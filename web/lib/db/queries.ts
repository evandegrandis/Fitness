/**
 * Fonctions de lecture (Server Components). Toutes tolèrent l'absence de
 * `DATABASE_URL` : plutôt que de laisser `db` lever au premier accès (voir
 * `client.ts`), on vérifie `hasDatabaseUrl()` en amont et on retourne des
 * valeurs vides — utile pour que `next build` (prerender) ne casse pas avant
 * que Neon soit provisionné.
 */

import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "./client";
import {
  mapExerciseRow,
  mapGoalRow,
  mapRecoveryCheckinRow,
  mapSessionRow,
  mapSettingsRow,
  mapTemplateRow,
} from "./mappers";
import {
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
import type {
  Exercise,
  MuscleGoal,
  RecoveryCheckin,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/models/types";

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// ---------------------------------------------------------------------------
// getExercises
// ---------------------------------------------------------------------------

export async function getExercises(): Promise<Exercise[]> {
  if (!hasDatabaseUrl()) return [];

  const exerciseRows = await db.select().from(exercises).orderBy(asc(exercises.sortOrder));
  if (exerciseRows.length === 0) return [];

  const mappingRows = await db
    .select()
    .from(muscleMappings)
    .where(
      inArray(
        muscleMappings.exerciseId,
        exerciseRows.map((e) => e.id)
      )
    );

  return exerciseRows.map((row) => mapExerciseRow(row, mappingRows));
}

// ---------------------------------------------------------------------------
// getSessions — séances FINIES (endTime non nul), triées date DESC, avec
// logged_exercises + logged_sets + superset_groups imbriqués.
// ---------------------------------------------------------------------------

export async function getSessions(): Promise<WorkoutSession[]> {
  if (!hasDatabaseUrl()) return [];

  const sessionRows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.isActive, false))
    .orderBy(desc(workoutSessions.date));

  // Une séance terminée = isActive false (déjà filtré). La durée (endTime) peut
  // être inconnue (séances transcrites sans horaires) sans que la séance
  // disparaisse de l'historique.
  const finished = sessionRows;
  if (finished.length === 0) return [];

  const sessionIds = finished.map((s) => s.id);

  const [exerciseRows, supersetRows, cardioRows] = await Promise.all([
    db.select().from(loggedExercises).where(inArray(loggedExercises.sessionId, sessionIds)),
    db.select().from(supersetGroups).where(inArray(supersetGroups.sessionId, sessionIds)),
    db.select().from(cardioEntries).where(inArray(cardioEntries.sessionId, sessionIds)),
  ]);

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setRows =
    exerciseIds.length > 0
      ? await db.select().from(loggedSets).where(inArray(loggedSets.loggedExerciseId, exerciseIds))
      : [];

  return finished.map((sessionRow) =>
    mapSessionRow(sessionRow, exerciseRows, setRows, supersetRows, cardioRows)
  );
}

/** Une seule séance par id (avec exercices/sets/supersets), ou null si absente. */
export async function getSessionById(id: string): Promise<WorkoutSession | null> {
  if (!hasDatabaseUrl()) return null;

  const sessionRows = await db.select().from(workoutSessions).where(eq(workoutSessions.id, id));
  const sessionRow = sessionRows[0];
  if (!sessionRow) return null;

  const [exerciseRows, supersetRows, cardioRows] = await Promise.all([
    db.select().from(loggedExercises).where(eq(loggedExercises.sessionId, id)),
    db.select().from(supersetGroups).where(eq(supersetGroups.sessionId, id)),
    db.select().from(cardioEntries).where(eq(cardioEntries.sessionId, id)),
  ]);

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setRows =
    exerciseIds.length > 0
      ? await db.select().from(loggedSets).where(inArray(loggedSets.loggedExerciseId, exerciseIds))
      : [];

  return mapSessionRow(sessionRow, exerciseRows, setRows, supersetRows, cardioRows);
}

// ---------------------------------------------------------------------------
// getGoals
// ---------------------------------------------------------------------------

export async function getGoals(): Promise<MuscleGoal[]> {
  if (!hasDatabaseUrl()) return [];
  const rows = await db.select().from(muscleGoals);
  return rows.map(mapGoalRow);
}

// ---------------------------------------------------------------------------
// getSettings — table singleton ; renvoie les défauts si absente.
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: UserSettings = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "Evan",
  supersetRestSeconds: 180,
    bodyWeightKg: null,
};

export async function getSettings(): Promise<UserSettings> {
  if (!hasDatabaseUrl()) return DEFAULT_SETTINGS;
  const rows = await db.select().from(userSettings).where(eq(userSettings.id, "singleton"));
  const row = rows[0];
  return row ? mapSettingsRow(row) : DEFAULT_SETTINGS;
}

// ---------------------------------------------------------------------------
// getTemplates
// ---------------------------------------------------------------------------

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  if (!hasDatabaseUrl()) return [];

  const templateRows = await db
    .select()
    .from(workoutTemplates)
    .orderBy(asc(workoutTemplates.sortOrder));
  if (templateRows.length === 0) return [];

  const exerciseRows = await db
    .select()
    .from(templateExercises)
    .where(
      inArray(
        templateExercises.templateId,
        templateRows.map((t) => t.id)
      )
    );

  return templateRows.map((row) => mapTemplateRow(row, exerciseRows));
}

// ---------------------------------------------------------------------------
// getRecoveryCheckins
// ---------------------------------------------------------------------------

export async function getRecoveryCheckins(): Promise<RecoveryCheckin[]> {
  if (!hasDatabaseUrl()) return [];
  const rows = await db.select().from(recoveryCheckins).orderBy(desc(recoveryCheckins.date));
  return rows.map(mapRecoveryCheckinRow);
}

// ---------------------------------------------------------------------------
// getAllData — agrège tout, pratique pour hydrater le store client en un
// seul aller-retour (ex: dans le layout ou la page racine).
// ---------------------------------------------------------------------------

export interface AllData {
  exercises: Exercise[];
  sessions: WorkoutSession[];
  goals: MuscleGoal[];
  settings: UserSettings;
  templates: WorkoutTemplate[];
  recoveryCheckins: RecoveryCheckin[];
}

export async function getAllData(): Promise<AllData> {
  if (!hasDatabaseUrl()) {
    return {
      exercises: [],
      sessions: [],
      goals: [],
      settings: DEFAULT_SETTINGS,
      templates: [],
      recoveryCheckins: [],
    };
  }

  const [exercisesData, sessionsData, goalsData, settingsData, templatesData, checkinsData] =
    await Promise.all([
      getExercises(),
      getSessions(),
      getGoals(),
      getSettings(),
      getTemplates(),
      getRecoveryCheckins(),
    ]);

  return {
    exercises: exercisesData,
    sessions: sessionsData,
    goals: goalsData,
    settings: settingsData,
    templates: templatesData,
    recoveryCheckins: checkinsData,
  };
}
