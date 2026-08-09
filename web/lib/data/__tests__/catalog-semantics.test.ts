import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildFullDataset } from "@/lib/data/build-dataset";
import { collectExerciseHistory, detectPattern } from "@/lib/engines/patterns";
import { SetPatternMode } from "@/lib/models/enums";

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", file), "utf8"));
}

describe("invariants sémantiques du catalogue", () => {
  const backup = readJson("jeera_backup.json") as {
    exercises: Array<{
      id: string;
      name: string;
      setPatternMode: string;
      strengthStandardKey?: string;
      benchmarkUnit?: string;
    }>;
    sessions: Array<{
      exercises: Array<{
        exerciseName: string;
        sets: Array<{ completed: boolean; weight: number }>;
      }>;
    }>;
  };
  const standards = readJson("strength_standards_corrected.json") as {
    standards: Record<
      string,
      {
        slSlug: string;
        unit: string;
        convention: string;
        load?: number[];
        loggedLoadMultiplier?: number;
        caveat?: string;
      }
    >;
    resistanceProfiles: Record<string, string>;
  };

  it("traite Dips machine comme une charge externe croissante, jamais comme une assistance", () => {
    const exercise = backup.exercises.find(
      (item) => item.id === "61FFD2BA-E88F-47C1-9DA1-8FB103F5A600"
    );
    expect(exercise).toMatchObject({
      name: "Dips machine",
      setPatternMode: SetPatternMode.straight,
      strengthStandardKey: "Dips machine",
      benchmarkUnit: "load",
    });

    const loggedWeights = backup.sessions
      .flatMap((session) => session.exercises)
      .filter((logged) => logged.exerciseName === "Dips machine")
      .flatMap((logged) => logged.sets)
      .filter((set) => set.completed)
      .map((set) => set.weight);
    expect(loggedWeights.length).toBeGreaterThan(0);
    expect(loggedWeights.every((weight) => weight > 0)).toBe(true);

    expect(standards.standards["Dips machine"]).toMatchObject({
      slSlug: "seated-dip-machine",
      unit: "load",
      convention: "total",
    });
    expect(standards.standards["Dips machine"].caveat).toContain("comparaison indicative");
  });

  it("garde Dips libre en bodyweight et les exercices BW historiques sur la branche BW_REP", () => {
    expect(backup.exercises.find((item) => item.name === "Dips")?.setPatternMode).toBe(
      SetPatternMode.bodyweight
    );

    const dataset = buildFullDataset(backup, readJson("recent_sessions.json"));
    for (const name of ["HSPU", "Relevé de jambes chaise romaine", "Ab roller genoux"]) {
      const exercise = dataset.exercises.find((item) => item.name === name);
      expect(exercise, name).toBeDefined();
      const history = collectExerciseHistory(dataset.sessions, exercise!.id);
      expect(detectPattern(exercise!, history.sets, history.positions), name).toBe("BW_REP");
    }
  });

  it("ne prétend pas connaître le point faible de la Plate sans modèle de machine", () => {
    expect(standards.resistanceProfiles).not.toHaveProperty("Plate loaded lat raise");
    expect(standards.standards["Plate loaded lat raise"]).toMatchObject({
      slSlug: "machine-lateral-raise",
      unit: "load",
      convention: "total",
      loggedLoadMultiplier: 2,
    });
    expect(standards.standards["Plate loaded lat raise"].caveat).toContain(
      "géométrie et résistance réelle non standardisées"
    );
  });

  it("réserve les seuils de charge négatifs aux standards de charge ajoutée", () => {
    const withNegativeLoad = Object.entries(standards.standards).filter(([, standard]) =>
      standard.load?.some((value) => value < 0)
    );
    expect(withNegativeLoad.length).toBeGreaterThan(0);
    expect(withNegativeLoad.every(([, standard]) => standard.convention === "added")).toBe(true);
    expect(withNegativeLoad.map(([name]) => name)).toContain("Traction pronation large");
  });
});
