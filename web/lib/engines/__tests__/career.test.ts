import { describe, expect, it } from "vitest";

import { buildCareer, milestoneLabel } from "@/lib/engines/career";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;
const START = new Date("2026-06-01T17:00:00");

function exercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "ex", name: "Ex", category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 1,
    isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.deltLat, coefficient: 1 }], lastUsed: null, movementPattern: "isolation",
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null, ...overrides,
  };
}

/** Élévations latérales (repère libre) et Pec deck (repère machine, indicatif). */
const LATERAL = exercise({ id: "lat", name: "Lateral raises", strengthStandardKey: "Lateral raises", benchmarkUnit: "load" });
const PEC = exercise({ id: "pec", name: "Pec deck", strengthStandardKey: "Pec deck", benchmarkUnit: "load", muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }] });

const SETTINGS: UserSettings = {
  usesKilograms: true, defaultSmallestIncrement: 2.5, defaultRestTimerSeconds: 90, defaultRepTargetMin: 8, defaultRepTargetMax: 12,
  userName: "Evan", supersetRestSeconds: 180, bodyWeightKg: 73.7, gender: "male", ageYears: 26, trainingPhase: null,
  trainingPhaseStartedAt: null, weeklyCardioMinutesGoal: null,
};

function session(index: number, lateral: number, pec: number, hour = 17): WorkoutSession {
  const date = new Date(START.getTime() + index * 2 * DAY);
  date.setHours(hour);
  const sets = (prefix: string, weight: number): LoggedSet[] =>
    [0, 1, 2].map((k) => ({
      id: `${prefix}-${index}-${k}`, weight, reps: 10, setType: "work", timestamp: new Date(date.getTime() + (k * 3 + (prefix === "pec" ? 12 : 0)) * 60_000),
      setSlotIndex: k, completed: true, supersetRoundIndex: null,
    }));
  return {
    id: `s${index}`, date, startTime: date, endTime: new Date(date.getTime() + 3_600_000), notes: "", isActive: false,
    templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: [
      { id: `le-lat-${index}`, orderIndex: 0, notes: "", exerciseId: LATERAL.id, exerciseName: LATERAL.name, sets: sets("lat", lateral), supersetGroupId: null, plateauWeakPoint: null },
      { id: `le-pec-${index}`, orderIndex: 1, notes: "", exerciseId: PEC.id, exerciseName: PEC.name, sets: sets("pec", pec), supersetGroupId: null, plateauWeakPoint: null },
    ],
  };
}

const history = Array.from({ length: 10 }, (_, i) => session(i, 8 + i, 60 + i * 20, i === 4 ? 6 : 17));
const career = buildCareer({ history, catalog: [LATERAL, PEC], goals: [], bodyWeights: [], settings: SETTINGS, now: new Date(START.getTime() + 25 * DAY) });

describe("parcours recalculé sur le passé", () => {
  it("donne un rang à chaque séance passée ; la première, en étalonnage, sur son seul volume", () => {
    // 6 séries sur 22, sans record possible ni RIR saisi.
    expect(career.bySession.get("s0")?.rank).toMatchObject({ letter: "C", score: Math.round((100 * 6) / 22), rated: 0 });
    expect(career.bySession.get("s5")?.rank?.letter).toMatch(/[SABC]/);
  });

  it("Discipline : la meilleure série face à la cible affichée sur la 1re série, comme le bilan", () => {
    const past = session(0, 10, 60);
    const shown = (target: [number, number]): WorkoutSession => {
      const today = session(1, 10, 60);
      const [lateral] = today.exercises;
      return { ...today, exercises: [{ ...lateral, sets: lateral.sets.map((set) => ({ ...set, suggestedWeight: target[0], suggestedReps: target[1] })) }] };
    };
    const rankOf = (today: WorkoutSession) =>
      buildCareer({ history: [past, today], catalog: [LATERAL, PEC], goals: [], bodyWeights: [], settings: SETTINGS, now: today.date }).bySession.get(today.id)?.rank;
    // 10 kg × 10 face à une cible de 10 × 12 : ni battue ni tenue ; 10 × 11 : tenue ; 10 × 10 : atteinte.
    expect(rankOf(shown([10, 12]))).toMatchObject({ rated: 1, performed: 0, held: 0 });
    expect(rankOf(shown([10, 11]))).toMatchObject({ rated: 1, performed: 0, held: 1 });
    expect(rankOf(shown([10, 10]))).toMatchObject({ rated: 1, performed: 1, held: 0 });
  });

  it("date chaque jalon à la séance qui l'a décroché", () => {
    const sessions = career.milestones.find((milestone) => milestone.family === "sessions")!;
    expect(sessions.value).toBe(10);
    expect(sessions.reached).toEqual([{ tier: 10, date: history[9].date, sessionId: "s9" }]);
    expect(sessions.next).toBe(25);
    expect(career.bySession.get("s9")?.unlocks).toContainEqual({ kind: "milestone", family: "sessions", tier: 10, label: milestoneLabel("sessions", 10) });
  });

  it("le jalon de niveau ignore les repères machine, indicatifs", () => {
    const level = career.milestones.find((milestone) => milestone.family === "level")!;
    // Les latérales montent de 8 à 17 kg : le niveau vient d'elles, jamais du Pec deck à 240 kg.
    expect(level.value).toBeGreaterThan(0);
    expect(level.value).toBeLessThan(5);
  });

  it("un secret se débloque à la séance qui remplit sa condition, une seule fois", () => {
    const dawn = career.secrets.filter((secret) => secret.id === "aube");
    expect(dawn).toHaveLength(1);
    expect(dawn[0].sessionId).toBe("s4");
    expect(career.bySession.get("s4")?.unlocks.some((unlock) => unlock.kind === "secret" && unlock.id === "aube")).toBe(true);
  });
});
