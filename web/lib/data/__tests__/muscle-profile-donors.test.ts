import { describe, expect, it } from "vitest";
import { muscleProfileDonors, withDonorProfile } from "@/lib/data/muscle-profile-donors";
import { MovementPattern } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise } from "@/lib/models/types";

function exercise(name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: name, name, category: "", setPatternMode: "straight", repTargetMin: 6, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0,
    suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [], lastUsed: null, movementPattern: null, resistanceProfile: null,
    strengthStandardKey: null, benchmarkUnit: null,
    ...overrides,
  };
}

const QUADS = [{ muscleGroup: MuscleGroup.vasteLat, coefficient: 1 }];
const LATS = [{ muscleGroup: MuscleGroup.latSup, coefficient: 1 }];
const DELTS = [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1 }];

const CATALOG = [
  exercise("Presse à cuisses", { category: "Legs", muscleMappings: QUADS, movementPattern: MovementPattern.squat }),
  exercise("Shoulder press", { category: "Push", muscleMappings: DELTS, lastUsed: new Date("2026-09-20") }),
  exercise("Tirage vertical prise large", { category: "Pull", muscleMappings: LATS, lastUsed: new Date("2026-09-18") }),
  exercise("Tirage vertical supination", { category: "Pull", muscleMappings: LATS, lastUsed: new Date("2026-08-01") }),
  exercise("Machine orpheline"),
];

describe("donneurs de profil musculaire", () => {
  it("met en tête la même machine d'une autre marque, même sous un autre nom", () => {
    const donors = muscleProfileDonors(exercise("Leg Press Technogym"), CATALOG);
    expect(donors[0].name).toBe("Presse à cuisses");
  });

  it("écarte un candidat qui ne partage qu'un mot banal avec le meilleur", () => {
    const donors = muscleProfileDonors(exercise("Leg Press Technogym"), CATALOG).map((d) => d.name);
    expect(donors).not.toContain("Shoulder press");
  });

  it("à ressemblance égale, préfère l'exercice pratiqué le plus récemment", () => {
    const donors = muscleProfileDonors(exercise("Tirage vertical serré neutre"), CATALOG).map((d) => d.name);
    expect(donors.slice(0, 2)).toEqual(["Tirage vertical prise large", "Tirage vertical supination"]);
  });

  it("un mot rare pèse plus qu'un mot qu'on retrouve partout", () => {
    const BACK = [{ muscleGroup: MuscleGroup.rhomboides, coefficient: 1 }];
    const ARMS = [{ muscleGroup: MuscleGroup.bicepsLong, coefficient: 1 }];
    const catalog = [
      exercise("Rowing machine assis", { muscleMappings: BACK }),
      exercise("Curl barre EZ", { muscleMappings: ARMS, lastUsed: new Date("2026-09-22") }),
      exercise("Développé couché barre", { muscleMappings: DELTS, lastUsed: new Date("2026-09-22") }),
      exercise("Squat barre", { muscleMappings: QUADS, lastUsed: new Date("2026-09-22") }),
    ];
    const donors = muscleProfileDonors(exercise("Rowing T-bar Panatta"), catalog).map((d) => d.name);
    expect(donors).toEqual(["Rowing machine assis"]);
  });

  it("ne propose jamais un exercice lui-même sans muscles", () => {
    const donors = muscleProfileDonors(exercise("Machine orpheline bis"), CATALOG).map((d) => d.name);
    expect(donors).not.toContain("Machine orpheline");
  });

  it("ne propose rien plutôt qu'un hasard", () => {
    expect(muscleProfileDonors(exercise("Glute kickback"), CATALOG)).toEqual([]);
  });

  it("copie le profil sans écraser un réglage explicite", () => {
    const donor = CATALOG[0];
    const adopted = withDonorProfile(exercise("Leg Press Technogym"), donor);
    expect(adopted.muscleMappings).toEqual(QUADS);
    expect(adopted.muscleMappings).not.toBe(donor.muscleMappings);
    expect(adopted.category).toBe("Legs");
    expect(adopted.movementPattern).toBe(MovementPattern.squat);

    const explicit = withDonorProfile(exercise("Leg Press Technogym", { category: "Jambes", movementPattern: MovementPattern.hinge }), donor);
    expect(explicit.category).toBe("Jambes");
    expect(explicit.movementPattern).toBe(MovementPattern.hinge);
  });
});
