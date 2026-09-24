import { describe, expect, it } from "vitest";
import { adoptServerProfile, exercisesAwaitingBarbis, needsBarbisProfile, type ServerProfile } from "@/lib/integrations/barbis";
import { parseBarbisProfile } from "@/lib/integrations/barbis-profile-input";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, WorkoutSession } from "@/lib/models/types";

const NOW = new Date("2026-09-24T18:00:00Z");

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "row-fp", name: "Low row Fitness Park", category: "", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [], lastUsed: null, movementPattern: null,
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null, maxLoad: 90, profileSource: null, ...overrides,
  };
}

function session(date: Date, exerciseIds: string[]): WorkoutSession {
  return {
    id: `s-${date.toISOString()}`, date, endTime: date, isActive: false, notes: "", supersetGroups: [],
    exercises: exerciseIds.map((exerciseId, orderIndex) => ({ id: `l-${exerciseId}`, exerciseId, orderIndex, sets: [] })),
  } as unknown as WorkoutSession;
}

const barbisProfile: ServerProfile = {
  id: "row-fp",
  muscleMappings: [
    { muscleGroup: MuscleGroup.latInf, coefficient: 1 },
    { muscleGroup: MuscleGroup.trapMid, coefficient: 0.6 },
  ],
  profileSource: "barbis",
  movementPattern: "horizontal_pull",
  fatigueClass: "medium",
  category: "Pull",
  equivalenceKey: "low row",
};

describe("profil à confier à Barbis", () => {
  it("absent, copié ou reconnu par le nom : Barbis peut l'améliorer ; réglé à la main ou déjà cherché : non", () => {
    expect([null, undefined, "known_profile", "donor"].every((s) => needsBarbisProfile(s as never))).toBe(true);
    expect(["legacy", "barbis", "user"].some((s) => needsBarbisProfile(s as never))).toBe(false);
  });

  it("guette la machine créée pendant la séance en cours, pas un vieil exercice ni un exercice du catalogue", () => {
    const created = exercise();
    const old = exercise({ id: "old", name: "Vieille machine" });
    const catalogOne = exercise({ id: "cat", createdByUser: false });
    const active = { ...session(NOW, ["row-fp", "cat"]), isActive: true };
    const history = [session(new Date(NOW.getTime() - 10 * 86_400_000), ["old"])];
    expect(exercisesAwaitingBarbis([created, old, catalogOne], history, active, NOW)).toEqual(["row-fp"]);
  });

  it("continue de guetter au retour du réseau, jusqu'à deux jours après la séance", () => {
    const yesterday = [session(new Date(NOW.getTime() - 20 * 3_600_000), ["row-fp"])];
    expect(exercisesAwaitingBarbis([exercise()], yesterday, null, NOW)).toEqual(["row-fp"]);
    const tooOld = [session(new Date(NOW.getTime() - 50 * 3_600_000), ["row-fp"])];
    expect(exercisesAwaitingBarbis([exercise()], tooOld, null, NOW)).toEqual([]);
  });
});

describe("adoption du profil écrit par Barbis", () => {
  it("remplace un profil absent ou copié, sans toucher la charge max saisie hors-ligne", () => {
    const adopted = adoptServerProfile(exercise({ maxLoad: 95 }), barbisProfile);
    expect(adopted?.muscleMappings).toHaveLength(2);
    expect(adopted?.profileSource).toBe("barbis");
    expect(adopted?.maxLoad).toBe(95);
    expect(adopted?.category).toBe("Pull");
    expect(adopted?.equivalenceKey).toBe("low row");
    const donor = exercise({ profileSource: "donor", muscleMappings: [{ muscleGroup: MuscleGroup.latSup, coefficient: 1 }] });
    expect(adoptServerProfile(donor, barbisProfile)?.profileSource).toBe("barbis");
  });

  it("n'écrase jamais un profil réglé à la main sur le téléphone", () => {
    const manual = exercise({ profileSource: "user", muscleMappings: [{ muscleGroup: MuscleGroup.trapMid, coefficient: 1 }] });
    expect(adoptServerProfile(manual, barbisProfile)).toBeNull();
  });

  it("ignore une réponse serveur sans muscles et garde la catégorie choisie", () => {
    expect(adoptServerProfile(exercise(), { ...barbisProfile, muscleMappings: [] })).toBeNull();
    expect(adoptServerProfile(exercise({ category: "Arms" }), barbisProfile)?.category).toBe("Arms");
  });
});

describe("contrat POST /api/barbis/exercise-profile", () => {
  const valid = {
    exerciseId: "row-fp",
    muscleMappings: [
      { muscleGroup: "lat_inf", coefficient: 1 },
      { muscleGroup: "biceps_long", coefficient: 0.3 },
    ],
    movementPattern: "horizontal_pull",
    fatigueClass: "medium",
    category: "Pull",
    equivalentToExerciseId: "row-onair",
  };

  it("accepte un profil conforme à la taxonomie", () => {
    expect(parseBarbisProfile(valid).muscleMappings).toHaveLength(2);
  });

  it.each([
    ["un muscle inconnu", { muscleMappings: [{ muscleGroup: "dorsaux", coefficient: 1 }] }],
    ["un coefficient au-delà de 1", { muscleMappings: [{ muscleGroup: "lat_inf", coefficient: 1.5 }] }],
    ["un coefficient nul", { muscleMappings: [{ muscleGroup: "lat_inf", coefficient: 1 }, { muscleGroup: "trap_mid", coefficient: 0 }] }],
    ["un muscle en double", { muscleMappings: [{ muscleGroup: "lat_inf", coefficient: 1 }, { muscleGroup: "lat_inf", coefficient: 0.3 }] }],
    ["aucun moteur principal", { muscleMappings: [{ muscleGroup: "lat_inf", coefficient: 0.3 }] }],
    ["un schéma de mouvement inconnu", { movementPattern: "row" }],
    ["une catégorie inconnue", { category: "Dos" }],
  ])("refuse %s", (_label, patch) => {
    expect(() => parseBarbisProfile({ ...valid, ...patch })).toThrow();
  });
});
