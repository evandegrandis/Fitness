/**
 * Import atomique des séances carnet des 7 et 10 août 2026.
 *
 * Le script est en lecture seule par défaut. L'écriture exige :
 *   APPLY_PROD_SESSION_IMPORT=ep-mute-sunset-atqb5xkv
 *
 * Garde-fous : host de production exact, collision par jour civil refusée,
 * backup cohérent relu sur disque, empreinte de toutes les tables revérifiée
 * sous verrou, transaction unique et validation exacte après écriture.
 */

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

import {
  neon,
  type NeonQueryFunction,
  type NeonQueryFunctionInTransaction,
  type NeonQueryInTransaction,
} from "@neondatabase/serverless";

import {
  assertExactProductionDatabase,
  databaseHostname,
  EXPECTED_PRODUCTION_NEON_HOST,
  PRODUCTION_MIGRATION_CONFIRMATION,
  writeBackupFile,
} from "./_safety";

const SCRIPT_NAME = "import-sessions-2026-08-13";
const APPLY_ENV = "APPLY_PROD_SESSION_IMPORT";
const APPLY_VALUE = process.env[APPLY_ENV];
const APPLY = APPLY_VALUE !== undefined;
const TEMPLATE_NAME = "Full Body";

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
type CountMap = Record<BusinessTable, number>;
type TableDump = Record<string, Record<string, unknown>[]>;
type SqlClient = NeonQueryFunction<false, false>;

type SetSpec = {
  id: string;
  weight: number;
  reps: number;
  setType: "work" | "finisher";
  timestampIso: string;
  setSlotIndex: number;
  supersetRoundIndex: number | null;
};

type LoggedExerciseSpec = {
  id: string;
  orderIndex: number;
  exerciseId: string;
  exerciseName: string;
  supersetGroupId: string | null;
  sets: SetSpec[];
};

type SessionSpec = {
  id: string;
  localDate: string;
  startIso: string;
  supersetGroupId: string;
  exercises: LoggedExerciseSpec[];
};

type SnapshotFacts = {
  counts: CountMap;
  contentHashes: Record<string, string>;
  newExerciseSortOrder: number;
};

const IDS = {
  hspu: "0A3E88ED-96C5-4B6A-B502-47D9CD005B8F",
  pullupsSn: "4819C179-6682-4D3D-9D8B-8BC3BA3EC57B",
  muscleUpPulldown: "D8831DCB-BA2D-4150-9A9A-96A029AE1ED5",
  pecDeck: "3E1E8EC6-89F7-4E37-8B17-61C0DD4DFABA",
  closePulley: "9088AA1B-84B4-4686-BA9D-206F51F2BDA6",
  plateLateralRaise: "22519741-91db-5810-8e1f-1e42a7cfd392",
  dips: "64054336-5A49-4DB5-B226-5B77973F5BA4",
  lateralRaise: "986C0567-D8D3-4348-A92D-26A9BBF4A459",
  standingCurl: "DA1AF977-1C06-4D87-95B9-DDF80C60893B",
  inclineChestPress: stableId("exercise:chest-press-incline-technogym"),
} as const;

const CANONICAL_EXERCISES = [
  { id: IDS.hspu, name: "HSPU", increment: 1.25 },
  { id: IDS.pullupsSn, name: "Tractions SN", increment: 1.25 },
  { id: IDS.muscleUpPulldown, name: "Tirage vertical muscle up", increment: 5 },
  { id: IDS.pecDeck, name: "Pec deck", increment: 5 },
  { id: IDS.closePulley, name: "Pulley serré", increment: 5 },
  {
    id: IDS.plateLateralRaise,
    name: "Plate loaded lateral raises",
    increment: 1.25,
  },
  // Incrément sans effet en mode bodyweight, mais on vérifie la valeur live
  // existante au lieu de la modifier silencieusement pendant cet import.
  { id: IDS.dips, name: "Dips", increment: 2.5 },
  { id: IDS.lateralRaise, name: "Lateral raises", increment: 2 },
  { id: IDS.standingCurl, name: "Curl debout", increment: 2 },
] as const;

const NEW_EXERCISE = {
  id: IDS.inclineChestPress,
  name: "Chest press incliné Technogym",
  category: "Push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 10,
  smallestIncrement: 2.5,
  suggestedRestSeconds: 150,
  setupNotes: "Machine guidée Technogym (pas poids libre), charge saisie telle qu’affichée.",
  fatigueClass: "heavy",
  movementPattern: "horizontal_press",
  mappings: [
    ["pect_clav", 1],
    ["pect_stern", 0.3],
    ["delt_ant", 0.3],
    ["triceps_long", 0.3],
    ["triceps_lat", 0.3],
    ["triceps_med", 0.3],
  ] as const,
} as const;

function stableId(key: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16)
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildSession(input: {
  id: string;
  localDate: string;
  startIso: string;
  supersetGroupId: string;
  exercises: Array<{
    exerciseId: string;
    exerciseName: string;
    superset: boolean;
    sets: Array<{
      weight: number;
      reps: number;
      minute: number;
      setType?: "work" | "finisher";
      round?: number;
    }>;
  }>;
}): SessionSpec {
  const exercises = input.exercises.map((exercise, orderIndex): LoggedExerciseSpec => {
    const id = stableId(
      `${input.id}:exercise:${orderIndex}:${exercise.exerciseName}`
    );
    return {
      id,
      orderIndex,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      supersetGroupId: exercise.superset ? input.supersetGroupId : null,
      sets: exercise.sets.map((set, setSlotIndex) => ({
        id: stableId(`${id}:set:${setSlotIndex}`),
        weight: set.weight,
        reps: set.reps,
        setType: set.setType ?? "work",
        timestampIso: new Date(
          new Date(input.startIso).getTime() + set.minute * 60_000
        ).toISOString(),
        setSlotIndex,
        supersetRoundIndex: set.round ?? null,
      })),
    };
  });
  return { ...input, exercises };
}

const SESSIONS: readonly SessionSpec[] = [
  buildSession({
    id: stableId("session:2026-08-07"),
    localDate: "2026-08-07",
    startIso: "2026-08-07T16:00:00.000Z",
    supersetGroupId: stableId(
      `${stableId("session:2026-08-07")}:superset:0`
    ),
    exercises: [
      {
        exerciseId: IDS.hspu,
        exerciseName: "HSPU",
        superset: true,
        sets: [
          { weight: 0, reps: 10, minute: 0, round: 1 },
          { weight: 0, reps: 10, minute: 6, round: 2 },
        ],
      },
      {
        exerciseId: IDS.pullupsSn,
        exerciseName: "Tractions SN",
        superset: true,
        sets: [
          { weight: 0, reps: 10, minute: 3, round: 1 },
          { weight: 0, reps: 10, minute: 9, round: 2 },
        ],
      },
      {
        exerciseId: IDS.muscleUpPulldown,
        exerciseName: "Tirage vertical muscle up",
        superset: false,
        sets: [
          { weight: 35, reps: 10, minute: 12 },
          { weight: 40, reps: 7, minute: 15 },
          { weight: 40, reps: 5, minute: 18 },
        ],
      },
      {
        exerciseId: IDS.pecDeck,
        exerciseName: "Pec deck",
        superset: false,
        sets: [{ weight: 75, reps: 10, minute: 21 }],
      },
      {
        exerciseId: IDS.closePulley,
        exerciseName: "Pulley serré",
        superset: false,
        sets: [
          { weight: 45, reps: 8, minute: 24 },
          { weight: 45, reps: 7, minute: 27 },
        ],
      },
      {
        exerciseId: IDS.plateLateralRaise,
        exerciseName: "Plate loaded lateral raises",
        superset: false,
        sets: [{ weight: 13.75, reps: 5, minute: 30 }],
      },
      {
        exerciseId: IDS.dips,
        exerciseName: "Dips",
        superset: false,
        sets: [{ weight: 0, reps: 20, minute: 33, setType: "finisher" }],
      },
    ],
  }),
  buildSession({
    id: stableId("session:2026-08-10"),
    localDate: "2026-08-10",
    startIso: "2026-08-10T16:00:00.000Z",
    supersetGroupId: stableId(
      `${stableId("session:2026-08-10")}:superset:0`
    ),
    exercises: [
      {
        exerciseId: IDS.pullupsSn,
        exerciseName: "Tractions SN",
        superset: true,
        sets: [
          { weight: 0, reps: 10, minute: 0, round: 1 },
          { weight: 0, reps: 8, minute: 6, round: 2 },
        ],
      },
      {
        exerciseId: IDS.hspu,
        exerciseName: "HSPU",
        superset: true,
        sets: [
          { weight: 0, reps: 15, minute: 3, round: 1 },
          { weight: 0, reps: 13, minute: 9, round: 2 },
        ],
      },
      {
        exerciseId: IDS.muscleUpPulldown,
        exerciseName: "Tirage vertical muscle up",
        superset: false,
        sets: [
          { weight: 40, reps: 9, minute: 12 },
          { weight: 35, reps: 9, minute: 15 },
        ],
      },
      {
        exerciseId: IDS.inclineChestPress,
        exerciseName: NEW_EXERCISE.name,
        superset: false,
        sets: [{ weight: 60, reps: 5, minute: 18 }],
      },
      {
        exerciseId: IDS.closePulley,
        exerciseName: "Pulley serré",
        superset: false,
        sets: [{ weight: 45, reps: 9, minute: 21 }],
      },
      {
        exerciseId: IDS.lateralRaise,
        exerciseName: "Lateral raises",
        superset: false,
        sets: [
          { weight: 12, reps: 10, minute: 24 },
          { weight: 12, reps: 8, minute: 27 },
          { weight: 12, reps: 7, minute: 30 },
        ],
      },
      {
        exerciseId: IDS.standingCurl,
        exerciseName: "Curl debout",
        superset: false,
        sets: [{ weight: 20, reps: 4, minute: 33 }],
      },
      {
        exerciseId: IDS.pecDeck,
        exerciseName: "Pec deck",
        superset: false,
        sets: [
          { weight: 75, reps: 10, minute: 36 },
          { weight: 80, reps: 7, minute: 39 },
        ],
      },
    ],
  }),
] as const;

const SESSION_IDS = SESSIONS.map((session) => session.id);
const TARGET_DATES = SESSIONS.map((session) => session.localDate);
const EXPECTED_DELTA: CountMap = {
  exercises: 1,
  muscle_mappings: NEW_EXERCISE.mappings.length,
  workout_sessions: SESSIONS.length,
  logged_exercises: SESSIONS.reduce(
    (count, session) => count + session.exercises.length,
    0
  ),
  logged_sets: SESSIONS.reduce(
    (count, session) =>
      count + session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    0
  ),
  superset_groups: SESSIONS.length,
  cardio_entries: 0,
  muscle_goals: 0,
  workout_templates: 0,
  template_exercises: 0,
  user_settings: 0,
  recovery_checkins: 0,
};

function assertStaticPlan(): void {
  const expectedIds = {
    inclineChestPress: "d1e35c65-d11a-55b0-a697-667c8738269b",
    session07: "2f54ec0c-94a7-57fa-b2b0-fe06bd31302a",
    session10: "ef6347c6-3f4b-5f7c-86d6-3abc994993c0",
    superset07: "9c3d56f6-ccf9-5225-86c2-27010f1f394c",
    superset10: "26712f78-d43b-5013-b1cf-7f279806a7c8",
  };
  const actualIds = {
    inclineChestPress: IDS.inclineChestPress,
    session07: SESSIONS[0].id,
    session10: SESSIONS[1].id,
    superset07: SESSIONS[0].supersetGroupId,
    superset10: SESSIONS[1].supersetGroupId,
  };
  assertSame("UUID déterministes", actualIds, expectedIds);
  assertSame("delta attendu", EXPECTED_DELTA, {
    exercises: 1,
    muscle_mappings: 6,
    workout_sessions: 2,
    logged_exercises: 15,
    logged_sets: 26,
    superset_groups: 2,
    cardio_entries: 0,
    muscle_goals: 0,
    workout_templates: 0,
    template_exercises: 0,
    user_settings: 0,
    recovery_checkins: 0,
  });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

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

function lockSnapshotTablesSql(): string {
  return `lock table ${CONTENT_HASH_TARGETS.map(
    (target) => target.relationSql
  ).join(", ")} in share mode`;
}

function parseContentHashes(rows: Record<string, unknown>[]): Record<string, string> {
  if (rows.length !== 1) {
    throw new Error(`Empreintes invalides : ${rows.length} ligne(s).`);
  }
  const hashes: Record<string, string> = {};
  for (const target of CONTENT_HASH_TARGETS) {
    const value = rows[0][target.key];
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`Empreinte SHA-256 invalide pour ${target.key}.`);
    }
    hashes[target.key] = value;
  }
  return hashes;
}

async function consistentDump(sql: SqlClient): Promise<TableDump> {
  const descriptors = [
    ...BUSINESS_TABLES.map((table) => ({
      key: table,
      sql: `select * from public."${table}"`,
    })),
    {
      key: "drizzle.__drizzle_migrations",
      sql: 'select * from drizzle."__drizzle_migrations" order by created_at,id',
    },
    { key: "__content_hashes", sql: contentHashesSelectSql() },
  ];
  const results = await sql.transaction(
    (tx) => [
      tx.query("set local time zone 'UTC'", []),
      ...descriptors.map((descriptor) => tx.query(descriptor.sql, [])),
    ],
    { isolationLevel: "Serializable", readOnly: true, deferrable: true }
  );
  return Object.fromEntries(
    descriptors.map((descriptor, index) => [
      descriptor.key,
      results[index + 1] as Record<string, unknown>[],
    ])
  );
}

function validateCatalogRows(rows: Record<string, unknown>[]): void {
  for (const expected of CANONICAL_EXERCISES) {
    const matches = rows.filter((row) => row.id === expected.id);
    if (matches.length !== 1) {
      throw new Error(`Catalogue : exercice absent/dupliqué ${expected.name} (${expected.id}).`);
    }
    const row = matches[0];
    if (row.name !== expected.name) {
      throw new Error(
        `Catalogue : ${expected.id} s'appelle ${String(row.name)}, attendu ${expected.name}.`
      );
    }
    if (Number(row.smallest_increment) !== expected.increment) {
      throw new Error(
        `Catalogue : incrément ${expected.name}=${String(row.smallest_increment)}, attendu ${expected.increment}.`
      );
    }
  }

  const modeById = new Map(rows.map((row) => [String(row.id), row.set_pattern_mode]));
  if (!["weighted_bodyweight", "bodyweight"].includes(String(modeById.get(IDS.hspu)))) {
    throw new Error("Catalogue : mode HSPU inattendu.");
  }
  if (modeById.get(IDS.pullupsSn) !== "weighted_bodyweight") {
    throw new Error("Catalogue : Tractions SN doit rester lestable.");
  }
  if (modeById.get(IDS.dips) !== "bodyweight") {
    throw new Error("Catalogue : Dips doit rester bodyweight.");
  }
}

function validateSnapshot(dump: TableDump): SnapshotFacts {
  const counts = Object.fromEntries(
    BUSINESS_TABLES.map((table) => {
      const rows = dump[table];
      if (!Array.isArray(rows)) throw new Error(`Backup incomplet : ${table}.`);
      return [table, rows.length];
    })
  ) as CountMap;
  const contentHashes = parseContentHashes(dump.__content_hashes ?? []);

  validateCatalogRows(dump.exercises ?? []);
  const newExerciseCollisions = (dump.exercises ?? []).filter(
    (row) => row.id === NEW_EXERCISE.id || row.name === NEW_EXERCISE.name
  );
  if (newExerciseCollisions.length !== 0) {
    throw new Error("Le nouvel exercice existe déjà alors que les séances cibles sont absentes.");
  }

  const maxSortOrder = Math.max(
    -1,
    ...(dump.exercises ?? []).map((row) => Number(row.sort_order))
  );
  if (!Number.isFinite(maxSortOrder)) throw new Error("sort_order catalogue invalide.");
  return {
    counts,
    contentHashes,
    newExerciseSortOrder: maxSortOrder + 1,
  };
}

function preconditionSql(facts: SnapshotFacts): string {
  const countChecks = BUSINESS_TABLES.map(
    (table) => `
      IF (SELECT count(*) FROM public."${table}") <> ${facts.counts[table]} THEN
        RAISE EXCEPTION 'La table ${table} a changé depuis le backup.';
      END IF;`
  ).join("\n");
  const hashChecks = CONTENT_HASH_TARGETS.map(
    (target) => `
      IF ${contentHashExpression(target.relationSql)} <> ${sqlString(facts.contentHashes[target.key])} THEN
        RAISE EXCEPTION 'Le contenu de ${target.key} a changé depuis le backup.';
      END IF;`
  ).join("\n");
  return `DO $$ BEGIN ${countChecks} ${hashChecks} END $$;`;
}

function importPreconditionSql(): string {
  return `DO $$ BEGIN
    IF (
      SELECT count(*) FROM workout_sessions
       WHERE (date AT TIME ZONE 'Europe/Paris')::date IN
             (${TARGET_DATES.map((date) => `${sqlString(date)}::date`).join(",")})
    ) <> 0 THEN
      RAISE EXCEPTION 'Collision de séance sur le 07/08 ou le 10/08.';
    END IF;
    IF (SELECT count(*) FROM workout_sessions WHERE id = ANY(ARRAY[${SESSION_IDS.map(sqlString).join(",")}])) <> 0 THEN
      RAISE EXCEPTION 'Collision UUID de séance.';
    END IF;
    IF (SELECT count(*) FROM exercises WHERE id=${sqlString(NEW_EXERCISE.id)} OR name=${sqlString(NEW_EXERCISE.name)}) <> 0 THEN
      RAISE EXCEPTION 'Collision sur Chest press incliné Technogym.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM exercises
       WHERE id=${sqlString(IDS.hspu)} AND name='HSPU'
         AND set_pattern_mode IN ('weighted_bodyweight','bodyweight')
    ) THEN
      RAISE EXCEPTION 'Précondition HSPU invalide.';
    END IF;
  END $$;`;
}

function insertionQueries(
  tx: NeonQueryFunctionInTransaction<false, false>,
  facts: SnapshotFacts
): NeonQueryInTransaction[] {
  const queries: NeonQueryInTransaction[] = [
    tx.query(
      `insert into exercises (
         id,name,category,set_pattern_mode,rep_target_min,rep_target_max,
         smallest_increment,is_favorite,created_by_user,sort_order,
         suggested_rest_seconds,machine_setting,setup_notes,benchmark_low,
         benchmark_high,fatigue_class,progression_policy,voluntary_rep_cap,
         last_used,movement_pattern,resistance_profile,strength_standard_key,benchmark_unit
       ) values (
         $1,$2,$3,$4,$5,$6,$7,false,true,$8,$9,'',$10,null,null,$11,
         null,0,null,$12,null,null,null
       )`,
      [
        NEW_EXERCISE.id,
        NEW_EXERCISE.name,
        NEW_EXERCISE.category,
        NEW_EXERCISE.setPatternMode,
        NEW_EXERCISE.repTargetMin,
        NEW_EXERCISE.repTargetMax,
        NEW_EXERCISE.smallestIncrement,
        facts.newExerciseSortOrder,
        NEW_EXERCISE.suggestedRestSeconds,
        NEW_EXERCISE.setupNotes,
        NEW_EXERCISE.fatigueClass,
        NEW_EXERCISE.movementPattern,
      ]
    ),
  ];

  for (const [muscleGroup, coefficient] of NEW_EXERCISE.mappings) {
    queries.push(
      tx.query(
        `insert into muscle_mappings (id,exercise_id,muscle_group,coefficient)
         values ($1,$2,$3,$4)`,
        [
          stableId(`mapping:${NEW_EXERCISE.id}:${muscleGroup}`),
          NEW_EXERCISE.id,
          muscleGroup,
          coefficient,
        ]
      )
    );
  }

  // Tout l'historique HSPU est BW et son benchmark est fondé sur les répétitions.
  // Tractions SN reste séparément en weighted_bodyweight : son historique est lesté.
  queries.push(
    tx.query(
      `update exercises set set_pattern_mode='bodyweight'
        where id=$1 and name='HSPU'
          and set_pattern_mode in ('weighted_bodyweight','bodyweight')`,
      [IDS.hspu]
    )
  );

  for (const session of SESSIONS) {
    queries.push(
      tx.query(
        `insert into workout_sessions
           (id,date,start_time,end_time,notes,is_active,template_name)
         values ($1,$2::timestamptz,$2::timestamptz,null,'',false,$3)`,
        [session.id, session.startIso, TEMPLATE_NAME]
      )
    );
    const memberOrder = session.exercises
      .filter((exercise) => exercise.supersetGroupId === session.supersetGroupId)
      .map((exercise) => exercise.id);
    queries.push(
      tx.query(
        `insert into superset_groups (id,session_id,order_index,member_order)
         values ($1,$2,0,$3::jsonb)`,
        [session.supersetGroupId, session.id, JSON.stringify(memberOrder)]
      )
    );
    for (const exercise of session.exercises) {
      queries.push(
        tx.query(
          `insert into logged_exercises
             (id,session_id,order_index,notes,exercise_id,exercise_name,
              superset_group_id,plateau_weak_point)
           values ($1,$2,$3,'',$4,$5,$6,null)`,
          [
            exercise.id,
            session.id,
            exercise.orderIndex,
            exercise.exerciseId,
            exercise.exerciseName,
            exercise.supersetGroupId,
          ]
        )
      );
      for (const set of exercise.sets) {
        queries.push(
          tx.query(
            `insert into logged_sets
               (id,logged_exercise_id,weight,reps,set_type,timestamp,
                set_slot_index,completed,superset_round_index)
             values ($1,$2,$3,$4,$5,$6::timestamptz,$7,true,$8)`,
            [
              set.id,
              exercise.id,
              set.weight,
              set.reps,
              set.setType,
              set.timestampIso,
              set.setSlotIndex,
              set.supersetRoundIndex,
            ]
          )
        );
      }
    }
  }

  // Champ dérivé : le remet en cohérence globalement au lieu de recopier une
  // valeur obsolète du catalogue ou d'un client.
  queries.push(
    tx.query(
      `update exercises e
          set last_used = (
            select max(ls.timestamp)
              from logged_exercises le
              join logged_sets ls on ls.logged_exercise_id=le.id
             where le.exercise_id=e.id and ls.completed
          )`,
      []
    )
  );
  return queries;
}

function postconditionSql(facts: SnapshotFacts): string {
  const countChecks = BUSINESS_TABLES.map((table) => {
    const expected = facts.counts[table] + EXPECTED_DELTA[table];
    return `
      IF (SELECT count(*) FROM public."${table}") <> ${expected} THEN
        RAISE EXCEPTION 'Compteur final invalide pour ${table}.';
      END IF;`;
  }).join("\n");
  const exactSessionChecks = SESSIONS.map(
    (session) => `
      IF NOT EXISTS (
        SELECT 1 FROM workout_sessions
         WHERE id=${sqlString(session.id)}
           AND date=${sqlString(session.startIso)}::timestamptz
           AND start_time=${sqlString(session.startIso)}::timestamptz
           AND end_time IS NULL AND notes='' AND is_active=false
           AND template_name=${sqlString(TEMPLATE_NAME)}
      ) THEN
        RAISE EXCEPTION 'Séance exacte absente: ${session.localDate}.';
      END IF;`
  ).join("\n");
  const exactLoggedExerciseChecks = SESSIONS.flatMap((session) =>
    session.exercises.map(
      (exercise) => `
      IF NOT EXISTS (
        SELECT 1 FROM logged_exercises
         WHERE id=${sqlString(exercise.id)}
           AND session_id=${sqlString(session.id)}
           AND order_index=${exercise.orderIndex}
           AND notes=''
           AND exercise_id=${sqlString(exercise.exerciseId)}
           AND exercise_name=${sqlString(exercise.exerciseName)}
           AND superset_group_id IS NOT DISTINCT FROM ${
             exercise.supersetGroupId ? sqlString(exercise.supersetGroupId) : "NULL"
           }
           AND plateau_weak_point IS NULL
      ) THEN
        RAISE EXCEPTION 'Exercice journalisé exact absent: ${exercise.id}.';
      END IF;`
    )
  ).join("\n");
  const exactSetChecks = SESSIONS.flatMap((session) =>
    session.exercises.flatMap((exercise) =>
      exercise.sets.map(
        (set) => `
      IF NOT EXISTS (
        SELECT 1 FROM logged_sets
         WHERE id=${sqlString(set.id)}
           AND logged_exercise_id=${sqlString(exercise.id)}
           AND weight=${set.weight}
           AND reps=${set.reps}
           AND set_type=${sqlString(set.setType)}
           AND timestamp=${sqlString(set.timestampIso)}::timestamptz
           AND set_slot_index=${set.setSlotIndex}
           AND completed=true
           AND superset_round_index IS NOT DISTINCT FROM ${set.supersetRoundIndex ?? "NULL"}
      ) THEN
        RAISE EXCEPTION 'Série exacte absente: ${set.id}.';
      END IF;`
      )
    )
  ).join("\n");
  const exactGroupChecks = SESSIONS.map((session) => {
    const memberOrder = session.exercises
      .filter((exercise) => exercise.supersetGroupId === session.supersetGroupId)
      .map((exercise) => exercise.id);
    return `
      IF NOT EXISTS (
        SELECT 1 FROM superset_groups
         WHERE id=${sqlString(session.supersetGroupId)}
           AND session_id=${sqlString(session.id)}
           AND order_index=0
           AND member_order=${sqlString(JSON.stringify(memberOrder))}::jsonb
      ) THEN
        RAISE EXCEPTION 'Groupe superset exact absent: ${session.supersetGroupId}.';
      END IF;`;
  }).join("\n");
  const exactMappingChecks = NEW_EXERCISE.mappings.map(
    ([muscleGroup, coefficient]) => `
      IF NOT EXISTS (
        SELECT 1 FROM muscle_mappings
         WHERE id=${sqlString(stableId(`mapping:${NEW_EXERCISE.id}:${muscleGroup}`))}
           AND exercise_id=${sqlString(NEW_EXERCISE.id)}
           AND muscle_group=${sqlString(muscleGroup)}
           AND coefficient=${coefficient}
      ) THEN
        RAISE EXCEPTION 'Mapping exact absent: ${muscleGroup}.';
      END IF;`
  ).join("\n");
  const newExerciseLastUsed = SESSIONS.flatMap((session) => session.exercises)
    .filter((exercise) => exercise.exerciseId === NEW_EXERCISE.id)
    .flatMap((exercise) => exercise.sets)
    .map((set) => set.timestampIso)
    .sort()
    .at(-1);
  if (!newExerciseLastUsed) {
    throw new Error("Le plan ne contient aucun set pour le nouvel exercice.");
  }
  return `DO $$ BEGIN
    ${countChecks}
    ${exactSessionChecks}
    ${exactLoggedExerciseChecks}
    ${exactSetChecks}
    ${exactGroupChecks}
    ${exactMappingChecks}
    IF (SELECT count(*) FROM workout_sessions WHERE id=ANY(ARRAY[${SESSION_IDS.map(sqlString).join(",")}])) <> 2 THEN
      RAISE EXCEPTION 'Deux séances exactes attendues.';
    END IF;
    IF (
      SELECT count(*) FROM workout_sessions
       WHERE (date AT TIME ZONE 'Europe/Paris')::date IN
             (${TARGET_DATES.map((date) => `${sqlString(date)}::date`).join(",")})
    ) <> 2 THEN
      RAISE EXCEPTION 'Dates civiles finales invalides.';
    END IF;
    IF (
      SELECT count(*) FROM logged_exercises
       WHERE session_id=ANY(ARRAY[${SESSION_IDS.map(sqlString).join(",")}])
    ) <> 15 THEN
      RAISE EXCEPTION '15 exercices journalisés attendus.';
    END IF;
    IF (
      SELECT count(*) FROM logged_sets ls
      JOIN logged_exercises le ON le.id=ls.logged_exercise_id
      WHERE le.session_id=ANY(ARRAY[${SESSION_IDS.map(sqlString).join(",")}])
    ) <> 26 THEN
      RAISE EXCEPTION '26 séries attendues.';
    END IF;
    IF (
      SELECT count(*) FROM cardio_entries
       WHERE session_id=ANY(ARRAY[${SESSION_IDS.map(sqlString).join(",")}])
    ) <> 0 THEN
      RAISE EXCEPTION 'Aucun cardio ne devait être inventé.';
    END IF;
    IF (SELECT count(*) FROM muscle_mappings WHERE exercise_id=${sqlString(NEW_EXERCISE.id)}) <> 6 THEN
      RAISE EXCEPTION 'Six mappings attendus pour le Chest press incliné.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM exercises
       WHERE id=${sqlString(NEW_EXERCISE.id)}
         AND name=${sqlString(NEW_EXERCISE.name)}
         AND category=${sqlString(NEW_EXERCISE.category)}
         AND set_pattern_mode=${sqlString(NEW_EXERCISE.setPatternMode)}
         AND rep_target_min=${NEW_EXERCISE.repTargetMin}
         AND rep_target_max=${NEW_EXERCISE.repTargetMax}
         AND smallest_increment=${NEW_EXERCISE.smallestIncrement}
         AND is_favorite=false AND created_by_user=true
         AND sort_order=${facts.newExerciseSortOrder}
         AND suggested_rest_seconds=${NEW_EXERCISE.suggestedRestSeconds}
         AND machine_setting=''
         AND setup_notes=${sqlString(NEW_EXERCISE.setupNotes)}
         AND benchmark_low IS NULL AND benchmark_high IS NULL
         AND fatigue_class=${sqlString(NEW_EXERCISE.fatigueClass)}
         AND progression_policy IS NULL AND voluntary_rep_cap=0
         AND last_used=${sqlString(newExerciseLastUsed)}::timestamptz
         AND movement_pattern=${sqlString(NEW_EXERCISE.movementPattern)}
         AND resistance_profile IS NULL
         AND strength_standard_key IS NULL AND benchmark_unit IS NULL
    ) THEN
      RAISE EXCEPTION 'Métadonnées exactes du Chest press incliné absentes.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM exercises
       WHERE id=${sqlString(IDS.hspu)} AND set_pattern_mode='bodyweight'
    ) THEN
      RAISE EXCEPTION 'HSPU n’est pas bodyweight après import.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM exercises
       WHERE id=${sqlString(IDS.pullupsSn)} AND set_pattern_mode='weighted_bodyweight'
    ) THEN
      RAISE EXCEPTION 'Tractions SN ne doit pas perdre son mode lestable.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM exercises e
       WHERE e.last_used IS DISTINCT FROM (
         SELECT max(ls.timestamp)
           FROM logged_exercises le
           JOIN logged_sets ls ON ls.logged_exercise_id=le.id
          WHERE le.exercise_id=e.id AND ls.completed
       )
    ) THEN
      RAISE EXCEPTION 'last_used reste incohérent.';
    END IF;
  END $$;`;
}

async function readCollisions(sql: SqlClient): Promise<Record<string, unknown>[]> {
  return sql.query(
    `select id,
            to_char(date AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') as local_date
       from workout_sessions
      where (date AT TIME ZONE 'Europe/Paris')::date=ANY($1::date[])
      order by local_date,id`,
    [TARGET_DATES]
  );
}

async function readCounts(sql: SqlClient): Promise<Record<string, unknown>> {
  const rows = await sql.query(
    `select ${BUSINESS_TABLES.map(
      (table) => `(select count(*)::int from public."${table}") as "${table}"`
    ).join(",")}`,
    []
  );
  if (rows.length !== 1) throw new Error("Lecture des compteurs impossible.");
  return rows[0];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  }
  return value;
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(canonical(actual));
  const expectedJson = JSON.stringify(canonical(expected));
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label} divergent.\nReçu: ${JSON.stringify(actual, null, 2)}\nAttendu: ${JSON.stringify(expected, null, 2)}`
    );
  }
}

function sortedById<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

async function validateApplied(sql: SqlClient): Promise<void> {
  const [sessions, loggedExercises, loggedSets, groups, cardio, newExercise, mappings, hspu, staleLastUsed, collisions] =
    await Promise.all([
      sql.query(
        `select id,
                to_char(date AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as date,
                to_char(start_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_time,
                case when end_time is null then null else
                  to_char(end_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end as end_time,
                notes,is_active,template_name
           from workout_sessions where id=ANY($1::text[]) order by id`,
        [SESSION_IDS]
      ),
      sql.query(
        `select id,session_id,order_index,notes,exercise_id,exercise_name,
                superset_group_id,plateau_weak_point
           from logged_exercises where session_id=ANY($1::text[]) order by id`,
        [SESSION_IDS]
      ),
      sql.query(
        `select ls.id,ls.logged_exercise_id,ls.weight,ls.reps,ls.set_type,
                to_char(ls.timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as timestamp,
                ls.set_slot_index,ls.completed,ls.superset_round_index
           from logged_sets ls
           join logged_exercises le on le.id=ls.logged_exercise_id
          where le.session_id=ANY($1::text[]) order by ls.id`,
        [SESSION_IDS]
      ),
      sql.query(
        `select id,session_id,order_index,member_order
           from superset_groups where session_id=ANY($1::text[]) order by id`,
        [SESSION_IDS]
      ),
      sql.query(
        `select count(*)::int as count from cardio_entries
          where session_id=ANY($1::text[])`,
        [SESSION_IDS]
      ),
      sql.query(
        `select id,name,category,set_pattern_mode,rep_target_min,rep_target_max,
                smallest_increment,is_favorite,created_by_user,suggested_rest_seconds,
                machine_setting,setup_notes,benchmark_low,benchmark_high,fatigue_class,
                progression_policy,voluntary_rep_cap,movement_pattern,resistance_profile,
                strength_standard_key,benchmark_unit
           from exercises where id=$1 or name=$2`,
        [NEW_EXERCISE.id, NEW_EXERCISE.name]
      ),
      sql.query(
        `select muscle_group,coefficient from muscle_mappings
          where exercise_id=$1 order by muscle_group`,
        [NEW_EXERCISE.id]
      ),
      sql.query("select id,name,set_pattern_mode from exercises where id=$1", [IDS.hspu]),
      sql.query(
        `select count(*)::int as count from exercises e
          where e.last_used is distinct from (
            select max(ls.timestamp) from logged_exercises le
            join logged_sets ls on ls.logged_exercise_id=le.id
            where le.exercise_id=e.id and ls.completed
          )`,
        []
      ),
      readCollisions(sql),
    ]);

  const expectedSessions = sortedById(
    SESSIONS.map((session) => ({
      id: session.id,
      date: session.startIso.replace(".000", ""),
      start_time: session.startIso.replace(".000", ""),
      end_time: null,
      notes: "",
      is_active: false,
      template_name: TEMPLATE_NAME,
    }))
  );
  assertSame("séances", sessions, expectedSessions);

  const expectedLoggedExercises = sortedById(
    SESSIONS.flatMap((session) =>
      session.exercises.map((exercise) => ({
        id: exercise.id,
        session_id: session.id,
        order_index: exercise.orderIndex,
        notes: "",
        exercise_id: exercise.exerciseId,
        exercise_name: exercise.exerciseName,
        superset_group_id: exercise.supersetGroupId,
        plateau_weak_point: null,
      }))
    )
  );
  assertSame("exercices journalisés", loggedExercises, expectedLoggedExercises);

  const expectedSets = sortedById(
    SESSIONS.flatMap((session) =>
      session.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => ({
          id: set.id,
          logged_exercise_id: exercise.id,
          weight: set.weight,
          reps: set.reps,
          set_type: set.setType,
          timestamp: set.timestampIso.replace(".000", ""),
          set_slot_index: set.setSlotIndex,
          completed: true,
          superset_round_index: set.supersetRoundIndex,
        }))
      )
    )
  );
  assertSame("séries", loggedSets, expectedSets);

  const expectedGroups = sortedById(
    SESSIONS.map((session) => ({
      id: session.supersetGroupId,
      session_id: session.id,
      order_index: 0,
      member_order: session.exercises
        .filter((exercise) => exercise.supersetGroupId === session.supersetGroupId)
        .map((exercise) => exercise.id),
    }))
  );
  assertSame("supersets", groups, expectedGroups);
  assertSame("cardio absent", cardio, [{ count: 0 }]);

  assertSame("Chest press incliné", newExercise, [
    {
      id: NEW_EXERCISE.id,
      name: NEW_EXERCISE.name,
      category: NEW_EXERCISE.category,
      set_pattern_mode: NEW_EXERCISE.setPatternMode,
      rep_target_min: NEW_EXERCISE.repTargetMin,
      rep_target_max: NEW_EXERCISE.repTargetMax,
      smallest_increment: NEW_EXERCISE.smallestIncrement,
      is_favorite: false,
      created_by_user: true,
      suggested_rest_seconds: NEW_EXERCISE.suggestedRestSeconds,
      machine_setting: "",
      setup_notes: NEW_EXERCISE.setupNotes,
      benchmark_low: null,
      benchmark_high: null,
      fatigue_class: NEW_EXERCISE.fatigueClass,
      progression_policy: null,
      voluntary_rep_cap: 0,
      movement_pattern: NEW_EXERCISE.movementPattern,
      resistance_profile: null,
      strength_standard_key: null,
      benchmark_unit: null,
    },
  ]);
  assertSame(
    "mappings Chest press incliné",
    mappings,
    [...NEW_EXERCISE.mappings]
      .map(([muscle_group, coefficient]) => ({ muscle_group, coefficient }))
      .sort((a, b) => a.muscle_group.localeCompare(b.muscle_group))
  );
  assertSame("mode HSPU", hspu, [
    { id: IDS.hspu, name: "HSPU", set_pattern_mode: "bodyweight" },
  ]);
  assertSame("last_used dérivé", staleLastUsed, [{ count: 0 }]);
  assertSame(
    "collisions par jour civil",
    collisions,
    SESSIONS.map((session) => ({ id: session.id, local_date: session.localDate })).sort(
      (a, b) => a.local_date.localeCompare(b.local_date)
    )
  );
}

async function main(): Promise<void> {
  assertStaticPlan();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  if (APPLY_VALUE !== undefined && APPLY_VALUE !== PRODUCTION_MIGRATION_CONFIRMATION) {
    throw new Error(
      `${SCRIPT_NAME}: confirmation invalide. Attendu ${APPLY_ENV}=${PRODUCTION_MIGRATION_CONFIRMATION}.`
    );
  }

  const sql = neon(databaseUrl);
  const [countsBefore, collisions, catalogRows, newExerciseRows] = await Promise.all([
    readCounts(sql),
    readCollisions(sql),
    sql.query(
      `select id,name,set_pattern_mode,smallest_increment
         from exercises where id=ANY($1::text[]) order by id`,
      [CANONICAL_EXERCISES.map((exercise) => exercise.id)]
    ),
    sql.query("select id,name from exercises where id=$1 or name=$2", [
      NEW_EXERCISE.id,
      NEW_EXERCISE.name,
    ]),
  ]);
  validateCatalogRows(catalogRows);

  const collisionIds = collisions.map((row) => String(row.id)).sort();
  const exactIds = [...SESSION_IDS].sort();
  const alreadyApplied = JSON.stringify(collisionIds) === JSON.stringify(exactIds);
  if (collisions.length > 0 && !alreadyApplied) {
    throw new Error(
      `Collision : une autre séance existe déjà sur une date cible. ${JSON.stringify(collisions)}`
    );
  }
  if (alreadyApplied) {
    await validateApplied(sql);
    console.log(
      JSON.stringify(
        {
          mode: "ALREADY_APPLIED_VALIDATED",
          host: databaseHostname(databaseUrl),
          counts: countsBefore,
          sessions: collisions,
        },
        null,
        2
      )
    );
    return;
  }
  if (newExerciseRows.length !== 0) {
    throw new Error("Collision : le Chest press incliné existe sans les séances cibles.");
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "APPLY" : "READ_ONLY_PLAN",
        host: databaseHostname(databaseUrl),
        expectedHost: EXPECTED_PRODUCTION_NEON_HOST,
        countsBefore,
        delta: EXPECTED_DELTA,
        sessions: SESSIONS.map((session) => ({
          date: session.localDate,
          id: session.id,
          exercises: session.exercises.length,
          sets: session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
          supersetMembers: session.exercises
            .filter((exercise) => exercise.supersetGroupId)
            .map((exercise) => exercise.exerciseName),
        })),
        newExercise: {
          id: NEW_EXERCISE.id,
          name: NEW_EXERCISE.name,
          increment: NEW_EXERCISE.smallestIncrement,
          mappings: NEW_EXERCISE.mappings,
          strengthStandard: null,
        },
        corrections: ["HSPU: weighted_bodyweight -> bodyweight", "recalcul global de last_used"],
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log(
      `\n[LECTURE SEULE] Aucun write. Pour appliquer : ${APPLY_ENV}=${PRODUCTION_MIGRATION_CONFIRMATION} npx tsx scripts/${SCRIPT_NAME}.ts`
    );
    return;
  }

  const dump = await consistentDump(sql);
  const facts = validateSnapshot(dump);
  const backupFile = writeBackupFile(dump, "pre-session-import-2026-08-13");
  if (statSync(backupFile).size < 1_000) {
    throw new Error(`Backup anormalement petit (${backupFile}).`);
  }
  const persisted = JSON.parse(readFileSync(backupFile, "utf8")) as {
    tables?: TableDump;
  };
  if (!persisted.tables) throw new Error(`Backup illisible : ${backupFile}.`);
  const persistedFacts = validateSnapshot(persisted.tables);
  assertSame("compteurs du backup relu", persistedFacts.counts, facts.counts);
  assertSame(
    "empreintes du backup relu",
    persistedFacts.contentHashes,
    facts.contentHashes
  );
  assertSame(
    "sort_order du backup relu",
    persistedFacts.newExerciseSortOrder,
    facts.newExerciseSortOrder
  );
  console.log(`Backup cohérent vérifié : ${backupFile}`);

  await sql.transaction(
    (tx) => [
      tx.query("set local time zone 'UTC'", []),
      tx.query("set local lock_timeout='15s'", []),
      tx.query(lockSnapshotTablesSql(), []),
      tx.query(preconditionSql(facts), []),
      tx.query(importPreconditionSql(), []),
      ...insertionQueries(tx, facts),
      tx.query(postconditionSql(facts), []),
    ],
    { isolationLevel: "Serializable" }
  );

  await validateApplied(sql);
  const countsAfter = await readCounts(sql);
  console.log("\n✅ Import atomique validé.");
  console.log(
    JSON.stringify(
      {
        host: databaseHostname(databaseUrl),
        countsBefore,
        countsAfter,
        importedSessions: SESSIONS.map((session) => ({
          date: session.localDate,
          id: session.id,
        })),
        backupFile,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`\n${SCRIPT_NAME}: échec —`, error);
  process.exit(1);
});
