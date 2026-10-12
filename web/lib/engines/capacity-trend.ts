/**
 * Tendance d'un exercice : l'écart de ses séances récentes à ce que Jeera prévoyait, fatigue de séance comprise
 * (voir `web/TENDANCE.md`).
 *
 * Evan, 12/10/2026 : « ma performance en dips n'a pas baissé de 10 %. Peut-être que tu compares un moment où je les ai
 * faits en fin de séance à d'autres fois où je les faisais plus frais […] Ce n'est pas une comparaison juste. »
 * Avant, la capacité d'une séance était « ramenée à frais » par une règle fixe (1 rep par 6 de coût systémique, +1 après
 * 3 séries du même muscle, 3 reps au plus) : à l'intérieur d'un exercice, chaque série du même muscle faite avant coûtait
 * encore 2 % de capacité de plus que la règle ne rendait (Dips du 08/09, frais : 22 reps ; du 05/10, après 11 séries :
 * 17 + 3). Puis la meilleure des 3 dernières séances était comparée à la meilleure des 3 d'avant, avec des seuils
 * (+1,5 %, −3 %) bien sous le bruit d'une séance à l'autre (≈ 4 à 5 % sur une machine).
 *
 * Méthode, pure, refaite depuis l'historique :
 *  - contexte d'une série = séries comptées comme dans l'Historique, faites AVANT elle dans la séance par les autres
 *    exercices, et parmi elles ce qui a travaillé le même muscle (coefficient du profil sur le muscle principal) ;
 *  - coût du contexte, en reps jusqu'à l'échec, APPRIS : entre deux séances consécutives d'un même exercice (28 jours au
 *    plus, RIR déclaré), l'écart de capacité est régressé sur l'écart de contexte (moindres carrés, dérive libre),
 *    par axe (charge, reps au poids du corps), rétréci vers le coût de tous les exercices, lui-même rétréci vers
 *    l'ancienne règle fixe, qui vaut `PRIOR_PAIRS` paires : un nouvel utilisateur la garde ;
 *  - capacité d'une séance = sa meilleure série, sur les reps jusqu'à l'échec plus les reps coûtées par le contexte ;
 *  - prévision d'une séance récente = niveau des 3 séances d'avant, ramené au contexte de cette séance ; tendance =
 *    écart moyen (géométrique) des 3 dernières séances à leur prévision ; une reprise après plus de 28 jours sans
 *    l'exercice repart de zéro (pas de comparaison avec l'avant-pause) ;
 *  - progression ou baisse seulement au-delà de `Z` erreurs-types : l'erreur-type vient du bruit MESURÉ de l'exercice
 *    d'une séance à la suivante, rétréci vers celui de tous les exercices du même axe, puis vers un a priori.
 */

import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { aggregateCoefficient, primaryParent, type Exercise, type WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;

/**
 * Réglages. Les a priori ne servent que sans historique : ils sont rétrécis vers ce que l'historique mesure.
 * Objet modifiable à l'exécution pour les scripts d'audit uniquement.
 */
export const CAPACITY_TREND = {
  /** Séances récentes jugées, et séances d'avant qui font la prévision. */
  WINDOW: 3,
  /**
   * A priori du coût du contexte = l'ancienne règle fixe (`session-fatigue.ts`) rendue continue : 1 rep pour 6 de coût
   * systémique (une série de classe moyenne coûte 1,5, donc 0,25 rep), et 1 rep de plus après 3 séries du même muscle.
   */
  PRIOR_REPS_PER_SET: 0.25,
  PRIOR_REPS_PER_SAME_MUSCLE_SET: 1 / 3,
  /**
   * Poids de l'a priori, en paires de séances (une paire ≈ un exercice d'une séance). Avec 10, le coût d'une série du
   * même muscle appris au 24/08/2026 (14 paires, une semaine après les premiers RIR) touchait la borne de 2 reps ; avec
   * 30, il reste à 1,5 et rejoint ~0,6 en octobre (146 paires), comme avec 10.
   */
  PRIOR_PAIRS: 30,
  /** Bornes d'un coût par série (une série faite avant ne rend jamais plus fort). */
  MAX_REPS_PER_SET: 2,
  /** Deux séances plus éloignées ne forment pas une paire (reprise). */
  MAX_GAP_DAYS: 28,
  /**
   * Bruit d'une séance à l'autre (écart-type du log de la capacité) sans historique, mesuré sur celui d'Evan au
   * 12/10/2026 : ≈ 5 % sur une charge, ≈ 10 % en reps au poids du corps.
   */
  PRIOR_NOISE_LOAD: 0.05,
  PRIOR_NOISE_REPS: 0.1,
  /** Poids de l'a priori dans le bruit d'un axe, puis du bruit de l'axe dans celui d'un exercice, en paires. */
  NOISE_PRIOR_PAIRS: 8,
  NOISE_SHRINK_PAIRS: 4,
  /** Un écart de log de capacité plus grand d'une séance à l'autre est borné (saisie aberrante). */
  NOISE_MAX_LOG_GAP: 0.4,
  /** Erreurs-types au-delà desquelles l'écart est une progression ou une baisse (5 % de fausses alertes par sens). */
  Z: 1.645,
};

export type CapacityAxis = "load" | "reps";

/** Ce que la séance avait déjà coûté avant une série. */
export interface SetContext {
  /** Séries comptées (comme l'Historique) faites avant, par les autres exercices de la séance. */
  sets: number;
  /** Parmi elles, ce qui a travaillé le muscle principal de l'exercice (coefficient du profil). */
  sameMuscleSets: number;
}

export interface ContextCost {
  /** Reps jusqu'à l'échec coûtées par série comptée faite avant. */
  perSet: number;
  /** Reps coûtées en plus par série du même muscle. */
  perSameMuscleSet: number;
  /** Paires de séances consécutives qui ont servi à l'apprendre (0 : a priori seul). */
  pairs: number;
}

/** Deux séances consécutives d'un même exercice : écart (seconde − première) de capacité et de contexte. */
export interface ContextPair {
  /** Écart de capacité en reps jusqu'à l'échec (à la charge de la paire, règle d'Epley de la capacité). */
  repsGap: number;
  setsGap: number;
  sameMuscleGap: number;
}

/** Écart de log de capacité entre deux séances consécutives d'un même exercice (bruit). */
export interface NoiseSample {
  exerciseId: string;
  axis: CapacityAxis;
  logGap: number;
}

export interface CapacityTrend {
  /** Écart moyen des séances récentes à leur prévision (fraction), `null` sans assez de séances. */
  delta: number | null;
  /** Écart à dépasser pour parler de progression (la baisse est l'écart symétrique en log), `null` sans tendance. */
  threshold: number | null;
  direction: "up" | "down" | "flat" | null;
}

/**
 * Contexte de la série jouée à `at` : ce que les AUTRES exercices de la séance ont fait avant. Les occurrences du même
 * exercice (et ses séances converties d'une machine équivalente) n'en font pas partie : la perte d'une série à la
 * suivante du même exercice est déjà dans le choix de la meilleure série.
 */
export function setContext(
  session: WorkoutSession,
  exercise: Exercise,
  at: Date,
  catalogById: ReadonlyMap<string, Exercise>
): SetContext {
  const parent = primaryParent(exercise);
  let sets = 0;
  let sameMuscleSets = 0;
  for (const logged of session.exercises) {
    if (logged.exerciseId === exercise.id) continue;
    const other = catalogById.get(logged.exerciseId);
    if (!other) continue;
    const earlier = logged.sets.filter((set) => set.timestamp.getTime() < at.getTime());
    const units = physiologicalSetUnits(earlier, { increment: other.smallestIncrement });
    if (units <= 0) continue;
    sets += units;
    if (parent) sameMuscleSets += units * aggregateCoefficient(other, parent);
  }
  return { sets, sameMuscleSets };
}

/** Reps jusqu'à l'échec que le contexte a coûtées. */
export function contextReps(cost: ContextCost, context: SetContext): number {
  return cost.perSet * context.sets + cost.perSameMuscleSet * context.sameMuscleSets;
}

export const PRIOR_CONTEXT_COST: ContextCost = {
  perSet: CAPACITY_TREND.PRIOR_REPS_PER_SET,
  perSameMuscleSet: CAPACITY_TREND.PRIOR_REPS_PER_SAME_MUSCLE_SET,
  pairs: 0,
};

/**
 * Coût du contexte appris sur les paires : écart de reps = dérive − coût × écart de contexte. Moindres carrés sur les
 * écarts centrés (la dérive, c'est-à-dire la progression moyenne d'une séance à la suivante, reste libre), rétrécis vers
 * `prior` avec un poids de `PRIOR_PAIRS` paires typiques, bornés à [0 ; `MAX_REPS_PER_SET`].
 */
export function learnContextCost(pairs: readonly ContextPair[], prior: ContextCost = PRIOR_CONTEXT_COST): ContextCost {
  if (pairs.length === 0) return { ...prior, pairs: 0 };
  const n = pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair.repsGap, 0) / n;
  const meanA = pairs.reduce((sum, pair) => sum + pair.setsGap, 0) / n;
  const meanB = pairs.reduce((sum, pair) => sum + pair.sameMuscleGap, 0) / n;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  let say = 0;
  let sby = 0;
  let rawA = 0;
  let rawB = 0;
  for (const pair of pairs) {
    const a = pair.setsGap - meanA;
    const b = pair.sameMuscleGap - meanB;
    const y = pair.repsGap - meanY;
    saa += a * a;
    sbb += b * b;
    sab += a * b;
    say += a * y;
    sby += b * y;
    rawA += pair.setsGap * pair.setsGap;
    rawB += pair.sameMuscleGap * pair.sameMuscleGap;
  }
  // Pénalité de l'a priori : `PRIOR_PAIRS` paires d'un écart de contexte typique (au moins une série).
  const la = CAPACITY_TREND.PRIOR_PAIRS * Math.max(1, rawA / n);
  const lb = CAPACITY_TREND.PRIOR_PAIRS * Math.max(1, rawB / n);
  // Pente (écart de reps par série) = − coût.
  const pa = -prior.perSet;
  const pb = -prior.perSameMuscleSet;
  const m11 = saa + la;
  const m22 = sbb + lb;
  const m12 = sab;
  const r1 = say + la * pa;
  const r2 = sby + lb * pb;
  const det = m11 * m22 - m12 * m12;
  if (!(Math.abs(det) > 1e-12)) return { ...prior, pairs: n };
  const slopeA = (r1 * m22 - r2 * m12) / det;
  const slopeB = (m11 * r2 - m12 * r1) / det;
  const clamp = (value: number) => Math.max(0, Math.min(CAPACITY_TREND.MAX_REPS_PER_SET, value));
  return { perSet: clamp(-slopeA), perSameMuscleSet: clamp(-slopeB), pairs: n };
}

/** Une paire, avec l'axe de la capacité de son exercice. */
export interface AxisContextPair extends ContextPair {
  axis: CapacityAxis;
}

export interface ContextCosts {
  load: ContextCost;
  reps: ContextCost;
}

/**
 * Coût par axe : au poids du corps, la capacité se compte en reps (15 à 20 aux dips) et une série faite avant en coûte
 * davantage qu'à une charge (12/10/2026 : 0,29 rep par série et 0,59 par série du même muscle sur 22 paires de Dips et
 * HSPU, contre 0,10 et 0,65 sur 146 paires à une charge). Chaque axe est rétréci vers le coût appris sur toutes les
 * paires, lui-même rétréci vers l'a priori : un axe sans paires prend le coût commun.
 */
export function learnContextCosts(pairs: readonly AxisContextPair[]): ContextCosts {
  const pooled = learnContextCost(pairs);
  return {
    load: learnContextCost(pairs.filter((pair) => pair.axis === "load"), pooled),
    reps: learnContextCost(pairs.filter((pair) => pair.axis === "reps"), pooled),
  };
}

/**
 * Bruit d'une séance à l'autre (écart-type du log de la capacité) de chaque exercice : la moitié de la variance des
 * écarts entre séances consécutives, rétrécie vers celle de son axe, elle-même rétrécie vers l'a priori.
 */
export function trendNoise(samples: readonly NoiseSample[]): (exerciseId: string, axis: CapacityAxis) => number {
  const bound = CAPACITY_TREND.NOISE_MAX_LOG_GAP;
  const halfSquare = (sample: NoiseSample) => Math.min(bound, Math.abs(sample.logGap)) ** 2 / 2;
  const byAxis = new Map<CapacityAxis, { sum: number; count: number }>();
  const byExercise = new Map<string, { sum: number; count: number }>();
  for (const sample of samples) {
    const value = halfSquare(sample);
    const axis = byAxis.get(sample.axis) ?? { sum: 0, count: 0 };
    byAxis.set(sample.axis, { sum: axis.sum + value, count: axis.count + 1 });
    const own = byExercise.get(sample.exerciseId) ?? { sum: 0, count: 0 };
    byExercise.set(sample.exerciseId, { sum: own.sum + value, count: own.count + 1 });
  }
  const axisVariance = (axis: CapacityAxis) => {
    const prior = (axis === "load" ? CAPACITY_TREND.PRIOR_NOISE_LOAD : CAPACITY_TREND.PRIOR_NOISE_REPS) ** 2;
    const pool = byAxis.get(axis) ?? { sum: 0, count: 0 };
    return (pool.sum + CAPACITY_TREND.NOISE_PRIOR_PAIRS * prior) / (pool.count + CAPACITY_TREND.NOISE_PRIOR_PAIRS);
  };
  return (exerciseId, axis) => {
    const own = byExercise.get(exerciseId) ?? { sum: 0, count: 0 };
    const variance = (own.sum + CAPACITY_TREND.NOISE_SHRINK_PAIRS * axisVariance(axis)) / (own.count + CAPACITY_TREND.NOISE_SHRINK_PAIRS);
    return Math.sqrt(variance);
  };
}

/** Index du premier point depuis la dernière reprise (plus de `MAX_GAP_DAYS` sans l'exercice) avant `end` inclus. */
function segmentStart(points: readonly { date: Date }[], end: number): number {
  let since = 0;
  for (let index = 1; index <= end; index += 1) {
    if (points[index].date.getTime() - points[index - 1].date.getTime() > CAPACITY_TREND.MAX_GAP_DAYS * DAY_MS) since = index;
  }
  return since;
}

const meanLog = (list: readonly number[]) => list.reduce((sum, value) => sum + Math.log(value), 0) / list.length;

/**
 * Écart des `WINDOW` dernières capacités (à contexte neutre, de la plus ancienne à la plus récente) à la prévision tirée
 * des `WINDOW` d'avant, jugé contre le bruit `noise` de l'exercice. Ramener chaque séance récente à contexte neutre ou
 * ramener la prévision à son contexte revient au même : l'écart est celui de la séance à ce que Jeera attendait d'elle.
 * Une reprise (plus de `MAX_GAP_DAYS` sans l'exercice) ne se compare pas à l'avant-pause, comme dans la table des
 * séances de Barbis : seules comptent les séances depuis la dernière reprise.
 */
export function capacityTrend(points: readonly { date: Date; value: number }[], noise: number): CapacityTrend {
  const window = CAPACITY_TREND.WINDOW;
  const values = points.slice(segmentStart(points, points.length - 1)).map((point) => point.value);
  if (values.length < window + 1) return { delta: null, threshold: null, direction: null };
  const recent = values.slice(-window);
  const reference = values.slice(-2 * window, -window);
  if ([...recent, ...reference].some((value) => !(value > 0))) return { delta: null, threshold: null, direction: null };
  const gap = meanLog(recent) - meanLog(reference);
  const limit = CAPACITY_TREND.Z * noise * Math.sqrt(1 / recent.length + 1 / reference.length);
  return {
    delta: Math.exp(gap) - 1,
    threshold: Math.exp(limit) - 1,
    direction: gap >= limit ? "up" : gap <= -limit ? "down" : "flat",
  };
}

/**
 * Écart d'une seule séance (`index`) à ce que Jeera prévoyait d'après ses `WINDOW` séances d'avant (depuis la dernière
 * reprise), et l'écart que le bruit de l'exercice explique pour une séance seule. `null` sans assez de séances d'avant.
 */
export function sessionForecastGap(
  points: readonly { date: Date; value: number }[],
  index: number,
  noise: number
): { gap: number; threshold: number; direction: "up" | "down" | "flat" } | null {
  const window = CAPACITY_TREND.WINDOW;
  if (index < 0 || index >= points.length || index - segmentStart(points, index) < window) return null;
  const values = points.slice(index - window, index + 1).map((point) => point.value);
  if (values.some((value) => !(value > 0))) return null;
  const logGap = Math.log(values[window]) - meanLog(values.slice(0, window));
  const limit = CAPACITY_TREND.Z * noise * Math.sqrt(1 + 1 / window);
  return {
    gap: Math.exp(logGap) - 1,
    threshold: Math.exp(limit) - 1,
    direction: logGap >= limit ? "up" : logGap <= -limit ? "down" : "flat",
  };
}
