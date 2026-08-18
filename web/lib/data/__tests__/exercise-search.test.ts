import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "@/lib/data/exercise-search";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise } from "@/lib/models/types";

function exercise(name: string, category: string, muscles: MuscleGroup[]): Exercise {
  return {
    id: name, name, category, setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0,
    suggestedRestSeconds: 90, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "light", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: muscles.map((m) => ({ muscleGroup: m, coefficient: 1 })), lastUsed: null,
    movementPattern: null, resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  };
}

const LATERAL = exercise("Lateral raises", "Push", [MuscleGroup.deltLat]);
const CURL = exercise("Curl debout", "Pull", [MuscleGroup.bicepsLong]);
const DEVELOPPE = exercise("Développé couché barre", "Push", [MuscleGroup.pectStern]);
const PRESSE = exercise("Presse à cuisses", "Legs", [MuscleGroup.vasteLat]);

describe("normalisation", () => {
  it("ignore accents, casse et ponctuation", () => {
    expect(normalizeSearch("Développé couché")).toBe("developpe couche");
    expect(normalizeSearch("  ÉLÉVATION,  latérale ")).toBe("elevation laterale");
  });
});

describe("les cas signalés par Evan", () => {
  it("« élévation » trouve Lateral raises", () => {
    expect(matchesSearch(LATERAL, "élévation")).toBe(true);
    expect(matchesSearch(LATERAL, "elevation laterale")).toBe(true);
  });

  it("« épaule » trouve Lateral raises via le muscle travaillé", () => {
    expect(matchesSearch(LATERAL, "épaule")).toBe(true);
    expect(matchesSearch(LATERAL, "epaules")).toBe(true);
  });

  it("ne remonte pas n'importe quoi pour autant", () => {
    expect(matchesSearch(CURL, "épaule")).toBe(false);
    expect(matchesSearch(PRESSE, "élévation")).toBe(false);
  });
});

describe("tolérance", () => {
  it("trouve sans les accents", () => {
    expect(matchesSearch(DEVELOPPE, "developpe")).toBe(true);
    expect(matchesSearch(PRESSE, "presse a cuisses")).toBe(true);
  });

  it("accepte les synonymes anglais courants", () => {
    expect(matchesSearch(DEVELOPPE, "bench press")).toBe(true);
    expect(matchesSearch(PRESSE, "leg press")).toBe(true);
  });

  it("cherche par muscle générique", () => {
    expect(matchesSearch(CURL, "biceps")).toBe(true);
    expect(matchesSearch(PRESSE, "cuisses")).toBe(true);
  });

  it("exige que TOUS les mots correspondent", () => {
    // Sinon « curl incliné » remonterait tous les curls.
    expect(matchesSearch(CURL, "curl debout")).toBe(true);
    expect(matchesSearch(CURL, "curl incline")).toBe(false);
  });

  it("une requête vide ne filtre rien", () => {
    expect(matchesSearch(CURL, "")).toBe(true);
    expect(matchesSearch(CURL, "   ")).toBe(true);
  });
});
