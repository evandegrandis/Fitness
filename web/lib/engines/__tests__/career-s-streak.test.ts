import { describe, expect, it } from "vitest";

import { buildCareer } from "@/lib/engines/career";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;
const START = new Date("2026-06-01T17:00:00");

const SETTINGS: UserSettings = {
  usesKilograms: true, defaultSmallestIncrement: 2.5, defaultRestTimerSeconds: 90, defaultRepTargetMin: 8, defaultRepTargetMax: 12,
  userName: "Evan", supersetRestSeconds: 180, bodyWeightKg: 73.7, gender: "male", ageYears: 26, trainingPhase: null,
  trainingPhaseStartedAt: null, weeklyCardioMinutesGoal: null,
};

function exercise(id: string): Exercise {
  return {
    id, name: id, category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 1,
    isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }], lastUsed: null, movementPattern: "isolation",
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  };
}

/**
 * Chaque séance porte sur une machine neuve : séance d'étalonnage, classée sur ses seules séries
 * (20 séries = S, 5 = C). `sets = 0` : séance sans série (cardio seule), donc sans rang.
 */
function session(index: number, sets: number): WorkoutSession {
  const date = new Date(START.getTime() + index * 2 * DAY);
  const id = `m${index}`;
  const logged: LoggedSet[] = Array.from({ length: sets }, (_, k) => ({
    id: `${id}-${k}`, weight: 40, reps: 10, setType: "work", timestamp: new Date(date.getTime() + k * 3 * 60_000),
    setSlotIndex: k, completed: true, supersetRoundIndex: null,
  }));
  return {
    id: `s${index}`, date, startTime: date, endTime: new Date(date.getTime() + 3_600_000), notes: "", isActive: false,
    templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: sets > 0 ? [{ id: `le-${index}`, orderIndex: 0, notes: "", exerciseId: id, exerciseName: id, sets: logged, supersetGroupId: null, plateauWeakPoint: null }] : [],
  };
}

describe("série de rangs S d'affilée", () => {
  // S S C S S [sans série] S
  const plan = [20, 20, 5, 20, 20, 0, 20];
  const history = plan.map((sets, index) => session(index, sets));
  const catalog = plan.map((_, index) => exercise(`m${index}`));
  const career = buildCareer({ history, catalog, goals: [], bodyWeights: [], settings: SETTINGS, now: new Date(START.getTime() + 20 * DAY) });
  const streakOf = (index: number) => career.bySession.get(`s${index}`)?.sStreak;

  it("compte les S d'affilée séance par séance, et repart de zéro après un autre rang", () => {
    expect(career.bySession.get("s0")?.rank?.letter).toBe("S");
    expect(career.bySession.get("s2")?.rank?.letter).toBe("C");
    expect([0, 1, 2, 3, 4].map(streakOf)).toEqual([1, 2, 0, 1, 2]);
  });

  it("une séance sans rang ne casse pas la série : la suivante la prolonge", () => {
    expect(career.bySession.get("s5")?.rank).toBeNull();
    expect(streakOf(5)).toBe(0);
    expect(streakOf(6)).toBe(3);
    expect(career.sStreak).toEqual({ current: 3, best: 3 });
  });

  it("garde la plus longue série quand la courante est retombée", () => {
    const withC = [...history, session(7, 5)];
    const after = buildCareer({ history: withC, catalog: [...catalog, exercise("m7")], goals: [], bodyWeights: [], settings: SETTINGS, now: new Date(START.getTime() + 20 * DAY) });
    expect(after.sStreak).toEqual({ current: 0, best: 3 });
  });
});
