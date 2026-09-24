import { describe, expect, it } from "vitest";
import { machineMaxStatus, machinesForMaxTracking } from "@/lib/engines/machine-max";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const NOW = new Date("2026-09-24T18:00:00Z");
function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "abs", name: "Abdominal LifeFitness", category: "Core", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.absHaut, coefficient: 1 }],
    lastUsed: null, movementPattern: "isolation", resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: 85, ...overrides,
  };
}
const set = (weight: number, reps: number, minutesAgo: number): LoggedSet => ({
  id: `s-${weight}-${reps}-${minutesAgo}`, weight, reps, setType: SetType.work,
  timestamp: new Date(NOW.getTime() - minutesAgo * 60_000), setSlotIndex: 0, completed: true, supersetRoundIndex: null,
});

describe("machine maxée", () => {
  it("l'est quand une vraie série atteint le bout de pile", () => {
    const status = machineMaxStatus(exercise(), [set(80, 10, 30), set(85, 12, 20)]);
    expect(status.maxed).toBe(true);
    expect(status.progress).toBe(1);
  });

  it("ne l'est pas pour 2 reps à la charge max : il faut le minimum de la fourchette", () => {
    const status = machineMaxStatus(exercise(), [set(80, 10, 30), set(85, 2, 20)]);
    expect(status.maxed).toBe(false);
    expect(status.bestLoad).toBe(80);
    expect(status.progress).toBeCloseTo(80 / 85, 5);
  });

  it("sans charge max connue, pas de progression inventée", () => {
    const status = machineMaxStatus(exercise({ maxLoad: null }), [set(80, 10, 30)]);
    expect(status.maxLoad).toBeNull();
    expect(status.progress).toBeNull();
    expect(status.maxed).toBe(false);
  });

  it("liste les machines chargées de la salle du moment, les plus récentes d'abord", () => {
    const old = exercise({ id: "old", name: "Chest Press", maxLoad: null });
    const recent = exercise();
    const bodyweight = exercise({ id: "hspu", name: "HSPU", maxLoad: null });
    const session = (id: string, daysAgo: number, ex: Exercise, sets: LoggedSet[]): WorkoutSession => ({
      id, date: new Date(NOW.getTime() - daysAgo * 86_400_000), startTime: NOW, endTime: NOW, notes: "", isActive: false,
      templateName: null, supersetGroups: [], cardioEntries: [],
      exercises: [{ id: `le-${id}`, orderIndex: 0, notes: "", exerciseId: ex.id, exerciseName: ex.name, sets, supersetGroupId: null, plateauWeakPoint: null }],
    });
    const history = [
      session("a", 2, recent, [set(85, 12, 60)]),
      session("b", 5, bodyweight, [set(0, 15, 60)]),
      session("c", 90, old, [set(100, 10, 60)]),
    ];
    expect(machinesForMaxTracking([old, recent, bodyweight], history, NOW).map((m) => m.exercise.id)).toEqual(["abs"]);
  });
});
