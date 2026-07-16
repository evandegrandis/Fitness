/**
 * Golden test — filet anti-dérive pour la refonte du moteur de suggestion.
 *
 * Charge l'historique RÉEL d'Evan (33 séances, `data/*.json`) via
 * `buildFullDataset`/`loadFullDatasetFromDisk`, reconstruit `recentHistory`
 * EXACTEMENT comme le store (`recentWorkSetsForExercise`, même fenêtre que
 * `suggestion()`) et appelle `suggest()` pour le "premier set du jour" de
 * chaque exercice ayant de l'historique.
 *
 * Le snapshot de référence (`__snapshots__/golden-current.json`) capture le
 * comportement AVANT la refonte fenêtre 3->10 + deload daté (WS1/WS4). Ce
 * test compare le comportement ACTUEL du moteur à cette référence commitée :
 * tant qu'aucun paramètre de deload n'est fourni, WS4 doit être un no-op
 * (non-régression), donc le comportement par défaut de `suggest()` DEVRAIT
 * rester identique à la référence même après la refonte — voir le rapport
 * pour le diff explicite goldenWindow3 -> nouvelle fenêtre 10.
 *
 * Pour régénérer la référence après un changement voulu :
 *   UPDATE_GOLDEN=1 npx vitest run lib/engines/__tests__/golden.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadFullDatasetFromDisk } from "@/lib/data/build-dataset";
import { suggest } from "@/lib/engines/progression";
import { HISTORY_WINDOW } from "@/lib/engines/constants";
import { recentWorkSetsForExercise } from "@/lib/store/workout";
import type { Exercise } from "@/lib/models/types";

const SNAPSHOT_DIR = path.join(process.cwd(), "lib/engines/__tests__/__snapshots__");
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "golden-current.json");

interface GoldenEntry {
  exerciseName: string;
  weight: number;
  reps: number;
  mode: string;
  reasonCodes: string[];
}

async function computeGolden(): Promise<Record<string, GoldenEntry>> {
  const data = await loadFullDatasetFromDisk();
  const catalog = data.exercises;
  // Le store trie `history` du plus récent au plus ancien (voir hydrate()).
  const history = [...data.sessions].sort((a, b) => b.date.getTime() - a.date.getTime());

  const entries: Record<string, GoldenEntry> = {};

  const exercisesWithHistory = catalog.filter((exercise: Exercise) =>
    history.some((session) => session.exercises.some((e) => e.exerciseId === exercise.id))
  );

  for (const exercise of exercisesWithHistory) {
    const recentHistory = recentWorkSetsForExercise(history, exercise.id, HISTORY_WINDOW);
    if (recentHistory.length === 0 || recentHistory.every((s) => s.length === 0)) continue;

    const result = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory,
      currentSessionSets: [],
    });

    // Clé = nom d'exercice (stable), PAS exercise.id : les exercices définis dans
    // `recent_sessions.json` (`newExercises`) reçoivent un `crypto.randomUUID()` frais à
    // chaque appel de `loadFullDatasetFromDisk()` (voir build-dataset.ts::buildNewExercise),
    // donc `exercise.id` n'est pas stable entre deux exécutions du test.
    entries[exercise.name] = {
      exerciseName: exercise.name,
      weight: result.weight,
      reps: result.reps,
      mode: result.mode,
      reasonCodes: result.reasonCodes,
    };
  }

  return entries;
}

describe("Golden test — suggestion sur historique réel (filet anti-dérive)", () => {
  it("reproduit la référence commitée pour chaque exercice avec historique", async () => {
    const current = await computeGolden();

    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(SNAPSHOT_PATH)) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(current, null, 2) + "\n", "utf8");
      console.log(`Golden snapshot (re)généré : ${SNAPSHOT_PATH} (${Object.keys(current).length} exercices)`);
      return;
    }

    const reference = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, GoldenEntry>;

    const diffs: string[] = [];
    const allIds = new Set([...Object.keys(reference), ...Object.keys(current)]);
    for (const id of allIds) {
      const before = reference[id];
      const after = current[id];
      if (!before || !after) {
        diffs.push(`${id}: ${before ? "supprimé" : "ajouté"} (${(before ?? after).exerciseName})`);
        continue;
      }
      if (before.weight !== after.weight || before.reps !== after.reps || before.mode !== after.mode) {
        diffs.push(
          `${before.exerciseName}: ${before.weight}x${before.reps} (${before.mode}) -> ${after.weight}x${after.reps} (${after.mode})`
        );
      }
    }

    if (diffs.length > 0) {
      console.log("GOLDEN DIFF:\n" + diffs.join("\n"));
    }

    expect(diffs).toEqual([]);
  });
});
