import { describe, expect, it } from "vitest";
import {
  knownMuscleProfileForName,
  withKnownMuscleProfile,
} from "@/lib/data/catalog-muscle-profiles";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise } from "@/lib/models/types";

function unmapped(name: string): Exercise {
  return {
    id: name, name, category: "", setPatternMode: "straight", repTargetMin: 6, repTargetMax: 12,
    smallestIncrement: 5, isFavorite: false, createdByUser: true, sortOrder: 0,
    suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [], lastUsed: null, movementPattern: null, resistanceProfile: null,
    strengthStandardKey: null, benchmarkUnit: null,
  };
}

describe("profils musculaires des machines connues", () => {
  it.each([
    ["Upper back machine", MuscleGroup.trapMid],
    ["low-row machine", MuscleGroup.latSup],
    ["Pull-over machine", MuscleGroup.latSup],
  ])("mappe %s malgré ponctuation/casse", (name, expectedMuscle) => {
    const mapped = withKnownMuscleProfile(unmapped(name));
    expect(mapped.muscleMappings.some((mapping) => mapping.muscleGroup === expectedMuscle)).toBe(true);
    expect(mapped.movementPattern).not.toBeNull();
  });

  it("n'écrase jamais un mapping manuel existant", () => {
    const manual = {
      ...unmapped("Low row"),
      muscleMappings: [{ muscleGroup: MuscleGroup.deltPost, coefficient: 0.42 }],
    };
    expect(withKnownMuscleProfile(manual)).toBe(manual);
  });

  it("ne devine rien pour un nom ambigu inconnu", () => {
    expect(knownMuscleProfileForName("Nouvelle machine mystérieuse")).toBeNull();
    expect(withKnownMuscleProfile(unmapped("Nouvelle machine mystérieuse")).muscleMappings).toEqual([]);
  });
});
