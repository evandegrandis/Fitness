import { describe, expect, it } from "vitest";

import { exercisesReferencedBySession } from "../session-dependencies";
import type { Exercise, WorkoutSession } from "@/lib/models/types";

const base: Omit<Exercise, "id" | "name"> = {
  category: "push", setPatternMode: "straight", repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5,
  isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 120, machineSetting: "", setupNotes: "",
  benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
  muscleMappings: [], lastUsed: null, movementPattern: null, resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
};

describe("exercisesReferencedBySession", () => {
  it("joint à la séance exactement les fiches des exercices qu'elle référence", () => {
    const catalog: Exercise[] = [
      { ...base, id: "upper-back", name: "Upper back" },
      { ...base, id: "dips", name: "Dips" },
      { ...base, id: "inutile", name: "Autre" },
    ];
    const session: WorkoutSession = {
      id: "s", date: new Date(), startTime: new Date(), endTime: new Date(), notes: "", isActive: false, templateName: null,
      exercises: [
        { id: "l1", exerciseId: "upper-back", exerciseName: "Upper back", orderIndex: 0, notes: "", sets: [], plateauWeakPoint: null, supersetGroupId: null },
        { id: "l2", exerciseId: "dips", exerciseName: "Dips", orderIndex: 1, notes: "", sets: [], plateauWeakPoint: null, supersetGroupId: null },
      ],
      supersetGroups: [], cardioEntries: [],
    };
    expect(exercisesReferencedBySession(session, catalog).map((exercise) => exercise.id)).toEqual(["upper-back", "dips"]);
  });
});
