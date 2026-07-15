"use server";

/**
 * Server Actions (écritures).
 *
 * IMPORTANT — pas de transactions : le driver `drizzle-orm/neon-http` (HTTP,
 * sans connexion persistante, adapté aux fonctions serverless) ne supporte
 * PAS `db.transaction(...)` (il lève `"No transactions support in neon-http
 * driver"` — vérifié dans `node_modules/drizzle-orm/neon-http/session.js`).
 * Toutes les écritures multi-tables ci-dessous enchaînent donc des
 * delete/insert séquentiels awaités un par un, dans un ordre qui respecte
 * les FK (enfants supprimés avant parents, parents insérés avant enfants).
 * Ce n'est pas atomique : une requête tardive peut échouer après que des
 * étapes précédentes ont déjà été committées. Acceptable ici (app
 * mono-utilisateur, réécritures idempotentes sur re-run) ; à revisiter si un
 * jour on bascule sur `drizzle-orm/neon-serverless` (driver websocket, qui
 * supporte de vraies transactions).
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "./client";
import {
  exerciseToMappingRows,
  exerciseToRow,
  goalToRow,
  recoveryCheckinToRow,
  sessionToLoggedExerciseRows,
  sessionToLoggedSetRows,
  sessionToRow,
  sessionToSupersetRows,
  settingsToRow,
  templateToExerciseRows,
  templateToRow,
} from "./mappers";
import {
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
import type {
  Exercise,
  MuscleGoal,
  RecoveryCheckin,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/models/types";

function revalidateWorkoutData(): void {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// saveSession — upsert complet d'une séance (logged_exercises, logged_sets,
// superset_groups). Utilisé à la fin d'une séance ET pour l'import.
//
// Stratégie : delete-then-insert des enfants. On détache d'abord les
// logged_exercises de leurs superset_groups (sinon la FK
// logged_exercises.superset_group_id bloque la suppression des groupes),
// puis on supprime superset_groups et logged_exercises (cascade sur
// logged_sets), puis on réinsère tout dans l'ordre parent -> enfants.
// ---------------------------------------------------------------------------

export async function saveSession(session: WorkoutSession): Promise<void> {
  const sessionRow = sessionToRow(session);
  await db
    .insert(workoutSessions)
    .values(sessionRow)
    .onConflictDoUpdate({ target: workoutSessions.id, set: sessionRow });

  await db
    .update(loggedExercises)
    .set({ supersetGroupId: null })
    .where(eq(loggedExercises.sessionId, session.id));
  await db.delete(supersetGroups).where(eq(supersetGroups.sessionId, session.id));
  // cascade: supprime aussi les logged_sets liés.
  await db.delete(loggedExercises).where(eq(loggedExercises.sessionId, session.id));

  const supersetRows = sessionToSupersetRows(session);
  if (supersetRows.length > 0) {
    await db.insert(supersetGroups).values(supersetRows);
  }

  const exerciseRows = sessionToLoggedExerciseRows(session);
  if (exerciseRows.length > 0) {
    await db.insert(loggedExercises).values(exerciseRows);
  }

  const setRows = sessionToLoggedSetRows(session);
  if (setRows.length > 0) {
    await db.insert(loggedSets).values(setRows);
  }

  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

export async function deleteSession(id: string): Promise<void> {
  await db.delete(workoutSessions).where(eq(workoutSessions.id, id));
  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// upsertExercise / deleteExercise
// ---------------------------------------------------------------------------

export async function upsertExercise(exercise: Exercise): Promise<void> {
  const row = exerciseToRow(exercise);
  await db
    .insert(exercises)
    .values(row)
    .onConflictDoUpdate({ target: exercises.id, set: row });

  await db.delete(muscleMappings).where(eq(muscleMappings.exerciseId, exercise.id));
  const mappingRows = exerciseToMappingRows(exercise);
  if (mappingRows.length > 0) {
    await db.insert(muscleMappings).values(mappingRows);
  }

  revalidateWorkoutData();
}

export async function deleteExercise(id: string): Promise<void> {
  await db.delete(exercises).where(eq(exercises.id, id));
  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// setGoals — remplace intégralement la table.
// ---------------------------------------------------------------------------

export async function setGoals(goals: MuscleGoal[]): Promise<void> {
  await db.delete(muscleGoals);
  if (goals.length > 0) {
    await db.insert(muscleGoals).values(goals.map(goalToRow));
  }

  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// updateSettings — table singleton (id fixe "singleton").
// ---------------------------------------------------------------------------

export async function updateSettings(settings: UserSettings): Promise<void> {
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

export async function saveRecoveryCheckin(checkin: RecoveryCheckin): Promise<void> {
  const row = recoveryCheckinToRow(checkin);
  await db
    .insert(recoveryCheckins)
    .values(row)
    .onConflictDoUpdate({ target: recoveryCheckins.id, set: row });

  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// saveTemplate / deleteTemplate
// ---------------------------------------------------------------------------

export async function saveTemplate(template: WorkoutTemplate): Promise<void> {
  const row = templateToRow(template);
  await db
    .insert(workoutTemplates)
    .values(row)
    .onConflictDoUpdate({ target: workoutTemplates.id, set: row });

  await db.delete(templateExercises).where(eq(templateExercises.templateId, template.id));
  const exerciseRows = templateToExerciseRows(template);
  if (exerciseRows.length > 0) {
    await db.insert(templateExercises).values(exerciseRows);
  }

  revalidateWorkoutData();
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.delete(workoutTemplates).where(eq(workoutTemplates.id, id));
  revalidateWorkoutData();
}

// ---------------------------------------------------------------------------
// importBackup — parse puis réécrit TOUTE la base (reset + insert). Réutilise
// les mêmes helpers de mapping que le seed pour rester cohérent.
// ---------------------------------------------------------------------------

export async function importBackup(json: unknown): Promise<void> {
  const backup = parseBackup(json);

  // -- Reset (enfants avant parents) ---------------------------------------
  await db.delete(loggedSets);
  await db.update(loggedExercises).set({ supersetGroupId: null });
  await db.delete(supersetGroups);
  await db.delete(loggedExercises);
  await db.delete(workoutSessions);
  await db.delete(templateExercises);
  await db.delete(workoutTemplates);
  await db.delete(muscleMappings);
  await db.delete(exercises);
  await db.delete(muscleGoals);
  await db.delete(recoveryCheckins);

  // -- Insert (parents avant enfants) --------------------------------------
  if (backup.exercises.length > 0) {
    await db.insert(exercises).values(backup.exercises.map(exerciseToRow));
    const mappingRows = backup.exercises.flatMap(exerciseToMappingRows);
    if (mappingRows.length > 0) {
      await db.insert(muscleMappings).values(mappingRows);
    }
  }

  if (backup.goals.length > 0) {
    await db.insert(muscleGoals).values(backup.goals.map(goalToRow));
  }

  const settingsRow = settingsToRow(backup.settings);
  await db
    .insert(userSettings)
    .values(settingsRow)
    .onConflictDoUpdate({ target: userSettings.id, set: settingsRow });

  if (backup.templates.length > 0) {
    await db.insert(workoutTemplates).values(backup.templates.map(templateToRow));
    const templateExerciseRows = backup.templates.flatMap(templateToExerciseRows);
    if (templateExerciseRows.length > 0) {
      await db.insert(templateExercises).values(templateExerciseRows);
    }
  }

  if (backup.sessions.length > 0) {
    await db.insert(workoutSessions).values(backup.sessions.map(sessionToRow));

    const supersetRows = backup.sessions.flatMap(sessionToSupersetRows);
    if (supersetRows.length > 0) {
      await db.insert(supersetGroups).values(supersetRows);
    }

    const exerciseRows = backup.sessions.flatMap(sessionToLoggedExerciseRows);
    if (exerciseRows.length > 0) {
      await db.insert(loggedExercises).values(exerciseRows);
    }

    const setRows = backup.sessions.flatMap(sessionToLoggedSetRows);
    if (setRows.length > 0) {
      await db.insert(loggedSets).values(setRows);
    }
  }

  revalidateWorkoutData();
}
