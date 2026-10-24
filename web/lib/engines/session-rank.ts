/**
 * Rang de fin de séance : S, A, B ou C, sur les objectifs d'Evan (26/09/2026) :
 * - séries (60) : le plus de séries possible par séance, pour tenir les objectifs de la semaine.
 *   Comptées comme dans l'Historique, où une série à RIR 3 vaut déjà 0,75 et à RIR 4 ou plus 0,5 :
 *   le RIR n'est pas pénalisé une seconde fois (Evan). Note pleine à 22 séries, le rythme d'une
 *   semaine or (~85 séries) en 4 séances ;
 * - records (40) : séries étoilées (les ★ de l'Historique), pleine à 4, à 2 en sèche (déclarée ou
 *   mesurée sur les pesées) : une sèche ne coûte jamais rien.
 * En séance d'étalonnage (aucun exercice qui puisse encore battre un record), seules les séries
 * comptent.
 *
 * Seuils : S 85, A 65, B 45. Sur les 23 séances d'Evan du 17/08 au 25/09 : 4 S, 7 A, 8 B, 4 C.
 * La comparaison à la suggestion du moteur (tenue, battue) reste mesurée pour la fiche de
 * personnage (Discipline) mais ne pèse pas sur le rang.
 */

import type { ExerciseReview, SessionReview } from "@/lib/engines/bilan";
import { buildWeightTrend, WEIGHT_TREND } from "@/lib/engines/body-weight";
import { sessionStars } from "@/lib/engines/session-stars";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { repsAtReferenceLoad } from "@/lib/engines/versus";
import { SetType } from "@/lib/models/enums";
import type { BodyWeightEntry, Exercise, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;

export const SESSION_RANK = {
  VOLUME_WEIGHT: 0.6,
  RECORDS_WEIGHT: 0.4,
  /** Séries (comptées comme dans l'Historique) pour la note pleine. */
  FULL_SETS: 22,
  /** Séries étoilées pour la note pleine de records ; en sèche, la moitié. */
  FULL_RECORDS: 4,
  FULL_RECORDS_CUT: 2,
  /**
   * Une série « tient » la référence quand, ramenée à la charge de la référence par la règle du moteur
   * (`versus.ts`, 7,5 % = 1 rep), il lui manque au plus une rep (Discipline). Avant le 12/10/2026 :
   * 97 % du 1RM d'Epley, soit la même rep de marge à charge égale.
   */
  HELD_REPS_SHORT: 1,
  /** Sèche mesurée : tendance de poids des 28 jours précédents, au seuil de perte de l'app. */
  CUT_WINDOW_DAYS: 28,
  THRESHOLDS: { S: 85, A: 65, B: 45 },
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
  cut: boolean;
  /** Face à la cible affichée sur la 1re série de chaque exercice, pour la Discipline (hors rang). */
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

/** La meilleure série du jour tient la référence sans la battre (même règle que « battre », `versus.ts`). */
export function heldReference(review: ExerciseReview, exercise: Exercise | undefined): boolean {
  if (review.performed || review.noData || !exercise) return false;
  const reps = repsAtReferenceLoad(exercise, { weight: review.achievedWeight, reps: review.achievedReps }, review.referenceWeight);
  return reps >= review.referenceReps - SESSION_RANK.HELD_REPS_SHORT;
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

/** Ce que le rang lit d'une séance, terminée ou en cours. */
export interface RankInput {
  /** Séries comptées comme dans l'Historique (RIR déjà pondéré). */
  sets: number;
  records: number;
  cut: boolean;
  /** Au moins un exercice déjà pratiqué : sinon, aucun record n'est possible (étalonnage). */
  recordsPossible: boolean;
}

/** Séries de la séance, comptées comme dans l'Historique (RIR pondéré, compléments fusionnés, cran de chaque machine). */
export function sessionSetUnits(session: WorkoutSession, catalogById: ReadonlyMap<string, Exercise>): number {
  return session.exercises.reduce(
    (sum, logged) => sum + physiologicalSetUnits(logged.sets, { increment: catalogById.get(logged.exerciseId)?.smallestIncrement }),
    0
  );
}

const RANKED_SET_TYPES = new Set<string>([SetType.work, SetType.topSet, SetType.backoff]);

/**
 * Ce que le rang lit d'une séance : UNE fonction pour l'en-tête de séance (séance en cours) et le bilan
 * (`career.ts`, séance terminée), pour que le rang en direct soit celui du bilan pour les mêmes séries
 * (24/10/2026 : B en direct, S au bilan). `previous` : les séances d'avant (la séance et les séances actives
 * exclues). `records` : le compte d'étoiles quand l'appelant l'a déjà fait avec la même définition
 * (`recordEvents`, qui passe par `session-stars.ts`) ; sinon compté ici.
 */
export function sessionRankInput({
  session,
  previous,
  catalog,
  bodyWeights,
  settings,
  records,
}: {
  session: WorkoutSession;
  previous: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  bodyWeights: readonly BodyWeightEntry[];
  settings: Pick<UserSettings, "trainingPhase" | "trainingPhaseStartedAt">;
  records?: number;
}): RankInput {
  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const before = previous.filter((candidate) => !candidate.isActive && candidate.id !== session.id);
  const practiced = new Set(
    before.flatMap((past) => past.exercises.filter((logged) => logged.sets.some((set) => set.completed)).map((logged) => logged.exerciseId))
  );
  return {
    sets: sessionSetUnits(session, catalogById),
    records: records ?? sessionStars(session, before, catalog).size,
    cut: cutAt(session.date, bodyWeights, settings),
    // Un record n'est possible que sur un exercice déjà pratiqué et fait aujourd'hui (sinon : étalonnage).
    recordsPossible: session.exercises.some(
      (logged) => practiced.has(logged.exerciseId) && logged.sets.some((set) => set.completed && RANKED_SET_TYPES.has(set.setType))
    ),
  };
}

export interface RankPart {
  key: "sets" | "records";
  weight: number;
  /** 0..1 */
  value: number;
}

export function rankParts(input: RankInput): RankPart[] {
  const parts: RankPart[] = [{ key: "sets", weight: SESSION_RANK.VOLUME_WEIGHT, value: Math.min(1, input.sets / SESSION_RANK.FULL_SETS) }];
  if (input.recordsPossible) {
    const full = input.cut ? SESSION_RANK.FULL_RECORDS_CUT : SESSION_RANK.FULL_RECORDS;
    parts.push({ key: "records", weight: SESSION_RANK.RECORDS_WEIGHT, value: Math.min(1, input.records / full) });
  }
  return parts;
}

export function rankScore(input: RankInput): number {
  const parts = rankParts(input);
  const weights = parts.reduce((sum, part) => sum + part.weight, 0);
  return Math.round((100 * parts.reduce((sum, part) => sum + part.weight * part.value, 0)) / weights);
}

const NEXT_LETTER: Record<RankLetter, { letter: RankLetter; min: number } | null> = {
  C: { letter: "B", min: SESSION_RANK.THRESHOLDS.B },
  B: { letter: "A", min: SESSION_RANK.THRESHOLDS.A },
  A: { letter: "S", min: SESSION_RANK.THRESHOLDS.S },
  S: null,
};

export interface NextRankPlan {
  letter: RankLetter;
  /** Séries de plus (à RIR 2 ou moins, qui comptent pleines), `null` si elles ne suffisent pas. */
  sets: number | null;
  /** Records de plus (sans série), `null` s'ils ne suffisent pas ou sont impossibles. */
  records: number | null;
}

/**
 * Ce qu'il manque, en séance, pour le rang suivant : soit des séries de plus, soit des records. Les deux chemins sont donnés séparément : le plus court se lit tout de suite.
 */
export function nextRankPlan(input: RankInput): NextRankPlan | null {
  const next = NEXT_LETTER[rankLetter(rankScore(input))];
  if (!next) return null;
  let sets: number | null = null;
  for (let extra = 1; extra <= SESSION_RANK.FULL_SETS * 2; extra += 1) {
    const reached = rankScore({ ...input, sets: input.sets + extra });
    if (reached >= next.min) {
      sets = extra;
      break;
    }
  }
  let records: number | null = null;
  if (input.recordsPossible) {
    for (let extra = 1; extra <= SESSION_RANK.FULL_RECORDS; extra += 1) {
      if (rankScore({ ...input, records: input.records + extra }) >= next.min) {
        records = extra;
        break;
      }
    }
  }
  return { letter: next.letter, sets, records };
}

export function rankSession({
  review,
  catalog,
  input,
}: {
  review: SessionReview;
  catalog: ReadonlyMap<string, Exercise>;
  /** `sessionRankInput` : la même lecture que l'en-tête de séance. */
  input: RankInput;
}): SessionRank | null {
  if (input.sets <= 0) return null;
  const rated = review.exercises.filter((exercise) => !exercise.calibrating && !exercise.noData);
  const performed = rated.filter((exercise) => exercise.performed).length;
  const held = rated.filter((exercise) => heldReference(exercise, catalog.get(exercise.exerciseId))).length;
  const score = rankScore(input);
  return {
    letter: rankLetter(score),
    score,
    sets: Math.round(input.sets * 10) / 10,
    records: input.records,
    cut: input.cut,
    rated: rated.length,
    performed,
    held,
  };
}
