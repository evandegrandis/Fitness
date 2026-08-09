import { describe, expect, it } from "vitest";

import { comparableSessionPerformances } from "./global-analytics";
import { estimated1RM } from "@/lib/engines/e1rm";
import type { Exercise, LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const EXERCISE: Exercise = {
  id: "exercise",
  name: "Exercice",
  category: "Push",
  setPatternMode: "straight",
  repTargetMin: 8,
  repTargetMax: 12,
  smallestIncrement: 2.5,
  isFavorite: false,
  createdByUser: false,
  sortOrder: 0,
  suggestedRestSeconds: 120,
  machineSetting: "",
  setupNotes: "",
  benchmarkLow: null,
  benchmarkHigh: null,
  fatigueClass: "medium",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

function set(id: string, seconds: number, weight: number, reps: number, slot = 0): LoggedSet {
  return {
    id,
    weight,
    reps,
    setType: "work",
    timestamp: new Date(new Date("2026-08-09T18:00:00Z").getTime() + seconds * 1_000),
    setSlotIndex: slot,
    completed: true,
    supersetRoundIndex: null,
  };
}

function logged(id: string, sets: LoggedSet[]): LoggedExercise {
  return {
    id,
    orderIndex: 0,
    notes: "",
    exerciseId: EXERCISE.id,
    exerciseName: EXERCISE.name,
    sets,
    supersetGroupId: null,
    plateauWeakPoint: null,
  };
}

function session(exercises: LoggedExercise[]): WorkoutSession {
  const date = new Date("2026-08-09T18:00:00Z");
  return {
    id: "session",
    date,
    startTime: date,
    endTime: date,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
    cardioEntries: [],
  };
}

describe("comparableSessionPerformances", () => {
  it("fusionne les occurrences répétées en une seule observation de séance", () => {
    const result = comparableSessionPerformances(
      session([
        logged("first", [set("80", 0, 80, 8)]),
        logged("return", [set("85", 600, 85, 8)]),
      ]),
      new Map([[EXERCISE.id, EXERCISE]])
    );
    expect(result.size).toBe(1);
    expect(result.get(EXERCISE.id)).toEqual({ kind: "weighted", score: estimated1RM(85, 8) });
  });

  it("ne laisse pas une continuation immédiate battre artificiellement un set normal", () => {
    const result = comparableSessionPerformances(
      session([
        logged("only", [
          set("normal", 0, 90, 8, 0),
          set("short", 600, 100, 4, 1),
          set("drop", 615, 97.5, 8, 2),
        ]),
      ]),
      new Map([[EXERCISE.id, EXERCISE]])
    );
    expect(result.get(EXERCISE.id)).toEqual({ kind: "weighted", score: estimated1RM(90, 8) });
  });
});
