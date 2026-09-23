import { describe, expect, it } from "vitest";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import { buildFinishedWorkoutSnapshot } from "@/lib/store/snapshot";

const EXERCISE: Exercise = {
  id: "exercise",
  name: "Dips",
  category: "push",
  setPatternMode: "bodyweight",
  repTargetMin: 8,
  repTargetMax: 15,
  smallestIncrement: 1,
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
  muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

function loggedSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 0,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-08-09T10:05:00"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function session(sets: LoggedSet[]): WorkoutSession {
  const date = new Date("2026-08-09T10:00:00");
  return {
    id: "session",
    date,
    startTime: date,
    endTime: new Date("2026-08-09T11:00:00"),
    notes: "",
    isActive: false,
    templateName: null,
    exercises: [
      {
        id: "logged",
        orderIndex: 0,
        notes: "",
        exerciseId: EXERCISE.id,
        exerciseName: EXERCISE.name,
        sets,
        supersetGroupId: null,
        plateauWeakPoint: null,
      },
    ],
    supersetGroups: [],
  };
}

describe("buildFinishedWorkoutSnapshot", () => {
  it("compte une séance finisher-only dans le volume, les exercices et sa piste PR dédiée", () => {
    const finisher = loggedSet({ id: "finisher", reps: 16, setType: SetType.finisher });
    const snapshot = buildFinishedWorkoutSnapshot({
      session: session([finisher]),
      exercises: [EXERCISE],
      justHitRecord: { [finisher.id]: "finisherReps" },
      finishedSessions: [],
      goals: [],
    });

    expect(snapshot.setCount).toBe(1);
    expect(snapshot.exerciseCount).toBe(1);
    expect(snapshot.prCount).toBe(1);
    expect(snapshot.prHighlights).toEqual([{ title: "Dips", detail: "PDC×16 · finisher" }]);
    expect(snapshot.topMuscles.length).toBeGreaterThan(0);
  });

  it("ne compte et n'affiche que le lead d'un composite comme PR normal", () => {
    const started = new Date("2026-08-09T10:05:00");
    const lead = loggedSet({ id: "lead", weight: 100, reps: 4, timestamp: started });
    const continuation = loggedSet({
      id: "continuation",
      weight: 75,
      reps: 4,
      setType: SetType.backoff,
      setSlotIndex: 1,
      timestamp: new Date(started.getTime() + 10_000),
    });
    const snapshot = buildFinishedWorkoutSnapshot({
      session: session([lead, continuation]),
      exercises: [EXERCISE],
      // Même avec un vieux marqueur incohérent, le snapshot reste aligné sur
      // la série logique et ne laisse pas remonter la continuation.
      justHitRecord: { lead: "heaviestWeight", continuation: "repsAtWeight" },
      finishedSessions: [],
      goals: [],
    });

    expect(snapshot.setCount).toBe(1);
    expect(snapshot.prCount).toBe(1);
    expect(snapshot.prHighlights).toEqual([{ title: "Dips", detail: "100×4" }]);
  });
});
