import { describe, expect, it } from "vitest";
import { exerciseRecordSheet } from "@/lib/engines/exercise-records";
import { recordEvents } from "@/lib/engines/progress-stats";
import { MuscleGroup } from "@/lib/models/muscles";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const PRESS: Exercise = {
  id: "ex-press",
  name: "Wide Chest Press",
  category: "push",
  setPatternMode: "straight",
  repTargetMin: 6,
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
  fatigueClass: "heavy",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};
const OLD_MACHINE: Exercise = { ...PRESS, id: "ex-old", name: "Chest Press" };

let n = 0;
function session(day: string, exercise: Exercise, sets: [number, number][]): WorkoutSession {
  const start = new Date(`${day}T18:00:00`);
  const logged = {
    id: `le-${(n += 1)}`,
    orderIndex: 0,
    notes: "",
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    supersetGroupId: null,
    plateauWeakPoint: null,
    sets: sets.map(([weight, reps], index) => ({
      id: `set-${(n += 1)}`,
      weight,
      reps,
      setType: SetType.work,
      timestamp: new Date(start.getTime() + index * 180_000),
      setSlotIndex: index,
      completed: true,
      supersetRoundIndex: null,
    })) as LoggedSet[],
  };
  return { id: `s-${day}-${exercise.id}`, date: start, startTime: start, endTime: start, notes: "", isActive: false, templateName: null, exercises: [logged], supersetGroups: [], cardioEntries: [] } as WorkoutSession;
}

describe("exerciseRecordSheet", () => {
  const history = [
    session("2026-09-10", OLD_MACHINE, [[150, 10]]),
    session("2026-09-29", PRESS, [[100, 10], [110, 6]]),
    session("2026-10-01", PRESS, [[100, 14], [120, 7]]),
    session("2026-10-05", PRESS, [[120, 11], [130, 9]]),
    session("2026-10-06", PRESS, [[130, 9], [135, 8], [125, 8]]),
  ];
  const sheet = exerciseRecordSheet(PRESS, history, recordEvents(history, [PRESS, OLD_MACHINE]));

  it("lit les records de la machine seule, jamais ceux d'une machine équivalente", () => {
    expect(sheet.sessions).toBe(4);
    expect(sheet.heaviest).toMatchObject({ weight: 135, reps: 8 });
  });

  it("meilleure capacité, reps à la charge actuelle", () => {
    expect(sheet.bestCapacity).toMatchObject({ weight: 135, reps: 8 });
    expect(Math.round(sheet.bestCapacity!.e1rm)).toBe(171);
    // Charge de la meilleure série de la dernière séance : 135 kg, 8 reps au mieux.
    expect(sheet.currentLoad).toMatchObject({ weight: 135, bestReps: 8 });
  });

  it("les 5 meilleures séances, la première marquée étalonnage et sans étoile", () => {
    expect(sheet.topSessions.map((entry) => `${entry.weight}x${entry.reps}`)).toEqual(["135x8", "130x9", "120x7", "100x10"]);
    const calibration = sheet.topSessions.find((entry) => entry.calibration)!;
    expect(calibration.stars).toBe(0);
    expect(sheet.topSessions[0].stars).toBeGreaterThan(0);
  });
});
