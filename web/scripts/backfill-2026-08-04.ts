/**
 * Correctif ciblé demandé le 04/08/2026.
 *
 * Garantit la présence de Plate loaded lat raise le 01/08 (12,5 × 7) et
 * l'ajoute à la séance existante du 03/08 (12,5 × 9 puis 12,5 × 7).
 * Les IDs déterministes et les upserts rendent le script rejouable sans
 * créer de doublons.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { neon, type NeonQueryInTransaction } from "@neondatabase/serverless";

type MappingRow = {
  exercise_name: string;
  muscle_group: string;
  coefficient: number;
};

type LoggedExerciseRow = {
  id: string;
  session_id: string;
};

function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const AUGUST_1_SESSION = "c9772b33-e919-4619-97e1-4d9d6563b7bc";
const AUGUST_3_SESSION = "4c5faebd-9454-4aa8-a7d2-b4297c837616";
const PLATE_EXERCISE = "22519741-91db-5810-8e1f-1e42a7cfd392";

const AUGUST_1_SET = {
  weight: 12.5,
  reps: 7,
  // Les colonnes PostgreSQL sont des `timestamp without time zone` et les
  // anciennes donnees contiennent l'heure murale de Paris. Passer une Date JS
  // rendrait le resultat dependant du fuseau du processus qui rejoue le script.
  timestampLocal: "2026-08-01 15:57:00",
};

const AUGUST_3_SETS = [
  { weight: 12.5, reps: 9, timestampLocal: "2026-08-03 15:40:00" },
  { weight: 12.5, reps: 7, timestampLocal: "2026-08-03 15:43:00" },
] as const;

function mappingSignature(rows: MappingRow[], exerciseName: string): string {
  return rows
    .filter((row) => row.exercise_name === exerciseName)
    .map((row) => `${row.muscle_group}:${row.coefficient}`)
    .sort()
    .join("|");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent");
  const sql = neon(databaseUrl);

  const sessions = await sql.query(
    "select id, is_active from workout_sessions where id = any($1::text[]) order by id",
    [[AUGUST_1_SESSION, AUGUST_3_SESSION]]
  );
  if (sessions.length !== 2 || sessions.some((session) => session.is_active)) {
    throw new Error("Les séances terminées uniques des 01/08 et 03/08 sont introuvables");
  }

  const exercises = await sql.query(
    "select id from exercises where id = $1 and name = 'Plate loaded lat raise'",
    [PLATE_EXERCISE]
  );
  if (exercises.length !== 1) throw new Error("Plate loaded lat raise est introuvable ou dupliqué");

  const mappings = (await sql.query(
    `select e.name as exercise_name, mm.muscle_group, mm.coefficient
     from exercises e
     join muscle_mappings mm on mm.exercise_id = e.id
     where e.name = any($1::text[])
     order by e.name, mm.muscle_group`,
    [["Lateral raises", "Plate loaded lat raise"]]
  )) as MappingRow[];
  const lateralSignature = mappingSignature(mappings, "Lateral raises");
  const plateSignature = mappingSignature(mappings, "Plate loaded lat raise");
  if (!lateralSignature || lateralSignature !== plateSignature) {
    throw new Error("Les mappings musculaires de Plate loaded lat raise ne correspondent pas à Lateral raises");
  }

  const existingLogged = (await sql.query(
    "select id, session_id from logged_exercises where session_id = any($1::text[]) and exercise_id = $2",
    [[AUGUST_1_SESSION, AUGUST_3_SESSION], PLATE_EXERCISE]
  )) as LoggedExerciseRow[];
  const existingBySession = new Map(existingLogged.map((row) => [row.session_id, row.id]));
  const august1LoggedId =
    existingBySession.get(AUGUST_1_SESSION) ?? stableId(`${AUGUST_1_SESSION}:exercise:${PLATE_EXERCISE}`);
  const august3LoggedId =
    existingBySession.get(AUGUST_3_SESSION) ?? stableId(`${AUGUST_3_SESSION}:exercise:${PLATE_EXERCISE}`);

  await sql.transaction((tx) => {
    const queries: NeonQueryInTransaction[] = [];

    for (const [sessionId, loggedExerciseId] of [
      [AUGUST_1_SESSION, august1LoggedId],
      [AUGUST_3_SESSION, august3LoggedId],
    ] as const) {
      queries.push(tx`
        insert into logged_exercises (
          id, session_id, order_index, notes, exercise_id, exercise_name, superset_group_id
        ) values (
          ${loggedExerciseId}, ${sessionId},
          (select coalesce(max(order_index), -1) + 1 from logged_exercises where session_id = ${sessionId}),
          '', ${PLATE_EXERCISE}, 'Plate loaded lat raise', null
        )
        on conflict (id) do update set
          exercise_id = excluded.exercise_id,
          exercise_name = excluded.exercise_name
      `);
    }

    queries.push(tx`
      insert into logged_sets (
        id, logged_exercise_id, weight, reps, set_type, timestamp,
        set_slot_index, completed, superset_round_index
      ) values (
        ${stableId(`${august1LoggedId}:set:0`)}, ${august1LoggedId},
        ${AUGUST_1_SET.weight}, ${AUGUST_1_SET.reps}, 'work', ${AUGUST_1_SET.timestampLocal},
        0, true, null
      )
      on conflict (id) do update set
        logged_exercise_id = excluded.logged_exercise_id,
        weight = excluded.weight,
        reps = excluded.reps,
        set_type = excluded.set_type,
        timestamp = excluded.timestamp,
        set_slot_index = excluded.set_slot_index,
        completed = excluded.completed,
        superset_round_index = excluded.superset_round_index
    `);

    AUGUST_3_SETS.forEach((set, index) => {
      queries.push(tx`
        insert into logged_sets (
          id, logged_exercise_id, weight, reps, set_type, timestamp,
          set_slot_index, completed, superset_round_index
        ) values (
          ${stableId(`${august3LoggedId}:set:${index}`)}, ${august3LoggedId},
          ${set.weight}, ${set.reps}, 'work', ${set.timestampLocal},
          ${index}, true, null
        )
        on conflict (id) do update set
          logged_exercise_id = excluded.logged_exercise_id,
          weight = excluded.weight,
          reps = excluded.reps,
          set_type = excluded.set_type,
          timestamp = excluded.timestamp,
          set_slot_index = excluded.set_slot_index,
          completed = excluded.completed,
          superset_round_index = excluded.superset_round_index
      `);
    });

    queries.push(tx`
      update exercises
      set last_used = ${AUGUST_3_SETS.at(-1)!.timestampLocal}
      where id = ${PLATE_EXERCISE}
    `);

    return queries;
  });

  const verification = await sql.query(
    `select le.session_id, count(distinct le.id)::int as exercise_count,
            json_agg(json_build_array(ls.weight, ls.reps) order by ls.set_slot_index) as sets,
            json_agg(to_char(ls.timestamp, 'YYYY-MM-DD HH24:MI:SS') order by ls.set_slot_index) as timestamps
     from logged_exercises le
     join logged_sets ls on ls.logged_exercise_id = le.id
     where le.session_id = any($1::text[]) and le.exercise_id = $2
     group by le.session_id
     order by le.session_id`,
    [[AUGUST_1_SESSION, AUGUST_3_SESSION], PLATE_EXERCISE]
  );

  const expected = new Map<string, { sets: number[][]; timestamps: string[] }>([
    [AUGUST_1_SESSION, { sets: [[12.5, 7]], timestamps: [AUGUST_1_SET.timestampLocal] }],
    [
      AUGUST_3_SESSION,
      {
        sets: [[12.5, 9], [12.5, 7]],
        timestamps: AUGUST_3_SETS.map((set) => set.timestampLocal),
      },
    ],
  ]);
  for (const row of verification) {
    const expectedSession = expected.get(row.session_id);
    if (
      row.exercise_count !== 1 ||
      JSON.stringify(row.sets) !== JSON.stringify(expectedSession?.sets) ||
      JSON.stringify(row.timestamps) !== JSON.stringify(expectedSession?.timestamps)
    ) {
      throw new Error(`Vérification échouée pour la séance ${row.session_id}`);
    }
  }
  if (verification.length !== 2) throw new Error("Vérification incomplète après écriture");

  console.log(JSON.stringify({ status: "ok", sessions: verification }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
