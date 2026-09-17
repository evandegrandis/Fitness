/**
 * Applique les profils musculaires connus (`lib/data/catalog-muscle-profiles.ts`)
 * aux exercices du catalogue Neon restés SANS AUCUN mapping. Ne touche jamais
 * un exercice déjà mappé : une correction manuelle reste prioritaire.
 *
 * Script pérenne (pas daté) : chaque fois qu'un profil est ajouté pour une
 * nouvelle machine, le relancer met le catalogue en cohérence. Le même
 * profil s'applique automatiquement aux exercices créés ensuite (upsert et
 * synchro passent par `withKnownMuscleProfile`).
 *
 * Dry-run par défaut ; `--apply` exige le host exact de production ET
 * `APPLY_PROD_MIGRATION=<jeton _safety>`.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { neon, type NeonQueryInTransaction } from "@neondatabase/serverless";
import {
  assertExactProductionDatabase,
  assertProductionMigrationConfirmed,
  dumpAllTables,
  writeBackupFile,
} from "./_safety";
import { knownMuscleProfileForName } from "../lib/data/catalog-muscle-profiles";

const SCRIPT_NAME = "apply-known-muscle-profiles";

function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  movement_pattern: string | null;
  mapping_count: string;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  const apply = process.argv.includes("--apply");
  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `select e.id, e.name, e.category, e.movement_pattern, count(mm.id)::text as mapping_count
       from exercises e
       left join muscle_mappings mm on mm.exercise_id = e.id
      group by e.id
      order by e.name`
  ) as ExerciseRow[];

  const unmapped = rows.filter((row) => Number(row.mapping_count) === 0);
  const repairs = unmapped
    .map((row) => ({ row, profile: knownMuscleProfileForName(row.name) }))
    .filter((candidate): candidate is { row: ExerciseRow; profile: NonNullable<ReturnType<typeof knownMuscleProfileForName>> } => candidate.profile !== null);
  const unknown = unmapped.filter((row) => knownMuscleProfileForName(row.name) === null);

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    repairs: repairs.map(({ row, profile }) => ({ id: row.id, name: row.name, copiedFrom: profile.copiedFrom, mappings: profile.muscleMappings.length })),
    stillUnknown: unknown.map((row) => row.name),
  }, null, 2));

  if (!apply) return;
  assertProductionMigrationConfirmed(SCRIPT_NAME);
  const backup = writeBackupFile(await dumpAllTables(), `before-${SCRIPT_NAME}`);
  console.log(`Sauvegarde avant écriture : ${backup}`);

  await sql.transaction((tx) => {
    const operations: NeonQueryInTransaction[] = [];
    for (const { row, profile } of repairs) {
      operations.push(tx`
        update exercises
           set category = case when trim(category) = '' or lower(trim(category)) = 'autre' then ${profile.category} else category end,
               movement_pattern = coalesce(movement_pattern, ${profile.movementPattern})
         where id = ${row.id}
           and not exists (select 1 from muscle_mappings where exercise_id = ${row.id})
      `);
      for (const mapping of profile.muscleMappings) {
        operations.push(tx`
          insert into muscle_mappings (id, exercise_id, muscle_group, coefficient)
          values (${stableId(`mapping:${row.id}:${mapping.muscleGroup}`)}, ${row.id}, ${mapping.muscleGroup}, ${mapping.coefficient})
          on conflict (id) do update set coefficient = excluded.coefficient
        `);
      }
    }
    return operations;
  });

  const verification = await sql.query(
    `select e.name, count(mm.id)::int as mapping_count
       from exercises e left join muscle_mappings mm on mm.exercise_id = e.id
      where e.id = any($1::text[]) group by e.id order by e.name`,
    [repairs.map(({ row }) => row.id)]
  );
  console.log(JSON.stringify({ status: "ok", verification }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
