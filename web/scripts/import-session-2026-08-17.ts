/**
 * Import atomique de la séance carnet du 17 août 2026 (saisie hors-ligne impossible :
 * pas de réseau à la salle, l'app n'avait pas été ouverte avant).
 *
 * Le script est en LECTURE SEULE par défaut. L'écriture exige :
 *   APPLY_PROD_SESSION_IMPORT=ep-mute-sunset-atqb5xkv
 *
 * Garde-fous : host de production exact, refus si une séance existe déjà ce jour-là,
 * backup complet relu sur disque, transaction sérialisable unique, validation après écriture.
 *
 * Contenu : RIR 1 par défaut (consigne d'Evan « quasi tout à RIR 1 sauf spécifié »),
 * un superset Lateral raises + Curl debout, deux finishers explicites (Dips, HSPU) et
 * un nouvel exercice « Pec deck bras tendus » — machine réversible pec deck / rear delt,
 * coude verrouillé, distinct du « Pec deck » bras pliés déjà au catalogue.
 */

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

import {
  assertExactProductionDatabase,
  databaseHostname,
  dumpAllTables,
  PRODUCTION_MIGRATION_CONFIRMATION,
  writeBackupFile,
} from "./_safety";

const SCRIPT_NAME = "import-session-2026-08-17";
const APPLY_ENV = "APPLY_PROD_SESSION_IMPORT";
const APPLY = process.env[APPLY_ENV] !== undefined;
const LOCAL_DATE = "2026-08-17";

/** UUID déterministe : rejouer le script ne peut pas créer de doublon. */
function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// --- Catalogue -------------------------------------------------------------

const EX = {
  tractionsSn: "4819C179-6682-4D3D-9D8B-8BC3BA3EC57B",
  lateralRaises: "986C0567-D8D3-4348-A92D-26A9BBF4A459",
  curlDebout: "DA1AF977-1C06-4D87-95B9-DDF80C60893B",
  muscleUpPulldown: "D8831DCB-BA2D-4150-9A9A-96A029AE1ED5",
  pulleySerre: "9088AA1B-84B4-4686-BA9D-206F51F2BDA6",
  rearDeltFly: "",
  dcAssiste: "",
  dips: "64054336-5A49-4DB5-B226-5B77973F5BA4",
  hspu: "0A3E88ED-96C5-4B6A-B502-47D9CD005B8F",
  pecDeckBrasTendus: stableId("exercise:pec-deck-bras-tendus"),
};

/**
 * Nouvel exercice. Volontairement SANS benchmark externe ni `strengthStandardKey` :
 * c'est une machine maison, un repère hérité du Pec deck fausserait le niveau.
 * Pas de triceps dans les mappings — bras tendus, le coude ne travaille pas.
 */
const NEW_EXERCISE = {
  id: EX.pecDeckBrasTendus,
  name: "Pec deck bras tendus",
  category: "Push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 10,
  smallestIncrement: 2.5,
  suggestedRestSeconds: 75,
  machineSetting: "",
  setupNotes:
    "Machine réversible pec deck / rear delt, bras tendus (coude verrouillé). " +
    "Distinct du « Pec deck » bras pliés (avant-bras à la verticale).",
  fatigueClass: "light",
  movementPattern: "isolation",
  resistanceProfile: "bottom",
  mappings: [
    ["pect_clav", 1],
    ["pect_stern", 1],
    ["delt_ant", 0.3],
  ] as const,
};

// --- Séance ----------------------------------------------------------------

type SetSpec = { weight: number; reps: number; rir: number | null; at: string; finisher?: boolean; round?: number };
type ExSpec = { key: string; exerciseId: string; name: string; superset?: boolean; sets: SetSpec[] };

/**
 * Les heures ci-dessous sont en HEURE LOCALE de Paris (CEST = UTC+2 en août), comme
 * l'affiche l'historique. Stocké en UTC : écrire « 18:00 » en Z afficherait 20:00.
 */
const T = (hhmm: string) => new Date(`${LOCAL_DATE}T${hhmm}:00.000+02:00`).toISOString();

const SESSION_ID = stableId(`session:${LOCAL_DATE}`);
const SUPERSET_ID = stableId(`superset:${LOCAL_DATE}`);
const START = T("18:00");
const END = T("19:12");

/** RIR 1 par défaut, valeurs explicites reprises telles quelles du carnet. */
const EXERCISES: ExSpec[] = [
  {
    key: "tractions",
    exerciseId: EX.tractionsSn,
    name: "Tractions SN",
    sets: [{ weight: 0, reps: 11, rir: 1, at: T("18:04") }],
  },
  {
    key: "lateral",
    exerciseId: EX.lateralRaises,
    name: "Lateral raises",
    superset: true,
    sets: [
      { weight: 14, reps: 10, rir: 1, at: T("18:08"), round: 1 },
      { weight: 14, reps: 8, rir: 1, at: T("18:12"), round: 2 },
      { weight: 12, reps: 8, rir: 1, at: T("18:16"), round: 3 },
      { weight: 12, reps: 8, rir: 1, at: T("18:20"), round: 4 },
    ],
  },
  {
    key: "curl",
    exerciseId: EX.curlDebout,
    name: "Curl debout",
    superset: true,
    sets: [
      { weight: 18, reps: 7, rir: 1, at: T("18:10"), round: 1 },
      { weight: 18, reps: 5, rir: 1, at: T("18:14"), round: 2 },
      { weight: 16, reps: 6, rir: 1, at: T("18:18"), round: 3 },
    ],
  },
  {
    key: "muscleup",
    exerciseId: EX.muscleUpPulldown,
    name: "Tirage vertical muscle up",
    sets: [{ weight: 40, reps: 10, rir: 2, at: T("18:25") }],
  },
  {
    key: "pulley",
    exerciseId: EX.pulleySerre,
    name: "Pulley serré",
    sets: [
      { weight: 45, reps: 10, rir: 1, at: T("18:30") },
      { weight: 50, reps: 8, rir: 1, at: T("18:34") },
      { weight: 50, reps: 7, rir: 1, at: T("18:38") },
    ],
  },
  {
    key: "pecdeckbt",
    exerciseId: EX.pecDeckBrasTendus,
    name: NEW_EXERCISE.name,
    sets: [
      { weight: 93, reps: 10, rir: 1, at: T("18:43") },
      { weight: 100, reps: 9, rir: 1, at: T("18:47") },
      { weight: 100, reps: 5, rir: 0, at: T("18:51") },
    ],
  },
  {
    key: "reardelt",
    exerciseId: EX.rearDeltFly,
    name: "Rear delt fly",
    sets: [
      { weight: 37.5, reps: 10, rir: 3, at: T("18:55") },
      { weight: 45, reps: 9, rir: 1, at: T("18:59") },
      { weight: 45, reps: 5, rir: 0, at: T("19:02") },
    ],
  },
  {
    key: "dc",
    exerciseId: EX.dcAssiste,
    name: "DC assisté",
    sets: [
      { weight: 80, reps: 10, rir: 3, at: T("19:05") },
      { weight: 100, reps: 5, rir: 0, at: T("19:07") },
      { weight: 80, reps: 6, rir: 1, at: T("19:09") },
    ],
  },
  {
    key: "dips",
    exerciseId: EX.dips,
    name: "Dips",
    sets: [{ weight: 0, reps: 15, rir: 1, at: T("19:10"), finisher: true }],
  },
  {
    key: "hspu",
    exerciseId: EX.hspu,
    name: "HSPU",
    sets: [{ weight: 0, reps: 2, rir: 1, at: T("19:11"), finisher: true }],
  },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  const sql = neon(databaseUrl);

  // Résout les deux exercices dont l'UUID n'est pas connu du script.
  for (const [key, name] of [["rearDeltFly", "Rear delt fly"], ["dcAssiste", "DC assisté"]] as const) {
    const rows = await sql`SELECT id FROM exercises WHERE name = ${name}`;
    if (rows.length !== 1) throw new Error(`Exercice introuvable ou ambigu : ${name}`);
    EX[key] = String(rows[0].id);
    for (const spec of EXERCISES) if (spec.name === name) spec.exerciseId = EX[key];
  }

  const missing = EXERCISES.filter((e) => !e.exerciseId);
  if (missing.length) throw new Error(`Exercices non résolus : ${missing.map((m) => m.name).join(", ")}`);

  // Collision : une séance existe-t-elle déjà ce jour civil ?
  const sameDay = await sql`
    SELECT id, date FROM workout_sessions WHERE (date AT TIME ZONE 'UTC')::date = ${LOCAL_DATE}::date`;
  const alreadyApplied = sameDay.length === 1 && String(sameDay[0].id) === SESSION_ID;
  if (sameDay.length > 0 && !alreadyApplied) {
    throw new Error(`Collision : une séance existe déjà le ${LOCAL_DATE} — ${JSON.stringify(sameDay)}`);
  }
  if (alreadyApplied) {
    console.log(`${SCRIPT_NAME}: séance déjà importée (${SESSION_ID}) — rien à faire.`);
    return;
  }

  const totalSets = EXERCISES.reduce((n, e) => n + e.sets.length, 0);
  console.log(`Host          : ${databaseHostname(databaseUrl)}`);
  console.log(`Séance        : ${LOCAL_DATE} — ${EXERCISES.length} exercices, ${totalSets} séries`);
  console.log(`Nouvel exo    : ${NEW_EXERCISE.name}`);
  for (const e of EXERCISES) {
    console.log(
      `  ${e.superset ? "⛓ " : "  "}${e.name.padEnd(28)} ` +
        e.sets
          .map((s) => `${s.weight > 0 ? s.weight : "BW"}×${s.reps}${s.rir !== null ? ` (RIR ${s.rir})` : ""}${s.finisher ? " [finisher]" : ""}`)
          .join(" · ")
    );
  }

  if (!APPLY) {
    console.log(`\n🔍 LECTURE SEULE. Pour appliquer :\n   ${APPLY_ENV}=${PRODUCTION_MIGRATION_CONFIRMATION} npx tsx scripts/${SCRIPT_NAME}.ts`);
    return;
  }
  if (process.env[APPLY_ENV] !== PRODUCTION_MIGRATION_CONFIRMATION) {
    throw new Error(`${APPLY_ENV} doit valoir exactement « ${PRODUCTION_MIGRATION_CONFIRMATION} ».`);
  }

  // Backup complet relu sur disque AVANT toute écriture.
  const backupFile = writeBackupFile(await dumpAllTables(), `pre-${SCRIPT_NAME}`);
  // `writeBackupFile` enveloppe le dump : { exportedAt, counts, tables }.
  const onDisk = JSON.parse(readFileSync(backupFile, "utf8")) as { tables?: Record<string, unknown[]> };
  const savedSets = onDisk.tables?.loggedSets;
  if (!Array.isArray(savedSets) || savedSets.length === 0 || statSync(backupFile).size < 1000) {
    throw new Error("Backup incohérent — écriture annulée.");
  }
  console.log(`\nBackup        : ${backupFile} (${savedSets.length} séries sauvegardées)`);

  const supersetMembers = EXERCISES.filter((e) => e.superset).map((e) => stableId(`le:${LOCAL_DATE}:${e.key}`));

  await sql.transaction(
    (tx) => {
      const q = [
        tx.query("set local time zone 'UTC'", []),
        tx.query("set local lock_timeout='15s'", []),
        // Le nouvel exercice et ses mappings.
        tx.query(
          `INSERT INTO exercises (id, name, category, set_pattern_mode, rep_target_min, rep_target_max,
             smallest_increment, is_favorite, created_by_user, sort_order, suggested_rest_seconds,
             machine_setting, setup_notes, fatigue_class, voluntary_rep_cap, movement_pattern,
             resistance_profile, last_used)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,true,
             (SELECT COALESCE(MAX(sort_order),0)+1 FROM exercises),$8,$9,$10,$11,0,$12,$13,$14)
           ON CONFLICT (id) DO NOTHING`,
          [
            NEW_EXERCISE.id, NEW_EXERCISE.name, NEW_EXERCISE.category, NEW_EXERCISE.setPatternMode,
            NEW_EXERCISE.repTargetMin, NEW_EXERCISE.repTargetMax, NEW_EXERCISE.smallestIncrement,
            NEW_EXERCISE.suggestedRestSeconds, NEW_EXERCISE.machineSetting, NEW_EXERCISE.setupNotes,
            NEW_EXERCISE.fatigueClass, NEW_EXERCISE.movementPattern, NEW_EXERCISE.resistanceProfile, END,
          ]
        ),
        ...NEW_EXERCISE.mappings.map(([muscle, coeff]) =>
          tx.query(
            `INSERT INTO muscle_mappings (id, exercise_id, muscle_group, coefficient)
             VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
            [stableId(`mm:${NEW_EXERCISE.id}:${muscle}`), NEW_EXERCISE.id, muscle, coeff]
          )
        ),
        tx.query(
          `INSERT INTO workout_sessions (id, date, start_time, end_time, notes, is_active, template_name)
           VALUES ($1,$2,$3,$4,'',false,NULL) ON CONFLICT (id) DO NOTHING`,
          [SESSION_ID, START, START, END]
        ),
        tx.query(
          `INSERT INTO superset_groups (id, session_id, order_index, member_order)
           VALUES ($1,$2,0,$3) ON CONFLICT (id) DO NOTHING`,
          // `member_order` est jsonb : le driver attend une chaîne JSON, pas un tableau JS.
          [SUPERSET_ID, SESSION_ID, JSON.stringify(supersetMembers)]
        ),
      ];

      EXERCISES.forEach((e, index) => {
        const leId = stableId(`le:${LOCAL_DATE}:${e.key}`);
        q.push(
          tx.query(
            `INSERT INTO logged_exercises (id, session_id, order_index, notes, exercise_id, exercise_name, superset_group_id)
             VALUES ($1,$2,$3,'',$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
            [leId, SESSION_ID, index, e.exerciseId, e.name, e.superset ? SUPERSET_ID : null]
          )
        );
        e.sets.forEach((s, slot) => {
          const setId = stableId(`set:${LOCAL_DATE}:${e.key}:${slot}`);
          q.push(
            tx.query(
              `INSERT INTO logged_sets (id, logged_exercise_id, weight, reps, set_type, timestamp,
                 set_slot_index, completed, superset_round_index, logical_set_id, reported_rir)
               VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
              [
                setId, leId, s.weight, s.reps, s.finisher ? "finisher" : "work", s.at, slot,
                s.round ?? null,
                // Un finisher n'appartient pas à la piste de prédiction normale.
                s.finisher ? null : setId,
                s.rir,
              ]
            )
          );
        });
      });

      return q;
    },
    { isolationLevel: "Serializable" }
  );

  // Validation stricte après écriture.
  const [check] = await sql`
    SELECT
      (SELECT count(*)::int FROM logged_exercises WHERE session_id = ${SESSION_ID}) AS exos,
      (SELECT count(*)::int FROM logged_sets ls JOIN logged_exercises le ON le.id = ls.logged_exercise_id
        WHERE le.session_id = ${SESSION_ID}) AS sets,
      (SELECT count(*)::int FROM logged_sets ls JOIN logged_exercises le ON le.id = ls.logged_exercise_id
        WHERE le.session_id = ${SESSION_ID} AND ls.set_type = 'finisher') AS finishers,
      (SELECT count(*)::int FROM logged_sets ls JOIN logged_exercises le ON le.id = ls.logged_exercise_id
        WHERE le.session_id = ${SESSION_ID} AND ls.reported_rir IS NOT NULL) AS avec_rir`;

  if (check.exos !== EXERCISES.length || check.sets !== totalSets || check.finishers !== 2) {
    throw new Error(`Validation échouée : ${JSON.stringify(check)}`);
  }

  console.log(`\n✅ Séance importée : ${check.exos} exercices, ${check.sets} séries, ${check.finishers} finishers, ${check.avec_rir} avec RIR.`);
}

main().catch((error) => {
  console.error(`\n${SCRIPT_NAME}: échec —`, error);
  process.exit(1);
});
