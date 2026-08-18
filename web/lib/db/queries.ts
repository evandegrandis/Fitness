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
  bodyWeights,
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
  BodyWeightEntry,} from "@/lib/models/types";

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

// ---------------------------------------------------------------------------
// getActiveSession — dernière séance active autosauvegardée, avec tous ses enfants.
// Le tri défensif permet de récupérer la plus récente si une ancienne base contient encore
// plusieurs lignes actives historiques ; les nouvelles écritures restent idempotentes par id.
// ---------------------------------------------------------------------------

/**
 * Une active serveur n'est qu'une copie de secours d'un autosave. Passé ce délai, une ligne
 * `is_active=true` est considérée comme orpheline et ne doit pas ressusciter dans l'interface.
 * La copie locale courante n'est pas concernée par cette limite et reste prioritaire.
 */
export const ACTIVE_SESSION_RESTORE_WINDOW_MS = 36 * 60 * 60 * 1000;

export function isRestorableActiveSessionStart(
  startTime: Date,
  now: Date = new Date()
): boolean {
  const startTimeMs = startTime.getTime();
  const nowMs = now.getTime();
  return (
    Number.isFinite(startTimeMs) &&
    Number.isFinite(nowMs) &&
    startTimeMs >= nowMs - ACTIVE_SESSION_RESTORE_WINDOW_MS
  );
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  if (!hasDatabaseUrl()) return null;

  const sessionRows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.isActive, true))
    .orderBy(desc(workoutSessions.startTime));
  const sessionRow = sessionRows.find((row) => isRestorableActiveSessionStart(row.startTime));
  if (!sessionRow) return null;

  const [exerciseRows, supersetRows, cardioRows] = await Promise.all([
    db.select().from(loggedExercises).where(eq(loggedExercises.sessionId, sessionRow.id)),
    db.select().from(supersetGroups).where(eq(supersetGroups.sessionId, sessionRow.id)),
    db.select().from(cardioEntries).where(eq(cardioEntries.sessionId, sessionRow.id)),
  ]);
  const exerciseIds = exerciseRows.map((exercise) => exercise.id);
  const setRows = exerciseIds.length > 0
    ? await db.select().from(loggedSets).where(inArray(loggedSets.loggedExerciseId, exerciseIds))
    : [];

  return mapSessionRow(sessionRow, exerciseRows, setRows, supersetRows, cardioRows);
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
  gender: null,
  ageYears: null,
  trainingPhase: null,
  trainingPhaseStartedAt: null,
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
// getBodyWeights
// ---------------------------------------------------------------------------

export async function getBodyWeights(): Promise<BodyWeightEntry[]> {
  if (!hasDatabaseUrl()) return [];
  const rows = await db.select().from(bodyWeights).orderBy(desc(bodyWeights.measuredOn));
  return rows.map((row) => ({ id: row.id, measuredOn: row.measuredOn, weightKg: row.weightKg }));
}

// ---------------------------------------------------------------------------
// getAllData — agrège tout, pratique pour hydrater le store client en un
// seul aller-retour (ex: dans le layout ou la page racine).
// ---------------------------------------------------------------------------

export interface AllData {
  exercises: Exercise[];
  sessions: WorkoutSession[];
  /** Séance autosauvegardée récupérable si le cache navigateur a disparu. */
  activeSession: WorkoutSession | null;
  goals: MuscleGoal[];
  settings: UserSettings;
  templates: WorkoutTemplate[];
  recoveryCheckins: RecoveryCheckin[];
  bodyWeights: BodyWeightEntry[];
}

/**
 * OFFLINE_PWA_SPEC §3 (P4.2) — valeurs vides partagées entre "pas de `DATABASE_URL`" (ci-dessous)
 * et "Neon injoignable" (`lib/data/index.ts::getInitialData`, try/catch autour de cet appel). Un
 * seul endroit qui définit ce qu'est une réponse "vide" — `isEmptyAllData` ci-dessous compare
 * structurellement à cette même forme.
 */
export function emptyAllData(): AllData {
  return {
    exercises: [],
    sessions: [],
    activeSession: null,
    goals: [],
    settings: DEFAULT_SETTINGS,
    templates: [],
    recoveryCheckins: [],
    bodyWeights: [],
  };
}

/**
 * OFFLINE_PWA_SPEC §3 (P4.2) — `true` si `data` ne porte aucune donnée de référence exploitable
 * (Neon injoignable, DB pas encore provisionnée, ou compte réellement neuf). Consommé par
 * `StoreHydrator` : ne JAMAIS écraser le cache localStorage réhydraté (P4.1) avec ceci — l'absence
 * de données serveur ne doit jamais se traduire par une perte du cache offline (C2).
 */
export function isEmptyAllData(data: AllData): boolean {
  return (
    data.exercises.length === 0 &&
    data.sessions.length === 0 &&
    data.activeSession === null &&
    data.templates.length === 0 &&
    data.recoveryCheckins.length === 0 &&
    data.goals.length === 0
  );
}

export async function getAllData(): Promise<AllData> {
  if (!hasDatabaseUrl()) {
    return emptyAllData();
  }

  const [
    exercisesData,
    sessionsData,
    activeSessionData,
    goalsData,
    settingsData,
    templatesData,
    checkinsData,
    bodyWeightsData,
  ] =
    await Promise.all([
      getExercises(),
      getSessions(),
      getActiveSession(),
      getGoals(),
      getSettings(),
      getTemplates(),
      getRecoveryCheckins(),
      getBodyWeights(),
    ]);

  return {
    exercises: exercisesData,
    sessions: sessionsData,
    activeSession: activeSessionData,
    goals: goalsData,
    settings: settingsData,
    templates: templatesData,
    recoveryCheckins: checkinsData,
    bodyWeights: bodyWeightsData,
  };
}
