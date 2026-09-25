import type { Exercise } from "@/lib/models/types";

/**
 * Les modifications faites dans l'éditeur, appliquées sur la version LA PLUS RÉCENTE de l'exercice
 * et non sur la copie lue à l'ouverture. Barbis peut poser les muscles d'une machine créée en salle
 * pendant que l'éditeur est ouvert : enregistrer la copie entière les effaçait. Seuls les champs
 * qu'Evan a réellement changés partent ; tout le reste garde la valeur à jour.
 */
export function mergeExerciseEdits(opened: Exercise, draft: Exercise, latest: Exercise): Exercise {
  const merged: Exercise = { ...latest };
  for (const key of Object.keys(draft) as Array<keyof Exercise>) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(opened[key])) {
      (merged as Record<keyof Exercise, unknown>)[key] = draft[key];
    }
  }
  return merged;
}
