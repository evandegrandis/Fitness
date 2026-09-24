"use server";

/**
 * Lecture ciblée pour le téléphone : les profils musculaires que Barbis a écrits pour les
 * exercices créés en salle. Ne lève jamais : sans réseau ou sans base, la séance continue et le
 * prochain passage réessaie.
 */

import { requireAuthenticatedSession } from "@/lib/auth";
import { getExercisesByIds } from "@/lib/db/queries";
import type { ServerProfile } from "@/lib/integrations/barbis";

const MAX_IDS = 20;

export async function fetchExerciseProfiles(ids: string[]): Promise<ServerProfile[]> {
  try {
    await requireAuthenticatedSession();
    const rows = await getExercisesByIds(ids.slice(0, MAX_IDS));
    return rows.map((exercise) => ({
      id: exercise.id,
      muscleMappings: exercise.muscleMappings,
      profileSource: exercise.profileSource ?? null,
      movementPattern: exercise.movementPattern,
      fatigueClass: exercise.fatigueClass,
      category: exercise.category,
      equivalenceKey: exercise.equivalenceKey ?? null,
    }));
  } catch {
    return [];
  }
}
