/**
 * Script de seed (exécuté via `npm run seed`, tsx).
 *
 * 1. Charge `data/jeera_backup.json` -> `parseBackup` -> catalogue officiel
 *    (28 exercices) + 20 séances + goals + templates + settings.
 * 2. Charge `data/recent_sessions.json` (13 séances récentes, transcrites du
 *    carnet papier, absentes du backup officiel) : crée les `newExercises`
 *    (ex: "Ab roller debout"), résout chaque session en `WorkoutSession` du
 *    domaine par résolution de nom contre le catalogue fusionné. Toute
 *    résolution de nom manquante lève une erreur explicite (fail-fast).
 * 3. Reset la base (delete enfants -> parents) puis insère tout.
 *
 * Mode dry-run : si `DATABASE_URL` est absent, exécute PARSE + MERGE +
 * RÉSOLUTION DE NOMS et loggue les comptes, mais saute les writes DB — permet
 * de valider la logique sans base provisionnée.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseBackup } from "@/lib/models/backup";
import { fatigueClassFromRaw, SetType } from "@/lib/models/enums";
import type { SetPatternMode } from "@/lib/models/enums";
import type { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedExercise, LoggedSet, MuscleMapping, WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Chargement des fichiers de données
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(__dirname, "../data");

function loadJson(fileName: string): unknown {
  const raw = readFileSync(path.join(DATA_DIR, fileName), "utf-8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Format `recent_sessions.json`
// ---------------------------------------------------------------------------

interface RecentNewExercise {
  name: string;
  category: string;
  setPatternMode: string;
  repTargetMin: number;
  repTargetMax: number;
  smallestIncrement: number;
  suggestedRestSeconds: number;
  fatigueClass: string;
  isFavorite: boolean;
  muscleMappings: { muscleGroup: string; coefficient: number }[];
}

interface RecentSetTuple extends Array<number> {
  0: number; // weight
  1: number; // reps
}

interface RecentExerciseEntry {
  name: string;
  sets: RecentSetTuple[];
}

interface RecentSessionEntry {
  date: string;
  exercises: RecentExerciseEntry[];
}

interface RecentSessionsFile {
  newExercises: RecentNewExercise[];
  sessions: RecentSessionEntry[];
}

function isRecentSessionsFile(json: unknown): json is RecentSessionsFile {
  return (
    typeof json === "object" &&
    json !== null &&
    Array.isArray((json as RecentSessionsFile).newExercises) &&
    Array.isArray((json as RecentSessionsFile).sessions)
  );
}

// ---------------------------------------------------------------------------
// Construction des nouveaux Exercise (recent_sessions.newExercises)
// ---------------------------------------------------------------------------

function buildNewExercise(data: RecentNewExercise, sortOrder: number): Exercise {
  const muscleMappings: MuscleMapping[] = data.muscleMappings.map((m) => ({
    muscleGroup: m.muscleGroup as MuscleGroup,
    coefficient: m.coefficient,
  }));

  return {
    id: crypto.randomUUID(),
    name: data.name,
    category: data.category,
    setPatternMode: data.setPatternMode as SetPatternMode,
    repTargetMin: data.repTargetMin,
    repTargetMax: data.repTargetMax,
    smallestIncrement: data.smallestIncrement,
    isFavorite: data.isFavorite,
    createdByUser: true,
    sortOrder,
    suggestedRestSeconds: data.suggestedRestSeconds,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: null,
    benchmarkHigh: null,
    fatigueClass: fatigueClassFromRaw(data.fatigueClass),
    progressionPolicy: null,
    voluntaryRepCap: 0,
    muscleMappings,
    lastUsed: null,
  };
}

// ---------------------------------------------------------------------------
// Résolution des séances récentes -> WorkoutSession du domaine
// ---------------------------------------------------------------------------

const SESSION_START_HOUR = 18;

function resolveRecentSession(
  entry: RecentSessionEntry,
  exerciseByName: Map<string, Exercise>
): WorkoutSession {
  const [year, month, day] = entry.date.split("-").map(Number);
  const startTime = new Date(year, month - 1, day, SESSION_START_HOUR, 0, 0);
  // Durée inconnue (transcription papier sans horaires) → endTime null : pas de
  // durée inventée. La séance reste "terminée" (isActive=false).
  const endTime: Date | null = null;

  const exercisesLogged: LoggedExercise[] = entry.exercises.map((exEntry, orderIndex) => {
    const exercise = exerciseByName.get(exEntry.name);
    if (!exercise) {
      throw new Error(
        `seed: impossible de résoudre l'exercice "${exEntry.name}" (séance du ${entry.date}) ` +
          `contre le catalogue fusionné (backup + newExercises).`
      );
    }

    const sets: LoggedSet[] = exEntry.sets.map(([weight, reps], setSlotIndex) => ({
      id: crypto.randomUUID(),
      weight,
      reps,
      setType: SetType.work,
      timestamp: startTime,
      setSlotIndex,
      completed: true,
      supersetRoundIndex: null,
    }));

    return {
      id: crypto.randomUUID(),
      orderIndex,
      notes: "",
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sets,
      supersetGroupId: null,
    };
  });

  return {
    id: crypto.randomUUID(),
    date: startTime,
    startTime,
    endTime,
    notes: "",
    isActive: false,
    templateName: null,
    exercises: exercisesLogged,
    supersetGroups: [],
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Jeera — seed ===\n");

  // -- 1. Backup officiel ----------------------------------------------------
  const backupJson = loadJson("jeera_backup.json");
  const backup = parseBackup(backupJson);
  console.log(
    `Backup officiel : ${backup.exercises.length} exercices, ${backup.sessions.length} séances, ` +
      `${backup.goals.length} goals, ${backup.templates.length} template(s).`
  );

  // -- 2. Séances récentes -----------------------------------------------------
  const recentJson = loadJson("recent_sessions.json");
  if (!isRecentSessionsFile(recentJson)) {
    throw new Error("seed: recent_sessions.json ne correspond pas au format attendu.");
  }

  const newExercises = recentJson.newExercises.map((data, index) =>
    buildNewExercise(data, backup.exercises.length + index)
  );
  console.log(
    `Nouveaux exercices (recent_sessions.newExercises) : ${newExercises.length} ` +
      `(${newExercises.map((e) => e.name).join(", ")}).`
  );

  const mergedExercises: Exercise[] = [...backup.exercises, ...newExercises];
  const exerciseByName = new Map(mergedExercises.map((e) => [e.name, e]));

  const recentSessions = recentJson.sessions.map((entry) =>
    resolveRecentSession(entry, exerciseByName)
  );
  console.log(`Séances récentes résolues : ${recentSessions.length} (toutes les résolutions de nom OK).\n`);

  // -- 3. Fusion --------------------------------------------------------------
  const allExercises = mergedExercises;
  const allSessions: WorkoutSession[] = [...backup.sessions, ...recentSessions];

  const totalSets = allSessions.reduce(
    (sum, s) => sum + s.exercises.reduce((sSum, e) => sSum + e.sets.length, 0),
    0
  );

  console.log("=== Récapitulatif fusionné ===");
  console.log(`Exercices     : ${allExercises.length}`);
  console.log(`Séances       : ${allSessions.length}`);
  console.log(`Sets (total)  : ${totalSets}`);
  console.log(`Goals         : ${backup.goals.length}`);
  console.log(`Templates     : ${backup.templates.length}`);
  console.log(`Settings      : userName=${backup.settings.userName}, usesKilograms=${backup.settings.usesKilograms}`);

  // -- 4. Writes DB (sautées en dry-run) --------------------------------------
  if (!process.env.DATABASE_URL) {
    console.log(
      "\n[DRY RUN] DATABASE_URL absent — writes DB sautées. " +
        "Logique de parsing/fusion/résolution validée avec succès."
    );
    return;
  }

  console.log("\nDATABASE_URL détecté — écriture en base...");

  // Import dynamique : évite d'initialiser le client Neon (et de dépendre du
  // reste de lib/db) quand on tourne en dry-run sans DATABASE_URL.
  const { db } = await import("../lib/db/client");
  const {
    exercises: exercisesTable,
    muscleMappings: muscleMappingsTable,
    workoutSessions: workoutSessionsTable,
    loggedExercises: loggedExercisesTable,
    loggedSets: loggedSetsTable,
    supersetGroups: supersetGroupsTable,
    muscleGoals: muscleGoalsTable,
    workoutTemplates: workoutTemplatesTable,
    templateExercises: templateExercisesTable,
    userSettings: userSettingsTable,
  } = await import("../lib/db/schema");
  const {
    exerciseToMappingRows,
    exerciseToRow,
    goalToRow,
    sessionToLoggedExerciseRows,
    sessionToLoggedSetRows,
    sessionToRow,
    sessionToSupersetRows,
    settingsToRow,
    templateToExerciseRows,
    templateToRow,
  } = await import("../lib/db/mappers");

  // -- Reset (enfants avant parents) -------------------------------------
  console.log("Reset de la base...");
  await db.delete(loggedSetsTable);
  await db.update(loggedExercisesTable).set({ supersetGroupId: null });
  await db.delete(supersetGroupsTable);
  await db.delete(loggedExercisesTable);
  await db.delete(workoutSessionsTable);
  await db.delete(templateExercisesTable);
  await db.delete(workoutTemplatesTable);
  await db.delete(muscleMappingsTable);
  await db.delete(exercisesTable);
  await db.delete(muscleGoalsTable);

  // -- Insert (parents avant enfants) --------------------------------------
  console.log("Insertion des exercices...");
  await db.insert(exercisesTable).values(allExercises.map(exerciseToRow));
  const mappingRows = allExercises.flatMap(exerciseToMappingRows);
  if (mappingRows.length > 0) {
    await db.insert(muscleMappingsTable).values(mappingRows);
  }

  console.log("Insertion des goals...");
  if (backup.goals.length > 0) {
    await db.insert(muscleGoalsTable).values(backup.goals.map(goalToRow));
  }

  console.log("Insertion des settings...");
  const settingsRow = settingsToRow(backup.settings);
  await db
    .insert(userSettingsTable)
    .values(settingsRow)
    .onConflictDoUpdate({ target: userSettingsTable.id, set: settingsRow });

  console.log("Insertion des templates...");
  if (backup.templates.length > 0) {
    await db.insert(workoutTemplatesTable).values(backup.templates.map(templateToRow));
    const templateExerciseRows = backup.templates.flatMap(templateToExerciseRows);
    if (templateExerciseRows.length > 0) {
      await db.insert(templateExercisesTable).values(templateExerciseRows);
    }
  }

  console.log("Insertion des séances...");
  await db.insert(workoutSessionsTable).values(allSessions.map(sessionToRow));

  const supersetRows = allSessions.flatMap(sessionToSupersetRows);
  if (supersetRows.length > 0) {
    await db.insert(supersetGroupsTable).values(supersetRows);
  }

  const exerciseRows = allSessions.flatMap(sessionToLoggedExerciseRows);
  if (exerciseRows.length > 0) {
    await db.insert(loggedExercisesTable).values(exerciseRows);
  }

  const setRows = allSessions.flatMap(sessionToLoggedSetRows);
  if (setRows.length > 0) {
    await db.insert(loggedSetsTable).values(setRows);
  }

  console.log("\nSeed terminé avec succès.");
  console.log(
    `Inséré : ${allExercises.length} exercices, ${allSessions.length} séances, ${totalSets} sets, ` +
      `${backup.goals.length} goals, ${backup.templates.length} template(s).`
  );
}

main().catch((error) => {
  console.error("\nseed: échec —", error);
  process.exit(1);
});
