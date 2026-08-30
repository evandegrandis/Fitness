/**
 * « Quoi faire maintenant ? » : priorités musculaires vivantes pendant la séance.
 *
 * Le moteur distingue volontairement :
 *   - le déficit sur les 7 derniers jours ;
 *   - la récence réelle dans l'historique (pas `Exercise.lastUsed`, qui peut être périmé) ;
 *   - ce qui est déjà prévu ou réalisé dans la séance en cours.
 *
 * Un groupe abandonné depuis plusieurs semaines n'est plus supprimé silencieusement : il reste
 * visible en fin de liste, clairement marqué « hors routine récente ». À l'inverse, les exercices
 * proposés sont uniquement ceux réellement exécutés récemment ou déjà présents aujourd'hui.
 *
 * Moteur pur : aucune écriture, aucun état dérivé persisté (ALGO_SPEC_HARDENED §0.2).
 */

import {
  parentSets,
  rolling7DayProgress,
  type ParentMuscleProgress,
} from "@/lib/engines/effective-sets";
import {
  aggregateCoefficient,
  type Exercise,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";
import { MUSCLE_PARENTS, type MuscleParent } from "@/lib/models/muscles";

export const SESSION_FOCUS = {
  /** Au-delà de trois semaines sans set effectif, le groupe passe après la routine actuelle. */
  RELEVANCE_WINDOW_DAYS: 21,
  /** Même fenêtre pour ne pas ressusciter un exercice pratiqué il y a deux mois. */
  EXERCISE_SUGGESTION_WINDOW_DAYS: 21,
  /** En deçà, le déficit est du bruit d'arrondi. */
  MIN_REMAINING: 0.5,
  /** La feuille est scrollable : montrer tous les parents possibles reste lisible et honnête. */
  MAX_ROWS: 14,
  /** Deux choix suffisent pour agir sans transformer le panneau en picker bis. */
  MAX_EXERCISE_SUGGESTIONS: 2,
} as const;

export interface SessionFocusExerciseSuggestion {
  exerciseId: string;
  exerciseName: string;
  /** null si l'exercice est prévu aujourd'hui mais absent de l'historique récent. */
  daysSinceLastUsed: number | null;
  /** Déjà dans la séance : le chip informe, il ne doit pas créer un doublon. */
  inCurrentSession: boolean;
}

export interface SessionFocusRow extends ParentMuscleProgress {
  /** Séries effectives déjà faites sur ce muscle DANS la séance en cours. */
  doneThisSession: number;
  /** Jours depuis le dernier set effectif connu ; null si jamais vu. */
  daysSinceLastTrained: number | null;
  /** Ni travaillé récemment, ni déjà prévu dans la séance courante. */
  isDormant: boolean;
  /** Exercices actuels/récents qui peuvent concrètement combler ce déficit. */
  suggestedExercises: SessionFocusExerciseSuggestion[];
}

export interface SessionFocus {
  /** Muscles à viser : routine active d'abord, groupes dormants à la fin. */
  priorities: SessionFocusRow[];
  /** Muscles travaillés aujourd'hui, pour montrer ce qui est déjà couvert. */
  workedToday: SessionFocusRow[];
  /** Nombre de déficits relégués en fin de liste faute d'activité récente. */
  dormantCount: number;
}

const DAY_MS = 86_400_000;

function wholeDaysSince(referenceDate: Date, pastDate: Date): number {
  return Math.max(0, Math.floor((referenceDate.getTime() - pastDate.getTime()) / DAY_MS));
}

interface ActivityRecency {
  lastByParent: Map<MuscleParent, Date>;
  lastByExerciseId: Map<string, Date>;
}

/** Dernières utilisations dérivées des vrais sets, indépendamment de l'ordre reçu de `history`. */
function activityRecency(history: WorkoutSession[], exercises: Exercise[]): ActivityRecency {
  const exerciseIndex = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const lastByParent = new Map<MuscleParent, Date>();
  const lastByExerciseId = new Map<string, Date>();

  for (const session of history) {
    if (session.isActive) continue;
    for (const logged of session.exercises) {
      const exercise = exerciseIndex.get(logged.exerciseId);
      const contributions = parentSets(logged, exercise);
      if (contributions.size === 0) continue;

      const usedAt = logged.sets.reduce(
        (latest, set) => (set.completed && set.timestamp > latest ? set.timestamp : latest),
        session.date
      );
      const previousExerciseUse = lastByExerciseId.get(logged.exerciseId);
      if (!previousExerciseUse || usedAt > previousExerciseUse) {
        lastByExerciseId.set(logged.exerciseId, usedAt);
      }
      for (const [parent, value] of contributions) {
        if (value <= 0) continue;
        const previousParentUse = lastByParent.get(parent);
        if (!previousParentUse || usedAt > previousParentUse) lastByParent.set(parent, usedAt);
      }
    }
  }

  return { lastByParent, lastByExerciseId };
}

function doneIn(session: WorkoutSession | null | undefined, exercises: Exercise[]): Map<MuscleParent, number> {
  const totals = new Map<MuscleParent, number>();
  if (!session) return totals;
  const index = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  for (const logged of session.exercises) {
    for (const [parent, value] of parentSets(logged, index.get(logged.exerciseId))) {
      totals.set(parent, (totals.get(parent) ?? 0) + value);
    }
  }
  return totals;
}

function plannedParents(session: WorkoutSession | null, exercises: Exercise[]): Set<MuscleParent> {
  const planned = new Set<MuscleParent>();
  if (!session) return planned;
  const exerciseIndex = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  for (const logged of session.exercises) {
    const exercise = exerciseIndex.get(logged.exerciseId);
    if (!exercise) continue;
    for (const parent of MUSCLE_PARENTS) {
      if (aggregateCoefficient(exercise, parent) > 0) planned.add(parent);
    }
  }
  return planned;
}

function suggestionsForParent(
  parent: MuscleParent,
  exercises: Exercise[],
  liveSession: WorkoutSession | null,
  recency: ActivityRecency,
  referenceDate: Date
): SessionFocusExerciseSuggestion[] {
  const inSessionIds = new Set(liveSession?.exercises.map((logged) => logged.exerciseId) ?? []);
  const liveOrder = new Map(
    (liveSession?.exercises ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((logged, index) => [logged.exerciseId, index])
  );

  return exercises
    .map((exercise) => {
      const coefficient = aggregateCoefficient(exercise, parent);
      const lastUsedAt = recency.lastByExerciseId.get(exercise.id) ?? null;
      const daysSinceLastUsed = lastUsedAt ? wholeDaysSince(referenceDate, lastUsedAt) : null;
      return {
        exercise,
        coefficient,
        daysSinceLastUsed,
        inCurrentSession: inSessionIds.has(exercise.id),
        liveOrder: liveOrder.get(exercise.id) ?? Number.POSITIVE_INFINITY,
      };
    })
    .filter(
      (candidate) =>
        candidate.coefficient > 0 &&
        (candidate.inCurrentSession ||
          (candidate.daysSinceLastUsed !== null &&
            candidate.daysSinceLastUsed <= SESSION_FOCUS.EXERCISE_SUGGESTION_WINDOW_DAYS))
    )
    .sort((a, b) => {
      if (a.inCurrentSession !== b.inCurrentSession) return a.inCurrentSession ? -1 : 1;
      if (a.liveOrder !== b.liveOrder) return a.liveOrder - b.liveOrder;
      const recencyDelta =
        (a.daysSinceLastUsed ?? Number.POSITIVE_INFINITY) -
        (b.daysSinceLastUsed ?? Number.POSITIVE_INFINITY);
      if (recencyDelta !== 0) return recencyDelta;
      if (a.coefficient !== b.coefficient) return b.coefficient - a.coefficient;
      return a.exercise.name.localeCompare(b.exercise.name, "fr");
    })
    .slice(0, SESSION_FOCUS.MAX_EXERCISE_SUGGESTIONS)
    .map(({ exercise, daysSinceLastUsed, inCurrentSession }) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      daysSinceLastUsed,
      inCurrentSession,
    }));
}

export function sessionFocus(
  history: WorkoutSession[],
  exercises: Exercise[],
  goals: MuscleGoal[],
  liveSession: WorkoutSession | null,
  referenceDate: Date = new Date()
): SessionFocus {
  const progress = rolling7DayProgress(history, exercises, goals, referenceDate, liveSession);
  const recency = activityRecency(history, exercises);
  const doneNow = doneIn(liveSession, exercises);
  const planned = plannedParents(liveSession, exercises);

  const withSession = progress.map((p): SessionFocusRow => {
    const doneThisSession = Math.round((doneNow.get(p.parent) ?? 0) * 10) / 10;
    const lastHistoricalUse = recency.lastByParent.get(p.parent) ?? null;
    const daysSinceLastTrained = doneThisSession > 0
      ? 0
      : lastHistoricalUse
        ? wholeDaysSince(referenceDate, lastHistoricalUse)
        : null;
    const isDormant =
      !planned.has(p.parent) &&
      (daysSinceLastTrained === null || daysSinceLastTrained > SESSION_FOCUS.RELEVANCE_WINDOW_DAYS);

    return {
      ...p,
      doneThisSession,
      daysSinceLastTrained,
      isDormant,
      suggestedExercises: suggestionsForParent(p.parent, exercises, liveSession, recency, referenceDate),
    };
  });

  const priorities = withSession
    .filter((p) => p.goalSets > 0 && p.remaining >= SESSION_FOCUS.MIN_REMAINING)
    .sort((a, b) => {
      if (a.isDormant !== b.isDormant) return a.isDormant ? 1 : -1;
      // À statut comparable, afficher le plus gros déficit en premier. Les
      // groupes abandonnés restent toujours relégués après la routine active,
      // même avec un déficit théorique important.
      if (a.remaining !== b.remaining) return b.remaining - a.remaining;
      const recencyDelta =
        (a.daysSinceLastTrained ?? Number.POSITIVE_INFINITY) -
        (b.daysSinceLastTrained ?? Number.POSITIVE_INFINITY);
      if (recencyDelta !== 0) return recencyDelta;
      return a.parent.localeCompare(b.parent, "fr");
    })
    .slice(0, SESSION_FOCUS.MAX_ROWS);

  const workedToday = withSession
    .filter((p) => p.doneThisSession > 0)
    .sort((a, b) => b.doneThisSession - a.doneThisSession);

  const dormantCount = priorities.filter((p) => p.isDormant).length;

  return { priorities, workedToday, dormantCount };
}
