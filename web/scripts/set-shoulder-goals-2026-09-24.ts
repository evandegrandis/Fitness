/**
 * Objectifs d'épaules par faisceau, demandés par Evan le 2026-09-24 : les deltoïdes deviennent trois
 * groupes (lib/models/muscles.ts). L'ancien objectif « deltoides » (20 séries) est remplacé par :
 *   - deltoïde latéral : 16 séries par semaine ;
 *   - deltoïde postérieur : 10 séries par semaine (il hésitait entre 8 et 10) ;
 *   - deltoïde antérieur : suivi sans objectif (il travaille à chaque développé).
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

const SCRIPT_NAME = "set-shoulder-goals-2026-09-24";
const REMOVED = "deltoides";
const GOALS = [
  { parent: "delt_lateral", weeklyGoalSets: 16 },
  { parent: "delt_posterieur", weeklyGoalSets: 10 },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(databaseUrl, SCRIPT_NAME);
  const apply = process.argv.includes("--apply");
  const sql = neon(databaseUrl);
  const read = async () =>
    (await sql.query("select muscle_parent, weekly_goal_sets from muscle_goals order by muscle_parent")) as {
      muscle_parent: string;
      weekly_goal_sets: number;
    }[];

  const before = await read();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", avant: before, retiré: REMOVED, ajoutés: GOALS }, null, 2));
  if (!apply) return;

  assertProductionMigrationConfirmed(SCRIPT_NAME);
  const backup = writeBackupFile(await dumpAllTables(), `before-${SCRIPT_NAME}`);
  console.log(`Sauvegarde avant écriture : ${backup}`);

  await sql.transaction((tx) => [
    tx`delete from muscle_goals where muscle_parent = ${REMOVED}`,
    ...GOALS.map((goal) => tx`
      insert into muscle_goals (muscle_parent, weekly_goal_sets)
      values (${goal.parent}, ${goal.weeklyGoalSets})
      on conflict (muscle_parent) do update set weekly_goal_sets = excluded.weekly_goal_sets
    `),
  ]);

  const after = await read();
  if (after.some((row) => row.muscle_parent === REMOVED)) throw new Error(`${SCRIPT_NAME}: « ${REMOVED} » toujours présent.`);
  for (const goal of GOALS) {
    const row = after.find((candidate) => candidate.muscle_parent === goal.parent);
    if (!row || row.weekly_goal_sets !== goal.weeklyGoalSets) throw new Error(`${SCRIPT_NAME}: vérification échouée pour ${goal.parent}.`);
  }
  console.log(JSON.stringify({ vérifié: after }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
