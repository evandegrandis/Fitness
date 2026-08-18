"use server";

/**
 * Server Actions (écritures).
 *
 * Les écritures multi-tables utilisent `db.batch()`. Le driver Neon HTTP
 * transmet ce lot à `neon().transaction(...)` : toutes les requêtes sont
 * validées ou annulées ensemble, sans connexion websocket persistante.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "./client";
import {
  exerciseToMappingRows,
  exerciseToRow,
  exerciseToUpsertUpdateRow,
  goalToRow,
  recoveryCheckinToRow,
  sessionToCardioEntryRows,
  sessionToLoggedExerciseRows,
  sessionToLoggedSetRows,
  sessionToRow,
  sessionToSupersetRows,
  settingsToRow,
  templateToExerciseRows,
  templateToRow,
} from "./mappers";
import {
  bodyWeights,
  cardioEntries,
  exercises,
  loggedExercises,
  loggedSets,
  muscleGoals,
  muscleMappings,
  recoveryCheckins,
  supersetGroups,
  templateExercises,
  userSettings,
  workoutSessions,
  workoutTemplates,
} from "./schema";
import { parseBackup } from "@/lib/models/backup";
import { hasAnyRecoveryValue } from "@/lib/models/recovery";
import { requireAuthenticatedSession } from "@/lib/auth";
import type {
  Exercise,
  MuscleGoal,
  RecoveryCheckinInput,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/models/types";

function revalidateWorkoutData(): void {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// saveSession — upsert complet d'une séance (logged_exercises, logged_sets,
// superset_groups, cardio_entries). Utilisé à la fin d'une séance ET pour l'import.
//
// Stratégie : delete-then-insert des enfants. On détache d'abord les
// logged_exercises de leurs superset_groups (sinon la FK
// logged_exercises.superset_group_id bloque la suppression des groupes),
// puis on supprime superset_groups et logged_exercises (cascade sur
// logged_sets), puis on réinsère tout dans l'ordre parent -> enfants.
// ---------------------------------------------------------------------------

export async function saveSession(session: WorkoutSession, revalidate = true): Promise<void> {
  await requireAuthenticatedSession();
  const sessionRow = sessionToRow(session);
  const operations: BatchItem<"pg">[] = [
    db
      .insert(workoutSessions)
      .values(sessionRow)
      .onConflictDoUpdate({ target: workoutSessions.id, set: sessionRow }),
  ];

  // `undefined` identifie une ancienne séance restaurée depuis localStorage :
  // dans ce cas on préserve le cardio déjà en base. `[]` reste une demande
  // explicite de supprimer toutes les entrées cardio de la séance.
  if (session.cardioEntries !== undefined) {
    operations.push(db.delete(cardioEntries).where(eq(cardioEntries.sessionId, session.id)));
    const cardioRows = sessionToCardioEntryRows(session);
    if (cardioRows.length > 0) {
      operations.push(db.insert(cardioEntries).values(cardioRows));
    }
  }

  operations.push(
    db
      .update(loggedExercises)
      .set({ supersetGroupId: null })
      .where(eq(loggedExercises.sessionId, session.id)),
    db.delete(supersetGroups).where(eq(supersetGroups.sessionId, session.id))
  );
  // cascade: supprime aussi les logged_sets liés.
  operations.push(db.delete(loggedExercises).where(eq(loggedExercises.sessionId, session.id)));

  const supersetRows = sessionToSupersetRows(session);
  if (supersetRows.length > 0) {
    operations.push(db.insert(supersetGroups).values(supersetRows));
  }

  const exerciseRows = sessionToLoggedExerciseRows(session);
  if (exerciseRows.length > 0) {
    operations.push(db.insert(loggedExercises).values(exerciseRows));
  }

  const setRows = sessionToLoggedSetRows(session);
  if (setRows.length > 0) {
    operations.push(db.insert(loggedSets).values(setRows));
  }

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
    })
  );

  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  // L'autosave passe revalidate=false : écrire en base ne doit PAS déclencher un
  // refetch complet de l'app à chaque set (sinon boucle de re-render / page jamais idle).
  if (revalidate) revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

export async function deleteSession(id: string): Promise<void> {
  await requireAuthenticatedSession();
  // Supprimer la séance peut retirer le dernier usage réel d'un exercice. La
  // date dérivée doit être corrigée dans la même transaction que le delete,
  // sinon le tri « récents » du catalogue conserve une valeur fantôme.
  await db.batch([
    db.delete(workoutSessions).where(eq(workoutSessions.id, id)),
    db.update(exercises).set({
      lastUsed: sql<Date | null>`(
        select max(ls.timestamp)
        from ${loggedExercises} le
        join ${loggedSets} ls on ls.logged_exercise_id = le.id
        where le.exercise_id = ${exercises.id} and ls.completed = true
      )`,
    }),
  ]);
  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// upsertExercise / deleteExercise
// ---------------------------------------------------------------------------

export async function upsertExercise(exercise: Exercise): Promise<void> {
  await requireAuthenticatedSession();
  const row = exerciseToRow(exercise);
  const updateRow = exerciseToUpsertUpdateRow(exercise);
  const operations: BatchItem<"pg">[] = [
    db
      .insert(exercises)
      .values(row)
      .onConflictDoUpdate({ target: exercises.id, set: updateRow }),
    db.delete(muscleMappings).where(eq(muscleMappings.exerciseId, exercise.id)),
  ];
  const mappingRows = exerciseToMappingRows(exercise);
  if (mappingRows.length > 0) {
    operations.push(db.insert(muscleMappings).values(mappingRows));
  }

  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  revalidateWorkoutData();
}

export type DeleteExerciseResult = "deleted" | "referenced" | "not_found";

export async function deleteExercise(id: string): Promise<DeleteExerciseResult> {
  await requireAuthenticatedSession();
  if (typeof id !== "string" || id.trim().length === 0 || id.length > 200) {
    throw new Error("Identifiant d'exercice invalide.");
  }

  // `logged_exercises.exercise_id` est volontairement RESTRICT : les mappings
  // de l'exercice restent indispensables aux volumes/benchmarks historiques.
  // Un delete naïf levait donc une erreur FK; `writeThrough` la prenait pour
  // une panne réseau, mettait l'opération impossible en outbox puis, ordre
  // FIFO oblige, bloquait toutes les mutations suivantes. Le prédicat est
  // atomique avec le DELETE : même une sauvegarde concurrente ne crée pas de
  // fenêtre check-then-delete.
  const referencesExercise = db
    .select({ value: sql<number>`1` })
    .from(loggedExercises)
    .where(eq(loggedExercises.exerciseId, id));
  const deleted = await db
    .delete(exercises)
    .where(and(eq(exercises.id, id), notExists(referencesExercise)))
    .returning({ id: exercises.id });

  let result: DeleteExerciseResult = "deleted";
  if (deleted.length === 0) {
    const reference = await db
      .select({ id: loggedExercises.id })
      .from(loggedExercises)
      .where(eq(loggedExercises.exerciseId, id))
      .limit(1);
    result = reference.length > 0 ? "referenced" : "not_found";
  }
  revalidateWorkoutData();
  return result;
}

// ---------------------------------------------------------------------------
// setGoals — remplace intégralement la table.
// ---------------------------------------------------------------------------

export async function setGoals(goals: MuscleGoal[]): Promise<void> {
  await requireAuthenticatedSession();
  const operations: BatchItem<"pg">[] = [db.delete(muscleGoals)];
  if (goals.length > 0) {
    operations.push(db.insert(muscleGoals).values(goals.map(goalToRow)));
  }

  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// updateSettings — table singleton (id fixe "singleton").
// ---------------------------------------------------------------------------

export async function updateSettings(settings: UserSettings): Promise<void> {
  await requireAuthenticatedSession();
  const row = settingsToRow(settings);
  await db
    .insert(userSettings)
    .values(row)
    .onConflictDoUpdate({ target: userSettings.id, set: row });

  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// saveRecoveryCheckin
// ---------------------------------------------------------------------------

export async function saveRecoveryCheckin(checkin: RecoveryCheckinInput): Promise<void> {
  await saveRecoveryCheckins([checkin]);
}

export async function saveRecoveryCheckins(checkins: RecoveryCheckinInput[]): Promise<void> {
  await requireAuthenticatedSession();
  if (checkins.length === 0) return;
  const rows = checkins.map(recoveryCheckinToRow);
  const operations = rows.map((row, index) => {
    if (!hasAnyRecoveryValue(checkins[index]!)) {
      // Même payload/outbox que l'upsert : un état entièrement inconnu signifie
      // « retirer ce jour ». Le DELETE par date est idempotent au rejeu offline.
      return db.delete(recoveryCheckins).where(eq(recoveryCheckins.date, row.date));
    }
    return db
      .insert(recoveryCheckins)
      .values(row)
      .onConflictDoUpdate({
        target: recoveryCheckins.date,
        set: {
          tookCreatine: row.tookCreatine,
          proteinTargetMet: row.proteinTargetMet,
          sleepHours: row.sleepHours,
          hadAlcohol: row.hadAlcohol,
        },
      });
  });
  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// saveBodyWeight / deleteBodyWeight
// ---------------------------------------------------------------------------

/**
 * Enregistre une pesée. Une seule par jour civil : la date est normalisée à minuit UTC et sert
 * de clé de conflit, donc repeser deux fois le même jour corrige au lieu d'empiler.
 *
 * Met aussi à jour `user_settings.bodyWeightKg`, que le moteur de repères et les exercices au
 * poids du corps lisent encore comme valeur unique — sans ça, l'app garderait un poids figé
 * pendant qu'une courbe évolue à côté.
 */
export async function saveBodyWeight(entry: { id: string; measuredOn: Date; weightKg: number }): Promise<void> {
  await requireAuthenticatedSession();
  const day = new Date(
    Date.UTC(entry.measuredOn.getFullYear(), entry.measuredOn.getMonth(), entry.measuredOn.getDate())
  );

  await db
    .insert(bodyWeights)
    .values({ id: entry.id, measuredOn: day, weightKg: entry.weightKg })
    .onConflictDoUpdate({ target: bodyWeights.measuredOn, set: { weightKg: entry.weightKg } });

  const [latest] = await db.select().from(bodyWeights).orderBy(desc(bodyWeights.measuredOn)).limit(1);
  if (latest) {
    await db
      .update(userSettings)
      .set({ bodyWeightKg: latest.weightKg })
      .where(eq(userSettings.id, "singleton"));
  }

  revalidateWorkoutData();
}

export async function deleteBodyWeight(id: string): Promise<void> {
  await requireAuthenticatedSession();
  await db.delete(bodyWeights).where(eq(bodyWeights.id, id));
  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// saveTemplate / deleteTemplate
// ---------------------------------------------------------------------------

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  await requireAuthenticatedSession();
  const row = templateToRow(template);
  const operations: BatchItem<"pg">[] = [
    db
      .insert(workoutTemplates)
      .values(row)
      .onConflictDoUpdate({ target: workoutTemplates.id, set: row }),
    db.delete(templateExercises).where(eq(templateExercises.templateId, template.id)),
  ];
  const exerciseRows = templateToExerciseRows(template);
  if (exerciseRows.length > 0) {
    operations.push(db.insert(templateExercises).values(exerciseRows));
  }

  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  revalidateWorkoutData();
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireAuthenticatedSession();
  await db.delete(workoutTemplates).where(eq(workoutTemplates.id, id));
  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// importBackup — parse puis réécrit TOUTE la base (reset + insert). Réutilise
// les mêmes helpers de mapping que le seed pour rester cohérent.
// ---------------------------------------------------------------------------

export async function importBackup(json: unknown): Promise<void> {
  await requireAuthenticatedSession();
  const backup = parseBackup(json);
  const operations: BatchItem<"pg">[] = [];

  // -- Reset (enfants avant parents) ---------------------------------------
  operations.push(
    db.delete(loggedSets),
    db.update(loggedExercises).set({ supersetGroupId: null }),
    db.delete(supersetGroups),
    db.delete(loggedExercises),
    db.delete(cardioEntries),
    db.delete(workoutSessions),
    db.delete(templateExercises),
    db.delete(workoutTemplates),
    db.delete(muscleMappings),
    db.delete(exercises),
    db.delete(muscleGoals),
    db.delete(recoveryCheckins),
    db.delete(bodyWeights)
  );

  // -- Insert (parents avant enfants) --------------------------------------
  if (backup.exercises.length > 0) {
    operations.push(db.insert(exercises).values(backup.exercises.map(exerciseToRow)));
    const mappingRows = backup.exercises.flatMap(exerciseToMappingRows);
    if (mappingRows.length > 0) {
      operations.push(db.insert(muscleMappings).values(mappingRows));
    }
  }

  if (backup.goals.length > 0) {
    operations.push(db.insert(muscleGoals).values(backup.goals.map(goalToRow)));
  }

  const settingsRow = settingsToRow(backup.settings);
  operations.push(
    db
      .insert(userSettings)
      .values(settingsRow)
      .onConflictDoUpdate({ target: userSettings.id, set: settingsRow })
  );

  if (backup.templates.length > 0) {
    operations.push(db.insert(workoutTemplates).values(backup.templates.map(templateToRow)));
    const templateExerciseRows = backup.templates.flatMap(templateToExerciseRows);
    if (templateExerciseRows.length > 0) {
      operations.push(db.insert(templateExercises).values(templateExerciseRows));
    }
  }

  if (backup.sessions.length > 0) {
    operations.push(db.insert(workoutSessions).values(backup.sessions.map(sessionToRow)));

    const cardioRows = backup.sessions.flatMap(sessionToCardioEntryRows);
    if (cardioRows.length > 0) {
      operations.push(db.insert(cardioEntries).values(cardioRows));
    }

    const supersetRows = backup.sessions.flatMap(sessionToSupersetRows);
    if (supersetRows.length > 0) {
      operations.push(db.insert(supersetGroups).values(supersetRows));
    }

    const exerciseRows = backup.sessions.flatMap(sessionToLoggedExerciseRows);
    if (exerciseRows.length > 0) {
      operations.push(db.insert(loggedExercises).values(exerciseRows));
    }

    const setRows = backup.sessions.flatMap(sessionToLoggedSetRows);
    if (setRows.length > 0) {
      operations.push(db.insert(loggedSets).values(setRows));
    }
  }

  if (backup.recoveryCheckins.length > 0) {
    operations.push(db.insert(recoveryCheckins).values(backup.recoveryCheckins.map(recoveryCheckinToRow)));
  }

  if (backup.bodyWeights.length > 0) {
    operations.push(
      db.insert(bodyWeights).values(
        backup.bodyWeights.map((entry) => ({
          id: entry.id,
          measuredOn: entry.measuredOn,
          weightKg: entry.weightKg,
        }))
      )
    );
  }

  // L'import est un remplacement intégral et atomique. `last_used` est dérivé
  // des séries restaurées plutôt que cru aveuglément depuis le fichier.
  operations.push(
    db.update(exercises).set({
      lastUsed: sql<Date | null>`(
        select max(ls.timestamp)
        from ${loggedExercises} le
        join ${loggedSets} ls on ls.logged_exercise_id = le.id
        where le.exercise_id = ${exercises.id} and ls.completed = true
      )`,
    })
  );

  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  revalidateWorkoutData();
}
