/**
 * « Battre la suggestion » : une seule définition dans l'app (compteur, combo, Discipline, bilan,
 * Historique, ce que lit Barbis, et la marge d'ambition de la cible, `target.ts`). Déplacé de
 * `bilan.ts` le 11/10/2026 pour que le moteur puisse la lire sans dépendance circulaire ; `bilan.ts`
 * la réexporte.
 *
 * Règle (décision d'Evan du 12/10/2026, audit des suggestions du 11/10) : à la charge de la cible,
 * on compare les reps. À une autre charge, les reps doivent rester dans la fourchette (au moins
 * `repTargetMin`) ; plus lourd, c'est battu ; plus léger, la série est ramenée à la charge de la cible
 * par la règle du moteur (7,5 % de charge = 1 rep, `repsAtLoad`), puis comparée. Plus aucun 1RM
 * d'Epley ici : il comptait 1 rep pour 2,5 à 3 % de charge, et demandait donc à une série plus légère
 * environ trois fois plus de reps en plus que la règle avec laquelle le moteur prévoit et reprojette.
 * Les records gardent leurs propres règles (`classify`).
 */
import { ALGO_V2 } from "@/lib/engines/constants";
import { effTotal, type LoadMode } from "@/lib/engines/predict";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import { cleanWeight } from "@/lib/format";

export type Versus = "beat" | "met" | "below";

export function formatSet(weight: number, reps: number): string {
  return weight > 0 ? `${cleanWeight(weight)}kg×${reps}` : `PDC×${reps}`;
}

/** Effort effectif (mêmes règles que `progression.ts::effectiveLoad`) : assistedBodyweight inverse le signe. */
export function effectiveEffort(exercise: Exercise, weight: number): number {
  return exercise.setPatternMode === "assisted_bodyweight" ? -weight : weight;
}

function loadModeOf(exercise: Exercise): LoadMode {
  if (exercise.setPatternMode === "weighted_bodyweight") return "weighted_bodyweight";
  if (exercise.setPatternMode === "assisted_bodyweight") return "assisted_bodyweight";
  return "external";
}

/**
 * Reps que vaut une série à une autre charge, par la règle du moteur (prévision, reprojection) :
 * 7,5 % de la charge effective de la série = 1 rep, au moins un cran de l'exercice. Le poids du corps
 * est celui par défaut du moteur, pour que le verdict d'une série passée ne bouge pas avec la pesée
 * (il ne joue qu'au poids du corps lesté ou assisté). Non arrondi.
 */
export function repsAtLoad(exercise: Exercise, set: { weight: number; reps: number }, load: number): number {
  const mode = loadModeOf(exercise);
  const from = effTotal(set.weight, mode);
  const to = effTotal(load, mode);
  const kgPerRep = Math.max(exercise.smallestIncrement, ALGO_V2.REP_SLOPE_PCT * Math.max(1, from));
  return set.reps + (from - to) / kgPerRep;
}

/** Reps de la série ramenées à la charge de la référence, arrondies comme les reps affichées. */
export function repsAtReferenceLoad(exercise: Exercise, set: { weight: number; reps: number }, referenceWeight: number): number {
  const reps = repsAtLoad(exercise, set, referenceWeight);
  return reps >= 0 ? Math.floor(reps + 0.5) : Math.ceil(reps - 0.5);
}

/** Une série face à une référence (charge × reps) : la définition unique de « battre ». */
export function versusReference(
  exercise: Exercise,
  achieved: { weight: number; reps: number },
  reference: { weight: number; reps: number }
): Versus {
  const gapKg = effectiveEffort(exercise, achieved.weight) - effectiveEffort(exercise, reference.weight);
  if (Math.abs(gapKg) < 0.01) {
    return achieved.reps > reference.reps ? "beat" : achieved.reps === reference.reps ? "met" : "below";
  }
  if (achieved.reps < exercise.repTargetMin) return "below";
  if (gapKg > 0) return "beat";
  const reps = repsAtReferenceLoad(exercise, achieved, reference.weight);
  return reps > reference.reps ? "beat" : reps === reference.reps ? "met" : "below";
}

/**
 * Une série face à la suggestion affichée au moment de la valider (`suggestedWeight/Reps` du set) :
 * « battue », « tenue » (exactement la cible), « en dessous ». `null` sans suggestion enregistrée.
 */
export function setVersusSuggestion(exercise: Exercise, set: LoggedSet): Versus | null {
  if (set.suggestedWeight == null || set.suggestedReps == null || set.suggestedReps <= 0) return null;
  return versusReference(exercise, set, { weight: set.suggestedWeight, reps: set.suggestedReps });
}

export function comparePerformance(
  exercise: Exercise,
  achieved: LoggedSet,
  reference: { weight: number; reps: number }
): { performed: boolean; gapKg: number; gapReps: number; message: string } {
  const performed = versusReference(exercise, achieved, reference) !== "below";
  const referenceEffort = effectiveEffort(exercise, reference.weight);
  const achievedEffort = effectiveEffort(exercise, achieved.weight);

  if (Math.abs(achievedEffort - referenceEffort) < 0.01) {
    const gapReps = achieved.reps - reference.reps;
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

  return {
    performed,
    gapKg: achievedEffort - referenceEffort,
    gapReps: 0,
    message: performed
      ? `Performé : ${formatSet(achieved.weight, achieved.reps)}, effort équivalent ou supérieur`
      : `En dessous : ${formatSet(achieved.weight, achieved.reps)} vs ${formatSet(reference.weight, reference.reps)} attendu`,
  };
}
