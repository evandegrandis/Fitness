/**
 * Correctif idempotent à exécuter uniquement après la migration 0003.
 *
 * - Plate loaded lateral raises: charge saisie par bras, incrément 1,25 kg,
 *   deltoïde latéral uniquement.
 * - Dips: bodyweight, pectoral sternal + trois chefs du triceps.
 * - Profil de repères: homme, 26 ans.
 *
 * Le script n'est jamais importé par l'application et n'est pas exécuté par
 * les tests. Il effectue ses écritures dans une transaction Neon unique puis
 * relit exactement les lignes attendues.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { neon, type NeonQueryInTransaction } from "@neondatabase/serverless";
import { assertDbWriteAllowed } from "./_safety";

const PLATE_ID = "22519741-91db-5810-8e1f-1e42a7cfd392";
const DIPS_ID = "64054336-5A49-4DB5-B226-5B77973F5BA4";
const PLATE_NAME = "Plate loaded lateral raises";

function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent");

  // Correctif historique désormais remplacé par migrate-prod-2026-08-09.ts.
  // Il reste rejouable sur une base locale de test, mais ne peut plus modifier
  // Neon : assertDbWriteAllowed n'a volontairement aucun override.
  assertDbWriteAllowed("fix-catalog-profile-2026-08-04 (historique)");
  const sql = neon(databaseUrl);

  const targets = await sql.query(
    "select id, name from exercises where id = any($1::text[]) order by id",
    [[PLATE_ID, DIPS_ID]]
  );
  if (targets.length !== 2) throw new Error("Plate ou Dips est introuvable; aucune écriture effectuée.");

  await sql.transaction((tx) => {
    const queries: NeonQueryInTransaction[] = [
      tx`
        update exercises
        set name = ${PLATE_NAME}, smallest_increment = 1.25,
            setup_notes = 'Charge loggée par bras.'
        where id = ${PLATE_ID}
      `,
      tx`update logged_exercises set exercise_name = ${PLATE_NAME} where exercise_id = ${PLATE_ID}`,
      tx`delete from muscle_mappings where exercise_id = ${PLATE_ID}`,
      tx`
        insert into muscle_mappings (id, exercise_id, muscle_group, coefficient)
        values (${stableId(`mapping:${PLATE_ID}:delt_lat`)}, ${PLATE_ID}, 'delt_lat', 1)
        on conflict (id) do update set muscle_group = excluded.muscle_group, coefficient = excluded.coefficient
      `,
      tx`update exercises set set_pattern_mode = 'bodyweight' where id = ${DIPS_ID}`,
      tx`delete from muscle_mappings where exercise_id = ${DIPS_ID}`,
      ...(["pect_stern", "triceps_long", "triceps_lat", "triceps_med"] as const).map(
        (muscle) => tx`
          insert into muscle_mappings (id, exercise_id, muscle_group, coefficient)
          values (${stableId(`mapping:${DIPS_ID}:${muscle}`)}, ${DIPS_ID}, ${muscle}, 1)
          on conflict (id) do update set muscle_group = excluded.muscle_group, coefficient = excluded.coefficient
        `
      ),
      tx`update user_settings set gender = 'male', age_years = 26 where id = 'singleton'`,
    ];
    return queries;
  });

  const verification = await sql.query(
    `select e.id, e.name, e.set_pattern_mode, e.smallest_increment, e.setup_notes,
            json_agg(json_build_object('muscle', mm.muscle_group, 'coefficient', mm.coefficient)
                     order by mm.muscle_group) as mappings
     from exercises e
     join muscle_mappings mm on mm.exercise_id = e.id
     where e.id = any($1::text[])
     group by e.id
     order by e.id`,
    [[PLATE_ID, DIPS_ID]]
  );
  const profile = await sql.query(
    "select gender, age_years from user_settings where id = 'singleton'"
  );
  console.log(JSON.stringify({ status: "ok", exercises: verification, profile }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
