import { estimated1RM } from "@/lib/engines/e1rm";
import { setsForNormalPrediction } from "@/lib/engines/set-structure";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

export interface ComparablePerformance {
  kind: "weighted" | "bodyweight";
  score: number;
}

/**
 * Une seule observation par exercice et par séance, même si l'exercice a été
 * ajouté deux fois. Les continuations drop/rest-pause restent dans leur bloc
 * logique et ne deviennent pas une fausse seconde performance.
 */
export function comparableSessionPerformances(
  session: WorkoutSession,
  exerciseById: Map<string, Exercise>
): Map<string, ComparablePerformance> {
  const setsByExercise = new Map<string, LoggedSet[]>();
  for (const logged of session.exercises) {
    const current = setsByExercise.get(logged.exerciseId) ?? [];
    current.push(...logged.sets);
    setsByExercise.set(logged.exerciseId, current);
  }

  const result = new Map<string, ComparablePerformance>();
  for (const [exerciseId, rawSets] of setsByExercise) {
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) continue;
    const chronological = [...rawSets]
      .sort(
        (a, b) =>
          a.timestamp.getTime() - b.timestamp.getTime() ||
          a.setSlotIndex - b.setSlotIndex ||
          a.id.localeCompare(b.id)
      )
      .map((set, setSlotIndex) => ({ ...set, setSlotIndex }));
    const sets = setsForNormalPrediction(chronological, {
      increment: exercise.smallestIncrement,
    });
    const weighted = sets.filter((set) => set.weight > 0);
    if (weighted.length > 0) {
      result.set(exerciseId, {
        kind: "weighted",
        score: Math.max(...weighted.map((set) => estimated1RM(set.weight, set.reps))),
      });
      continue;
    }
    const bodyweight = sets.filter((set) => set.weight === 0);
    if (bodyweight.length > 0) {
      result.set(exerciseId, {
        kind: "bodyweight",
        score: Math.max(...bodyweight.map((set) => set.reps)),
      });
    }
  }
  return result;
}
