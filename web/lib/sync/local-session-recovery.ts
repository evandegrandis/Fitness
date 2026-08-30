import type { Exercise, WorkoutSession } from "@/lib/models/types";

function normalizedName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr");
}

/** Règle de suppression explicitement demandée : ne jamais ressusciter ce brouillon connu. */
export function isPulloverMachineOnlySession(session: WorkoutSession): boolean {
  if ((session.cardioEntries?.length ?? 0) > 0) return false;
  const completedExercises = session.exercises.filter((logged) =>
    logged.sets.some((set) => set.completed)
  );
  return (
    completedExercises.length === 1 &&
    normalizedName(completedExercises[0]!.exerciseName) === "pullover machine"
  );
}

/**
 * Une séance locale terminée et absente de Neon est une donnée à récupérer, jamais un cache à
 * écraser. Cette règle est volontairement indépendante des watermarks : un autosave final peut
 * avoir disparu de l'outbox alors que `history` contient encore la seule copie complète.
 */
export function localSessionsMissingFromServer(
  localSessions: readonly WorkoutSession[],
  serverSessions: readonly WorkoutSession[]
): WorkoutSession[] {
  const serverIds = new Set(serverSessions.map((session) => session.id));
  return localSessions.filter(
    (session) =>
      !session.isActive &&
      !serverIds.has(session.id) &&
      !isPulloverMachineOnlySession(session) &&
      (session.exercises.some((logged) => logged.sets.some((set) => set.completed)) ||
        (session.cardioEntries?.length ?? 0) > 0)
  );
}

/** Exercices créés hors-ligne dont les séances récupérées dépendent (ordre avant les séances). */
export function localExercisesRequiredBySessions(
  sessions: readonly WorkoutSession[],
  localCatalog: readonly Exercise[],
  serverCatalog: readonly Exercise[]
): Exercise[] {
  const serverIds = new Set(serverCatalog.map((exercise) => exercise.id));
  const requiredIds = new Set(
    sessions.flatMap((session) => session.exercises.map((logged) => logged.exerciseId))
  );
  return localCatalog.filter(
    (exercise) => requiredIds.has(exercise.id) && !serverIds.has(exercise.id)
  );
}

/**
 * Le serveur gagne pour un id qu'il connaît (édition centrale confirmée), mais une séance qui
 * n'existe qu'en local reste dans l'historique tant que sa récupération n'est pas confirmée.
 */
export function mergeServerHistoryWithoutDroppingLocal(
  serverSessions: readonly WorkoutSession[],
  localSessions: readonly WorkoutSession[]
): WorkoutSession[] {
  const serverIds = new Set(serverSessions.map((session) => session.id));
  return [...serverSessions, ...localSessions.filter((session) => !serverIds.has(session.id))];
}
