import { describe, expect, it } from "vitest";

import { pruneEmptyExercisesForFinish } from "@/lib/store/workout";
import type { LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

function set(id: string, completed = true): LoggedSet {
  return {
    id,
    weight: 10,
    reps: 8,
    setType: "work",
    timestamp: new Date(`2026-08-04T12:00:0${id.slice(-1)}Z`),
    setSlotIndex: 0,
    completed,
    supersetRoundIndex: 1,
  };
}

function exercise(id: string, orderIndex: number, sets: LoggedSet[], group = "group"): LoggedExercise {
  return {
    id,
    orderIndex,
    notes: "",
    exerciseId: `catalog-${id}`,
    exerciseName: id,
    sets,
    supersetGroupId: group,
    plateauWeakPoint: null,
  };
}

function session(exercises: LoggedExercise[]): WorkoutSession {
  return {
    id: "session",
    date: new Date("2026-08-04T12:00:00Z"),
    startTime: new Date("2026-08-04T12:00:00Z"),
    endTime: null,
    notes: "",
    isActive: true,
    templateName: null,
    exercises,
    supersetGroups: [{ id: "group", orderIndex: 0, memberOrder: exercises.map((item) => item.id) }],
    cardioEntries: [],
  };
}

describe("pruneEmptyExercisesForFinish", () => {
  it("supprime les exercices sans set validé et conserve un groupe encore valide", () => {
    const result = pruneEmptyExercisesForFinish(session([
      exercise("a", 0, [set("set-1")]),
      exercise("b", 1, []),
      exercise("c", 2, [set("set-2")]),
    ]));

    expect(result.exercises.map((item) => [item.id, item.orderIndex])).toEqual([["a", 0], ["c", 1]]);
    expect(result.supersetGroups).toHaveLength(1);
    expect(result.supersetGroups[0].memberOrder).toEqual(["a", "c"]);
  });

  it("dissout un groupe devenu solo et efface ses rounds", () => {
    const result = pruneEmptyExercisesForFinish(session([
      exercise("a", 0, [set("set-1")]),
      exercise("b", 1, [set("set-2", false)]),
    ]));

    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].supersetGroupId).toBeNull();
    expect(result.exercises[0].sets[0].supersetRoundIndex).toBeNull();
    expect(result.supersetGroups).toEqual([]);
  });
});
