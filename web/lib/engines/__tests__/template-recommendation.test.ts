import { describe, expect, it } from "vitest";
import { recommendTemplateId } from "@/lib/engines/template-recommendation";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, WorkoutSession, WorkoutTemplate } from "@/lib/models/types";

function exercise(id: string, name: string, muscleGroup: MuscleGroup): Exercise {
  return {
    id, name, category: "test", setPatternMode: "straight", repTargetMin: 6, repTargetMax: 12,
    smallestIncrement: 2, isFavorite: false, createdByUser: false, sortOrder: 0,
    suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup, coefficient: 1 }], lastUsed: null, movementPattern: null,
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  };
}

function template(id: string, exercises: Exercise[]): WorkoutTemplate {
  return {
    id, name: id, createdAt: new Date(0), sortOrder: 0,
    exercises: exercises.map((item, orderIndex) => ({ exerciseName: item.name, orderIndex, targetSets: 3 })),
  };
}

function historicalSession(exercises: Exercise[], daysAgo: number): WorkoutSession {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return {
    id: `session-${daysAgo}`, date, startTime: date, endTime: date, notes: "", isActive: false,
    templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: exercises.map((item, orderIndex) => ({
      id: `logged-${daysAgo}-${item.id}`, orderIndex, notes: "", exerciseId: item.id,
      exerciseName: item.name, supersetGroupId: null, plateauWeakPoint: null,
      sets: [{ id: `set-${daysAgo}-${item.id}`, weight: 20, reps: 10, setType: "work", timestamp: date,
        setSlotIndex: 0, completed: true, supersetRoundIndex: null }],
    })),
  };
}

describe("recommendTemplateId", () => {
  const shoulder = exercise("shoulder", "Élévations latérales", MuscleGroup.deltLat);
  const curl = exercise("curl", "Curl debout", MuscleGroup.bicepsLong);
  const oldBack = exercise("old-back", "Ancien tirage", MuscleGroup.latSup);
  const catalog = [shoulder, curl, oldBack];

  it("utilise réellement les déficits musculaires au lieu de sommer tous les mappings", () => {
    expect(recommendTemplateId(
      [template("ancien-volume", [oldBack, curl]), template("épaules", [shoulder])],
      catalog,
      [{ parent: MuscleParent.deltoides, remaining: 10 }],
      []
    )).toBe("épaules");
  });

  it("s'adapte en quelques séances au nouveau format et ne favorise pas le plus gros template", () => {
    const history = [0, 2, 4].map((days) => historicalSession([shoulder, curl], days));
    expect(recommendTemplateId(
      [template("ancien-volume", [oldBack, oldBack, oldBack]), template("format-récent", [shoulder, curl])],
      catalog,
      [],
      history
    )).toBe("format-récent");
  });
});
