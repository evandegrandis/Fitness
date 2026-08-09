/**
 * Réconciliation transactionnelle et idempotente de la base Jeera de production.
 *
 * Par défaut, ce script est STRICTEMENT EN LECTURE SEULE : il valide le host,
 * les migrations, le JSON StrengthLevel et affiche l'état live.
 *
 * L'écriture exige simultanément :
 *   1. le hostname Neon exact de la branche restaurée ;
 *   2. APPLY_PROD_MIGRATION=ep-mute-sunset-atqb5xkv ;
 *   3. une sauvegarde cohérente, relue sur disque avant toute mutation.
 *
 * Toutes les mutations (DDL 0003→0006, corrections catalogue, invariants et
 * journal Drizzle) vivent dans UNE transaction Neon HTTP. Une seule assertion
 * qui échoue annule l'intégralité du lot.
 */

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  neon,
  type NeonQueryFunction,
  type NeonQueryFunctionInTransaction,
  type NeonQueryInTransaction,
} from "@neondatabase/serverless";

import {
  assertExactProductionDatabase,
  assertProductionMigrationConfirmed,
  databaseHostname,
  EXPECTED_PRODUCTION_NEON_HOST,
  PRODUCTION_MIGRATION_CONFIRMATION,
  writeBackupFile,
} from "./_safety";

const SCRIPT_NAME = "migrate-prod-2026-08-09";
const APPLY = process.env.APPLY_PROD_MIGRATION !== undefined;

const BASELINE_MIGRATION_TAGS = [
  "0000_opposite_betty_ross",
  "0001_friendly_starbolt",
  "0002_dashing_tinkerer",
] as const;
const RECONCILIATION_MIGRATION_TAGS = [
  "0003_curly_jackpot",
  "0004_certain_frank_castle",
  "0005_dusty_justice",
  "0006_happy_rawhide_kid",
] as const;

const PLATE_ID = "22519741-91db-5810-8e1f-1e42a7cfd392";
const DIPS_ID = "64054336-5A49-4DB5-B226-5B77973F5BA4";
const DIPS_MACHINE_ID = "61FFD2BA-E88F-47C1-9DA1-8FB103F5A600";
const PLATE_CANONICAL_NAME = "Plate loaded lateral raises";
const PLATE_STANDARD_KEY = "Plate loaded lat raise";
const DIPS_MACHINE_NAME = "Dips machine";
const ALCOHOL_QUESTION_AVAILABLE_AT = "2026-08-03T00:00:00.000Z";

const REQUIRED_PLATE_SETS = [
  {
    id: "c82abaf2-8256-56fd-a5da-c7323962c7a2",
    sessionId: "4c5faebd-9454-4aa8-a7d2-b4297c837616",
    weight: 12.5,
    reps: 9,
    timestampIso: "2026-08-03T15:40:00.000Z",
  },
  {
    id: "3b4e68ec-aa75-5968-81fe-a3c6a7c3757e",
    sessionId: "4c5faebd-9454-4aa8-a7d2-b4297c837616",
    weight: 12.5,
    reps: 7,
    timestampIso: "2026-08-03T15:43:00.000Z",
  },
  {
    id: "09275163-381c-5fca-b3d7-3481fb2941a7",
    sessionId: "c9772b33-e919-4619-97e1-4d9d6563b7bc",
    weight: 12.5,
    reps: 7,
    timestampIso: "2026-08-01T15:57:00.000Z",
  },
] as const;

const BUSINESS_TABLES = [
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

/**
 * Tables couvertes par l'empreinte du snapshot. Le journal Drizzle est inclus :
 * le backup et la transaction d'écriture doivent partir du même état métier ET
 * du même état de migration.
 */
const CONTENT_HASH_TARGETS: readonly { key: string; relationSql: string }[] = [
  ...BUSINESS_TABLES.map((table) => ({
    key: table,
    relationSql: `public."${table}"`,
  })),
  {
    key: "drizzle.__drizzle_migrations",
    relationSql: 'drizzle."__drizzle_migrations"',
  },
];

type BusinessTable = (typeof BUSINESS_TABLES)[number];
type TableDump = Record<string, Record<string, unknown>[]>;
type CountMap = Record<BusinessTable, number>;

type MigrationIdentity = {
  tag: string;
  file: string;
  createdAt: number;
  hash: string;
  statements: string[];
};

type BenchmarkUnit = "load" | "reps" | "reps_and_load";
type ValidStandard = { key: string; unit: BenchmarkUnit };
type SqlClient = NeonQueryFunction<false, false>;

type SnapshotFacts = {
  counts: CountMap;
  contentHashes: Record<string, string>;
  expectedMappingsAfter: number;
  bodyWeightKg: number;
};

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * SHA-256 déterministe du contenu d'une table.
 *
 * `to_jsonb(row)::text` fournit une représentation canonique des clés et le
 * tri binaire `C` rend l'ordre indépendant du plan SQL/de la collation locale.
 * La transaction fixe en plus son fuseau à UTC avant d'évaluer l'expression,
 * ce qui stabilise le rendu des `timestamptz` lors d'un rejeu idempotent.
 */
function contentHashExpression(relationSql: string): string {
  return `(
    SELECT encode(
      sha256(
        convert_to(
          COALESCE(
            string_agg(
              to_jsonb(content_row)::text,
              E'\\n' ORDER BY (to_jsonb(content_row)::text) COLLATE "C"
            ),
            ''
          ),
          'UTF8'
        )
      ),
      'hex'
    )
    FROM ${relationSql} AS content_row
  )`;
}

function contentHashesSelectSql(): string {
  return `select ${CONTENT_HASH_TARGETS.map(
    (target) => `${contentHashExpression(target.relationSql)} as "${target.key}"`
  ).join(",\n")}`;
}

/**
 * Bloque les DML concurrents après la revérification du snapshot. `SHARE`
 * laisse les lecteurs continuer, mais entre en conflit avec le `ROW EXCLUSIVE`
 * pris par INSERT/UPDATE/DELETE. Les upgrades de verrou de notre propre
 * transaction (DDL/DML du lot) restent autorisés.
 */
function lockSnapshotTablesSql(): string {
  return `lock table ${CONTENT_HASH_TARGETS.map((target) => target.relationSql).join(", ")}
    in share mode`;
}

function parseContentHashes(rows: Record<string, unknown>[]): Record<string, string> {
  if (rows.length !== 1) {
    throw new Error(`Empreintes du snapshot invalides : ${rows.length} ligne(s).`);
  }
  const contentHashes: Record<string, string> = {};
  for (const target of CONTENT_HASH_TARGETS) {
    const hash = stringField(rows[0], target.key, target.key);
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Empreinte SHA-256 absente/invalide pour ${target.key}.`);
    }
    contentHashes[target.key] = hash;
  }
  return contentHashes;
}

function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function loadMigrations(tags: readonly string[]): MigrationIdentity[] {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const journalPath = path.join(drizzleDir, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: { idx: number; when: number; tag: string }[];
  };
  return tags.map((tag) => {
    const entry = journal.entries?.find((candidate) => candidate.tag === tag);
    if (!entry) throw new Error(`Journal local incomplet : ${tag} est absent.`);
    const file = path.join(drizzleDir, `${tag}.sql`);
    const source = readFileSync(file, "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    if (statements.length === 0) throw new Error(`Migration vide : ${tag}.`);
    return {
      tag,
      file,
      createdAt: entry.when,
      hash: sha256File(file),
      statements,
    };
  });
}

function validTierArray(value: unknown, allowNegative = false): boolean {
  if (!Array.isArray(value) || value.length !== 5) return false;
  if (
    !value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        (allowNegative || entry >= 0)
    )
  ) {
    return false;
  }
  return value.every((entry, index) => index === 0 || entry > value[index - 1]);
}

function loadValidStandards(): { valid: ValidStandard[]; skipped: string[] } {
  const file = path.resolve(process.cwd(), "data/strength_standards_corrected.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { standards?: Record<string, unknown> };
  if (!parsed.standards || typeof parsed.standards !== "object") {
    throw new Error("strength_standards_corrected.json ne contient pas d'objet standards.");
  }

  const valid: ValidStandard[] = [];
  const skipped: string[] = [];
  for (const [key, raw] of Object.entries(parsed.standards)) {
    if (!raw || typeof raw !== "object") {
      skipped.push(key);
      continue;
    }
    const standard = raw as Record<string, unknown>;
    const unit = standard.unit;
    const slSlug = standard.slSlug;
    const convention = standard.convention;
    const negativeAddedLoadAllowed = convention === "added";
    const unitValid = unit === "load" || unit === "reps" || unit === "reps_and_load";
    const metadataValid =
      typeof slSlug === "string" &&
      slSlug.length > 0 &&
      (convention === "per_arm" ||
        convention === "total" ||
        convention === "added" ||
        convention === "reps");
    const axesValid =
      unit === "load"
        ? validTierArray(standard.load, negativeAddedLoadAllowed)
        : unit === "reps"
          ? validTierArray(standard.reps)
          : unit === "reps_and_load"
            ? validTierArray(standard.load, negativeAddedLoadAllowed) && validTierArray(standard.reps)
            : false;
    if (!unitValid || !metadataValid || !axesValid) {
      skipped.push(key);
      continue;
    }
    valid.push({ key, unit });
  }

  for (const required of [PLATE_STANDARD_KEY, "Dips", DIPS_MACHINE_NAME]) {
    if (!valid.some((standard) => standard.key === required)) {
      throw new Error(`Standard obligatoire invalide ou absent : ${required}.`);
    }
  }
  return { valid, skipped };
}

async function consistentDump(
  sql: SqlClient
): Promise<TableDump> {
  const descriptors = [
    ...BUSINESS_TABLES.map((table) => ({ key: table, sql: `select * from public."${table}"` })),
    {
      key: "drizzle.__drizzle_migrations",
      sql: 'select * from drizzle."__drizzle_migrations" order by created_at, id',
    },
    {
      key: "__content_hashes",
      sql: contentHashesSelectSql(),
    },
  ];
  const results = await sql.transaction(
    (tx) => [
      tx.query("set local time zone 'UTC'", []),
      ...descriptors.map((descriptor) => tx.query(descriptor.sql, [])),
    ],
    // PostgreSQL n'accepte DEFERRABLE que pour une transaction SERIALIZABLE
    // READ ONLY. C'est aussi la combinaison qui garantit un snapshot cohérent.
    { isolationLevel: "Serializable", readOnly: true, deferrable: true }
  );
  return Object.fromEntries(
    descriptors.map((descriptor, index) => [
      descriptor.key,
      results[index + 1] as Record<string, unknown>[],
    ])
  );
}

/** Préflight lecture seule : exerce exactement le SQL d'empreinte utilisé par le backup. */
async function readContentHashes(sql: SqlClient): Promise<Record<string, string>> {
  const results = await sql.transaction(
    (tx) => [
      tx.query("set local time zone 'UTC'", []),
      tx.query(contentHashesSelectSql(), []),
    ],
    { isolationLevel: "Serializable", readOnly: true, deferrable: true }
  );
  return parseContentHashes(results[1] as Record<string, unknown>[]);
}

function countsFromDump(dump: TableDump): CountMap {
  return Object.fromEntries(
    BUSINESS_TABLES.map((table) => [table, dump[table]?.length ?? -1])
  ) as CountMap;
}

function numberField(row: Record<string, unknown>, snake: string, camel: string): number | null {
  const value = Object.prototype.hasOwnProperty.call(row, snake) ? row[snake] : row[camel];
  return typeof value === "number" ? value : value === null ? null : Number(value);
}

function stringField(row: Record<string, unknown>, snake: string, camel: string): string | null {
  const value = Object.prototype.hasOwnProperty.call(row, snake) ? row[snake] : row[camel];
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function validateSnapshot(dump: TableDump): SnapshotFacts {
  const counts = countsFromDump(dump);
  for (const [table, count] of Object.entries(counts)) {
    if (count < 0) throw new Error(`Backup incomplet : table ${table} absente.`);
  }

  const contentHashes = parseContentHashes(dump.__content_hashes ?? []);

  const exerciseRows = dump.exercises ?? [];
  const plate = exerciseRows.filter((row) => row.id === PLATE_ID);
  const dips = exerciseRows.filter((row) => row.id === DIPS_ID);
  const dipsMachine = exerciseRows.filter((row) => row.id === DIPS_MACHINE_ID);
  if (plate.length !== 1 || dips.length !== 1 || dipsMachine.length !== 1) {
    throw new Error(
      `Cibles catalogue invalides : Plate=${plate.length}, Dips=${dips.length}, Dips machine=${dipsMachine.length}.`
    );
  }
  const plateName = stringField(plate[0], "name", "name");
  if (plateName !== PLATE_STANDARD_KEY && plateName !== PLATE_CANONICAL_NAME) {
    throw new Error(`L'ID Plate pointe vers un exercice inattendu : ${String(plateName)}.`);
  }
  if (stringField(dips[0], "name", "name") !== "Dips") {
    throw new Error("L'ID Dips ne pointe pas vers l'exercice Dips attendu.");
  }
  if (stringField(dipsMachine[0], "name", "name") !== DIPS_MACHINE_NAME) {
    throw new Error("L'ID Dips machine ne pointe pas vers l'exercice attendu.");
  }
  if (
    exerciseRows.some(
      (row) => row.id !== PLATE_ID && stringField(row, "name", "name") === PLATE_CANONICAL_NAME
    )
  ) {
    throw new Error(`Le nom canonique ${PLATE_CANONICAL_NAME} est déjà utilisé par un autre ID.`);
  }

  const settings = (dump.user_settings ?? []).filter((row) => row.id === "singleton");
  if (settings.length !== 1) throw new Error(`Settings singleton invalide : ${settings.length} ligne(s).`);
  const bodyWeightKg = numberField(settings[0], "body_weight_kg", "bodyWeightKg");
  if (bodyWeightKg !== 80) {
    throw new Error(
      `Poids de corps inattendu (${String(bodyWeightKg)}). Le script refuse de l'écraser sans autorité.`
    );
  }

  const mappings = dump.muscle_mappings ?? [];
  const plateMappingCount = mappings.filter(
    (row) => stringField(row, "exercise_id", "exerciseId") === PLATE_ID
  ).length;
  const dipsMappingCount = mappings.filter(
    (row) => stringField(row, "exercise_id", "exerciseId") === DIPS_ID
  ).length;
  const expectedMappingsAfter = counts.muscle_mappings - plateMappingCount - dipsMappingCount + 5;

  const loggedExercises = new Map(
    (dump.logged_exercises ?? []).map((row) => [String(row.id), row])
  );
  const loggedSets = new Map((dump.logged_sets ?? []).map((row) => [String(row.id), row]));
  for (const expected of REQUIRED_PLATE_SETS) {
    const set = loggedSets.get(expected.id);
    if (!set) throw new Error(`Série Plate obligatoire absente : ${expected.id}.`);
    const logged = loggedExercises.get(
      stringField(set, "logged_exercise_id", "loggedExerciseId") ?? ""
    );
    if (
      !logged ||
      stringField(logged, "exercise_id", "exerciseId") !== PLATE_ID ||
      stringField(logged, "session_id", "sessionId") !== expected.sessionId ||
      numberField(set, "weight", "weight") !== expected.weight ||
      numberField(set, "reps", "reps") !== expected.reps
    ) {
      throw new Error(`Série Plate incohérente avant migration : ${expected.id}.`);
    }
  }

  return { counts, contentHashes, expectedMappingsAfter, bodyWeightKg };
}

function validateExistingJournal(
  rows: Record<string, unknown>[],
  knownMigrations: MigrationIdentity[],
  requiredMigrations: MigrationIdentity[]
): void {
  for (const row of rows) {
    const matchingIdentity = knownMigrations.find(
      (migration) =>
        row.hash === migration.hash && Number(row.created_at) === migration.createdAt
    );
    if (!matchingIdentity) {
      throw new Error(
        `Journal Drizzle inconnu/divergent (created_at=${String(row.created_at)}).`
      );
    }
  }

  for (const migration of knownMigrations) {
    const exactMatches = rows.filter(
      (row) => row.hash === migration.hash && Number(row.created_at) === migration.createdAt
    ).length;
    const required = requiredMigrations.some((candidate) => candidate.tag === migration.tag);
    if ((required && exactMatches !== 1) || (!required && exactMatches > 1)) {
      throw new Error(
        `Journal Drizzle ${required ? "incomplet" : "dupliqué"} pour ${migration.tag}.`
      );
    }
  }
}

function preconditionSql(facts: SnapshotFacts): string {
  const countChecks = BUSINESS_TABLES.map((table) => {
    const expected = facts.counts[table];
    return `
      IF (SELECT count(*) FROM public."${table}") <> ${expected} THEN
        RAISE EXCEPTION 'La table ${table} a changé depuis le backup; migration annulée.';
      END IF;`;
  }).join("\n");
  const hashChecks = CONTENT_HASH_TARGETS.map((target) => `
      IF ${contentHashExpression(target.relationSql)} <> ${sqlString(facts.contentHashes[target.key])} THEN
        RAISE EXCEPTION 'Le contenu de ${target.key} a changé depuis le backup; migration annulée.';
      END IF;`).join("\n");
  return `DO $$ BEGIN ${countChecks} ${hashChecks} END $$;`;
}

function schemaInvariantSql(): string {
  const timestampPairs = [
    ["exercises", "last_used"],
    ["logged_sets", "timestamp"],
    ["recovery_checkins", "date"],
    ["workout_sessions", "date"],
    ["workout_sessions", "start_time"],
    ["workout_sessions", "end_time"],
    ["workout_templates", "created_at"],
  ];
  const timestampChecks = timestampPairs
    .map(
      ([table, column]) => `
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=${sqlString(table)}
           AND column_name=${sqlString(column)} AND data_type='timestamp with time zone'
      ) THEN
        RAISE EXCEPTION 'Type timestamptz manquant: %.%', ${sqlString(table)}, ${sqlString(column)};
      END IF;`
    )
    .join("\n");
  const additiveColumnSpecs = [
    ["cardio_entries", "activity_type", "text", "NO"],
    ["cardio_entries", "machine_name", "text", "YES"],
    ["cardio_entries", "machine_model", "text", "YES"],
    ["cardio_entries", "resistance", "double precision", "YES"],
    ["cardio_entries", "average_watts", "double precision", "YES"],
    ["cardio_entries", "average_heart_rate_bpm", "integer", "YES"],
    ["cardio_entries", "incline_percent", "double precision", "YES"],
    ["user_settings", "gender", "text", "YES"],
    ["user_settings", "age_years", "integer", "YES"],
    ["exercises", "movement_pattern", "text", "YES"],
    ["exercises", "resistance_profile", "text", "YES"],
    ["exercises", "strength_standard_key", "text", "YES"],
    ["exercises", "benchmark_unit", "text", "YES"],
    ["logged_exercises", "plateau_weak_point", "text", "YES"],
  ];
  const additiveColumnChecks = additiveColumnSpecs
    .map(
      ([table, column, dataType, nullable]) => `
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=${sqlString(table)}
           AND column_name=${sqlString(column)} AND data_type=${sqlString(dataType)}
           AND is_nullable=${sqlString(nullable)}
      ) THEN
        RAISE EXCEPTION 'Colonne additive absente/incompatible: %.%', ${sqlString(table)}, ${sqlString(column)};
      END IF;`
    )
    .join("\n");
  return `
    DO $$
    BEGIN
      ${timestampChecks}
      ${additiveColumnChecks}
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='cardio_entries'
           AND column_name='activity_type' AND column_default='''other''::text'
      ) THEN
        RAISE EXCEPTION 'Default cardio_entries.activity_type incorrect.';
      END IF;
      IF (
        SELECT count(*)
          FROM (VALUES
            ('public.cardio_entries'::regclass, 'cardio_entries_activity_type_check'),
            ('public.cardio_entries'::regclass, 'cardio_entries_metrics_check'),
            ('public.user_settings'::regclass, 'user_settings_profile_check'),
            ('public.recovery_checkins'::regclass, 'recovery_checkins_values_check')
          ) AS expected(relation_id, constraint_name)
          JOIN pg_constraint constraint_row
            ON constraint_row.conrelid=expected.relation_id
           AND constraint_row.conname=expected.constraint_name
           AND constraint_row.contype='c'
           AND constraint_row.convalidated
      ) <> 4 THEN
        RAISE EXCEPTION 'Les quatre contraintes de validation ne sont pas toutes présentes.';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='recovery_checkins'
           AND indexname='recovery_checkins_date_unique'
           AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      ) THEN
        RAISE EXCEPTION 'Index unique recovery_checkins_date_unique absent.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='recovery_checkins'
           AND indexname='recovery_checkins_date_idx'
      ) THEN
        RAISE EXCEPTION 'Ancien index non unique recovery_checkins_date_idx encore présent.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='recovery_checkins'
           AND column_name IN ('took_creatine','protein_target_met','sleep_hours','had_alcohol')
           AND (is_nullable <> 'YES' OR column_default IS NOT NULL)
      ) THEN
        RAISE EXCEPTION 'Colonnes recovery encore NOT NULL ou avec default.';
      END IF;
    END $$;
  `;
}

function businessInvariantSql(facts: SnapshotFacts, standards: ValidStandard[]): string {
  const unchangedChecks = BUSINESS_TABLES.filter((table) => table !== "muscle_mappings")
    .map(
      (table) => `
      IF (SELECT count(*) FROM public."${table}") <> ${facts.counts[table]} THEN
        RAISE EXCEPTION 'Compteur final inattendu pour ${table}.';
      END IF;`
    )
    .join("\n");
  const plateSetChecks = REQUIRED_PLATE_SETS.map(
    (set) => `
      IF NOT EXISTS (
        SELECT 1
          FROM logged_sets ls
          JOIN logged_exercises le ON le.id = ls.logged_exercise_id
         WHERE ls.id = ${sqlString(set.id)}
           AND le.session_id = ${sqlString(set.sessionId)}
           AND le.exercise_id = ${sqlString(PLATE_ID)}
           AND ls.weight = ${set.weight}
           AND ls.reps = ${set.reps}
           AND ls.timestamp = ${sqlString(set.timestampIso)}::timestamptz
      ) THEN
        RAISE EXCEPTION 'Série Plate absente/incohérente après migration: ${set.id}.';
      END IF;`
  ).join("\n");
  const standardsValues = standards
    .map((standard) => `(${sqlString(standard.key)}, ${sqlString(standard.unit)})`)
    .join(",\n");
  return `
    DO $$
    BEGIN
      ${unchangedChecks}
      IF (SELECT count(*) FROM muscle_mappings) <> ${facts.expectedMappingsAfter} THEN
        RAISE EXCEPTION 'Compteur final inattendu pour muscle_mappings.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM exercises
         WHERE id=${sqlString(PLATE_ID)}
           AND name=${sqlString(PLATE_CANONICAL_NAME)}
           AND smallest_increment=1.25
           AND setup_notes='Charge loggée par bras.'
           AND resistance_profile IS NULL
           AND strength_standard_key=${sqlString(PLATE_STANDARD_KEY)}
           AND benchmark_unit='load'
      ) THEN
        RAISE EXCEPTION 'Catalogue Plate incorrect après migration.';
      END IF;
      IF (SELECT count(*) FROM muscle_mappings WHERE exercise_id=${sqlString(PLATE_ID)}) <> 1
         OR NOT EXISTS (
           SELECT 1 FROM muscle_mappings
            WHERE exercise_id=${sqlString(PLATE_ID)} AND muscle_group='delt_lat' AND coefficient=1
         ) THEN
        RAISE EXCEPTION 'Mapping Plate incorrect après migration.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM logged_exercises
         WHERE exercise_id=${sqlString(PLATE_ID)}
           AND exercise_name<>${sqlString(PLATE_CANONICAL_NAME)}
      ) THEN
        RAISE EXCEPTION 'Nom historique Plate non réconcilié dans logged_exercises.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM exercises
         WHERE id=${sqlString(DIPS_ID)} AND set_pattern_mode='bodyweight'
           AND strength_standard_key='Dips' AND benchmark_unit='reps_and_load'
      ) THEN
        RAISE EXCEPTION 'Catalogue Dips incorrect après migration.';
      END IF;
      IF (SELECT count(*) FROM muscle_mappings WHERE exercise_id=${sqlString(DIPS_ID)}) <> 4
         OR EXISTS (
           SELECT 1 FROM muscle_mappings
            WHERE exercise_id=${sqlString(DIPS_ID)}
              AND (muscle_group NOT IN ('pect_stern','triceps_long','triceps_lat','triceps_med') OR coefficient<>1)
         ) THEN
        RAISE EXCEPTION 'Mappings Dips incorrects après migration.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM exercises
         WHERE id=${sqlString(DIPS_MACHINE_ID)}
           AND name=${sqlString(DIPS_MACHINE_NAME)}
           AND set_pattern_mode='straight'
           AND strength_standard_key=${sqlString(DIPS_MACHINE_NAME)}
           AND benchmark_unit='load'
      ) THEN
        RAISE EXCEPTION 'Catalogue Dips machine incorrect après migration.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM user_settings
         WHERE id='singleton' AND gender='male' AND age_years=26
           AND body_weight_kg IS NOT DISTINCT FROM ${facts.bodyWeightKg}
      ) THEN
        RAISE EXCEPTION 'Profil utilisateur incorrect ou poids de corps modifié.';
      END IF;

      IF EXISTS (
        SELECT 1 FROM recovery_checkins
         WHERE date < ${sqlString(ALCOHOL_QUESTION_AVAILABLE_AT)}::timestamptz
           AND had_alcohol = false
      ) THEN
        RAISE EXCEPTION 'Un faux Non alcool hérité subsiste avant la disponibilité de la question.';
      END IF;

      IF EXISTS (
        SELECT 1
          FROM exercises e
          JOIN (VALUES ${standardsValues}) AS expected(name, unit) ON expected.name=e.name
         WHERE e.strength_standard_key IS DISTINCT FROM expected.name
            OR e.benchmark_unit IS DISTINCT FROM expected.unit
      ) THEN
        RAISE EXCEPTION 'Un standard valide par nom exact n''a pas été mappé.';
      END IF;
      ${plateSetChecks}
    END $$;
  `;
}

function journalPreconditionSql(
  knownMigrations: MigrationIdentity[],
  baselineMigrations: MigrationIdentity[]
): string {
  const knownPairs = knownMigrations
    .map(
      (migration) =>
        `(hash=${sqlString(migration.hash)} AND created_at=${migration.createdAt})`
    )
    .join(" OR ");
  const baselineConditions = baselineMigrations
    .map(
      (migration) => `
      IF (SELECT count(*) FROM drizzle."__drizzle_migrations"
           WHERE hash=${sqlString(migration.hash)} AND created_at=${migration.createdAt}) <> 1 THEN
        RAISE EXCEPTION 'Migration de base absente/dupliquée: ${migration.tag}.';
      END IF;`
    )
    .join("\n");
  return `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM drizzle."__drizzle_migrations" WHERE NOT (${knownPairs})
      ) THEN
        RAISE EXCEPTION 'Le journal contient une migration locale inconnue ou divergente.';
      END IF;
      ${baselineConditions}
    END $$;
  `;
}

function journalFinalInvariantSql(migrations: MigrationIdentity[]): string {
  const checks = migrations
    .map(
      (migration) => `
      IF (SELECT count(*) FROM drizzle."__drizzle_migrations"
           WHERE created_at=${migration.createdAt} AND hash=${sqlString(migration.hash)}) <> 1 THEN
        RAISE EXCEPTION 'Journal final invalide pour ${migration.tag}.';
      END IF;`
    )
    .join("\n");
  return `
    DO $$
    BEGIN
      ${checks}
      IF (SELECT count(*) FROM drizzle."__drizzle_migrations") <> ${migrations.length} THEN
        RAISE EXCEPTION 'Le journal final ne contient pas exactement ${migrations.length} migrations.';
      END IF;
    END $$;
  `;
}

function correctionQueries(
  tx: NeonQueryFunctionInTransaction<false, false>,
  standards: ValidStandard[]
): NeonQueryInTransaction[] {
  const queries: NeonQueryInTransaction[] = [
    tx.query(
      `update exercises
          set name=$1, smallest_increment=1.25, setup_notes='Charge loggée par bras.',
              resistance_profile=null, strength_standard_key=$2, benchmark_unit='load'
        where id=$3`,
      [PLATE_CANONICAL_NAME, PLATE_STANDARD_KEY, PLATE_ID]
    ),
    tx.query("update logged_exercises set exercise_name=$1 where exercise_id=$2", [
      PLATE_CANONICAL_NAME,
      PLATE_ID,
    ]),
    tx.query("delete from muscle_mappings where exercise_id=$1", [PLATE_ID]),
    tx.query(
      `insert into muscle_mappings (id,exercise_id,muscle_group,coefficient)
       values ($1,$2,'delt_lat',1)
       on conflict (id) do update set
         exercise_id=excluded.exercise_id, muscle_group=excluded.muscle_group,
         coefficient=excluded.coefficient`,
      [stableId(`mapping:${PLATE_ID}:delt_lat`), PLATE_ID]
    ),
    tx.query(
      `update exercises
          set set_pattern_mode='bodyweight', strength_standard_key='Dips',
              benchmark_unit='reps_and_load'
        where id=$1`,
      [DIPS_ID]
    ),
    tx.query(
      `update exercises
          set set_pattern_mode='straight', strength_standard_key=$1, benchmark_unit='load'
        where id=$2 and name=$1`,
      [DIPS_MACHINE_NAME, DIPS_MACHINE_ID]
    ),
    // Avant l'ajout de l'option alcool, la migration 0002 a matérialisé
    // `false` par défaut sur les anciens check-ins. Ce n'était pas une réponse
    // utilisateur : la seule valeur honnête avant le cutoff est `NULL`.
    tx.query(
      `update recovery_checkins
          set had_alcohol=null
        where date < $1::timestamptz and had_alcohol=false`,
      [ALCOHOL_QUESTION_AVAILABLE_AT]
    ),
    tx.query("delete from muscle_mappings where exercise_id=$1", [DIPS_ID]),
  ];

  for (const muscle of ["pect_stern", "triceps_long", "triceps_lat", "triceps_med"]) {
    queries.push(
      tx.query(
        `insert into muscle_mappings (id,exercise_id,muscle_group,coefficient)
         values ($1,$2,$3,1)
         on conflict (id) do update set
           exercise_id=excluded.exercise_id, muscle_group=excluded.muscle_group,
           coefficient=excluded.coefficient`,
        [stableId(`mapping:${DIPS_ID}:${muscle}`), DIPS_ID, muscle]
      )
    );
  }

  // Seules les entrées JSON structurellement valides sont mappées. HSPU ne
  // rejoint donc cette boucle que si son standard reps possède bien 5 tiers.
  for (const standard of standards) {
    queries.push(
      tx.query(
        `update exercises
            set strength_standard_key=$1, benchmark_unit=$2
          where name=$1`,
        [standard.key, standard.unit]
      )
    );
  }

  // Le nom canonique affiché de Plate diffère volontairement de la clé
  // historique du JSON StrengthLevel : restaurer explicitement cette clé.
  queries.push(
    tx.query(
      "update exercises set strength_standard_key=$1, benchmark_unit='load' where id=$2",
      [PLATE_STANDARD_KEY, PLATE_ID]
    ),
    tx.query("update user_settings set gender='male', age_years=26 where id='singleton'", [])
  );
  return queries;
}

async function readLiveSummary(sql: SqlClient) {
  const [counts, targets, plateSets, migrations, schemaState, legacyAlcoholDefaults] = await Promise.all([
    sql.query(
      `select ${BUSINESS_TABLES.map(
        (table) => `(select count(*)::int from public."${table}") as "${table}"`
      ).join(",")}`,
      []
    ),
    sql.query(
      `select id,name,set_pattern_mode,smallest_increment,setup_notes,
              resistance_profile,strength_standard_key,benchmark_unit
         from exercises where id=any($1::text[]) order by id`,
      [[PLATE_ID, DIPS_ID, DIPS_MACHINE_ID]]
    ),
    sql.query(
      `select ls.id,le.session_id,ls.weight,ls.reps,ls.timestamp::text as timestamp
         from logged_sets ls join logged_exercises le on le.id=ls.logged_exercise_id
        where ls.id=any($1::text[]) order by ls.id`,
      [REQUIRED_PLATE_SETS.map((set) => set.id)]
    ),
    sql.query(
      'select id,hash,created_at from drizzle."__drizzle_migrations" order by created_at,id',
      []
    ),
    sql.query(
      `select table_name,column_name,data_type,is_nullable,column_default
         from information_schema.columns
        where (table_name,column_name) in (
          ('exercises','last_used'),('logged_sets','timestamp'),('recovery_checkins','date'),
          ('workout_sessions','date'),('workout_sessions','start_time'),
          ('workout_sessions','end_time'),('workout_templates','created_at'),
          ('recovery_checkins','took_creatine'),('recovery_checkins','protein_target_met'),
          ('recovery_checkins','sleep_hours'),('recovery_checkins','had_alcohol')
        ) order by table_name,column_name`,
      []
    ),
    sql.query(
      `select count(*)::int as false_before_question
         from recovery_checkins
        where date < $1::timestamptz and had_alcohol=false`,
      [ALCOHOL_QUESTION_AVAILABLE_AT]
    ),
  ]);
  return {
    counts: counts[0],
    targets,
    plateSets,
    migrations,
    schemaState,
    legacyAlcoholDefaults: legacyAlcoholDefaults[0],
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  if (APPLY) assertProductionMigrationConfirmed(SCRIPT_NAME);

  const baselineMigrations = loadMigrations(BASELINE_MIGRATION_TAGS);
  const migrations = loadMigrations(RECONCILIATION_MIGRATION_TAGS);
  const knownMigrations = [...baselineMigrations, ...migrations];
  const { valid: standards, skipped } = loadValidStandards();
  const hspu = standards.find((standard) => standard.key === "HSPU");
  const sql = neon(databaseUrl);
  const liveBefore = await readLiveSummary(sql);
  const preflightContentHashes = APPLY ? undefined : await readContentHashes(sql);
  validateExistingJournal(
    liveBefore.migrations as Record<string, unknown>[],
    knownMigrations,
    baselineMigrations
  );

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "APPLY" : "READ_ONLY_PLAN",
        host: databaseHostname(databaseUrl),
        expectedHost: EXPECTED_PRODUCTION_NEON_HOST,
        counts: liveBefore.counts,
        targets: liveBefore.targets,
        requiredPlateSets: liveBefore.plateSets,
        schema: liveBefore.schemaState,
        legacyAlcoholDefaults: liveBefore.legacyAlcoholDefaults,
        preflightContentHashes,
        migrationBaseline: baselineMigrations.map(({ tag, createdAt, hash }) => ({
          tag,
          createdAt,
          hash,
        })),
        migrations: migrations.map(({ tag, createdAt, hash, statements }) => ({
          tag,
          createdAt,
          hash,
          statements: statements.length,
        })),
        standards: {
          valid: standards.length,
          skipped,
          hspuMapped: Boolean(hspu),
        },
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log(
      `\n[LECTURE SEULE] Aucun write. Pour appliquer: APPLY_PROD_MIGRATION=${PRODUCTION_MIGRATION_CONFIRMATION} npx tsx scripts/migrate-prod-2026-08-09.ts`
    );
    return;
  }

  // Snapshot cohérent et lecture seule AVANT toute mutation.
  const dump = await consistentDump(sql);
  const facts = validateSnapshot(dump);
  validateExistingJournal(
    dump["drizzle.__drizzle_migrations"] ?? [],
    knownMigrations,
    baselineMigrations
  );
  const backupFile = writeBackupFile(dump, "pre-prod-migration-2026-08-09");
  if (statSync(backupFile).size < 1_000) {
    throw new Error(`Backup anormalement petit (${backupFile}); migration annulée.`);
  }
  const persistedBackup = JSON.parse(readFileSync(backupFile, "utf8")) as {
    tables?: TableDump;
  };
  if (!persistedBackup.tables) {
    throw new Error(`Backup illisible ou incomplet (${backupFile}); migration annulée.`);
  }
  const persistedFacts = validateSnapshot(persistedBackup.tables);
  if (
    JSON.stringify(persistedFacts.counts) !== JSON.stringify(facts.counts) ||
    JSON.stringify(persistedFacts.contentHashes) !== JSON.stringify(facts.contentHashes)
  ) {
    throw new Error(`Backup relu divergent du snapshot (${backupFile}); migration annulée.`);
  }
  console.log(`Backup cohérent vérifié : ${backupFile}`);
  console.log(`Compteurs avant : ${JSON.stringify(facts.counts)}`);
  console.log(`Empreintes avant : ${JSON.stringify(facts.contentHashes)}`);

  await sql.transaction(
    (tx) => {
      const queries: NeonQueryInTransaction[] = [
        tx.query("set local time zone 'UTC'", []),
        tx.query(lockSnapshotTablesSql(), []),
        tx.query(preconditionSql(facts), []),
      ];
      for (const migration of migrations) {
        for (const statement of migration.statements) queries.push(tx.query(statement, []));
      }
      queries.push(...correctionQueries(tx, standards));
      queries.push(tx.query(schemaInvariantSql(), []));
      queries.push(tx.query(businessInvariantSql(facts, standards), []));
      queries.push(tx.query(journalPreconditionSql(knownMigrations, baselineMigrations), []));
      for (const migration of migrations) {
        queries.push(
          tx.query(
            `insert into drizzle."__drizzle_migrations" (hash,created_at)
             select $1,$2
              where not exists (
                select 1 from drizzle."__drizzle_migrations" where hash=$1 and created_at=$2
              )`,
            [migration.hash, migration.createdAt]
          )
        );
      }
      queries.push(tx.query(journalFinalInvariantSql(knownMigrations), []));
      return queries;
    },
    { isolationLevel: "Serializable" }
  );

  const liveAfter = await readLiveSummary(sql);
  validateExistingJournal(
    liveAfter.migrations as Record<string, unknown>[],
    knownMigrations,
    knownMigrations
  );
  console.log("\n✅ Migration atomique validée.");
  console.log(JSON.stringify(liveAfter, null, 2));
}

main().catch((error) => {
  console.error(`\n${SCRIPT_NAME}: échec —`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
