import type { LoggedExercise, WorkoutSession } from "@/lib/models/types";
import { supersetPairKey, type HabitualSupersetPair } from "@/lib/engines/superset-habits";
import { handleSupersetLink } from "@/lib/store/superset";

export interface AutoLinkedPair {
  key: string;
  /** Exercices de la séance liés, dans l'ordre du groupe (le premier présent d'abord). */
  loggedExerciseIds: [string, string];
  names: [string, string];
  linkedSessions: number;
}

function firstFree(session: WorkoutSession, exerciseId: string): LoggedExercise | undefined {
  return session.exercises
    .filter((logged) => logged.exerciseId === exerciseId && logged.supersetGroupId === null)
    .sort((a, b) => a.orderIndex - b.orderIndex)[0];
}

/**
 * Lie dans la séance les paires qu'Evan forme d'habitude (`habitualSupersetPairs`), dès que les deux
 * exercices y sont, libres, et qu'il n'a pas défait ce lien dans cette séance (`declined`). Même
 * chemin qu'un lien fait à la main (`handleSupersetLink`) : l'exercice déjà présent garde sa place,
 * l'autre le rejoint juste après, les tours sont recalculés.
 */
export function autoLinkHabitualPairs(
  session: WorkoutSession,
  pairs: readonly HabitualSupersetPair[],
  declined: ReadonlySet<string>,
  newGroupId: () => string
): { session: WorkoutSession; linked: AutoLinkedPair[] } {
  let working = session;
  const linked: AutoLinkedPair[] = [];
  for (const pair of pairs) {
    const key = supersetPairKey(pair.exerciseIds[0], pair.exerciseIds[1]);
    if (declined.has(key)) continue;
    const a = firstFree(working, pair.exerciseIds[0]);
    const b = firstFree(working, pair.exerciseIds[1]);
    if (!a || !b) continue;
    const [first, second] = a.orderIndex <= b.orderIndex ? [a, b] : [b, a];
    const result = handleSupersetLink(working, second.id, first.id, newGroupId);
    if (result.session === working) continue;
    working = result.session;
    linked.push({
      key,
      loggedExerciseIds: [first.id, second.id],
      names: [first.exerciseName, second.exerciseName],
      linkedSessions: pair.linkedSessions,
    });
  }
  return { session: working, linked };
}

/**
 * Paires qu'Evan défait en détachant cet exercice de son groupe : il ne faut plus les relier
 * d'office dans cette séance.
 */
export function pairKeysBrokenByDetach(session: WorkoutSession, loggedExerciseId: string): string[] {
  const leaving = session.exercises.find((logged) => logged.id === loggedExerciseId);
  if (!leaving?.supersetGroupId) return [];
  const group = session.supersetGroups.find((candidate) => candidate.id === leaving.supersetGroupId);
  if (!group) return [];
  return group.memberOrder
    .map((id) => session.exercises.find((logged) => logged.id === id))
    .filter((logged): logged is LoggedExercise => logged !== undefined && logged.id !== leaving.id)
    .map((logged) => supersetPairKey(leaving.exerciseId, logged.exerciseId));
}

/** Le message du toast « Annuler » : ce qui a été lié, et sur quelle preuve. */
export function autoLinkMessage(linked: readonly AutoLinkedPair[], addedLoggedExerciseId?: string): string {
  if (linked.length > 1) {
    return `Supersets habituels formés : ${linked.map((pair) => pair.names.join(" + ")).join(", ")}`;
  }
  const [pair] = linked;
  const times = `lié ${pair.linkedSessions} fois ces 4 semaines`;
  // L'exercice qu'il vient d'ajouter, il le connaît : on nomme celui avec lequel il est lié.
  if (pair.loggedExerciseIds[0] === addedLoggedExerciseId) return `Superset avec ${pair.names[1]} (${times})`;
  if (pair.loggedExerciseIds[1] === addedLoggedExerciseId) return `Superset avec ${pair.names[0]} (${times})`;
  return `Superset ${pair.names.join(" + ")} (${times})`;
}
