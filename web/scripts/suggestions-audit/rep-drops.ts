/**
 * Ce que le moteur a appris : la perte de reps par exercice (`lib/engines/rep-drop.ts`) sur un export
 * de données (LECTURE SEULE, voir `web/SUGGESTIONS.md`).
 *
 *   npx tsx scripts/suggestions-audit/rep-drops.ts <export.json> [AAAA-MM-JJ]
 */
import { readFileSync } from "node:fs";
import type { AllData } from "@/lib/db/queries";
import { learnedRepDrop, repDropPairs } from "@/lib/engines/rep-drop";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const [dataPath, day] = process.argv.slice(2);
if (!dataPath) {
  console.error("usage : rep-drops.ts <export.json> [AAAA-MM-JJ]");
  process.exit(1);
}
const data = JSON.parse(readFileSync(dataPath, "utf8"), (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as AllData;
const now = day ? new Date(`${day}T23:59:00Z`) : new Date();
const history = data.sessions.filter((s) => s.date.getTime() <= now.getTime());
const pairs = repDropPairs(history);
const rows = data.exercises
  .map((exercise) => ({ exercise, estimate: learnedRepDrop(exercise, history, now) }))
  .filter((row) => row.estimate.exercisePairs > 0)
  .sort((a, b) => b.estimate.exercisePairs - a.estimate.exercisePairs);
const fmt = (x: number | null) => (x === null ? "" : x.toFixed(2).replace(".", ","));
console.log(`Paires dans l'historique : ${pairs.length}. A priori (toutes paires) : ${fmt(rows[0]?.estimate.prior ?? null)}.`);
console.log("| Exercice | Classe (constante) | Paires | Moyenne propre | Perte retenue | Source |");
console.log("|---|---|---|---|---|---|");
for (const { exercise, estimate } of rows) {
  console.log(`| ${exercise.name} | ${exercise.fatigueClass} (${fmt(estimate.classDrop)}) | ${estimate.exercisePairs} | ${fmt(estimate.exerciseMean)} | ${fmt(estimate.drop)} | ${estimate.source} |`);
}
