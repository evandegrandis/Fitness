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

  it.each([
    ["Delts machine Technogym", MuscleGroup.deltLat],
    ["Leg Press Technogym", MuscleGroup.vasteLat],
    ["Leg curl LifeFitness", MuscleGroup.bicepsFemoral],
    ["Low Row Technogym", MuscleGroup.latSup],
    ["Shoulder press Technogym", MuscleGroup.deltAnt],
    ["Vertical Traction Technogym", MuscleGroup.latSup],
    ["Tirage vertical serré neutre", MuscleGroup.latInf],
  ])("reconnaît %s malgré la marque de la machine", (name, expectedMuscle) => {
    const mapped = withKnownMuscleProfile(unmapped(name));
    expect(mapped.muscleMappings.some((mapping) => mapping.muscleGroup === expectedMuscle)).toBe(true);
  });

  it("garde l'exercice de marque distinct : seul le profil musculaire est recopié", () => {
    // Les charges ne sont pas comparables d'une marque à l'autre : pas de fusion, pas de renommage.
    const technogym = unmapped("Low Row Technogym");
    const mapped = withKnownMuscleProfile(technogym);
    expect(mapped.id).toBe(technogym.id);
    expect(mapped.name).toBe("Low Row Technogym");
    expect(mapped.strengthStandardKey).toBeNull();
  });

  it("ne reconnaît rien à partir de la seule marque", () => {
    expect(knownMuscleProfileForName("Technogym")).toBeNull();
    expect(knownMuscleProfileForName("Machine mystère Technogym")).toBeNull();
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
