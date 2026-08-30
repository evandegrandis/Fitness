import { describe, expect, it } from "vitest";

import {
  localExercisesRequiredBySessions,
  localSessionsMissingFromServer,
  mergeServerHistoryWithoutDroppingLocal,
} from "@/lib/sync/local-session-recovery";
import type { Exercise, WorkoutSession } from "@/lib/models/types";

function session(id: string, options: { active?: boolean; completed?: boolean } = {}): WorkoutSession {
  const date = new Date("2026-08-24T10:00:00.000Z");
  return {
    id,
    date,
    startTime: date,
    endTime: options.active ? null : date,
    notes: "",
    isActive: options.active ?? false,
    templateName: null,
    supersetGroups: [],
    cardioEntries: [],
    exercises: [
      {
        id: `logged-${id}`,
        orderIndex: 0,
        notes: "",
        exerciseId: "exercise-local",
        exerciseName: "Machine locale",
        supersetGroupId: null,
        plateauWeakPoint: null,
        sets: [
          {
            id: `set-${id}`,
            weight: 50,
            reps: 8,
            setType: "work",
            timestamp: date,
            setSlotIndex: 0,
            completed: options.completed ?? true,
            supersetRoundIndex: null,
          },
        ],
      },
    ],
  };
}

describe("récupération additive des séances locales", () => {
  it("repère une séance locale finie absente du serveur sans prendre une active ou un brouillon vide", () => {
    expect(
      localSessionsMissingFromServer(
        [session("missing"), session("active", { active: true }), session("empty", { completed: false })],
        [session("known")]
      ).map((item) => item.id)
    ).toEqual(["missing"]);
  });

  it("conserve toutes les séances locales absentes lors d'une fusion de snapshot", () => {
    const server = session("server");
    const localOnly = session("local-only");
    expect(mergeServerHistoryWithoutDroppingLocal([server], [localOnly]).map((item) => item.id)).toEqual([
      "server",
      "local-only",
    ]);
  });

  it("met d'abord en évidence l'exercice local requis par une séance à récupérer", () => {
    const localExercise = { id: "exercise-local" } as Exercise;
    const unrelated = { id: "other" } as Exercise;
    expect(localExercisesRequiredBySessions([session("missing")], [localExercise, unrelated], [])).toEqual([
      localExercise,
    ]);
  });
});
