/**
 * Invariants de cohérence de la cible affichée (chantier « moteur fiable », 14/10/2026, `web/SUGGESTIONS.md` §7).
 *
 * Evan, après sa séance du 13/10 : « Si à la 4e série je fais 100 × 8, c'est extrêmement incohérent de me proposer
 * 127,5. » Une cible peut être fausse (il fait plus ou moins que prévu) ; elle ne doit jamais être incohérente avec
 * ce qu'il vient de faire. Ces règles se vérifient sur la cible seule, sans connaître le moteur : le rejeu de tout
 * l'historique (`scripts/suggestions-audit/criteres.ts`) et les tests de propriété exigent zéro violation.
 *
 * Pur, sans dépendance au store. Charges comparées en charge effective (poids du corps compris pour lesté/assisté).
 */
import { ALGO_V2 } from "@/lib/engines/constants";
import { effTotal, type LoadMode } from "@/lib/engines/predict";

export interface InvariantExercise {
  setPatternMode: string;
  repTargetMin: number;
  repTargetMax: number;
  smallestIncrement: number;
  maxLoad?: number | null;
}

/** Série du jour sur cet exercice (ordre chronologique, échauffements et finishers exclus). */
export interface InvariantSet {
  weight: number;
  reps: number;
  rir: number | null;
  /** Complément de série, drop-set ou rest-pause rattaché à la série d'avant. */
  continuation: boolean;
}

export interface InvariantTarget {
  weight: number;
  reps: number;
  mode: string;
  reasonCodes: readonly string[];
  /** Type de série proposé (`finisher` : règles propres, hors invariants de fourchette). */
  setType?: string;
}

export interface InvariantInput {
  exercise: InvariantExercise;
  today: readonly InvariantSet[];
  target: InvariantTarget;
  /** Charge de travail habituelle (médiane des 5 dernières séances), null sans historique. */
  usualLoad: number | null;
  bodyweightKg?: number;
}

export type InvariantCode =
  | "I1_hors_fourchette"
  | "I2_plus_leger_moins_de_reps"
  | "I3_remontee_apres_serie_dure"
  | "I4_au_dessus_du_1rm_montre"
  | "I5_pas_de_retour_apres_essai"
  | "I6_complement_hors_de_portee"
  | "I7_au_dela_charge_max"
  | "I8_cible_vide";

export interface Violation {
  code: InvariantCode;
  detail: string;
}

/** RIR au-delà duquel une série ne borne pas la capacité (l'app saisit « 4+ »). */
const RIR_BOUNDING_MAX = 3;
/** Essai quasi maximal : RIR ≤ 1 et au plus ce nombre de reps jusqu'à l'échec. */
export const NEAR_MAX_REPS_TO_FAILURE = 4;
const EPS = 1e-9;

export function loadModeOfPattern(pattern: string): LoadMode {
  if (pattern === "weighted_bodyweight") return "weighted_bodyweight";
  if (pattern === "assisted_bodyweight") return "assisted_bodyweight";
  return "external";
}

/**
 * Charge effective d'une série pour comparer des capacités : poids du corps compris pour lesté / assisté, et le poids
 * du corps seul pour un exercice au poids du corps pur (sa charge saisie vaut 0).
 */
export function capacityLoad(pattern: string, weight: number, bodyweightKg?: number): number {
  if (pattern === "bodyweight") return bodyweightKg ?? ALGO_V2.DEFAULT_BODYWEIGHT_KG;
  return effTotal(weight, loadModeOfPattern(pattern), bodyweightKg);
}

/** 1RM estimé (Epley) d'une série à `repsToFailure` reps jusqu'à l'échec. */
function epley(effectiveLoad: number, repsToFailure: number): number {
  return effectiveLoad * (1 + repsToFailure / 30);
}

/**
 * Essai quasi maximal : RIR déclaré ≤ 1, au plus 4 reps jusqu'à l'échec, plus lourd que toutes les séries d'avant
 * du jour (première série : au moins un cran au-dessus de la charge de travail habituelle). Une série ratée à la
 * charge de travail, par fatigue, n'est pas un essai.
 */
export function isNearMaxAttempt(
  set: InvariantSet,
  before: readonly InvariantSet[],
  exercise: InvariantExercise,
  usualLoad: number | null,
  bodyweightKg?: number
): boolean {
  if (exercise.setPatternMode === "bodyweight" || set.rir === null || set.rir > 1) return false;
  if (set.reps + set.rir > NEAR_MAX_REPS_TO_FAILURE) return false;
  const mode = loadModeOfPattern(exercise.setPatternMode);
  const eff = (w: number) => effTotal(w, mode, bodyweightKg);
  const regular = before.filter((s) => !s.continuation);
  if (regular.length > 0) return regular.every((s) => eff(set.weight) > eff(s.weight) + EPS);
  return usualLoad !== null && eff(set.weight) >= eff(usualLoad) + exercise.smallestIncrement - EPS;
}

/**
 * Reps minimales d'une cible plus légère que la dernière série : autant qu'elle, une de moins si elle a fini à l'échec
 * (RIR 0 : la cible se lit au RIR 1), au plus le haut de la fourchette. Un RIR plus haut ne relève pas l'exigence
 * (« 4+ » n'est qu'une borne basse).
 */
export function lighterTargetMinReps(last: InvariantSet, exercise: Pick<InvariantExercise, "repTargetMax">): number {
  return Math.min(exercise.repTargetMax, last.reps - (last.rir !== null && last.rir <= 0 ? 1 : 0));
}

/** Reps au RIR 1 les plus hautes qu'une cible peut demander à `load` sans dépasser le 1RM `shown` (Epley). */
export function maxRepsUnderOneRepMax(shown: number, capacity: number): number {
  return capacity > 0 ? Math.floor((30 * shown) / capacity - 31 + 1e-6) : Number.POSITIVE_INFINITY;
}

export function targetInvariantViolations(input: InvariantInput): Violation[] {
  const { exercise, today, target, usualLoad, bodyweightKg } = input;
  const out: Violation[] = [];
  const mode = loadModeOfPattern(exercise.setPatternMode);
  // Poids du corps pur : la charge saisie ne change pas l'effort comparé (le corps entier) ; lesté / assisté : poids du corps compris.
  const eff = (w: number) => (exercise.setPatternMode === "bodyweight" ? capacityLoad("bodyweight", w, bodyweightKg) : effTotal(w, mode, bodyweightKg));
  const kgPerRep = (w: number) => Math.max(exercise.smallestIncrement, ALGO_V2.REP_SLOPE_PCT * Math.max(1, eff(w)));
  /** Reps d'une série ramenées à une autre charge par la règle du moteur (7,5 % = 1 rep). */
  const repsAt = (from: { weight: number; reps: number }, load: number) => from.reps + (eff(from.weight) - eff(load)) / kgPerRep(from.weight);
  const set = (w: number, r: number) => `${w} × ${r}`;
  const completion = target.reasonCodes.includes("logical_set_completion");
  const finisher = target.setType === "finisher";
  const bodyweightTarget = exercise.setPatternMode === "bodyweight" || (mode !== "external" && Math.abs(target.weight) < EPS);
  const regular = today.filter((s) => !s.continuation);
  const last = regular.at(-1) ?? null;
  const lastIndex = last ? today.lastIndexOf(last) : -1;
  const attempt = last !== null && isNearMaxAttempt(last, today.slice(0, lastIndex), exercise, usualLoad, bodyweightKg);

  if (!(target.reps >= 1) || !(target.weight >= 0) || !Number.isFinite(target.weight)) {
    out.push({ code: "I8_cible_vide", detail: `cible ${set(target.weight, target.reps)}` });
    return out;
  }
  if (exercise.maxLoad && exercise.maxLoad > 0 && mode === "external" && target.weight > exercise.maxLoad + EPS) {
    out.push({ code: "I7_au_dela_charge_max", detail: `${target.weight} > charge max ${exercise.maxLoad}` });
  }

  // I1 — fourchette (cible chargée, hors test de plateau explicite, finisher et complément de série).
  if (!completion && !finisher && !bodyweightTarget && target.mode !== "plateau_break") {
    const inc = exercise.smallestIncrement;
    if (target.reps < exercise.repTargetMin) {
      const easier = mode === "assisted_bodyweight" ? target.weight + inc : target.weight - inc;
      const coarse = !(inc > 0) || easier < -EPS || repsAt(target, easier) > exercise.repTargetMax + 0.5;
      if (!coarse) out.push({ code: "I1_hors_fourchette", detail: `${set(target.weight, target.reps)} sous ${exercise.repTargetMin}` });
    } else if (target.reps > exercise.repTargetMax) {
      const atMax = !!exercise.maxLoad && exercise.maxLoad > 0 && mode === "external" && target.weight >= exercise.maxLoad - EPS;
      const harder = mode === "assisted_bodyweight" ? target.weight - inc : target.weight + inc;
      const coarse = !(inc > 0) || harder < -EPS || repsAt(target, harder) < exercise.repTargetMin - 0.5;
      if (!atMax && !coarse) out.push({ code: "I1_hors_fourchette", detail: `${set(target.weight, target.reps)} au-dessus de ${exercise.repTargetMax}` });
    }
  }

  // I2 — plus léger que la dernière série : au moins autant de reps (une de moins après une série à l'échec, la cible se
  // lisant au RIR 1 : après 16 × 7 au RIR 0, au moins 6), dans la limite du haut de la fourchette. Il cède à I4 quand
  // les deux ne tiennent pas ensemble (charge au plancher, épuisé) : on ne demande jamais plus que ce qu'il a montré.
  const cap = (w: number) => capacityLoad(exercise.setPatternMode, w, bodyweightKg);
  const bounding = today.filter((s) => s.rir !== null && s.rir <= RIR_BOUNDING_MAX && cap(s.weight) > 0);
  const shown = bounding.length > 0 ? Math.max(...bounding.map((s) => epley(cap(s.weight), s.reps + (s.rir ?? 0)))) : null;
  const capReps = shown === null ? Number.POSITIVE_INFINITY : maxRepsUnderOneRepMax(shown, cap(target.weight));
  const minLighter = last ? lighterTargetMinReps(last, exercise) : 0;
  if (last && !completion && eff(target.weight) < eff(last.weight) - EPS && target.reps < minLighter && !(capReps < minLighter && target.reps >= capReps)) {
    out.push({ code: "I2_plus_leger_moins_de_reps", detail: `${set(target.weight, target.reps)} après ${set(last.weight, last.reps)} RIR ${last.rir ?? "?"}` });
  }

  // I3 — pas de remontée de charge après une série finie au RIR 0-1 en bas de fourchette ou en dessous.
  if (last && last.rir !== null && last.rir <= 1 && last.reps <= exercise.repTargetMin + 1 && eff(target.weight) > eff(last.weight) + EPS) {
    out.push({ code: "I3_remontee_apres_serie_dure", detail: `${set(target.weight, target.reps)} après ${set(last.weight, last.reps)} RIR ${last.rir}` });
  }

  // I4 — 1RM estimé de la cible (reps au RIR 1, donc reps + 1 jusqu'à l'échec) ≤ meilleur 1RM montré aujourd'hui. Hors
  // complément de série (des reps ajoutées à la même série, couvertes par I6).
  if (shown !== null && !completion && cap(target.weight) > 0) {
    const asked = epley(cap(target.weight), target.reps + 1);
    // Une cible d'une seule rep est le plancher : elle ne peut pas demander moins.
    if (asked > shown + 1e-6 && target.reps > 1) {
      out.push({ code: "I4_au_dessus_du_1rm_montre", detail: `${set(target.weight, target.reps)} : 1RM ${asked.toFixed(1)} > ${shown.toFixed(1)} montré` });
    }
  }

  // I5 — juste après un essai quasi maximal : retour à la charge de travail (ou dessous), fatigue de l'essai comprise.
  if (attempt && last && !completion) {
    const before = regular.slice(0, -1);
    const work = before.at(-1)?.weight ?? usualLoad;
    if (work !== null && eff(target.weight) > eff(work) + EPS) {
      out.push({ code: "I5_pas_de_retour_apres_essai", detail: `${set(target.weight, target.reps)} au-dessus de la charge de travail ${work} après l'essai ${set(last.weight, last.reps)}` });
    }
    const fresh = before.filter((s) => s.rir !== null && s.rir <= RIR_BOUNDING_MAX && cap(s.weight) > 0);
    if (fresh.length > 0 && cap(target.weight) > 0) {
      const best = Math.max(...fresh.map((s) => epley(cap(s.weight), s.reps + (s.rir ?? 0))));
      if (epley(cap(target.weight), target.reps + 1) >= best - 1e-6 && target.reps > 1) {
        out.push({ code: "I5_pas_de_retour_apres_essai", detail: `${set(target.weight, target.reps)} sans fatigue après l'essai ${set(last.weight, last.reps)}` });
      }
    }
  }

  // I6 — « série à finir » : jamais après un essai, jamais hors de portée en enchaînant.
  if (completion) {
    const short = today.at(-1);
    if (attempt) out.push({ code: "I6_complement_hors_de_portee", detail: `complément ${set(target.weight, target.reps)} après l'essai ${last ? set(last.weight, last.reps) : ""}` });
    else if (short) {
      const reach = (short.rir ?? 0) + (eff(short.weight) - eff(target.weight)) / kgPerRep(short.weight);
      if (target.reps > reach + 0.5) {
        out.push({ code: "I6_complement_hors_de_portee", detail: `complément ${set(target.weight, target.reps)} après ${set(short.weight, short.reps)} RIR ${short.rir ?? "?"} : ${reach.toFixed(1)} reps à portée` });
      }
    }
  }
  return out;
}
