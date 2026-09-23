/**
 * Enregistrement d'un exercice du catalogue, commun à l'éditeur et aux réparations en un tap.
 *
 * Le catalogue local est mis à jour tout de suite (hors ligne, sélecteurs et suggestions doivent
 * voir le changement), puis l'écriture part vers Neon ou dans la file de synchronisation. Si ni
 * l'un ni l'autre n'a conservé la mutation, le catalogue revient à l'état précédent et l'erreur
 * remonte : l'interface ne doit pas prétendre avoir enregistré ce qui ne l'est pas.
 */

import { upsertExercise } from "@/lib/db/actions";
import type { Exercise } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { writeThrough } from "@/lib/sync/write-through";

export async function saveExercise(toSave: Exercise): Promise<void> {
  const previous = useWorkoutStore.getState().catalog.find((item) => item.id === toSave.id) ?? null;
  useWorkoutStore.getState().upsertExerciseInCatalog(toSave);
  try {
    await writeThrough({ kind: "exercise_upsert", exercise: toSave }, () => upsertExercise(toSave));
  } catch (cause) {
    // Le test d'identité évite d'annuler une édition plus récente du même exercice faite pendant
    // l'attente.
    const current = useWorkoutStore.getState().catalog.find((item) => item.id === toSave.id);
    if (current === toSave) {
      if (previous) useWorkoutStore.getState().upsertExerciseInCatalog(previous);
      else useWorkoutStore.getState().removeExerciseFromCatalog(toSave.id);
    }
    throw cause;
  }
}
