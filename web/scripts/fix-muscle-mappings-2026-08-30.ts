/**
 * Répare uniquement les exercices connus restés sans aucun mapping et retire
 * l'ancien objectif obliques. Dry-run par défaut ; `--apply` exige le host
 * exact de production ET le jeton de migration dédié partagé par `_safety`.
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

const SCRIPT_NAME = "fix-muscle-mappings-2026-08-30";

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
    `select e.id, e.name, e.category, e.movement_pattern,
            count(mm.id)::text as mapping_count
       from exercises e
       left join muscle_mappings mm on mm.exercise_id = e.id
      group by e.id
      order by e.name`
  ) as ExerciseRow[];

  const repairs = rows
    .filter((row) => Number(row.mapping_count) === 0)
    .map((row) => ({ row, profile: knownMuscleProfileForName(row.name) }))
    .filter((candidate): candidate is { row: ExerciseRow; profile: NonNullable<ReturnType<typeof knownMuscleProfileForName>> } => candidate.profile !== null);

  const obliqueGoal = await sql.query(
    "select muscle_parent, weekly_goal_sets from muscle_goals where muscle_parent = 'obliques'"
  );
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    repairs: repairs.map(({ row, profile }) => ({
      id: row.id,
      name: row.name,
      copiedFrom: profile.copiedFrom,
      mappings: profile.muscleMappings,
    })),
    obliqueGoal,
  }, null, 2));

  if (!apply) return;
  assertProductionMigrationConfirmed(SCRIPT_NAME);
  const backup = writeBackupFile(await dumpAllTables(), "before-muscle-mappings-2026-08-30");
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
    operations.push(tx`delete from muscle_goals where muscle_parent = 'obliques'`);
    return operations;
  });

  const verification = await sql.query(
    `select e.id, e.name, count(mm.id)::int as mapping_count
       from exercises e
       left join muscle_mappings mm on mm.exercise_id = e.id
      where e.id = any($1::text[])
      group by e.id
      order by e.name`,
    [repairs.map(({ row }) => row.id)]
  );
  const remainingGoal = await sql.query(
    "select muscle_parent from muscle_goals where muscle_parent = 'obliques'"
  );
  console.log(JSON.stringify({ status: "ok", verification, remainingGoal }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
