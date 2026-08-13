/**
 * Migration additive + correctif de catalogue pour les anomalies intra-séance du 13/08.
 * Lecture seule par défaut. L'écriture exige le verrou prod partagé APPLY_PROD_MIGRATION.
 */

import "dotenv/config";

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  neon,
  type NeonQueryFunction,
  type NeonQueryInTransaction,
} from "@neondatabase/serverless";

import {
  assertExactProductionDatabase,
  assertProductionMigrationConfirmed,
} from "./_safety";

const SCRIPT_NAME = "fix-intra-workout-2026-08-13";
const MIGRATION_TAG = "0007_kind_romulus";
const MIGRATION_CREATED_AT = 1786648063876;
const SESSION_ID = "af34118c-b94b-474b-836e-1547775187a9";
const PEC_SET_80 = "b238dfae-2d5c-47f4-9d5e-2df5d233b8a6";
const PEC_SET_85 = "51fe2086-930c-4fbf-9971-3ce70cbcfed0";
const PEC_SET_75 = "4c8d76a5-1a5d-4df7-b37b-40f78af930ec";
type Sql = NeonQueryFunction<false, false>;

const TABLES = [
  "exercises",
  "muscle_mappings",
  "workout_sessions",
  "logged_exercises",
  "logged_sets",
  "superset_groups",
  "cardio_entries",
  "muscle_goals",
  "workout_templates",
  "template_exercises",
  "user_settings",
  "recovery_checkins",
] as const;

function migrationIdentity(): { source: string; hash: string } {
  const file = path.resolve(process.cwd(), `drizzle/${MIGRATION_TAG}.sql`);
  const source = readFileSync(file, "utf8");
  return { source, hash: createHash("sha256").update(source).digest("hex") };
}

async function queryRows(sql: Sql, query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await sql.query(query, params)) as Record<string, unknown>[];
}

async function dumpBeforeWrite(sql: Sql): Promise<string> {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    tables[table] = await queryRows(sql, `select * from public."${table}" order by 1`);
  }
  tables["drizzle.__drizzle_migrations"] = await queryRows(
    sql,
    'select * from drizzle."__drizzle_migrations" order by created_at,id',
  );
  const dir = path.resolve(process.cwd(), "data/backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${SCRIPT_NAME}-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), tables }, null, 2));
  if (readFileSync(file, "utf8").length < 10_000) throw new Error("Backup pré-migration anormalement petit.");
  return file;
}

async function readSummary(sql: Sql) {
  const [counts, catalog, pecSets, columns, journal] = await Promise.all([
    queryRows(
      sql,
      `select
         (select count(*)::int from exercises) exercises,
         (select count(*)::int from workout_sessions) sessions,
         (select count(*)::int from logged_exercises) logged_exercises,
         (select count(*)::int from logged_sets) logged_sets`,
    ),
    queryRows(
      sql,
      `select id,name,smallest_increment,rep_target_min,rep_target_max
         from exercises
        where id in ($1,$2,$3)
        order by name`,
      [
        "3E1E8EC6-89F7-4E37-8B17-61C0DD4DFABA",
        "9088AA1B-84B4-4686-BA9D-206F51F2BDA6",
        "D8831DCB-BA2D-4150-9A9A-96A029AE1ED5",
      ]
    ),
    queryRows(
      sql,
      `select ls.id,ls.weight,ls.reps,ls.set_type,ls.set_slot_index,
              to_jsonb(ls)->>'logical_set_id' logical_set_id,
              to_jsonb(ls)->>'set_technique' set_technique
         from logged_sets ls
         join logged_exercises le on le.id=ls.logged_exercise_id
        where le.session_id=$1 and le.exercise_name='Pec deck'
        order by ls.set_slot_index`,
      [SESSION_ID]
    ),
    queryRows(
      sql,
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='logged_sets'
          and column_name in ('suggested_weight','suggested_reps','predicted_reps_at_actual_weight',
            'suggested_set_type','suggestion_mode','suggestion_reason_codes',
            'suggestion_engine_version','logical_set_id','set_technique')
        order by column_name`,
    ),
    queryRows(sql, 'select id,hash,created_at from drizzle."__drizzle_migrations" order by created_at,id'),
  ]);
  return { counts: counts[0], catalog, pecSets, columns, journal };
}

function validatePreflight(summary: Awaited<ReturnType<typeof readSummary>>): void {
  if (summary.catalog.length !== 3) throw new Error("Les trois exercices canoniques ne sont pas présents exactement une fois.");
  const allowedCatalog = summary.catalog.every((row) => {
    const item = row as Record<string, unknown>;
    if (item.name === "Pec deck") {
      return (
        (item.smallest_increment === 2.5 && item.rep_target_min === 10 && item.rep_target_max === 15) ||
        (item.smallest_increment === 5 && item.rep_target_min === 6 && item.rep_target_max === 10)
      );
    }
    return item.smallest_increment === 2.5 || item.smallest_increment === 5;
  });
  if (!allowedCatalog) throw new Error("Catalogue live divergent des valeurs avant/après attendues.");

  const expected = [
    [PEC_SET_80, 80, 9, 0],
    [PEC_SET_85, 85, 5, 1],
    [PEC_SET_75, 75, 5, 2],
  ];
  if (
    summary.pecSets.length !== expected.length ||
    !expected.every(([id, weight, reps, slot], index) => {
      const row = summary.pecSets[index] as Record<string, unknown>;
      return row.id === id && row.weight === weight && row.reps === reps && row.set_slot_index === slot;
    })
  ) {
    throw new Error("Les trois sets Pec deck ciblés ne correspondent plus au snapshot validé.");
  }

  const [set80, set85, set75] = summary.pecSets as Record<string, unknown>[];
  const legacyGrouping = [set80, set85, set75].every(
    (row) => row.logical_set_id == null && row.set_technique == null
  );
  const correctedGrouping =
    set80.logical_set_id === PEC_SET_80 &&
    set80.set_technique == null &&
    set85.logical_set_id === PEC_SET_85 &&
    set85.set_technique == null &&
    set75.logical_set_id === PEC_SET_85 &&
    set75.set_technique === "completion";
  if (!legacyGrouping && !correctedGrouping) {
    throw new Error("Le groupement logique Pec deck est dans un état partiel inattendu.");
  }
}

function validateCorrectedPecGrouping(summary: Awaited<ReturnType<typeof readSummary>>): void {
  const [set80, set85, set75] = summary.pecSets as Record<string, unknown>[];
  if (
    set80.logical_set_id !== PEC_SET_80 ||
    set80.set_technique != null ||
    set85.logical_set_id !== PEC_SET_85 ||
    set85.set_technique != null ||
    set75.logical_set_id !== PEC_SET_85 ||
    set75.set_technique !== "completion"
  ) {
    throw new Error("Le backfill logique Pec deck n'a pas été appliqué exactement.");
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  const sql = neon(databaseUrl);
  const before = await readSummary(sql);
  validatePreflight(before);
  console.log(JSON.stringify(before, null, 2));

  if (!process.env.APPLY_PROD_MIGRATION) {
    console.log("\n[LECTURE SEULE] Aucun write. Relancer avec le verrou APPLY_PROD_MIGRATION partagé.");
    return;
  }
  assertProductionMigrationConfirmed(SCRIPT_NAME);
  const backupFile = await dumpBeforeWrite(sql);
  console.log(`Backup vérifié : ${backupFile}`);

  const migration = migrationIdentity();
  const statements = migration.source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await sql.transaction(
    (tx) => {
      const queries: NeonQueryInTransaction[] = [tx.query("set local time zone 'UTC'", [])];
      for (const statement of statements) queries.push(tx.query(statement, []));
      queries.push(
        tx.query(
          `update exercises set smallest_increment=5,rep_target_min=6,rep_target_max=10
            where id=$1 and name='Pec deck'`,
          ["3E1E8EC6-89F7-4E37-8B17-61C0DD4DFABA"]
        ),
        tx.query(
          `update exercises set smallest_increment=5 where id=$1 and name='Pulley serré'`,
          ["9088AA1B-84B4-4686-BA9D-206F51F2BDA6"]
        ),
        tx.query(
          `update exercises set smallest_increment=5 where id=$1 and name='Tirage vertical muscle up'`,
          ["D8831DCB-BA2D-4150-9A9A-96A029AE1ED5"]
        ),
        tx.query(`update logged_sets set logical_set_id=$1,set_technique=null where id=$1`, [PEC_SET_80]),
        tx.query(`update logged_sets set logical_set_id=$1,set_technique=null where id=$1`, [PEC_SET_85]),
        tx.query(`update logged_sets set logical_set_id=$1,set_technique='completion' where id=$2`, [PEC_SET_85, PEC_SET_75]),
        tx.query(
          `insert into drizzle."__drizzle_migrations" (hash,created_at)
           select $1,$2 where not exists (
             select 1 from drizzle."__drizzle_migrations" where hash=$1 and created_at=$2
           )`,
          [migration.hash, MIGRATION_CREATED_AT]
        )
      );
      return queries;
    },
    { isolationLevel: "Serializable" }
  );

  const after = await readSummary(sql);
  validatePreflight(after);
  validateCorrectedPecGrouping(after);
  if (JSON.stringify(after.counts) !== JSON.stringify(before.counts)) {
    throw new Error("Les compteurs métier ont changé pendant la migration.");
  }
  if (after.columns.length !== 9) throw new Error("Les neuf colonnes additives ne sont pas présentes.");
  const targetCatalog = Object.fromEntries(
    after.catalog.map((row) => [(row as Record<string, unknown>).name, row])
  ) as Record<string, Record<string, unknown>>;
  if (
    targetCatalog["Pec deck"]?.smallest_increment !== 5 ||
    targetCatalog["Pec deck"]?.rep_target_min !== 6 ||
    targetCatalog["Pec deck"]?.rep_target_max !== 10 ||
    targetCatalog["Pulley serré"]?.smallest_increment !== 5 ||
    targetCatalog["Tirage vertical muscle up"]?.smallest_increment !== 5
  ) {
    throw new Error("Les réglages du catalogue n'ont pas été appliqués exactement.");
  }
  console.log("\n✅ Correctif production appliqué et vérifié.");
  console.log(JSON.stringify(after, null, 2));
}

main().catch((error) => {
  console.error(`${SCRIPT_NAME}:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
