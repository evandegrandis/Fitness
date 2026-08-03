/**
 * Correctif de données demandé le 03/08/2026.
 *
 * Le script est volontairement rejouable : les IDs sont déterministes, les
 * deux séances historiques sont remplacées uniquement sous leurs propres IDs
 * et toutes les écritures métier sont envoyées dans une transaction Neon.
 *
 * Pré-requis : appliquer la migration 0002 (cardio_entries + had_alcohol).
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { neon, type NeonQueryInTransaction } from "@neondatabase/serverless";

type CatalogRow = {
  id: string;
  name: string;
  sort_order: number;
};

type MappingRow = {
  muscle_group: string;
  coefficient: number;
};

type SetSpec = {
  weight: number;
  reps: number;
  minute: number;
  setType?: "work" | "top_set" | "backoff" | "finisher";
  round?: number;
};

type ExerciseSpec = {
  name: string;
  sets: SetSpec[];
  inSuperset?: boolean;
};

type HistoricalSession = {
  id: string;
  start: Date;
  end: Date;
  exercises: ExerciseSpec[];
};

function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SESSION_24 = stableId("session:2026-07-24");
const SESSION_29 = stableId("session:2026-07-29");
const PLATE_LOADED_LAT_RAISE = stableId("exercise:plate-loaded-lat-raise");
const AUGUST_1_SESSION = "c9772b33-e919-4619-97e1-4d9d6563b7bc";
const JULY_27_FINISHER = "c1706330-f4f9-4783-8728-c4034da90c04";
const AUGUST_1_FINISHER = "15c76cb8-79d6-447d-825b-19bbeea85744";
const AUGUST_1_CALISTHENICS = [
  "d2542160-3f97-4255-80e7-c3ffb8944138", // Tractions SN
  "2ec569ba-cb33-43b5-8243-6b9a0ea506e7", // HSPU
  "65c07c64-5ae8-4715-acf6-74c75ad6cec5", // Ab roller debout
];

const sessions: HistoricalSession[] = [
  {
    id: SESSION_24,
    start: new Date("2026-07-24T15:30:00.000Z"),
    end: new Date("2026-07-24T16:18:00.000Z"),
    exercises: [
      {
        name: "Tractions SN",
        inSuperset: true,
        sets: [
          { weight: 0, reps: 10, minute: 1, round: 1 },
          { weight: 0, reps: 10, minute: 6, round: 2 },
        ],
      },
      {
        name: "Ab roller debout",
        inSuperset: true,
        sets: [
          { weight: 0, reps: 5, minute: 2, round: 1 },
          { weight: 0, reps: 5, minute: 7, round: 2 },
        ],
      },
      {
        name: "HSPU",
        inSuperset: true,
        sets: [
          { weight: 0, reps: 10, minute: 3, round: 1 },
          { weight: 0, reps: 7, minute: 8, round: 2 },
        ],
      },
      {
        name: "Tirage vertical muscle up",
        sets: [
          { weight: 35, reps: 7, minute: 12 },
          { weight: 35, reps: 8, minute: 16 },
        ],
      },
      {
        name: "Pulley serré",
        sets: [
          { weight: 50, reps: 7, minute: 20 },
          { weight: 45, reps: 6, minute: 24, setType: "backoff" },
        ],
      },
      { name: "Curl debout", sets: [{ weight: 20, reps: 6, minute: 28 }] },
      { name: "Lateral raises", sets: [{ weight: 12, reps: 8, minute: 32 }] },
      {
        name: "DC assisté",
        sets: [
          { weight: 80, reps: 10, minute: 36 },
          { weight: 100, reps: 2, minute: 40, setType: "top_set" },
        ],
      },
      { name: "Pec deck", sets: [{ weight: 75, reps: 6, minute: 44 }] },
    ],
  },
  {
    id: SESSION_29,
    start: new Date("2026-07-29T15:30:00.000Z"),
    end: new Date("2026-07-29T16:25:00.000Z"),
    exercises: [
      {
        name: "Tractions SN",
        inSuperset: true,
        sets: [
          { weight: 0, reps: 10, minute: 1, round: 1 },
          { weight: 0, reps: 10, minute: 6, round: 2 },
        ],
      },
      {
        name: "HSPU",
        inSuperset: true,
        sets: [
          { weight: 0, reps: 10, minute: 2, round: 1 },
          { weight: 0, reps: 10, minute: 7, round: 2 },
        ],
      },
      {
        name: "Relevé de jambes chaise romaine",
        inSuperset: true,
        sets: [{ weight: 0, reps: 10, minute: 3, round: 1 }],
      },
      {
        name: "Tirage vertical muscle up",
        sets: [
          { weight: 35, reps: 10, minute: 11 },
          { weight: 40, reps: 7, minute: 15, setType: "top_set" },
          { weight: 30, reps: 10, minute: 19, setType: "backoff" },
        ],
      },
      {
        name: "Pec deck",
        sets: [
          { weight: 75, reps: 7, minute: 23 },
          { weight: 70, reps: 10, minute: 27, setType: "backoff" },
        ],
      },
      { name: "Chest Press", sets: [{ weight: 100, reps: 7, minute: 31 }] },
      {
        name: "Lateral raises",
        sets: [
          { weight: 12, reps: 10, minute: 35 },
          { weight: 12, reps: 10, minute: 39 },
        ],
      },
      {
        name: "Dips",
        sets: [{ weight: 0, reps: 20, minute: 48, setType: "finisher" }],
      },
    ],
  },
];

const requiredNames = [...new Set(sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name)))];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent");
  const sql = neon(databaseUrl);

  const schemaRows = await sql.query(
    "select to_regclass('public.cardio_entries') as cardio_table, exists (select 1 from information_schema.columns where table_schema='public' and table_name='recovery_checkins' and column_name='had_alcohol') as alcohol_column"
  );
  if (!schemaRows[0]?.cardio_table || !schemaRows[0]?.alcohol_column) {
    throw new Error("Migration 0002 non appliquée (cardio_entries / had_alcohol manquant)");
  }

  const catalogRows = (await sql.query(
    "select id, name, sort_order from exercises where name = any($1::text[])",
    [requiredNames]
  )) as CatalogRow[];
  const catalog = new Map(catalogRows.map((row) => [row.name, row]));
  const missing = requiredNames.filter((name) => !catalog.has(name));
  if (missing.length > 0) throw new Error(`Exercices catalogue introuvables : ${missing.join(", ")}`);

  for (const session of sessions) {
    const dayStart = new Date(session.start);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const collisions = (await sql`
      select id from workout_sessions
      where date >= ${dayStart} and date < ${dayEnd} and id <> ${session.id}
    `) as { id: string }[];
    if (collisions.length > 0) {
      throw new Error(`Une autre séance existe déjà le ${dayStart.toISOString().slice(0, 10)} (${collisions[0].id})`);
    }
  }

  const lateral = (await sql.query(
    "select id, name, sort_order from exercises where name = 'Lateral raises' limit 1"
  )) as CatalogRow[];
  const lateralExercise = lateral[0];
  if (!lateralExercise) throw new Error("Lateral raises introuvable");

  const mappings = (await sql.query(
    "select muscle_group, coefficient from muscle_mappings where exercise_id = $1 order by muscle_group",
    [lateralExercise.id]
  )) as MappingRow[];
  if (mappings.length === 0) throw new Error("Mappings musculaires de Lateral raises introuvables");

  const existingPlate = (await sql.query(
    "select id, name, sort_order from exercises where name = 'Plate loaded lat raise' limit 1"
  )) as CatalogRow[];
  const plateId = existingPlate[0]?.id ?? PLATE_LOADED_LAT_RAISE;
  const maxSortRows = (await sql.query("select coalesce(max(sort_order), 0) as max_sort from exercises")) as {
    max_sort: number;
  }[];
  const plateSortOrder = existingPlate[0]?.sort_order ?? Number(maxSortRows[0]?.max_sort ?? 0) + 1;

  await sql.transaction((tx) => {
    const queries: NeonQueryInTransaction[] = [];

    // Catalogue et corrections de granularité des haltères libres.
    queries.push(tx`
      update exercises set smallest_increment = 2
      where name in ('Curl debout', 'Lateral raises')
    `);
    queries.push(tx`
      update logged_sets set weight = 18
      where weight = 17.5 and logged_exercise_id in (
        select le.id from logged_exercises le join exercises e on e.id = le.exercise_id
        where e.name = 'Curl debout'
      )
    `);
    queries.push(tx`
      update logged_sets set weight = 12
      where weight = 11 and logged_exercise_id in (
        select le.id from logged_exercises le join exercises e on e.id = le.exercise_id
        where e.name = 'Lateral raises'
      )
    `);

    queries.push(tx`
      insert into exercises (
        id, name, category, set_pattern_mode, rep_target_min, rep_target_max,
        smallest_increment, is_favorite, created_by_user, sort_order,
        suggested_rest_seconds, machine_setting, setup_notes, benchmark_low,
        benchmark_high, fatigue_class, progression_policy, voluntary_rep_cap, last_used
      ) values (
        ${plateId}, 'Plate loaded lat raise', 'Push', 'straight', 10, 20,
        2.5, false, true, ${plateSortOrder}, 75, '', '', null, null,
        'light', null, 0, ${new Date("2026-08-01T13:57:00.000Z")}
      )
      on conflict (id) do update set
        name = excluded.name,
        category = excluded.category,
        set_pattern_mode = excluded.set_pattern_mode,
        rep_target_min = excluded.rep_target_min,
        rep_target_max = excluded.rep_target_max,
        smallest_increment = excluded.smallest_increment,
        suggested_rest_seconds = excluded.suggested_rest_seconds,
        fatigue_class = excluded.fatigue_class,
        last_used = excluded.last_used
    `);
    queries.push(tx`delete from muscle_mappings where exercise_id = ${plateId}`);
    for (const mapping of mappings) {
      queries.push(tx`
        insert into muscle_mappings (id, exercise_id, muscle_group, coefficient)
        values (
          ${stableId(`mapping:${plateId}:${mapping.muscle_group}`)},
          ${plateId}, ${mapping.muscle_group}, ${mapping.coefficient}
        )
      `);
    }

    // Séances manquantes, chacune possédant un bloc superset calisthénie.
    for (const session of sessions) {
      const supersetId = stableId(`${session.id}:superset:0`);
      const loggedExerciseIds = session.exercises.map((exercise, index) =>
        stableId(`${session.id}:exercise:${index}:${exercise.name}`)
      );
      const supersetMemberIds = session.exercises
        .map((exercise, index) => (exercise.inSuperset ? loggedExerciseIds[index] : null))
        .filter((id): id is string => id !== null);

      queries.push(tx`
        insert into workout_sessions (id, date, start_time, end_time, notes, is_active, template_name)
        values (${session.id}, ${session.start}, ${session.start}, ${session.end}, '', false, 'Full Body')
        on conflict (id) do update set
          date = excluded.date,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          notes = excluded.notes,
          is_active = excluded.is_active,
          template_name = excluded.template_name
      `);
      queries.push(tx`update logged_exercises set superset_group_id = null where session_id = ${session.id}`);
      queries.push(tx`delete from superset_groups where session_id = ${session.id}`);
      queries.push(tx`delete from logged_exercises where session_id = ${session.id}`);
      queries.push(tx`
        insert into superset_groups (id, session_id, order_index, member_order)
        values (${supersetId}, ${session.id}, 0, ${JSON.stringify(supersetMemberIds)}::jsonb)
      `);

      session.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseRow = catalog.get(exercise.name)!;
        const loggedExerciseId = loggedExerciseIds[exerciseIndex];
        queries.push(tx`
          insert into logged_exercises (
            id, session_id, order_index, notes, exercise_id, exercise_name, superset_group_id
          ) values (
            ${loggedExerciseId}, ${session.id}, ${exerciseIndex}, '', ${exerciseRow.id},
            ${exercise.name}, ${exercise.inSuperset ? supersetId : null}
          )
        `);

        exercise.sets.forEach((set, setIndex) => {
          const timestamp = new Date(session.start.getTime() + set.minute * 60_000);
          queries.push(tx`
            insert into logged_sets (
              id, logged_exercise_id, weight, reps, set_type, timestamp,
              set_slot_index, completed, superset_round_index
            ) values (
              ${stableId(`${loggedExerciseId}:set:${setIndex}`)}, ${loggedExerciseId},
              ${set.weight}, ${set.reps}, ${set.setType ?? "work"}, ${timestamp},
              ${setIndex}, true, ${set.round ?? null}
            )
          `);
        });
      });
    }

    // Ajout ciblé à la séance existante du 01/08.
    const loggedPlateId = stableId(`${AUGUST_1_SESSION}:exercise:${plateId}`);
    queries.push(tx`
      insert into logged_exercises (
        id, session_id, order_index, notes, exercise_id, exercise_name, superset_group_id
      ) values (
        ${loggedPlateId}, ${AUGUST_1_SESSION},
        (select coalesce(max(order_index), -1) + 1 from logged_exercises where session_id = ${AUGUST_1_SESSION}),
        '', ${plateId}, 'Plate loaded lat raise', null
      )
      on conflict (id) do update set
        exercise_id = excluded.exercise_id,
        exercise_name = excluded.exercise_name
    `);
    queries.push(tx`
      insert into logged_sets (
        id, logged_exercise_id, weight, reps, set_type, timestamp,
        set_slot_index, completed, superset_round_index
      ) values (
        ${stableId(`${loggedPlateId}:set:0`)}, ${loggedPlateId}, 12.5, 7, 'work',
        ${new Date("2026-08-01T13:57:00.000Z")}, 0, true, null
      )
      on conflict (id) do update set weight = 12.5, reps = 7, set_type = 'work', completed = true
    `);
    queries.push(tx`
      insert into cardio_entries (
        id, session_id, activity_name, duration_seconds, level, distance_km, order_index
      ) values (
        ${stableId(`${AUGUST_1_SESSION}:cardio:0`)}, ${AUGUST_1_SESSION},
        'Cardio', 120, 10, 1, 0
      )
      on conflict (id) do update set
        activity_name = excluded.activity_name,
        duration_seconds = excluded.duration_seconds,
        level = excluded.level,
        distance_km = excluded.distance_km,
        order_index = excluded.order_index
    `);

    const augustSupersetId = stableId(`${AUGUST_1_SESSION}:superset:calisthenics`);
    queries.push(tx`
      insert into superset_groups (id, session_id, order_index, member_order)
      values (${augustSupersetId}, ${AUGUST_1_SESSION}, 0, ${JSON.stringify(AUGUST_1_CALISTHENICS)}::jsonb)
      on conflict (id) do update set member_order = excluded.member_order
    `);
    queries.push(tx`
      update logged_exercises set superset_group_id = ${augustSupersetId}
      where id = any(${AUGUST_1_CALISTHENICS}::text[])
    `);
    queries.push(tx`
      update logged_sets set superset_round_index = set_slot_index + 1
      where logged_exercise_id = any(${AUGUST_1_CALISTHENICS}::text[])
    `);

    // Finishers explicitement identifiés par le retour utilisateur.
    queries.push(tx`update logged_sets set set_type = 'finisher' where id = ${JULY_27_FINISHER}`);
    queries.push(tx`update logged_sets set set_type = 'finisher' where id = ${AUGUST_1_FINISHER}`);

    return queries;
  });

  const verification = await sql.query(
    `select
      (select count(*)::int from workout_sessions where id = any($1::text[])) as inserted_sessions,
      (select count(*)::int from logged_sets ls join logged_exercises le on le.id = ls.logged_exercise_id where le.session_id = any($1::text[])) as inserted_sets,
      (select count(*)::int from exercises where name = 'Plate loaded lat raise') as plate_exercises,
      (select count(*)::int from cardio_entries where session_id = $2) as august_cardio`,
    [[SESSION_24, SESSION_29], AUGUST_1_SESSION]
  );
  console.log(JSON.stringify(verification[0]));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
