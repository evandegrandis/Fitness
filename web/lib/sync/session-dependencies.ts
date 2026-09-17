import type { Exercise, WorkoutSession } from "@/lib/models/types";

/**
 * Exercices du catalogue local référencés par une séance. Ils voyagent avec
 * la séance jusqu'au serveur (`syncSession`) : une séance créée hors-ligne
 * avec un exercice nouveau reste écrivable seule, sans dépendre de l'ordre de
 * la file. Module pur (aucun import serveur) : utilisable côté client.
 */
export function exercisesReferencedBySession(session: WorkoutSession, catalog: readonly Exercise[]): Exercise[] {
  const wanted = new Set(session.exercises.map((logged) => logged.exerciseId));
  return catalog.filter((exercise) => wanted.has(exercise.id));
}
