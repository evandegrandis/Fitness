import { eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "./client";
import {
  exerciseToMappingRows,
  exerciseToRow,
  sessionToCardioEntryRows,
  sessionToLoggedExerciseRows,
  sessionToLoggedSetRows,
  sessionToRow,
  sessionToSupersetRows,
} from "./mappers";
import {
  cardioEntries,
  exercises,
  loggedExercises,
  loggedSets,
  muscleMappings,
  supersetGroups,
  workoutSessions,
} from "./schema";
import { withKnownMuscleProfile } from "@/lib/data/catalog-muscle-profiles";
import { needsBarbisProfile } from "@/lib/integrations/barbis";
import type { Exercise, WorkoutSession } from "@/lib/models/types";

/**
 * Construction des lots d'écriture de séance, partagée par `saveSession`
 * (server action historique) et par `syncSession` (synchro outbox).
 *
 * Une séance doit pouvoir être écrite SEULE. Avant le 17/09/2026, elle
 * dépendait d'un upsert d'exercice arrivé plus tôt dans la file ; quand cet
 * ordre n'était pas tenu (écriture directe de l'exercice échouée, file
 * réordonnée par une récupération), l'insertion des `logged_exercises`
 * violait la clé étrangère vers `exercises`, et la file causale gelait
 * derrière. Ici les exercices que la séance référence voyagent avec elle et
 * sont insérés dans le même lot, en « insert si absent » : le serveur garde la
 * main sur un exercice qu'il connaît déjà, mais ne peut plus refuser une
 * séance pour un exercice créé hors-ligne.
 */

/**
 * Lot « exercices manquants » : parmi les exercices référencés, seuls ceux que
 * le serveur ne connaît pas sont insérés (avec leurs mappings musculaires).
 * Un exercice connu n'est jamais réécrit ici : le catalogue central garde la
 * main, et un rejeu de l'outbox ne peut pas rétrograder une édition récente.
 */
export async function missingExerciseOperations(
  referenced: readonly Exercise[]
): Promise<{ operations: BatchItem<"pg">[]; inserted: string[]; needsProfile: string[] }> {
  if (referenced.length === 0) return { operations: [], inserted: [], needsProfile: [] };
  const ids = referenced.map((exercise) => exercise.id);
  const known = new Set(
    (await db.select({ id: exercises.id }).from(exercises).where(inArray(exercises.id, ids))).map((row) => row.id),
  );
  const operations: BatchItem<"pg">[] = [];
  const inserted: string[] = [];
  const needsProfile: string[] = [];
  for (const raw of referenced) {
    if (known.has(raw.id)) continue;
    const exercise = withKnownMuscleProfile(raw);
    operations.push(db.insert(exercises).values(exerciseToRow(exercise)).onConflictDoNothing({ target: exercises.id }));
    const mappingRows = exerciseToMappingRows(exercise);
    if (mappingRows.length > 0) operations.push(db.insert(muscleMappings).values(mappingRows).onConflictDoNothing());
    inserted.push(exercise.id);
    if (exercise.createdByUser && needsBarbisProfile(exercise.profileSource)) needsProfile.push(exercise.id);
  }
  return { operations, inserted, needsProfile };
}

/**
 * Lot de la séance elle-même : upsert de l'en-tête, delete-then-insert des
 * enfants (cardio, supersets, exercices loggués, séries) puis recalcul de
 * `exercises.last_used` depuis les séries réelles.
 */
export function sessionWriteOperations(session: WorkoutSession): BatchItem<"pg">[] {
  const sessionRow = sessionToRow(session);
  const operations: BatchItem<"pg">[] = [
    db.insert(workoutSessions).values(sessionRow).onConflictDoUpdate({ target: workoutSessions.id, set: sessionRow }),
  ];

  // `undefined` identifie une ancienne séance restaurée depuis localStorage :
  // dans ce cas on préserve le cardio déjà en base. `[]` reste une demande
  // explicite de supprimer toutes les entrées cardio de la séance.
  if (session.cardioEntries !== undefined) {
    operations.push(db.delete(cardioEntries).where(eq(cardioEntries.sessionId, session.id)));
    const cardioRows = sessionToCardioEntryRows(session);
    if (cardioRows.length > 0) operations.push(db.insert(cardioEntries).values(cardioRows));
  }

  operations.push(
    db.update(loggedExercises).set({ supersetGroupId: null }).where(eq(loggedExercises.sessionId, session.id)),
    db.delete(supersetGroups).where(eq(supersetGroups.sessionId, session.id)),
  );
  // cascade : supprime aussi les logged_sets liés.
  operations.push(db.delete(loggedExercises).where(eq(loggedExercises.sessionId, session.id)));

  const supersetRows = sessionToSupersetRows(session);
  if (supersetRows.length > 0) operations.push(db.insert(supersetGroups).values(supersetRows));

  const exerciseRows = sessionToLoggedExerciseRows(session);
  if (exerciseRows.length > 0) operations.push(db.insert(loggedExercises).values(exerciseRows));

  const setRows = sessionToLoggedSetRows(session);
  if (setRows.length > 0) operations.push(db.insert(loggedSets).values(setRows));

  // Recalcule depuis la source de vérité complète, y compris lorsqu'une série
  // ou un exercice vient d'être retiré de la séance la plus récente.
  operations.push(
    db.update(exercises).set({
      lastUsed: sql<Date | null>`(
        select max(ls.timestamp)
        from ${loggedExercises} le
        join ${loggedSets} ls on ls.logged_exercise_id = le.id
        where le.exercise_id = ${exercises.id} and ls.completed = true
      )`,
    }),
  );
  return operations;
}
