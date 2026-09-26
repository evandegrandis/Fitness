/**
 * Rang de fin de séance : S, A, B ou C (Evan, 26/09/2026).
 *
 * Le rang lit le bilan (`buildSessionReview`), qui se recalcule pour n'importe quelle séance passée :
 * toutes les séances depuis mars ont donc un rang, pas seulement celles qui ont gardé la suggestion
 * affichée. Trois composantes, sur 100 :
 * - exécution (55) : part des exercices au-dessus de la référence du moteur ; une charge tenue vaut
 *   une demi-réussite, et une réussite entière en sèche (une sèche ne coûte jamais rien) ;
 * - records (25) : exercices étoilés dans la séance, plein à 3 ;
 * - volume (20) : séries efficaces rapportées à l'habitude (médiane des 8 séances précédentes).
 * Une séance courte (moins de 60 % du volume habituel) plafonne au rang B : ce qui compte, ce sont
 * les séries (Evan), deux exercices réussis ne font pas une grande séance.
 *
 * Seuils calés sur les 66 séances notées d'Evan au 26/09/2026 : S ≈ 14 %, A ≈ 30 %, B ≈ 36 %,
 * C ≈ 20 %. Un S doit rester rare, un C n'est pas un échec (une séance tenue sans record).
 */

import type { ExerciseReview, SessionReview } from "@/lib/engines/bilan";
import { buildWeightTrend, WEIGHT_TREND } from "@/lib/engines/body-weight";
import { estimated1RM } from "@/lib/engines/e1rm";
import { SetPatternMode } from "@/lib/models/enums";
import type { BodyWeightEntry, Exercise, UserSettings } from "@/lib/models/types";

const DAY_MS = 86_400_000;

export const SESSION_RANK = {
  EXECUTION_WEIGHT: 0.55,
  RECORDS_WEIGHT: 0.25,
  VOLUME_WEIGHT: 0.2,
  /** Records (exercices étoilés) pour la note pleine. */
  RECORDS_FOR_FULL: 3,
  /** Une série « tient » la référence à 97 % de son 1RM estimé, ou à une rep près au poids du corps. */
  HELD_E1RM_RATIO: 0.97,
  HELD_CREDIT: 0.5,
  HABIT_SESSIONS: 8,
  /** Sous cette part du volume habituel, le rang ne dépasse pas B. */
  SHORT_SESSION_VOLUME: 0.6,
  /** En dessous, la séance est une séance d'étalonnage : pas de rang. */
  MIN_RATED_EXERCISES: 2,
  /** Sèche mesurée : tendance de poids des 28 jours précédents, au seuil de perte de l'app. */
  CUT_WINDOW_DAYS: 28,
  THRESHOLDS: { S: 85, A: 70, B: 55 },
} as const;

export type RankLetter = "S" | "A" | "B" | "C";

export interface SessionRank {
  letter: RankLetter;
  /** 0..100 */
  score: number;
  rated: number;
  performed: number;
  held: number;
  /** Exercices étoilés dans la séance. */
  records: number;
  /** Séries efficaces de la séance et habitude du moment (`null` à la toute première séance). */
  effectiveSets: number;
  habitSets: number | null;
  cut: boolean;
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
  records,
  effectiveSets,
  habitSets,
  cut,
}: {
  review: SessionReview;
  catalog: ReadonlyMap<string, Exercise>;
  records: number;
  effectiveSets: number;
  habitSets: number | null;
  cut: boolean;
}): SessionRank | null {
  const rated = review.exercises.filter((exercise) => !exercise.calibrating && !exercise.noData);
  if (rated.length < SESSION_RANK.MIN_RATED_EXERCISES) return null;
  const performed = rated.filter((exercise) => exercise.performed).length;
  const held = rated.filter((exercise) => heldReference(exercise, catalog.get(exercise.exerciseId))).length;
  const execution = (performed + held * (cut ? 1 : SESSION_RANK.HELD_CREDIT)) / rated.length;
  const recordScore = Math.min(records, SESSION_RANK.RECORDS_FOR_FULL) / SESSION_RANK.RECORDS_FOR_FULL;
  const volume = habitSets && habitSets > 0 ? Math.min(effectiveSets / habitSets, 1) : 1;
  const raw = Math.round(
    100 *
      (SESSION_RANK.EXECUTION_WEIGHT * execution +
        SESSION_RANK.RECORDS_WEIGHT * recordScore +
        SESSION_RANK.VOLUME_WEIGHT * volume)
  );
  const score = volume < SESSION_RANK.SHORT_SESSION_VOLUME ? Math.min(raw, SESSION_RANK.THRESHOLDS.A - 1) : raw;
  return {
    letter: rankLetter(score),
    score,
    rated: rated.length,
    performed,
    held,
    records,
    effectiveSets: Math.round(effectiveSets * 10) / 10,
    habitSets: habitSets === null ? null : Math.round(habitSets * 10) / 10,
    cut,
  };
}
