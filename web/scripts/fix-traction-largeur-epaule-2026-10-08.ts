/**
 * Correction demandée par Evan le 08/10/2026 : « les 2 dernières séances où j'ai fait des
 * tractions, c'était en réalité des tractions largeur d'épaule ».
 *
 * Le 01/10 en salle (3G), l'app a créé « Trac » pendant qu'il tapait « Traction largeur épaule »,
 * puis la vraie création est restée sur « Création… ». Ses tractions largeur d'épaule ont été
 * notées sous « Traction pronation large » (01/10 et 06/10). Ce script :
 *   1. renomme « Trac » (aucune série) en « Traction largeur épaule » et lui donne le profil
 *      musculaire du donneur choisi par `muscleProfileDonors` parmi les tractions
 *      (`profile_source = 'donor'`), avec
 *      les réglages d'entraînement du donneur (poids du corps lestable, 6-10 reps, etc.), « Trac »
 *      n'ayant que les valeurs par défaut de la création rapide ;
 *   2. rattache à cet exercice les `logged_exercises` des 2 dernières séances de « Traction
 *      pronation large » (séries inchangées, aucune suppression de séance ni de série) ;
 *   3. touche ces 2 séances (`updated_at`) pour qu'une ancienne écriture du téléphone rejouée
 *      ensuite devienne une lettre morte `stale_write` au lieu de défaire la correction.
 *
 * Lecture seule par défaut (affiche les lignes concernées et le SQL d'annulation). `--apply` :
 * host exact de production + `APPLY_PROD_MIGRATION`, une seule transaction, dont chaque
 * précondition est vérifiée DANS la transaction (sinon tout est annulé). `row_history` garde
 * l'ancien état 30 jours (DATA_SAFETY.md).
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { assertExactProductionDatabase, assertProductionMigrationConfirmed } from "./_safety";
import { getExercises } from "../lib/db/queries";
import { muscleProfileDonors } from "../lib/data/muscle-profile-donors";

const SCRIPT_NAME = "fix-traction-largeur-epaule-2026-10-08";
const TRAC_ID = "b284680b-a6ce-4c0f-8edc-e0002ea8022c";
const SOURCE_ID = "4CF4693E-EE9B-4962-A01E-7B0461861AA7"; // Traction pronation large
const NEW_NAME = "Traction largeur épaule";
const SESSIONS_TO_MOVE = 2;

const q = (value: string | number | null): string =>
  value === null ? "null" : typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  if (apply) {
    assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
    assertProductionMigrationConfirmed(SCRIPT_NAME);
  }
  const sql = neon(databaseUrl);

  const [trac] = await sql.query("select * from exercises where id = $1", [TRAC_ID]);
  if (!trac) throw new Error("« Trac » introuvable.");
  const tracUsage = await sql.query("select count(*)::int as n from logged_exercises where exercise_id = $1", [TRAC_ID]);
  const tracMappings = await sql.query(
    "select id, muscle_group, coefficient from muscle_mappings where exercise_id = $1 order by id",
    [TRAC_ID]
  );

  // Donneur : le mécanisme de l'app, sur le catalogue réel, pour le NOUVEAU nom.
  const catalog = await getExercises();
  const tracExercise = catalog.find((exercise) => exercise.id === TRAC_ID);
  if (!tracExercise) throw new Error("« Trac » absent du catalogue lu.");
  // Parmi les tractions seulement : sur le catalogue entier, le mot « épaule » (qui décrit ici la
  // largeur de prise) fait gagner HSPU, un exercice d'épaules (essai à blanc du 08/10).
  const pullUps = catalog.filter((exercise) => /traction/i.test(exercise.name));
  const donors = muscleProfileDonors({ ...tracExercise, name: NEW_NAME }, pullUps);
  const donor = donors[0];
  if (!donor) throw new Error("Aucun donneur trouvé.");

  const moved = await sql.query(
    `select le.id as le_id, le.exercise_id, le.exercise_name, ws.id as session_id, ws.date, ws.updated_at,
            (select json_agg(json_build_object('id', ls.id, 'weight', ls.weight, 'reps', ls.reps,
                    'rir', ls.reported_rir, 'type', ls.set_type, 'completed', ls.completed, 'at', ls.timestamp)
                    order by ls.set_slot_index) from logged_sets ls where ls.logged_exercise_id = le.id) as sets
       from logged_exercises le join workout_sessions ws on ws.id = le.session_id
      where le.exercise_id = $1 and not ws.is_active
      order by ws.date desc limit $2`,
    [SOURCE_ID, SESSIONS_TO_MOVE]
  );
  const [source] = await sql.query("select id, name, last_used from exercises where id = $1", [SOURCE_ID]);
  const movedIds = moved.map((row) => row.le_id as string);
  const sessionIds = moved.map((row) => row.session_id as string);
  const [sourceLastUsedAfter] = await sql.query(
    `select max(ls.timestamp) as at from logged_sets ls join logged_exercises le on le.id = ls.logged_exercise_id
      where le.exercise_id = $1 and not (le.id = any($2::text[]))`,
    [SOURCE_ID, movedIds]
  );
  const [newLastUsed] = await sql.query(
    `select max(ls.timestamp) as at from logged_sets ls where ls.logged_exercise_id = any($1::text[])`,
    [movedIds]
  );

  console.log(JSON.stringify({
    mode: apply ? "apply" : "lecture seule",
    trac: { id: trac.id, name: trac.name, profile_source: trac.profile_source, set_pattern_mode: trac.set_pattern_mode, logged_exercises: tracUsage[0].n, mappings: tracMappings.length },
    donneurs: donors.map((exercise) => exercise.name),
    donneur: { id: donor.id, name: donor.name, mappings: donor.muscleMappings.map((m) => `${m.muscleGroup}:${m.coefficient}`) },
    a_rattacher: moved,
    source_last_used: { avant: source.last_used, apres: sourceLastUsedAfter.at },
    nouveau_last_used: newLastUsed.at,
  }, null, 1));

  if (moved.length !== SESSIONS_TO_MOVE) throw new Error(`${moved.length} séance(s) trouvée(s), ${SESSIONS_TO_MOVE} attendues.`);
  if (tracUsage[0].n !== 0) throw new Error("« Trac » porte des séries : arrêt, à examiner à la main.");

  // SQL d'annulation, tiré de l'état AVANT (à exécuter en une transaction).
  const rollback = [
    "begin;",
    `update logged_exercises set exercise_id = ${q(SOURCE_ID)}, exercise_name = ${q(source.name)} where id in (${movedIds.map(q).join(", ")});`,
    `update workout_sessions set updated_at = now() where id in (${sessionIds.map(q).join(", ")});`,
    `delete from muscle_mappings where exercise_id = ${q(TRAC_ID)};`,
    ...tracMappings.map((m) => `insert into muscle_mappings (id, exercise_id, muscle_group, coefficient) values (${q(m.id)}, ${q(TRAC_ID)}, ${q(m.muscle_group)}, ${m.coefficient});`),
    `update exercises set name = ${q(trac.name)}, category = ${q(trac.category)}, set_pattern_mode = ${q(trac.set_pattern_mode)}, rep_target_min = ${trac.rep_target_min}, rep_target_max = ${trac.rep_target_max}, smallest_increment = ${trac.smallest_increment}, fatigue_class = ${q(trac.fatigue_class)}, suggested_rest_seconds = ${trac.suggested_rest_seconds}, resistance_profile = ${q(trac.resistance_profile)}, movement_pattern = ${q(trac.movement_pattern)}, profile_source = ${q(trac.profile_source)}, last_used = ${trac.last_used ? q(new Date(trac.last_used).toISOString()) : "null"} where id = ${q(TRAC_ID)};`,
    `update exercises set last_used = ${q(new Date(source.last_used).toISOString())} where id = ${q(SOURCE_ID)};`,
    "commit;",
  ].join("\n");
  console.log("\n-- SQL d'annulation\n" + rollback);

  if (!apply) return;

  const checks = `
    do $$ begin
      if (select name from exercises where id = ${q(TRAC_ID)}) <> 'Trac' then raise exception 'Trac a changé'; end if;
      if (select count(*) from logged_exercises where exercise_id = ${q(TRAC_ID)}) <> 0 then raise exception 'Trac porte des séries'; end if;
      if (select count(*) from logged_exercises where id in (${movedIds.map(q).join(", ")}) and exercise_id = ${q(SOURCE_ID)}) <> ${SESSIONS_TO_MOVE} then raise exception 'lignes à rattacher modifiées'; end if;
    end $$;`;
  const statements = [
    checks,
    `update exercises set name = ${q(NEW_NAME)}, category = ${q(donor.category)}, set_pattern_mode = (select set_pattern_mode from exercises where id = ${q(donor.id)}),
       rep_target_min = ${donor.repTargetMin}, rep_target_max = ${donor.repTargetMax}, smallest_increment = ${donor.smallestIncrement},
       fatigue_class = (select fatigue_class from exercises where id = ${q(donor.id)}), suggested_rest_seconds = ${donor.suggestedRestSeconds},
       resistance_profile = (select resistance_profile from exercises where id = ${q(donor.id)}),
       movement_pattern = coalesce(movement_pattern, (select movement_pattern from exercises where id = ${q(donor.id)})),
       profile_source = 'donor', last_used = ${q(new Date(newLastUsed.at).toISOString())}
     where id = ${q(TRAC_ID)};`,
    `delete from muscle_mappings where exercise_id = ${q(TRAC_ID)};`,
    `insert into muscle_mappings (id, exercise_id, muscle_group, coefficient)
       select ${q(TRAC_ID)} || ':' || muscle_group || ':donor', ${q(TRAC_ID)}, muscle_group, coefficient
         from muscle_mappings where exercise_id = ${q(donor.id)};`,
    `update logged_exercises set exercise_id = ${q(TRAC_ID)}, exercise_name = ${q(NEW_NAME)} where id in (${movedIds.map(q).join(", ")});`,
    `update workout_sessions set updated_at = now() where id in (${sessionIds.map(q).join(", ")});`,
    `update exercises set last_used = ${q(new Date(sourceLastUsedAfter.at).toISOString())} where id = ${q(SOURCE_ID)};`,
  ];
  await sql.transaction(statements.map((statement) => sql.query(statement)));

  const after = await sql.query(
    `select e.id, e.name, e.profile_source, e.set_pattern_mode, e.last_used,
            (select count(*)::int from muscle_mappings mm where mm.exercise_id = e.id) as mappings,
            (select count(*)::int from logged_exercises le where le.exercise_id = e.id) as logged_exercises
       from exercises e where e.id in ($1, $2)`,
    [TRAC_ID, SOURCE_ID]
  );
  console.log("\n-- Après\n" + JSON.stringify(after, null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
