import { describe, expect, it } from "vitest";

import type { ExerciseReview, SessionReview } from "@/lib/engines/bilan";
import { cutAt, heldReference, rankLetter, rankSession } from "@/lib/engines/session-rank";
import type { Exercise, LoggedSet, UserSettings } from "@/lib/models/types";

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
const rir = (values: (number | null)[]): LoggedSet[] =>
  values.map((reportedRir, index) => ({
    id: `s${index}`, weight: 20, reps: 10, setType: "work", timestamp: new Date(2026, 8, 26, 18, index), setSlotIndex: index,
    completed: true, supersetRoundIndex: null, reportedRir,
  }));
const allHard = (count: number) => rir(Array.from({ length: count }, () => 1));

describe("rang de fin de séance : séries, records, intensité", () => {
  it("S à 85, A à 70, B à 50, C en dessous", () => {
    expect([90, 85, 84, 70, 69, 50, 49, 0].map(rankLetter)).toEqual(["S", "S", "A", "A", "B", "B", "C", "C"]);
  });

  it("22 séries, 4 records, tout à RIR 2 ou moins : 100", () => {
    const rank = rankSession({ review: review([above("a")]), catalog, sets: 22, records: 4, workSets: allHard(22), cut: false });
    expect(rank).toMatchObject({ letter: "S", score: 100, hardSets: 22, rirSets: 22 });
  });

  it("à records et intensité égaux, plus de séries fait un meilleur rang", () => {
    const at = (sets: number) => rankSession({ review: review([above("a")]), catalog, sets, records: 2, workSets: allHard(sets), cut: false })!;
    expect(at(14).score).toBeLessThan(at(17).score);
    expect(at(17).score).toBeLessThan(at(30).score);
    expect(at(30).score).toBe(Math.round(100 * (0.45 + 0.3 * 0.5 + 0.25)));
  });

  it("les séries à RIR 3 ou plus coûtent : 50 % de séries dures ne vaut plus rien", () => {
    const soft = rankSession({ review: review([above("a")]), catalog, sets: 20, records: 0, workSets: rir([1, 1, 3, 4]), cut: false })!;
    expect(soft.hardSets).toBe(2);
    expect(soft.score).toBe(Math.round(100 * (0.45 * 20 / 22)));
  });

  it("en sèche, deux records valent la note pleine", () => {
    const base = { review: review([above("a")]), catalog, sets: 22, records: 2, workSets: allHard(22) };
    expect(rankSession({ ...base, cut: true })!.score).toBe(100);
    expect(rankSession({ ...base, cut: false })!.score).toBe(Math.round(100 * (0.45 + 0.15 + 0.25)));
  });

  it("sans RIR saisi ni exercice pouvant battre un record, seul le volume compte", () => {
    const rank = rankSession({ review: review([calibrating("a"), calibrating("b")]), catalog, sets: 11, records: 0, workSets: rir([null, null]), cut: false })!;
    expect(rank.score).toBe(50);
    expect(rankSession({ review: review([]), catalog, sets: 0, records: 0, workSets: [], cut: false })).toBeNull();
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
