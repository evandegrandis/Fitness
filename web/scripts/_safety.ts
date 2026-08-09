/**
 * Garde-fous DB partagés par les scripts (`seed.ts`, backfills, etc.).
 *
 * Contexte : le 2026-08-04, `npx tsx scripts/seed.ts` a été lancé alors que
 * `DATABASE_URL` pointait vers la base Neon de PRODUCTION. Le seed fait un
 * reset destructif (DELETE de toutes les tables) → la prod a été wipée, ~3
 * semaines de séances ont dû être récupérées via une branche Neon (PITR).
 *
 * Ce module rend l'incident IMPOSSIBLE à reproduire :
 *   - `assertDbWriteAllowed()` : refuse tout script destructif si `DATABASE_URL`
 *     ne pointe pas vers une base LOCALE. Aucun override ne peut désactiver ce verrou.
 *   - `dumpAllTables()` + `writeBackupFile()` : sauvegarde complète (lecture
 *     seule) → utilisée AVANT tout reset et par `scripts/export-backup.ts`.
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Endpoint de la branche Neon de production récupérée le 04/08/2026. */
export const EXPECTED_PRODUCTION_NEON_HOST =
  "ep-mute-sunset-atqb5xkv-pooler.c-9.us-east-1.aws.neon.tech";

/** Jeton volontairement long : une variable générique `=1` ne doit jamais autoriser la prod. */
export const PRODUCTION_MIGRATION_CONFIRMATION = "ep-mute-sunset-atqb5xkv";

/** true si l'URL pointe vers une base locale (localhost / 127.0.0.1 / ::1 / 0.0.0.0). */
function isLocalUrl(url: string): boolean {
  const hostname = databaseHostname(url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0";
}

/** Retourne le hostname sans jamais imprimer les credentials de l'URL. */
export function databaseHostname(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL est invalide.");
  }
}

/**
 * Verrouille un correctif NON destructif explicitement prévu pour la branche prod récupérée.
 * Toute autre branche/clone Neon est refusée, même si son nom ressemble à la production.
 */
export function assertExactProductionDatabase(databaseUrl: string, scriptName: string): void {
  const hostname = databaseHostname(databaseUrl);
  if (hostname !== EXPECTED_PRODUCTION_NEON_HOST) {
    throw new Error(
      `${scriptName}: host refusé (${hostname}). Attendu exactement: ${EXPECTED_PRODUCTION_NEON_HOST}.`
    );
  }
}

/** Exige une confirmation propre à CETTE migration, en plus du verrou de host. */
export function assertProductionMigrationConfirmed(scriptName: string): void {
  if (process.env.APPLY_PROD_MIGRATION !== PRODUCTION_MIGRATION_CONFIRMATION) {
    throw new Error(
      `${scriptName}: confirmation absente. Utiliser APPLY_PROD_MIGRATION=${PRODUCTION_MIGRATION_CONFIRMATION}.`
    );
  }
}

/**
 * Refuse d'exécuter un script destructif contre une base non-locale.
 * À appeler EN PREMIER dans tout script qui DELETE/UPDATE/reset la base.
 * En dry-run (pas de `DATABASE_URL`) : ne fait rien (aucun write ne suivra).
 */
export function assertDbWriteAllowed(scriptName: string): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return; // dry-run : aucun write DB ne suivra
  if (isLocalUrl(url)) return;

  console.error(`\n⛔ SÉCURITÉ — "${scriptName}" refuse de s'exécuter.`);
  console.error(
    `   DATABASE_URL pointe vers une base NON-LOCALE (${databaseHostname(url)}).`
  );
  console.error("   Ce script réinitialise la base : refus absolu hors localhost.");
  console.error("   Rappel : un seed a déjà wipé la prod le 2026-08-04.");
  console.error("   Aucun flag ni override ne permet de contourner ce verrou.\n");
  process.exit(1);
}

/** Toutes les tables du schéma (noms prouvés par `seed.ts`), + recoveryCheckins si présente. */
async function allTables(): Promise<Record<string, unknown>> {
  const schema = (await import("../lib/db/schema")) as Record<string, unknown>;
  const names = [
    "exercises",
    "muscleMappings",
    "workoutSessions",
    "loggedExercises",
    "loggedSets",
    "supersetGroups",
    "cardioEntries",
    "muscleGoals",
    "workoutTemplates",
    "templateExercises",
    "userSettings",
    "recoveryCheckins",
  ];
  const out: Record<string, unknown> = {};
  for (const n of names) if (schema[n]) out[n] = schema[n];
  return out;
}

/** Dump complet (lecture seule) de toutes les tables → `{ table: rows[] }`. */
export async function dumpAllTables(): Promise<Record<string, unknown[]>> {
  const { db } = await import("../lib/db/client");
  const tables = await allTables();
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(tables)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out[name] = await db.select().from(table as any);
  }
  return out;
}

/** Écrit un snapshot horodaté dans `data/backups/<label>-<iso>.json`. Renvoie le chemin. */
export function writeBackupFile(data: Record<string, unknown[]>, label = "backup"): string {
  const dir = path.resolve(__dirname, "../data/backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${label}-${stamp}.json`);
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), counts, tables: data }, null, 2));
  return file;
}
