/**
 * « Battre la suggestion » : une seule définition dans l'app (compteur, combo, Discipline, bilan, et la
 * marge d'ambition de la cible, `target.ts`). Déplacé de `bilan.ts` le 11/10/2026 pour que le moteur
 * puisse la lire sans dépendance circulaire ; `bilan.ts` la réexporte.
 */
import { estimated1RM } from "@/lib/engines/e1rm";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import { cleanWeight } from "@/lib/format";

export function formatSet(weight: number, reps: number): string {
  return weight > 0 ? `${cleanWeight(weight)}kg×${reps}` : `PDC×${reps}`;
}

/** Effort effectif (mêmes règles que `progression.ts::effectiveLoad`) : assistedBodyweight inverse le signe. */
export function effectiveEffort(exercise: Exercise, weight: number): number {
  return exercise.setPatternMode === "assisted_bodyweight" ? -weight : weight;
}

/**
 * Une série face à la suggestion affichée au moment de la valider (`suggestedWeight/Reps` du set),
 * selon les MÊMES règles d'effort que le bilan (`comparePerformance`) : « battue » (plus de reps à
 * la même charge, ou un effort supérieur à une autre charge), « tenue » (exactement l'effort
 * demandé), « en dessous ». `null` sans suggestion enregistrée. Sert au compteur et au combo de la
 * séance (`session-game.ts`) : une seule définition de « battre la suggestion » dans l'app.
 */
export function setVersusSuggestion(exercise: Exercise, set: LoggedSet): "beat" | "met" | "below" | null {
  if (set.suggestedWeight == null || set.suggestedReps == null || set.suggestedReps <= 0) return null;
  const reference = { weight: set.suggestedWeight, reps: set.suggestedReps };
  const comparison = comparePerformance(exercise, set, reference);
  if (!comparison.performed) return "below";
  if (Math.abs(comparison.gapKg) < 0.01) return comparison.gapReps > 0 ? "beat" : "met";
  if (comparison.gapKg > 0) return "beat";
  return estimated1RM(set.weight, set.reps) > estimated1RM(reference.weight, reference.reps) + 1e-6 ? "beat" : "met";
}

export function comparePerformance(
  exercise: Exercise,
  achieved: LoggedSet,
  reference: { weight: number; reps: number }
): { performed: boolean; gapKg: number; gapReps: number; message: string } {
  const referenceEffort = effectiveEffort(exercise, reference.weight);
  const achievedEffort = effectiveEffort(exercise, achieved.weight);
  const sameLoad = Math.abs(achievedEffort - referenceEffort) < 0.01;

  if (sameLoad) {
    const gapReps = achieved.reps - reference.reps;
    const performed = gapReps >= 0;
    return {
      performed,
      gapKg: 0,
      gapReps,
      message: performed
        ? gapReps > 0
          ? `Performé : ${formatSet(achieved.weight, achieved.reps)}, +${gapReps} reps vs attendu`
          : `Performé : objectif atteint (${formatSet(achieved.weight, achieved.reps)})`
        : `En dessous : ${formatSet(achieved.weight, achieved.reps)} au lieu de ×${reference.reps} attendu`,
    };
  }

  const gapKg = achievedEffort - referenceEffort;
  const repsQualify = achieved.reps >= exercise.repTargetMin;
  let performed = false;
  if (repsQualify && exercise.setPatternMode !== "assisted_bodyweight" && achieved.weight > 0 && reference.weight > 0) {
    performed = estimated1RM(achieved.weight, achieved.reps) >= estimated1RM(reference.weight, reference.reps);
  } else if (repsQualify) {
    performed = gapKg > 0;
  }

  return {
    performed,
    gapKg,
    gapReps: 0,
    message: performed
      ? `Performé : ${formatSet(achieved.weight, achieved.reps)}, effort équivalent ou supérieur`
      : `En dessous : ${formatSet(achieved.weight, achieved.reps)} vs ${formatSet(reference.weight, reference.reps)} attendu`,
  };
}

