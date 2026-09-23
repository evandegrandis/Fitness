import { describe, expect, it } from "vitest";

import type { Exercise, WorkoutSession } from "@/lib/models/types";
import { countRecordSetsInSession, groupSessionsByIsoWeek } from "./historyHelpers";

const EXERCISE: Exercise = {
  id: "pull-up",
  name: "Tractions SN",
  category: "pull",
  setPatternMode: "straight",
  repTargetMin: 8,
  repTargetMax: 12,
  smallestIncrement: 1.25,
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

function session(id: string, startIso: string, reps: number, setCount = 1): WorkoutSession {
  return {
    id,
    // Deux entraînements ont la même date métier; seul startTime les ordonne.
    date: new Date("2026-08-03T00:00:00.000Z"),
    startTime: new Date(startIso),
    endTime: new Date(new Date(startIso).getTime() + 3_600_000),
    notes: "",
    isActive: false,
    templateName: null,
    supersetGroups: [],
    cardioEntries: [],
    exercises: [
      {
        id: `logged-${id}`,
        exerciseId: EXERCISE.id,
        exerciseName: EXERCISE.name,
        orderIndex: 0,
        notes: "",
        supersetGroupId: null,
        plateauWeakPoint: null,
        sets: Array.from({ length: setCount }, (_, i) => ({
          id: i === 0 ? `set-${id}` : `set-${id}-${i}`,
          weight: 0,
          reps,
          setType: "work" as const,
          timestamp: new Date(new Date(startIso).getTime() + 60_000 + i * 180_000),
          setSlotIndex: i,
          completed: true,
          supersetRoundIndex: null,
        })),
      },
    ],
  };
}

describe("ordre déterministe de l'historique", () => {
  it("garde les séances d'un même jour en ordre startTime décroissant", () => {
    const morning = session("morning", "2026-08-03T08:00:00.000Z", 10);
    const evening = session("evening", "2026-08-03T18:00:00.000Z", 12);

    const [week] = groupSessionsByIsoWeek([morning, evening]);
    expect(week.sessions.map((item) => item.id)).toEqual(["evening", "morning"]);
  });

  it("compte comme PR une amélioration lors de la deuxième séance du même jour", () => {
    // Le matin est la première séance de l'exercice : 3 séries qui posent la référence.
    const morning = session("morning", "2026-08-03T08:00:00.000Z", 10, 3);
    const evening = session("evening", "2026-08-03T18:00:00.000Z", 12);
    const unordered = [evening, morning];

    expect(countRecordSetsInSession(morning, unordered, [EXERCISE])).toBe(0);
    expect(countRecordSetsInSession(evening, unordered, [EXERCISE])).toBe(1);
  });
});
