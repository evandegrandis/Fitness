/**
 * Incohérences relevées sur les captures d'Evan (septembre 2026), verrouillées une par une.
 * Chaque cas rejoue une situation réelle : série faite, historique, réglages de l'exercice.
 */
import { describe, expect, it } from "vitest";
import { suggest } from "@/lib/engines/progression";
import { collectExerciseHistory } from "@/lib/engines/patterns";
import { startingPointFromEquivalent } from "@/lib/engines/equivalence";
import { headlineSet, lastWorkSession, sameRankSet, staleAgeLabel } from "@/lib/engines/last-session";
import { cleanWeight, formatDecimal, formatLoad } from "@/lib/format";
import { MovementPattern, SetPatternMode, SetType, plateauWeakPointLabel } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex", name: "Chest Press LifeFitness", category: "Push", setPatternMode: SetPatternMode.straight,
    repTargetMin: 8, repTargetMax: 12, smallestIncrement: 2.5, isFavorite: false, createdByUser: true,
    sortOrder: 0, suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }], lastUsed: null,
    movementPattern: MovementPattern.horizontalPress, resistanceProfile: null, strengthStandardKey: null,
    benchmarkUnit: null,
    ...overrides,
  };
}

const NOW = new Date("2026-09-20T17:30:00Z");
const daysAgo = (days: number, minutes = 0) => new Date(NOW.getTime() - days * 86_400_000 + minutes * 60_000);

function set(weight: number, reps: number, at: Date, rir: number | null = null, setType: LoggedSet["setType"] = SetType.work): LoggedSet {
  return { id: `s-${weight}-${reps}-${at.getTime()}`, weight, reps, setType, timestamp: at, setSlotIndex: 0, completed: true, supersetRoundIndex: null, reportedRir: rir };
}

function session(ex: Exercise, at: Date, sets: LoggedSet[]): WorkoutSession {
  return {
    id: `session-${at.getTime()}`, date: at, startTime: at, endTime: at, notes: "", isActive: false, templateName: null,
    exercises: [{ id: `le-${ex.id}-${at.getTime()}`, orderIndex: 0, notes: "", exerciseId: ex.id, exerciseName: ex.name, sets, supersetGroupId: null, plateauWeakPoint: null }],
    supersetGroups: [], cardioEntries: [],
  };
}

describe("série suivante : le RIR rapporté compte", () => {
  it("65 × 12 à RIR 2 (fourchette 8-12) fait MONTER la charge, jamais descendre à 62,5", () => {
    const ex = exercise();
    const s = suggest({ exercise: ex, currentSetIndex: 1, recentHistory: [], currentSessionSets: [set(65, 12, NOW, 2)], now: NOW });
    expect(s.weight).toBeGreaterThan(65);
    expect(s.reps).toBeGreaterThanOrEqual(ex.repTargetMin);
  });

  it("120 × 10 à RIR 2 garde la charge avec autant de reps, pas une de moins", () => {
    const ex = exercise({ name: "Leg Press Technogym", movementPattern: MovementPattern.squat });
    const s = suggest({ exercise: ex, currentSetIndex: 1, recentHistory: [], currentSessionSets: [set(120, 10, NOW, 2)], now: NOW });
    expect(s.weight).toBe(120);
    expect(s.reps).toBeGreaterThanOrEqual(10);
  });

  it("sans RIR rapporté, rien ne change : la marge de 2 reps reste exigée pour monter", () => {
    const ex = exercise();
    const s = suggest({ exercise: ex, currentSetIndex: 1, recentHistory: [], currentSessionSets: [set(65, 13, NOW)], now: NOW });
    expect(s.weight).toBe(65);
  });
});

describe("libellé « Tentative de record »", () => {
  it("n'apparaît pas quand la série proposée ne battrait rien (Lateral raises, record 16 × 5)", () => {
    const ex = exercise({ name: "Lateral raises", movementPattern: MovementPattern.isolation, smallestIncrement: 2, fatigueClass: "light" });
    const history = [
      session(ex, daysAgo(3), [set(14, 6, daysAgo(3), 2)]),
      session(ex, daysAgo(5), [set(14, 8, daysAgo(5), 1), set(12, 11, daysAgo(5, 3), 1)]),
      session(ex, daysAgo(7), [set(14, 11, daysAgo(7), 0), set(12, 10, daysAgo(7, 3), 2)]),
      session(ex, daysAgo(20), [set(16, 5, daysAgo(20), 1), set(12, 11, daysAgo(20, 3), 1)]),
    ];
    const s = suggest({
      exercise: ex, currentSetIndex: 0, recentHistory: history.map((h) => h.exercises[0].sets), currentSessionSets: [],
      sessionHistory: history, now: NOW,
    });
    expect(s.readyForPR).toBeFalsy();
    expect(s.explanation).not.toContain("Tentative de record");
    expect(s.explanation).toContain("Cible");
  });

  it("suit exactement le feu au poids du corps, sans plafond à 10 reps", () => {
    const ex = exercise({ name: "HSPU", setPatternMode: SetPatternMode.bodyweight, movementPattern: MovementPattern.verticalPress, repTargetMin: 5, repTargetMax: 10 });
    const history = [
      session(ex, daysAgo(3), [set(0, 16, daysAgo(3), 2), set(0, 10, daysAgo(3, 3), 1)]),
      session(ex, daysAgo(6), [set(0, 15, daysAgo(6), 2), set(0, 9, daysAgo(6, 3), 1)]),
      session(ex, daysAgo(9), [set(0, 14, daysAgo(9), 2), set(0, 10, daysAgo(9, 3), 1), set(0, 8, daysAgo(9, 6), 0)]),
    ];
    const s = suggest({
      exercise: ex, currentSetIndex: 0, recentHistory: history.map((h) => h.exercises[0].sets), currentSessionSets: [],
      sessionHistory: history, now: NOW,
    });
    // Tu fais 14 à 16 en tête de séance : la suggestion suit, la fourchette réglée (5-10) ne la coupe plus.
    expect(s.reps).toBeGreaterThan(10);
    const bestBodyweightReps = 16;
    expect(Boolean(s.readyForPR)).toBe(s.reps > bestBodyweightReps);
    expect(s.explanation.includes("Tentative de record")).toBe(Boolean(s.readyForPR));
  });
});

describe("reprise après une pause", () => {
  it("l'ajustement tombe dès que la première série du jour égale le niveau d'avant", () => {
    const ex = exercise({ name: "DC assisté", repTargetMin: 6, repTargetMax: 10, fatigueClass: "heavy" });
    const history = [session(ex, daysAgo(16), [set(80, 8, daysAgo(16), 0)])];
    const s = suggest({
      exercise: ex, currentSetIndex: 1, recentHistory: history.map((h) => h.exercises[0].sets),
      currentSessionSets: [set(80, 15, NOW, 2)], gapDays: 16, now: NOW,
    });
    expect(s.explanation).not.toContain("Reprise");
  });
});

describe("charge maximale de la machine", () => {
  const ex = exercise({ name: "Abdominal LifeFitness", movementPattern: MovementPattern.isolation, maxLoad: 85 });
  const history = [
    session(ex, daysAgo(2), [set(85, 17, daysAgo(2), 2), set(85, 9, daysAgo(2, 3), 1)]),
    session(ex, daysAgo(4), [set(85, 15, daysAgo(4), 1), set(85, 12, daysAgo(4, 3), 1)]),
    session(ex, daysAgo(6), [set(85, 16, daysAgo(6), 2), set(85, 14, daysAgo(6, 3), 2)]),
  ];

  it("ne propose jamais plus que le bout de pile", () => {
    const s = suggest({ exercise: ex, currentSetIndex: 0, recentHistory: history.map((h) => h.exercises[0].sets), currentSessionSets: [], now: NOW });
    expect(s.weight).toBe(85);
  });

  it("à ce poids, vise les reps réellement faites en tête de séance, au-delà de la fourchette", () => {
    const s = suggest({ exercise: ex, currentSetIndex: 0, recentHistory: history.map((h) => h.exercises[0].sets), currentSessionSets: [], now: NOW });
    expect(s.reps).toBeGreaterThan(ex.repTargetMax);
    expect(s.explanation).toContain("Charge max de la machine");
  });
});

describe("séances en finisher seul", () => {
  it("ne prennent pas de place dans la fenêtre d'historique d'une série de travail", () => {
    const ex = exercise({ name: "HSPU", setPatternMode: SetPatternMode.bodyweight });
    const finisher = (d: number, reps: number) => session(ex, daysAgo(d), [set(0, reps, daysAgo(d), 1, SetType.finisher)]);
    const work = (d: number, reps: number) => session(ex, daysAgo(d), [set(0, reps, daysAgo(d), 2)]);
    const history = [finisher(4, 12), finisher(17, 7), finisher(18, 2), work(20, 14), work(22, 17), work(25, 15)];
    const context = collectExerciseHistory(history, ex.id, 5, { skipFinisherOnlySessions: true });
    expect(context.sets.map((sets) => sets[0].reps)).toEqual([14, 17, 15]);
  });
});

describe("dernière séance lue en salle", () => {
  const ex = exercise({ name: "Abdominal LifeFitness" });
  const history = [
    session(ex, daysAgo(2), [set(85, 17, daysAgo(2), 2), set(85, 9, daysAgo(2, 3), 1), set(85, 8, daysAgo(2, 6), 0)]),
  ];

  it("se résume par la meilleure série, pas par la dernière", () => {
    const last = lastWorkSession(ex, history)!;
    expect(headlineSet(last).reps).toBe(17);
  });

  it("le raccourci reprend la série de même rang que la prochaine", () => {
    const last = lastWorkSession(ex, history)!;
    expect(sameRankSet(last, 0).reps).toBe(17);
    expect(sameRankSet(last, 1).reps).toBe(9);
    expect(sameRankSet(last, 5).reps).toBe(8);
  });

  it("ignore les séances en finisher seul et dit son âge quand elle est ancienne", () => {
    const withFinisher = [
      session(ex, daysAgo(1), [set(85, 5, daysAgo(1), 0, SetType.finisher)]),
      session(ex, daysAgo(20), [set(85, 14, daysAgo(20), 1)]),
    ];
    const last = lastWorkSession(ex, withFinisher)!;
    expect(headlineSet(last).reps).toBe(14);
    expect(staleAgeLabel(last, NOW)).toBe("il y a 20 j");
  });
});

describe("départ d'une première séance sur une machine", () => {
  it("part de la série de tête de la machine équivalente récente", () => {
    const old = exercise({ id: "old", name: "Chest press incliné Technogym" });
    const fresh = exercise({ id: "new", name: "Isolateral incline press" });
    const history = [session(old, daysAgo(5), [set(60, 10, daysAgo(5), 1), set(60, 8, daysAgo(5, 3), 0)])];
    const start = startingPointFromEquivalent(fresh, [old, fresh], history, NOW)!;
    expect(start.exercise.id).toBe("old");
    expect(start.set.weight).toBe(60);
    expect(start.set.reps).toBe(10);
  });

  it("ne remonte pas au-delà de 8 semaines", () => {
    const old = exercise({ id: "old", name: "Chest press incliné Technogym" });
    const fresh = exercise({ id: "new", name: "Isolateral incline press" });
    const history = [session(old, daysAgo(70), [set(60, 10, daysAgo(70), 1)])];
    expect(startingPointFromEquivalent(fresh, [old, fresh], history, NOW)).toBeNull();
  });
});

describe("point faible selon le mouvement", () => {
  it("pas de « lockout » sur une élévation latérale ni sur un tirage", () => {
    expect(plateauWeakPointLabel("lockout", "isolation")).toBe("Fin (contraction)");
    expect(plateauWeakPointLabel("lockout", "vertical_pull")).toBe("Fin (contraction)");
    expect(plateauWeakPointLabel("lockout", "horizontal_press")).toContain("verrouillage");
    expect(plateauWeakPointLabel("bottom", "vertical_pull")).toContain("bras tendus");
  });
});

describe("affichage à la française", () => {
  it("virgule décimale et PDC au poids du corps", () => {
    expect(cleanWeight(62.5)).toBe("62,5");
    expect(cleanWeight(120)).toBe("120");
    expect(formatDecimal(11.299999999999999)).toBe("11,3");
    expect(formatLoad(0)).toBe("PDC");
    expect(formatLoad(72.5)).toBe("72,5 kg");
  });
});
