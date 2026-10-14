/**
 * La cible à battre : ce que l'app AFFICHE et enregistre (`suggestedWeight` / `suggestedReps`), construite
 * sur la prévision du moteur (`suggest()`, sans biais, voir `web/SUGGESTIONS.md`).
 *
 * Evan, 11/10/2026 : « je vois la suggestion affichée comme quelque chose à battre -> son but est de me
 * pousser à donner le meilleur de moi-même, constamment me dépasser en charges ou reps ». Deux couches :
 *  - la PRÉVISION (interne) dit ce qu'il fera : elle sert à la reprojection quand il change le poids
 *    (`predictedRepsAtActualWeight`), au décalage appris et au bilan ; on la veut juste ;
 *  - la CIBLE (affichée) garde la charge qu'il porte et vise les reps qu'il bat environ une fois sur deux
 *    (Atkinson, 1957 : motivation maximale à probabilité de réussite intermédiaire ; Locke et Latham :
 *    un objectif difficile mais atteignable bat un objectif facile).
 *
 * Charge et reps (15/10/2026, `chooseTarget`, `web/SUGGESTIONS.md` §7) : la cible est d'abord cohérente avec ce qu'il
 * vient de faire (invariants de `target-invariants.ts`, zéro violation sur le rejeu) : jamais plus lourde après une
 * série finie au RIR 0-1 en bas de fourchette, jamais au-dessus du 1RM montré dans la séance, dans la fourchette (la
 * charge baisse jusqu'à ce que le bas soit à portée de `RANGE_STRETCH` reps), plus légère ⇒ au moins les reps de la
 * dernière série ; juste après un essai quasi maximal, retour à la charge de travail avec la fatigue de l'essai. Après
 * une série LOURDE, retour à la charge de la prévision ou 11 % plus léger. Montées du moteur gardées si cohérentes.
 * Reps : prévision à cette charge + marge d'ambition. La marge est apprise sur les séries récentes
 * enregistrées par ce moteur (prévision stockée contre reps faites, « battre » au sens de
 * `setVersusSuggestion`), par contexte (1re série, séries suivantes), rétrécie vers le global puis vers
 * un a priori, bornée à [−1 ; 2], visant 40 % de cibles battues (légèrement optimiste, Evan 14/10/2026), et
 * corrigée par une boucle de long terme, par contexte, sur les cibles réellement battues (à plus de 5 points de
 * l'objectif). Pure, recalculée à chaque suggestion.
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import { effTotal, type LoadMode } from "@/lib/engines/predict";
import { capacityLoad, lighterTargetMinReps } from "@/lib/engines/target-invariants";
import { setVersusSuggestion } from "@/lib/engines/versus";
import { SetPatternMode as SPM, SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import { orderedSets } from "@/lib/models/types";

/**
 * Réglages choisis par rejeu sur les séries d'avant le 21/09/2026, vérifiés après (`web/SUGGESTIONS.md`).
 * Objet modifiable à l'exécution pour les scripts de réglage uniquement.
 */
export const TARGET = {
  /** Demi-vie d'une série dans l'apprentissage de la marge, en jours. */
  HALF_LIFE_DAYS: 28,
  /** Poids du global dans la marge d'un contexte, en « séries équivalentes ». */
  SHRINK_K: 10,
  /** Poids de l'a priori dans la courbe globale, en « séries équivalentes ». */
  PRIOR_K: 10,
  /**
   * A priori : part des séries qui battent une cible = prévision − 1, + 0, + 1, + 2 reps (mesurée sur
   * l'historique d'Evan avant le 21/09/2026, 272 séries : 0,64 / 0,45 / 0,25 / 0,11).
   */
  PRIOR_BEAT_M1: 0.64,
  PRIOR_BEAT_0: 0.45,
  PRIOR_BEAT_1: 0.25,
  PRIOR_BEAT_2: 0.11,
  /** Probabilité visée de battre la cible. */
  GOAL: 0.4,
  /** Bornes de la marge, en reps. */
  MIN: -1,
  MAX: 2,
  /**
   * Boucle de long terme : quand la part de cibles battues s'écarte de l'objectif de plus de cette demi-largeur, la
   * marge bouge d'un pas (centrée sur `GOAL` ; avant le 15/10 elle visait 45-55 % quel que soit l'objectif).
   */
  LOOP_BAND: 0.05,
  LOOP_STEP: 0.5,
  /** Poids minimal de cibles jugées pour que la boucle agisse. */
  LOOP_MIN_WEIGHT: 8,
  /**
   * Fourchette : quand la prévision à la charge tenue tombe sous les reps exigées (bas de la fourchette, ou les reps de
   * la dernière série si la cible est plus légère), la charge baisse jusqu'à ce qu'elles soient à portée de ce nombre
   * de reps au-dessus de la prévision plus la marge, puis la cible les demande. Réglé sur les séances jusqu'au 21/09.
   */
  RANGE_STRETCH: 4,
  /**
   * Fatigue d'un essai quasi maximal (RIR ≤ 1, 4 reps au plus jusqu'à l'échec), en part de la perte de reps
   * apprise d'une série à la suivante. A priori : une série de 1 à 4 reps coûte moins qu'une série de 8 à 12 (la
   * fatigue d'une série suit le travail fait, Sánchez-Medina et González-Badillo, 2011), mais pas rien. Le seul
   * cas mesurable de son historique (Wide Chest Press, 13/10 : 140 × 8, 160 × 1, puis 120 × 7) donne 0,5. Trop peu
   * d'essais (7, dont 4 suivis d'une vraie série) pour l'apprendre : à remesurer (`web/SUGGESTIONS.md` §7).
   */
  ATTEMPT_COST: 0.5,
  /**
   * « Série à finir » : au-delà de cette baisse de charge, ce n'est plus un complément mais une nouvelle série. Quand
   * il enchaîne vraiment après une série courte (11 cas avec RIR depuis le 17/08), il baisse de 15 à 25 %.
   */
  COMPLETION_MAX_DROP: 0.3,
  /** Série lourde : sa charge dépasse la charge de travail habituelle d'au moins ce nombre de crans. */
  HEAVY_MIN_STEPS: 1,
  /**
   * Après une série lourde, la cible redescend au moins de cette part de la charge (sa baisse médiane quand il
   * redescend après une série lourde, avant le 21/09/2026 : 11,1 %, 13 cas), sauf si la prévision (retour ou
   * amorce du moteur) est déjà plus légère.
   */
  HEAVY_RETURN_PCT: 0.11,
};

/** Première version du moteur dont les séries portent une PRÉVISION (et non une cible) dans `predictedRepsAtActualWeight`. */
const FIRST_TARGET_VERSION: [number, number] = [2, 3];

function versionAtLeast(version: string | null | undefined): boolean {
  const match = /web-v(\d+)\.(\d+)/.exec(version ?? "");
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major > FIRST_TARGET_VERSION[0] || (major === FIRST_TARGET_VERSION[0] && minor >= FIRST_TARGET_VERSION[1]);
}

interface TargetSample {
  at: number;
  first: boolean;
  reps: number;
  predicted: number;
  beat: boolean | null;
  /** Série faite à la charge de la cible : la seule où la marge (des reps) décide du verdict. */
  atTargetLoad: boolean;
}

const NORMAL = new Set<string>([SetType.work, SetType.topSet, SetType.backoff]);
const cache = new WeakMap<readonly WorkoutSession[], TargetSample[]>();

function isContinuation(set: LoggedSet): boolean {
  return set.setTechnique != null || (set.logicalSetId != null && set.logicalSetId !== set.id);
}

/** Séries enregistrées par un moteur à deux couches, hors 1re séance de chaque exercice. Mémoïsé par tableau. */
function targetSamples(history: readonly WorkoutSession[], catalog: readonly Exercise[]): TargetSample[] {
  const cached = cache.get(history);
  if (cached) return cached;
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const chronological = [...history].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const samples: TargetSample[] = [];
  for (const session of chronological) {
    const firstTimeHere = new Set<string>();
    for (const logged of session.exercises) {
      if (!seen.has(logged.exerciseId) && logged.sets.some((set) => set.completed && NORMAL.has(set.setType))) {
        firstTimeHere.add(logged.exerciseId);
      }
    }
    for (const logged of session.exercises) {
      const exercise = byId.get(logged.exerciseId);
      if (!exercise || firstTimeHere.has(logged.exerciseId)) continue;
      const sets = orderedSets(logged).filter((set) => set.completed && NORMAL.has(set.setType) && !isContinuation(set));
      sets.forEach((set, index) => {
        if (!versionAtLeast(set.suggestionEngineVersion) || set.predictedRepsAtActualWeight == null) return;
        const verdict = setVersusSuggestion(exercise, set);
        samples.push({
          at: set.timestamp.getTime(),
          first: index === 0,
          reps: set.reps,
          predicted: set.predictedRepsAtActualWeight,
          beat: verdict === null ? null : verdict === "beat",
          atTargetLoad: set.suggestedWeight != null && Math.abs(set.suggestedWeight - set.weight) < 1e-9,
        });
      });
    }
    for (const id of firstTimeHere) seen.add(id);
  }
  cache.set(history, samples);
  return samples;
}

export interface AmbitionMargin {
  /** Reps ajoutées à la prévision pour former la cible. */
  margin: number;
  /** Part pondérée des cibles récentes battues (null sans assez de cibles jugées). */
  beatRate: number | null;
  /** Poids de récence cumulé des séries du contexte. */
  weight: number;
}

/** Marge d'ambition pour une 1re série (`first`) ou une série suivante, à `now`. */
export function ambitionMargin(
  history: readonly WorkoutSession[] | undefined,
  catalog: readonly Exercise[] | undefined,
  first: boolean,
  now: Date
): AmbitionMargin {
  // Marges candidates −1, 0, 1, 2 reps : part des séries qui auraient battu la prévision + marge.
  const margins = [-1, 0, 1, 2];
  const prior = [TARGET.PRIOR_BEAT_M1, TARGET.PRIOR_BEAT_0, TARGET.PRIOR_BEAT_1, TARGET.PRIOR_BEAT_2];
  const all = history && catalog ? targetSamples(history, catalog).filter((s) => s.at <= now.getTime()) : [];
  const curve = (samples: TargetSample[]) => {
    const sums = margins.map(() => 0);
    let total = 0;
    for (const s of samples) {
      const w = Math.pow(0.5, Math.max(0, now.getTime() - s.at) / 86_400_000 / TARGET.HALF_LIFE_DAYS);
      total += w;
      margins.forEach((k, i) => {
        if (s.reps >= s.predicted + k + 1) sums[i] += w;
      });
    }
    return { total, beat: sums.map((v) => (total > 0 ? v / total : 0)) };
  };
  const g = curve(all);
  const c = curve(all.filter((s) => s.first === first));
  const global = prior.map((p, k) => (g.total * g.beat[k] + TARGET.PRIOR_K * p) / (g.total + TARGET.PRIOR_K));
  const context = global.map((p, k) => (c.total * c.beat[k] + TARGET.SHRINK_K * p) / (c.total + TARGET.SHRINK_K));
  // Plus petite marge (interpolée entre −1, 0, 1 et 2 reps) dont la probabilité d'être battue ne dépasse pas l'objectif.
  let margin = margins[margins.length - 1];
  if (context[0] <= TARGET.GOAL) margin = margins[0];
  else {
    for (let i = 0; i < margins.length - 1; i++) {
      if (context[i + 1] <= TARGET.GOAL) {
        margin = margins[i] + (context[i] - TARGET.GOAL) / Math.max(1e-9, context[i] - context[i + 1]);
        break;
      }
    }
  }
  // Boucle de long terme sur les cibles réellement affichées et jugées, faites à la charge de la cible (ailleurs,
  // le verdict dépend de la charge choisie, pas des reps visées), dans ce contexte (à défaut, tous contextes).
  const realized = (samples: TargetSample[]) => {
    let judged = 0;
    let beaten = 0;
    for (const s of samples) {
      if (s.beat === null || !s.atTargetLoad) continue;
      const w = Math.pow(0.5, Math.max(0, now.getTime() - s.at) / 86_400_000 / TARGET.HALF_LIFE_DAYS);
      judged += w;
      if (s.beat) beaten += w;
    }
    return judged >= TARGET.LOOP_MIN_WEIGHT ? beaten / judged : null;
  };
  const beatRate = realized(all.filter((s) => s.first === first)) ?? realized(all);
  if (beatRate !== null && beatRate > TARGET.GOAL + TARGET.LOOP_BAND) margin += TARGET.LOOP_STEP;
  if (beatRate !== null && beatRate < TARGET.GOAL - TARGET.LOOP_BAND) margin -= TARGET.LOOP_STEP;
  return { margin: Math.max(TARGET.MIN, Math.min(TARGET.MAX, margin)), beatRate, weight: c.total };
}

function loadModeOf(exercise: Exercise): LoadMode {
  if (exercise.setPatternMode === SPM.weightedBodyweight) return "weighted_bodyweight";
  if (exercise.setPatternMode === SPM.assistedBodyweight) return "assisted_bodyweight";
  return "external";
}

/** Charge de travail habituelle : médiane des séries de travail des 5 dernières séances (plus récente en premier). */
export function usualWorkingLoad(historyNewestFirst: readonly LoggedSet[][]): number | null {
  const loads = historyNewestFirst
    .slice(0, 5)
    .flat()
    .filter((set) => set.completed && NORMAL.has(set.setType))
    .map((set) => set.weight)
    .sort((a, b) => a - b);
  if (loads.length === 0) return null;
  const mid = Math.floor(loads.length / 2);
  return loads.length % 2 ? loads[mid] : (loads[mid - 1] + loads[mid]) / 2;
}

/**
 * Série lourde : reps au RIR visé sous la fourchette, à une charge au-dessus de sa charge de travail
 * habituelle (d'au moins `HEAVY_MIN_STEPS` crans). Rejeu avant le 21/09 : après une telle série, il
 * redescend 63 % du temps (27 séries), contre 25 % ailleurs ; après le 21/09 : 74 % (19 séries).
 */
export function isHeavySet(
  repsAtTargetRir: number,
  load: number,
  usualLoad: number | null,
  exercise: Exercise,
  increment: number,
  bodyweightKg: number | undefined
): boolean {
  if (usualLoad === null || exercise.setPatternMode === SPM.bodyweight) return false;
  const mode = loadModeOf(exercise);
  return (
    repsAtTargetRir < exercise.repTargetMin &&
    effTotal(load, mode, bodyweightKg) >= effTotal(usualLoad, mode, bodyweightKg) + TARGET.HEAVY_MIN_STEPS * increment - 1e-9
  );
}

/** Charge de retour après une série lourde : la prévision du moteur, ou plus léger d'au moins `HEAVY_RETURN_PCT`. */
export function heavyReturnLoad(predictionLoad: number, heavyLoad: number, exercise: Exercise, increment: number): number {
  if (exercise.setPatternMode === SPM.assistedBodyweight || !(increment > 0)) return predictionLoad;
  const steps = Math.max(1, Math.ceil((heavyLoad * TARGET.HEAVY_RETURN_PCT) / increment - 1e-9));
  return Math.min(predictionLoad, Math.max(0, heavyLoad - steps * increment));
}

/** Série du jour sur cet exercice, telle que la lisent les invariants (`target-invariants.ts`). */
export interface TodaySet {
  weight: number;
  reps: number;
  rir: number | null;
  continuation: boolean;
}

export interface TargetChoiceInput {
  /** Reps prévues au RIR visé à une charge donnée pour la prochaine série (décroissantes avec la charge). */
  predictedAt: (load: number) => number;
  /** Charge de départ : celle du moteur en 1re série ou quand il monte, la charge de retour après une série lourde
   * ou un essai, sinon celle de la dernière série. */
  startLoad: number;
  /** Le moteur monte la charge (dépassement, promotion, test de plateau) : gardée si elle reste cohérente. */
  push: boolean;
  /** Reps d'un test de plateau explicite (`plateau_break`, hors fourchette par construction). */
  explicitTestReps?: number | null;
  /** Jamais plus lourd que cette charge (série dure, essai, retour après une série lourde). */
  ceiling: number | null;
  /** Séries normales du jour sur cet exercice, ordre chronologique. */
  today: readonly TodaySet[];
  margin: number;
  /**
   * Juste après un essai quasi maximal : meilleur 1RM estimé des séries d'avant l'essai. La cible reste strictement en
   * dessous (la fatigue de l'essai doit s'y voir).
   */
  belowOneRepMax?: number | null;
  /**
   * Étirement de la fourchette (défaut `TARGET.RANGE_STRETCH`). 0 juste après un essai quasi maximal : Evan
   * (14/10/2026) veut que la cible anticipe la fatigue de l'essai, la fourchette ne doit pas l'effacer.
   */
  stretch?: number;
}

export interface TargetChoice {
  weight: number;
  reps: number;
  predictedReps: number;
  /** Ce qui a déplacé la cible : `target_range` (charge ramenée vers la fourchette), `target_lifted` (reps relevées au
   * bas de la fourchette ou aux reps de la dernière série, au-dessus de la prévision plus la marge), `target_capacity`
   * (plafonnée par ce qu'il a montré aujourd'hui), `target_lighter_reps` (plus léger : au moins les reps de la dernière
   * série), `target_push_withheld` (montée du moteur refusée). */
  codes: string[];
}

const EPS = 1e-9;
const roundLoad = (load: number) => Math.round(load * 1000) / 1000;

/** Meilleur 1RM estimé (Epley, reps + RIR) montré aujourd'hui par les séries à RIR déclaré 0 à 3. */
export function shownOneRepMax(today: readonly TodaySet[], exercise: Exercise, bodyweightKg: number | undefined): number | null {
  // Une charge effective nulle ou négative (assistance au-delà du poids du corps saisi) ne mesure aucune capacité.
  const bounding = today.filter((s) => s.rir !== null && s.rir <= 3 && capacityLoad(exercise.setPatternMode, s.weight, bodyweightKg) > 0);
  if (bounding.length === 0) return null;
  return Math.max(...bounding.map((s) => capacityLoad(exercise.setPatternMode, s.weight, bodyweightKg) * (1 + (s.reps + (s.rir ?? 0)) / 30)));
}

/**
 * La cible : une charge et des reps à battre, cohérentes avec ce qu'il vient de faire (invariants de
 * `target-invariants.ts`, `web/SUGGESTIONS.md` §7).
 *
 * Reps à une charge : prévision + marge d'ambition, plafonnées par le 1RM qu'il a montré aujourd'hui (Epley, reps
 * jusqu'à l'échec : une cible n'en demande jamais plus). Charge : la charge de départ, puis ramenée dans la fourchette
 * (plus léger tant que les reps restent dessous, plus lourd tant qu'elles sont au-dessus), jamais au-dessus du
 * plafond (après une série finie au RIR 0-1 en bas de fourchette ou un essai) ni de la charge max ; quand un cran fait
 * sauter toute la fourchette, la charge la plus proche (à égalité, la plus lourde). Plus léger que la dernière série :
 * au moins ses reps. Poids du corps pur et lesté à 0 kg : la charge ne bouge pas, les reps suivent la prévision.
 */
export function chooseTarget(input: TargetChoiceInput, exercise: Exercise, increment: number, bodyweightKg: number | undefined): TargetChoice {
  const mode = loadModeOf(exercise);
  const eff = (load: number) => effTotal(load, mode, bodyweightKg);
  const shown = shownOneRepMax(input.today, exercise, bodyweightKg);
  const capAt = (load: number) => {
    const c = capacityLoad(exercise.setPatternMode, load, bodyweightKg);
    if (!(c > 0)) return Number.POSITIVE_INFINITY;
    let cap = shown === null ? Number.POSITIVE_INFINITY : Math.floor((30 * shown) / c - 31 + 1e-6);
    if (input.belowOneRepMax != null) cap = Math.min(cap, Math.ceil(30 * (input.belowOneRepMax / c - 1) - 1 - 1e-6) - 1);
    return cap;
  };
  const lastRegular = [...input.today].reverse().find((s) => !s.continuation) ?? null;
  const lighterThanLast = (load: number) => lastRegular !== null && eff(load) < eff(lastRegular.weight) - EPS;
  /** Reps exigées par la cohérence : le bas de la fourchette, et plus léger que la dernière série, au moins ses reps. */
  const needed = (load: number) => Math.max(exercise.repTargetMin, lighterThanLast(load) ? lighterTargetMinReps(lastRegular!, exercise) : 0);
  const raw = (load: number) => Math.round(input.predictedAt(load) + input.margin);
  /** Les reps exigées sont à portée : à moins de `RANGE_STRETCH` reps au-dessus de la prévision plus la marge. */
  const reachable = (load: number) =>
    Math.round(input.predictedAt(load) + input.margin + (input.stretch ?? TARGET.RANGE_STRETCH)) >= needed(load) && capAt(load) >= needed(load);
  const codes: string[] = [];
  const done = (load: number, loaded = true): TargetChoice => {
    let reps = raw(load);
    // Les reps de cohérence ne sont exigées que si elles sont à portée ; au plancher de charge (lesté ramené au poids
    // du corps, charge nulle), la cible reste la prévision plus la marge.
    if (loaded && reachable(load)) reps = Math.min(Math.max(reps, needed(load)), Math.max(needed(load), exercise.repTargetMax));
    else {
      if (loaded) reps = Math.min(reps, exercise.repTargetMax);
      // Plus léger que la dernière série (lesté ramené au poids du corps compris) : au moins ses reps.
      if (lighterThanLast(load)) reps = Math.max(reps, lighterTargetMinReps(lastRegular!, exercise));
    }
    if (reps > raw(load) && reps <= capAt(load)) codes.push("target_lifted");
    if (reps > capAt(load)) {
      reps = capAt(load);
      codes.push("target_capacity");
    }
    return { weight: roundLoad(load), reps: Math.max(1, reps), predictedReps: input.predictedAt(load), codes };
  };

  // Poids du corps (pur, ou lesté prévu sans lest) : seules les reps bougent.
  if (exercise.setPatternMode === SPM.bodyweight || (mode === "weighted_bodyweight" && Math.abs(input.startLoad) < EPS && !input.push)) {
    return done(input.startLoad, false);
  }
  const inc = increment > 0 ? increment : 0;
  const harder = (load: number) => roundLoad(mode === "assisted_bodyweight" ? Math.max(0, load - inc) : load + inc);
  const easier = (load: number) => roundLoad(mode === "assisted_bodyweight" ? load + inc : Math.max(0, load - inc));
  const maxLoad = mode === "external" && exercise.maxLoad && exercise.maxLoad > 0 ? exercise.maxLoad : null;
  const allowed = (load: number) =>
    load >= -EPS && (input.ceiling === null || eff(load) <= eff(input.ceiling) + EPS) && (maxLoad === null || load <= maxLoad + EPS);

  // Test de plateau explicite : gardé seulement s'il ne demande pas plus que ce qu'il a montré aujourd'hui.
  if (input.push && input.explicitTestReps != null) {
    if (allowed(input.startLoad) && input.explicitTestReps <= capAt(input.startLoad)) {
      return { weight: roundLoad(input.startLoad), reps: input.explicitTestReps, predictedReps: input.predictedAt(input.startLoad), codes };
    }
    codes.push("target_push_withheld");
  }
  let load = input.startLoad;
  if (input.push && (input.explicitTestReps != null || !(allowed(load) && reachable(load)))) {
    if (input.explicitTestReps == null) codes.push("target_push_withheld");
    load = lastRegular?.weight ?? load;
  }
  if (input.ceiling !== null && eff(load) > eff(input.ceiling) + EPS) load = input.ceiling;
  if (maxLoad !== null && load > maxLoad + EPS) load = maxLoad;

  // La charge descend d'un cran à la fois jusqu'à ce que les reps exigées soient à portée ; elle monte tant que la
  // prévision dépasse le haut de la fourchette (sans franchir le plafond, la charge max ni ce qu'il a montré).
  const start = load;
  if (inc > 0 && !reachable(load)) {
    for (let guard = 0; guard < 400 && !reachable(load); guard++) {
      const next = easier(load);
      if (Math.abs(next - load) < EPS) break;
      load = next;
    }
  } else if (inc > 0 && raw(load) > exercise.repTargetMax) {
    for (let guard = 0; guard < 400 && raw(load) > exercise.repTargetMax; guard++) {
      const next = harder(load);
      if (Math.abs(next - load) < EPS || !allowed(next) || !reachable(next)) break;
      load = next;
    }
  }
  if (Math.abs(start - load) > EPS) codes.push("target_range");
  if (lighterThanLast(load) && needed(load) > exercise.repTargetMin && raw(load) < needed(load)) codes.push("target_lighter_reps");
  return done(load);
}

/**
 * Charge et reps d'une « série à finir » juste après une série trop courte pour compter (moins de 8 reps cumulées),
 * ou null quand il n'y a rien à finir. Les reps restantes doivent être à portée en enchaînant : son RIR plus les
 * reps que rend la baisse de charge (règle 7,5 %), au moins un cran plus léger. Jamais après un essai quasi maximal
 * (il revient à sa charge de travail), jamais quand il faudrait baisser de plus de 30 % (une nouvelle série, pas un
 * complément) : 157,5 × 7 juste après 160 × 1 au RIR 0 était hors de portée.
 */
export function completionTarget(
  short: TodaySet,
  remainingReps: number,
  attempt: boolean,
  exercise: Exercise,
  increment: number,
  bodyweightKg: number | undefined
): { weight: number; reps: number } | null {
  if (attempt || remainingReps <= 0) return null;
  const reserve = Math.max(0, Math.min(4, short.rir ?? 0));
  // Poids du corps pur : pas de charge à baisser, seules les reps en réserve sont à portée.
  if (exercise.setPatternMode === SPM.bodyweight) return reserve >= remainingReps ? { weight: short.weight, reps: remainingReps } : null;
  const mode = loadModeOf(exercise);
  const eff = (load: number) => effTotal(load, mode, bodyweightKg);
  const inc = increment > 0 ? increment : 0.5;
  const kgPerRep = Math.max(inc, ALGO_V2.REP_SLOPE_PCT * Math.max(1, eff(short.weight)));
  const steps = Math.max(1, Math.ceil(((remainingReps - reserve) * kgPerRep) / inc - 1e-9));
  const load = roundLoad(mode === "assisted_bodyweight" ? short.weight + steps * inc : short.weight - steps * inc);
  if (load < -EPS) return null;
  const reach = reserve + (eff(short.weight) - eff(load)) / kgPerRep;
  const drop = (eff(short.weight) - eff(load)) / Math.max(EPS, eff(short.weight));
  if (reach < remainingReps - 0.5 || drop > TARGET.COMPLETION_MAX_DROP + EPS) return null;
  return { weight: load, reps: remainingReps };
}
