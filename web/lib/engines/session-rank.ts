/**
 * Rang de fin de séance : S, A, B ou C, sur les trois objectifs d'Evan (26/09/2026) :
 * - volume (45) : le plus de séries possible par séance, pour tenir les objectifs de la semaine.
 *   Note pleine à 22 séries, le rythme d'une semaine or (~85 séries) en 4 séances ;
 * - records (30) : séries étoilées (les ★ de l'Historique), pleine à 4, à 2 en sèche (déclarée ou
 *   mesurée sur les pesées) : une sèche ne coûte jamais rien ;
 * - intensité (25) : le moins possible de séries à RIR 3 ou plus. Part des séries de travail à RIR
 *   2 ou moins : 100 % vaut la note pleine, 50 % ou moins vaut 0.
 * Une composante sans donnée (RIR jamais saisi avant le 17/08/2026, aucun exercice qui puisse
 * encore battre un record en séance d'étalonnage) sort du calcul, qui se répartit sur les autres.
 *
 * Seuils : S 85, A 70, B 50. Sur les 23 séances d'Evan depuis la saisie du RIR : 4 S, 9 A, 9 B, 1 C.
 * La comparaison à la suggestion du moteur (tenue, battue) reste mesurée pour la fiche de
 * personnage (Discipline) mais ne pèse plus sur le rang.
 */

import type { ExerciseReview, SessionReview } from "@/lib/engines/bilan";
import { buildWeightTrend, WEIGHT_TREND } from "@/lib/engines/body-weight";
import { estimated1RM } from "@/lib/engines/e1rm";
import { SetPatternMode } from "@/lib/models/enums";
import type { BodyWeightEntry, Exercise, LoggedSet, UserSettings } from "@/lib/models/types";

const DAY_MS = 86_400_000;

export const SESSION_RANK = {
  VOLUME_WEIGHT: 0.45,
  RECORDS_WEIGHT: 0.3,
  INTENSITY_WEIGHT: 0.25,
  /** Séries (comptées comme dans l'Historique) pour la note pleine de volume. */
  FULL_SETS: 22,
  /** Séries étoilées pour la note pleine de records ; en sèche, la moitié. */
  FULL_RECORDS: 4,
  FULL_RECORDS_CUT: 2,
  /** Une série « dure » est à RIR 2 ou moins. */
  HARD_RIR: 2,
  /** Part de séries dures sous laquelle l'intensité ne vaut plus rien. */
  INTENSITY_FLOOR: 0.5,
  /** Une série « tient » la référence à 97 % de son 1RM estimé, ou à une rep près au poids du corps (Discipline). */
  HELD_E1RM_RATIO: 0.97,
  /** Sèche mesurée : tendance de poids des 28 jours précédents, au seuil de perte de l'app. */
  CUT_WINDOW_DAYS: 28,
  THRESHOLDS: { S: 85, A: 70, B: 50 },
} as const;

export type RankLetter = "S" | "A" | "B" | "C";

export interface SessionRank {
  letter: RankLetter;
  /** 0..100 */
  score: number;
  /** Séries de la séance (comme l'Historique). */
  sets: number;
  /** Séries étoilées. */
  records: number;
  /** Séries de travail à RIR 2 ou moins, parmi celles dont le RIR est saisi. */
  hardSets: number;
  rirSets: number;
  cut: boolean;
  /** Face à la référence du moteur, pour la Discipline (hors rang). */
  rated: number;
  performed: number;
  held: number;
}

export function rankLetter(score: number): RankLetter {
  if (score >= SESSION_RANK.THRESHOLDS.S) return "S";
  if (score >= SESSION_RANK.THRESHOLDS.A) return "A";
  if (score >= SESSION_RANK.THRESHOLDS.B) return "B";
  return "C";
}

/** La meilleure série du jour tient la référence sans la battre. */
export function heldReference(review: ExerciseReview, exercise: Exercise | undefined): boolean {
  if (review.performed || review.noData) return false;
  if (exercise?.setPatternMode === SetPatternMode.assistedBodyweight) return false;
  if (review.referenceWeight <= 0 || review.achievedWeight <= 0) {
    return review.referenceWeight <= 0 && review.achievedWeight <= 0 && review.achievedReps >= review.referenceReps - 1;
  }
  return (
    estimated1RM(review.achievedWeight, review.achievedReps) >=
    SESSION_RANK.HELD_E1RM_RATIO * estimated1RM(review.referenceWeight, review.referenceReps)
  );
}

/**
 * Séance faite en sèche : phase déclarée dans les réglages, ou perte de poids mesurée d'au moins
 * `WEIGHT_TREND.MIN_WEEKLY_LOSS_PCT` par semaine sur les 28 jours précédents (Evan ne déclare pas
 * forcément sa phase ; ses pesées, elles, sont là).
 */
export function cutAt(
  date: Date,
  bodyWeights: readonly BodyWeightEntry[],
  settings: Pick<UserSettings, "trainingPhase" | "trainingPhaseStartedAt">
): boolean {
  if (settings.trainingPhase === "cut" && (!settings.trainingPhaseStartedAt || settings.trainingPhaseStartedAt <= date)) {
    return true;
  }
  const since = new Date(date.getTime() - SESSION_RANK.CUT_WINDOW_DAYS * DAY_MS);
  const trend = buildWeightTrend(bodyWeights.filter((entry) => entry.measuredOn <= date), since);
  return trend.weeklyPct !== null && trend.weeklyPct <= -WEIGHT_TREND.MIN_WEEKLY_LOSS_PCT;
}

export function rankSession({
  review,
  catalog,
  sets,
  records,
  workSets,
  cut,
}: {
  review: SessionReview;
  catalog: ReadonlyMap<string, Exercise>;
  sets: number;
  records: number;
  /** Séries de travail terminées (travail, top set, back-off), pour le RIR. */
  workSets: readonly LoggedSet[];
  cut: boolean;
}): SessionRank | null {
  if (sets <= 0) return null;
  const rated = review.exercises.filter((exercise) => !exercise.calibrating && !exercise.noData);
  const performed = rated.filter((exercise) => exercise.performed).length;
  const held = rated.filter((exercise) => heldReference(exercise, catalog.get(exercise.exerciseId))).length;

  const withRir = workSets.filter((set) => set.reportedRir !== null && set.reportedRir !== undefined);
  const hardSets = withRir.filter((set) => set.reportedRir! <= SESSION_RANK.HARD_RIR).length;
  const parts: { weight: number; value: number }[] = [
    { weight: SESSION_RANK.VOLUME_WEIGHT, value: Math.min(1, sets / SESSION_RANK.FULL_SETS) },
  ];
  if (rated.length > 0) {
    const full = cut ? SESSION_RANK.FULL_RECORDS_CUT : SESSION_RANK.FULL_RECORDS;
    parts.push({ weight: SESSION_RANK.RECORDS_WEIGHT, value: Math.min(1, records / full) });
  }
  if (withRir.length > 0) {
    const share = hardSets / withRir.length;
    const floor = SESSION_RANK.INTENSITY_FLOOR;
    parts.push({ weight: SESSION_RANK.INTENSITY_WEIGHT, value: Math.min(1, Math.max(0, (share - floor) / (1 - floor))) });
  }
  const weights = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round((100 * parts.reduce((sum, part) => sum + part.weight * part.value, 0)) / weights);
  return {
    letter: rankLetter(score),
    score,
    sets: Math.round(sets * 10) / 10,
    records,
    hardSets,
    rirSets: withRir.length,
    cut,
    rated: rated.length,
    performed,
    held,
  };
}
