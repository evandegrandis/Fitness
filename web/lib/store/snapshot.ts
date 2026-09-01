/**
 * Construction du `FinishedWorkoutSnapshot`, miroir de la fin de
 * `WorkoutViewModel.finishWorkout` (Swift, lignes ~373-467).
 */

import { normalRecordSets, type RecordKind } from "@/lib/engines/records";
import { parentSets, weeklyProgress } from "@/lib/engines/effective-sets";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { SetType } from "@/lib/models/enums";
import { parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import {
  orderedSets,
  type Exercise,
  type LoggedSet,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";

export interface MuscleImpact {
  parent: MuscleParent;
  sets: number;
}

export interface RecordHighlight {
  title: string;
  detail: string;
}

export interface FinishedWorkoutSnapshot {
  duration: string;
  setCount: number;
  exerciseCount: number;
  prCount: number;
  progressionSignal: string;
  topMuscles: MuscleImpact[];
  remainingMuscles: MuscleImpact[];
  prHighlights: RecordHighlight[];
}

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

function formatDuration(startTime: Date, endTime: Date): string {
  const totalSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) {
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Miroir de `WorkoutSession.totalWorkSets` : total des work sets complétés. */
function totalWorkSets(session: WorkoutSession, exerciseIndex: Map<string, Exercise>): number {
  const total = session.exercises.reduce((acc, logged) => {
    const increment = exerciseIndex.get(logged.exerciseId)?.smallestIncrement;
    return acc + physiologicalSetUnits(logged.sets, { increment });
  }, 0);
  return Math.round(total * 10) / 10;
}

export interface BuildSnapshotParams {
  session: WorkoutSession;
  exercises: Exercise[];
  /** Sets marqués comme record pendant CETTE séance (clé = LoggedSet.id). */
  justHitRecord: Record<string, RecordKind>;
  /** Séances terminées (hors séance active) — pour le calcul des objectifs restants. */
  finishedSessions: WorkoutSession[];
  goals: MuscleGoal[];
}

/**
 * Miroir de la section snapshot de `WorkoutViewModel.finishWorkout`.
 * Ne mute rien — pure fonction appelée par `finish()` dans le store.
 */
export function buildFinishedWorkoutSnapshot(params: BuildSnapshotParams): FinishedWorkoutSnapshot {
  const { session, exercises, justHitRecord, finishedSessions, goals } = params;
  const exerciseIndex = new Map(exercises.map((e) => [e.id, e]));

  const muscleTotals = new Map<MuscleParent, number>();
  const sets = totalWorkSets(session, exerciseIndex);
  const duration = formatDuration(session.startTime, session.endTime ?? new Date());

  const prCount = session.exercises.reduce((count, logged) => {
    const exercise = exerciseIndex.get(logged.exerciseId);
    if (!exercise) return count;
    const ordered = orderedSets(logged);
    const eligible = [
      ...normalRecordSets(ordered, exercise),
      ...ordered.filter((set) => set.completed && set.setType === SetType.finisher),
    ];
    return count + eligible.filter((set) => justHitRecord[set.id] !== undefined).length;
  }, 0);

  const progressionSignal = prCount > 0 ? "Haussier" : sets >= 12 ? "Stable+" : "Stable";

  for (const logged of session.exercises) {
    const exercise = exerciseIndex.get(logged.exerciseId);
    for (const [parent, value] of parentSets(logged, exercise)) {
      muscleTotals.set(parent, (muscleTotals.get(parent) ?? 0) + value);
    }
  }

  const topMuscles: MuscleImpact[] = [...muscleTotals.entries()]
    .filter(([, value]) => value > 0)
    .sort(([pa, va], [pb, vb]) => {
      if (Math.abs(va - vb) > 0.01) return vb - va;
      return parentDisplayName[pa].localeCompare(parentDisplayName[pb]);
    })
    .slice(0, 3)
    .map(([parent, value]) => ({ parent, sets: Math.round(value) }));

  const prHighlights: RecordHighlight[] = session.exercises.flatMap((logged) => {
    const exercise = exerciseIndex.get(logged.exerciseId);
    if (!exercise) return [];
    const ordered = orderedSets(logged);
    const eligible = [
      ...normalRecordSets(ordered, exercise),
      ...ordered.filter((set) => set.completed && set.setType === SetType.finisher),
    ];
    const keptSets = eligible.filter((set) => justHitRecord[set.id] !== undefined);
    return keptSets.map((set: LoggedSet) => ({
      title: exercise.name,
      detail: `${set.weight > 0 ? `${cleanWeight(set.weight)}×${set.reps}` : `BW×${set.reps}`}${
        set.setType === SetType.finisher ? " · finisher" : ""
      }`,
    }));
  });

  const progress = weeklyProgress(finishedSessions, exercises, goals, session.date, session);
  const remainingMuscles: MuscleImpact[] = progress
    .filter((p) => p.remaining > 0)
    .sort((a, b) => {
      if (Math.abs(a.remaining - b.remaining) > 0.01) return b.remaining - a.remaining;
      return parentDisplayName[a.parent].localeCompare(parentDisplayName[b.parent]);
    })
    .slice(0, 3)
    .map((p) => ({ parent: p.parent, sets: Math.ceil(p.remaining) }));

  return {
    duration,
    setCount: sets,
    exerciseCount: session.exercises.filter((logged) => {
      const increment = exerciseIndex.get(logged.exerciseId)?.smallestIncrement;
      return physiologicalSetUnits(logged.sets, { increment }) > 0;
    }).length,
    prCount,
    progressionSignal,
    topMuscles,
    remainingMuscles,
    prHighlights,
  };
}
