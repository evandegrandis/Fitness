/**
 * Récupération des données restées sur le téléphone (17/09/2026).
 *
 * Contexte : depuis le 20/08/2026, l'outbox du téléphone échouait en tête de
 * file (séance référençant un exercice absent de Neon → violation FK) et,
 * la file étant causale, plus AUCUNE écriture n'atteignait le serveur : 17
 * séances, 9 exercices, 29 check-ins, 1 pesée. Le téléphone a exporté sa
 * sauvegarde JSON (Réglages) ; ce script y lit ce qui manque à Neon et
 * l'insère, en un seul batch atomique, sans jamais modifier une ligne que le
 * serveur connaît déjà.
 *
 * LECTURE SEULE par défaut. L'écriture exige :
 *   APPLY_PROD_RECOVERY=ep-mute-sunset-atqb5xkv npx tsx scripts/recover-from-backup-2026-09-17.ts <backup.json>
 *
 * Garde-fous : host de production exact, dump complet des tables sur disque
 * avant écriture, insertion uniquement des ids absents, règle applicative
 * « pas de brouillon Pullover seul », vérification après écriture.
 *
 * Idempotent avec l'outbox du téléphone : une fois la synchro réparée, le
 * rejeu de ses opérations (upserts par id / par date) retombe sur les mêmes
 * lignes.
 */

import "dotenv/config";

import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "../lib/db/client";
import {
  exerciseToMappingRows,
  exerciseToRow,
  recoveryCheckinToRow,
  sessionToCardioEntryRows,
  sessionToLoggedExerciseRows,
  sessionToLoggedSetRows,
  sessionToRow,
  sessionToSupersetRows,
} from "../lib/db/mappers";
import {
  bodyWeights,
  exercises,
  loggedExercises,
  loggedSets,
  muscleMappings,
  recoveryCheckins,
  supersetGroups,
  userSettings,
  workoutSessions,
  cardioEntries,
} from "../lib/db/schema";
import { withKnownMuscleProfile } from "../lib/data/catalog-muscle-profiles";
import { parseBackup } from "../lib/models/backup";
import { isPulloverMachineOnlySession } from "../lib/sync/local-session-recovery";
import {
  assertExactProductionDatabase,
  dumpAllTables,
  PRODUCTION_MIGRATION_CONFIRMATION,
  writeBackupFile,
} from "./_safety";

const SCRIPT_NAME = "recover-from-backup-2026-09-17";
const APPLY = process.env.APPLY_PROD_RECOVERY === PRODUCTION_MIGRATION_CONFIRMATION;

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error(`${SCRIPT_NAME}: chemin de la sauvegarde JSON attendu en argument.`);
  const url = process.env.DATABASE_URL ?? "";
  assertExactProductionDatabase(url, SCRIPT_NAME);

  const serverExerciseIds = new Set((await db.select({ id: exercises.id }).from(exercises)).map((r) => r.id));
  const serverSessionIds = new Set((await db.select({ id: workoutSessions.id }).from(workoutSessions)).map((r) => r.id));

  // Le validateur applicatif (`parseBackup`) est strict sur TOUT le fichier :
  // une vieille séance iOS de mai 2026 porte un superset à 5 membres et fait
  // échouer l'ensemble. Les séances que Neon connaît déjà ne servent à rien
  // ici : on ne soumet à la validation que celles qui manquent.
  const raw = JSON.parse(readFileSync(file, "utf8")) as { sessions: Array<{ id: string }> };
  const totalSessions = raw.sessions.length;
  raw.sessions = raw.sessions.filter((session) => !serverSessionIds.has(session.id));
  const backup = parseBackup(raw);
  console.log(`Sauvegarde du ${backup.exportDate.toISOString()} : ${totalSessions} séances (${backup.sessions.length} inconnues de Neon), ${backup.exercises.length} exercices, ${backup.recoveryCheckins.length} check-ins, ${backup.bodyWeights.length} pesées.`);
  const serverCheckinDays = new Set((await db.select({ date: recoveryCheckins.date }).from(recoveryCheckins)).map((r) => r.date.toISOString()));
  const serverWeightDays = new Set((await db.select({ day: bodyWeights.measuredOn }).from(bodyWeights)).map((r) => r.day.toISOString().slice(0, 10)));

  const missingSessions = backup.sessions
    .filter((session) => !session.isActive && !serverSessionIds.has(session.id))
    .filter((session) => !isPulloverMachineOnlySession(session))
    .filter((session) => session.exercises.some((logged) => logged.sets.some((set) => set.completed)) || (session.cardioEntries?.length ?? 0) > 0)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const skippedDrafts = backup.sessions.filter((session) => !session.isActive && !serverSessionIds.has(session.id) && !missingSessions.includes(session));

  const requiredExerciseIds = new Set(missingSessions.flatMap((session) => session.exercises.map((logged) => logged.exerciseId)));
  const missingExercises = backup.exercises
    .filter((exercise) => !serverExerciseIds.has(exercise.id))
    .map(withKnownMuscleProfile);
  const unresolved = [...requiredExerciseIds].filter((id) => !serverExerciseIds.has(id) && !missingExercises.some((exercise) => exercise.id === id));
  if (unresolved.length) throw new Error(`${SCRIPT_NAME}: séances référençant des exercices introuvables même dans la sauvegarde : ${unresolved.join(", ")}`);

  const missingCheckins = backup.recoveryCheckins.filter((checkin) => !serverCheckinDays.has(checkin.date.toISOString()));
  const missingWeights = backup.bodyWeights.filter((entry) => !serverWeightDays.has(entry.measuredOn.toISOString().slice(0, 10)));

  console.log(`\nÀ insérer : ${missingExercises.length} exercices, ${missingSessions.length} séances, ${missingCheckins.length} check-ins, ${missingWeights.length} pesées. Brouillons ignorés : ${skippedDrafts.length}.`);
  for (const exercise of missingExercises) console.log(`  + exercice ${exercise.id.slice(0, 8)} ${exercise.name} (mappings : ${exercise.muscleMappings.map((m) => `${m.muscleGroup}×${m.coefficient}`).join(", ") || "aucun"})`);
  for (const session of missingSessions) {
    const sets = session.exercises.reduce((sum, logged) => sum + logged.sets.filter((set) => set.completed).length, 0);
    console.log(`  + séance ${session.startTime.toISOString().slice(0, 16)} ${session.templateName ?? "(libre)"} · ${session.exercises.length} exos · ${sets} séries`);
  }
  for (const draft of skippedDrafts) console.log(`  · brouillon ignoré ${draft.startTime.toISOString().slice(0, 16)} (${draft.exercises.map((e) => e.exerciseName).join(", ") || "vide"})`);
  for (const checkin of missingCheckins) console.log(`  + check-in ${checkin.date.toISOString().slice(0, 10)}`);
  for (const entry of missingWeights) console.log(`  + pesée ${entry.measuredOn.toISOString().slice(0, 10)} ${entry.weightKg} kg`);

  if (!APPLY) {
    console.log(`\nLecture seule. Pour appliquer : APPLY_PROD_RECOVERY=${PRODUCTION_MIGRATION_CONFIRMATION} npx tsx scripts/${SCRIPT_NAME}.ts ${file}`);
    return;
  }

  const snapshot = writeBackupFile(await dumpAllTables(), `pre-${SCRIPT_NAME}`);
  console.log(`\nDump complet écrit : ${snapshot}`);

  const operations: BatchItem<"pg">[] = [];
  for (const exercise of missingExercises) {
    operations.push(db.insert(exercises).values(exerciseToRow(exercise)).onConflictDoNothing());
    const mappingRows = exerciseToMappingRows(exercise);
    if (mappingRows.length > 0) operations.push(db.insert(muscleMappings).values(mappingRows).onConflictDoNothing());
  }
  for (const session of missingSessions) {
    operations.push(db.insert(workoutSessions).values(sessionToRow(session)).onConflictDoNothing());
    const cardioRows = sessionToCardioEntryRows(session);
    if (cardioRows.length > 0) operations.push(db.insert(cardioEntries).values(cardioRows).onConflictDoNothing());
    const supersetRows = sessionToSupersetRows(session);
    if (supersetRows.length > 0) operations.push(db.insert(supersetGroups).values(supersetRows).onConflictDoNothing());
    const exerciseRows = sessionToLoggedExerciseRows(session);
    if (exerciseRows.length > 0) operations.push(db.insert(loggedExercises).values(exerciseRows).onConflictDoNothing());
    const setRows = sessionToLoggedSetRows(session);
    if (setRows.length > 0) operations.push(db.insert(loggedSets).values(setRows).onConflictDoNothing());
  }
  for (const checkin of missingCheckins) {
    operations.push(db.insert(recoveryCheckins).values(recoveryCheckinToRow(checkin)).onConflictDoNothing());
  }
  for (const entry of missingWeights) {
    const day = new Date(Date.UTC(entry.measuredOn.getFullYear(), entry.measuredOn.getMonth(), entry.measuredOn.getDate()));
    operations.push(db.insert(bodyWeights).values({ id: entry.id, measuredOn: day, weightKg: entry.weightKg }).onConflictDoNothing());
  }
  // Même recalcul que saveSession : la date d'usage dérive des séries réelles.
  operations.push(db.update(exercises).set({
    lastUsed: sql<Date | null>`(
      select max(ls.timestamp)
      from ${loggedExercises} le
      join ${loggedSets} ls on ls.logged_exercise_id = le.id
      where le.exercise_id = ${exercises.id} and ls.completed = true
    )`,
  }));
  if (missingWeights.length > 0) {
    const latest = [...backup.bodyWeights].sort((a, b) => b.measuredOn.getTime() - a.measuredOn.getTime())[0]!;
    operations.push(db.update(userSettings).set({ bodyWeightKg: latest.weightKg }).where(eq(userSettings.id, "singleton")));
  }

  console.log(`Batch atomique de ${operations.length} instructions…`);
  await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  const sessionCount = (await db.select({ n: sql<number>`count(*)` }).from(workoutSessions))[0]!.n;
  const exerciseCount = (await db.select({ n: sql<number>`count(*)` }).from(exercises))[0]!.n;
  const checkinCount = (await db.select({ n: sql<number>`count(*)` }).from(recoveryCheckins))[0]!.n;
  const weightCount = (await db.select({ n: sql<number>`count(*)` }).from(bodyWeights))[0]!.n;
  const stillMissing = missingSessions.filter((session) => !serverSessionIds.has(session.id));
  const present = new Set((await db.select({ id: workoutSessions.id }).from(workoutSessions)).map((r) => r.id));
  const failed = stillMissing.filter((session) => !present.has(session.id));
  console.log(`\nAprès écriture : ${sessionCount} séances, ${exerciseCount} exercices, ${checkinCount} check-ins, ${weightCount} pesées. Séances toujours absentes : ${failed.length}.`);
  if (failed.length) throw new Error(`${SCRIPT_NAME}: vérification échouée pour ${failed.map((s) => s.id).join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
