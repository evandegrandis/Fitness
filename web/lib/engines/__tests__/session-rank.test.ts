import { describe, expect, it } from "vitest";

import type { ExerciseReview, SessionReview } from "@/lib/engines/bilan";
import { cutAt, heldReference, nextRankPlan, rankLetter, rankScore, rankSession } from "@/lib/engines/session-rank";
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
const calibrating = (id: string) => exerciseReview({ exerciseId: id, calibrating: true });

describe("rang de fin de séance : séries et records", () => {
  it("S à 85, A à 65, B à 45, C en dessous", () => {
    expect([90, 85, 84, 65, 64, 45, 44, 0].map(rankLetter)).toEqual(["S", "S", "A", "A", "B", "B", "C", "C"]);
  });

  it("22 séries et 4 records : 100", () => {
    expect(rankSession({ review: review([above("a")]), catalog, sets: 22, records: 4, cut: false })).toMatchObject({ letter: "S", score: 100 });
  });

  it("à records égaux, plus de séries fait un meilleur rang", () => {
    const at = (sets: number) => rankSession({ review: review([above("a")]), catalog, sets, records: 2, cut: false })!;
    expect(at(14).score).toBeLessThan(at(17).score);
    expect(at(17).score).toBeLessThan(at(30).score);
    expect(at(30).score).toBe(Math.round(100 * (0.6 + 0.4 * 0.5)));
  });

  it("en sèche, deux records valent la note pleine", () => {
    const base = { review: review([above("a")]), catalog, sets: 22, records: 2 };
    expect(rankSession({ ...base, cut: true })!.score).toBe(100);
    expect(rankSession({ ...base, cut: false })!.score).toBe(80);
  });

  it("en séance d'étalonnage, seules les séries comptent", () => {
    expect(rankSession({ review: review([calibrating("a"), calibrating("b")]), catalog, sets: 11, records: 0, cut: false })!.score).toBe(50);
    expect(rankSession({ review: review([]), catalog, sets: 0, records: 0, cut: false })).toBeNull();
  });

  it("en séance, dit ce qu'il manque pour le rang suivant : des séries, ou des records", () => {
    // 14 séries, 1 record : 38 + 10 = 48, rang B ; A à 65.
    const input = { sets: 14, records: 1, cut: false, recordsPossible: true };
    expect(rankScore(input)).toBe(48);
    expect(nextRankPlan(input)).toEqual({ letter: "A", sets: 6, records: 2 });
    expect(nextRankPlan({ ...input, recordsPossible: false })).toMatchObject({ records: null });
    expect(nextRankPlan({ sets: 22, records: 4, cut: false, recordsPossible: true })).toBeNull();
  });

  it("tenir = au plus une rep de moins, la série ramenée à la charge de la référence (règle du moteur)", () => {
    const bodyweight = { setPatternMode: "bodyweight", repTargetMin: 6, repTargetMax: 15, smallestIncrement: 2.5 } as Exercise;
    const atBodyweight = exerciseReview({ referenceWeight: 0, achievedWeight: 0, referenceReps: 10, achievedReps: 9 });
    expect(heldReference(atBodyweight, bodyweight)).toBe(true);
    expect(heldReference({ ...atBodyweight, achievedReps: 8 }, bodyweight)).toBe(false);
    // 75 × 10 face à 80 × 10 : 10 − 5 / 5,625 = 9,1, soit 9 reps à 80 kg. Epley ne la tenait pas (100 < 0,97 × 106,7).
    const press = { setPatternMode: "straight", repTargetMin: 6, repTargetMax: 12, smallestIncrement: 2.5 } as Exercise;
    expect(heldReference(exerciseReview({ achievedWeight: 75, achievedReps: 10 }), press)).toBe(true);
    expect(heldReference(exerciseReview({ achievedWeight: 75, achievedReps: 9 }), press)).toBe(false);
    // Assisté : jugé sur la charge effective, comme « battre ».
    const assisted = { setPatternMode: "assisted_bodyweight", repTargetMin: 6, repTargetMax: 12, smallestIncrement: 5 } as Exercise;
    const dips = exerciseReview({ referenceWeight: 20, referenceReps: 10, achievedWeight: 25 });
    expect(heldReference({ ...dips, achievedReps: 10 }, assisted)).toBe(true);
    expect(heldReference({ ...dips, achievedReps: 9 }, assisted)).toBe(false);
    expect(heldReference(exerciseReview({ achievedReps: 9, performed: true }), press)).toBe(false);
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
