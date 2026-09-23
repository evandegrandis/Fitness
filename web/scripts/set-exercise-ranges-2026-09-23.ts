/**
 * Réglages d'exercices donnés par Evan le 2026-09-23 :
 *   - Lateral raises : fourchette 8-12 (au-delà quand il n'est pas encore à RIR 0-2, c'est normal) ;
 *   - Abdominal LifeFitness : fourchette 8-12, charge max de la machine 85 kg (bout de pile : il
 *     faisait plus de reps pour atteindre l'échec).
 *
 * Dry-run par défaut ; `--apply` exige le host exact de production ET
 * `APPLY_PROD_MIGRATION=<jeton _safety>`. Sauvegarde complète écrite avant toute écriture.
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import {
  assertExactProductionDatabase,
  assertProductionMigrationConfirmed,
  dumpAllTables,
  writeBackupFile,
} from "./_safety";

const SCRIPT_NAME = "set-exercise-ranges-2026-09-23";

const CHANGES: { name: string; repTargetMin: number; repTargetMax: number; maxLoad: number | null }[] = [
  { name: "Lateral raises", repTargetMin: 8, repTargetMax: 12, maxLoad: null },
  { name: "Abdominal LifeFitness", repTargetMin: 8, repTargetMax: 12, maxLoad: 85 },
];

interface Row {
  name: string;
  rep_target_min: number;
  rep_target_max: number;
  max_load: number | null;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  const apply = process.argv.includes("--apply");
  const sql = neon(databaseUrl);
  const names = CHANGES.map((change) => change.name);
  const read = async () =>
    (await sql.query(
      "select name, rep_target_min, rep_target_max, max_load from exercises where name = any($1) order by name",
      [names]
    )) as Row[];

  const before = await read();
  if (before.length !== CHANGES.length) {
    throw new Error(`${SCRIPT_NAME}: ${before.length} exercice(s) trouvé(s) sur ${CHANGES.length}, rien n'est écrit.`);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", avant: before, après: CHANGES }, null, 2));
  if (!apply) return;

  assertProductionMigrationConfirmed(SCRIPT_NAME);
  const backup = writeBackupFile(await dumpAllTables(), `before-${SCRIPT_NAME}`);
  console.log(`Sauvegarde avant écriture : ${backup}`);

  await sql.transaction((tx) =>
    CHANGES.map((change) => tx`
      update exercises
         set rep_target_min = ${change.repTargetMin},
             rep_target_max = ${change.repTargetMax},
             max_load = ${change.maxLoad}
       where name = ${change.name}
    `)
  );

  const after = await read();
  for (const change of CHANGES) {
    const row = after.find((candidate) => candidate.name === change.name);
    if (!row || row.rep_target_min !== change.repTargetMin || row.rep_target_max !== change.repTargetMax || (row.max_load ?? null) !== change.maxLoad) {
      throw new Error(`${SCRIPT_NAME}: vérification échouée pour ${change.name}.`);
    }
  }
  console.log(JSON.stringify({ vérifié: after }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
