import { describe, expect, it } from "vitest";

import type { ExerciseReview, SessionReview } from "@/lib/engines/bilan";
import { cutAt, heldReference, rankLetter, rankSession, SESSION_RANK } from "@/lib/engines/session-rank";
import type { Exercise, UserSettings } from "@/lib/models/types";

function exerciseReview(overrides: Partial<ExerciseReview>): ExerciseReview {
  return {
    loggedExerciseId: "le", exerciseId: "ex", exerciseName: "Ex", parent: null, noData: false, calibrating: false,
    performed: false, referenceWeight: 80, referenceReps: 10, achievedWeight: 80, achievedReps: 10, gapKg: 0, gapReps: 0,
    performedMessage: "", antiPlateauFailed: false, recordKinds: [], recordAchievements: [],
    ambition: { tooAmbitious: false, notAmbitiousEnough: false, underMinCount: 0, totalWorkSets: 3 },
    plateau: {
      wasInPlateau: false, plateauCounterBefore: 0, plateauStalledDaysBefore: null, brokenToday: false,
      enteringOrOngoing: false, message: null, suggestedVariant: null, weakPoint: null, needsWeakPointCapture: false,
    },
    ...overrides,
  };
}

function review(exercises: ExerciseReview[]): SessionReview {
  return { exercises } as unknown as SessionReview;
}

const catalog = new Map<string, Exercise>();
const above = (id: string) => exerciseReview({ exerciseId: id, performed: true, achievedReps: 11 });
const heldEx = (id: string) => exerciseReview({ exerciseId: id, achievedReps: 10 });
const below = (id: string) => exerciseReview({ exerciseId: id, achievedWeight: 70, achievedReps: 8 });

describe("rang de fin de séance", () => {
  it("S à 85, A à 70, B à 55, C en dessous", () => {
    expect([90, 85, 84, 70, 69, 55, 54, 0].map(rankLetter)).toEqual(["S", "S", "A", "A", "B", "B", "C", "C"]);
  });

  it("tout au-dessus, trois records, volume habituel : 100, rang S", () => {
    const rank = rankSession({ review: review([above("a"), above("b"), above("c")]), catalog, records: 3, effectiveSets: 16, habitSets: 16, cut: false });
    expect(rank).toMatchObject({ letter: "S", score: 100, performed: 3, rated: 3 });
  });

  it("une charge tenue vaut une demi-réussite, et une réussite entière en sèche", () => {
    const exercises = [above("a"), heldEx("b"), below("c"), heldEx("d")];
    const normal = rankSession({ review: review(exercises), catalog, records: 0, effectiveSets: 16, habitSets: 16, cut: false })!;
    const cut = rankSession({ review: review(exercises), catalog, records: 0, effectiveSets: 16, habitSets: 16, cut: true })!;
    expect(normal.held).toBe(2);
    expect(normal.score).toBe(Math.round(100 * (0.55 * (1 + 2 * 0.5) / 4 + 0.2)));
    expect(cut.score).toBe(Math.round(100 * (0.55 * 3 / 4 + 0.2)));
  });

  it("une séance courte plafonne au rang B, même parfaite", () => {
    const rank = rankSession({ review: review([above("a"), above("b")]), catalog, records: 3, effectiveSets: 6, habitSets: 16, cut: false })!;
    expect(rank.letter).toBe("B");
    expect(rank.score).toBe(SESSION_RANK.THRESHOLDS.A - 1);
  });

  it("pas de rang pour une séance d'étalonnage", () => {
    const calibration = [exerciseReview({ calibrating: true }), exerciseReview({ calibrating: true }), above("a")];
    expect(rankSession({ review: review(calibration), catalog, records: 0, effectiveSets: 10, habitSets: 10, cut: false })).toBeNull();
  });

  it("au poids du corps, tenir c'est à une rep près ; un exercice assisté n'est jamais « tenu »", () => {
    const bodyweight = exerciseReview({ referenceWeight: 0, achievedWeight: 0, referenceReps: 10, achievedReps: 9 });
    expect(heldReference(bodyweight, undefined)).toBe(true);
    expect(heldReference({ ...bodyweight, achievedReps: 8 }, undefined)).toBe(false);
    const assisted = { setPatternMode: "assisted_bodyweight" } as Exercise;
    expect(heldReference(exerciseReview({ achievedReps: 10 }), assisted)).toBe(false);
  });

  it("sèche : déclarée, ou mesurée sur les pesées des 28 jours précédents", () => {
    const settings = { trainingPhase: null, trainingPhaseStartedAt: null } as Pick<UserSettings, "trainingPhase" | "trainingPhaseStartedAt">;
    const day = (n: number) => new Date(Date.UTC(2026, 8, n, 7));
    const losing = Array.from({ length: 22 }, (_, i) => ({ id: `w${i}`, measuredOn: day(1 + i), weightKg: 76 - i * 0.1 }));
    const stable = losing.map((entry) => ({ ...entry, weightKg: 75 }));
    expect(cutAt(day(23), losing, settings)).toBe(true);
    expect(cutAt(day(23), stable, settings)).toBe(false);
    expect(cutAt(day(23), stable, { trainingPhase: "cut", trainingPhaseStartedAt: day(10) })).toBe(true);
    expect(cutAt(day(5), stable, { trainingPhase: "cut", trainingPhaseStartedAt: day(10) })).toBe(false);
  });
});
