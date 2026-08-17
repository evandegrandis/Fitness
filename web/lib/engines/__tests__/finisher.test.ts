import { describe, expect, it } from "vitest";
import { FINISHER_PROMPT, finisherPromptReason, isLateInSession } from "@/lib/engines/finisher";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const START = new Date("2026-08-17T18:00:00");
/** Après 40 min, la porte de position est ouverte par le temps seul. */
const LATE = new Date("2026-08-17T18:45:00");
/** Avant 40 min et sans volume : la porte reste fermée. */
const EARLY = new Date("2026-08-17T18:10:00");

const HSPU: Exercise = {
  id: "ex-hspu",
  name: "HSPU",
  category: "push",
  setPatternMode: "bodyweight",
  repTargetMin: 3,
  repTargetMax: 8,
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
  muscleMappings: [],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 0,
    reps: 5,
    setType: SetType.work,
    timestamp: START,
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function loggedExercise(id: string, exerciseId: string, sets: LoggedSet[], orderIndex = 0): LoggedExercise {
  return { id, orderIndex, notes: "", exerciseId, exerciseName: exerciseId, sets, supersetGroupId: null, plateauWeakPoint: null };
}

function session(exercises: LoggedExercise[]): WorkoutSession {
  return {
    id: "s1",
    date: START,
    startTime: START,
    endTime: null,
    notes: "",
    isActive: true,
    templateName: null,
    exercises,
    supersetGroups: [],
    cardioEntries: [],
  };
}

describe("porte de position — un finisher est en fin de séance", () => {
  it("s'ouvre après 40 minutes même sans gros volume", () => {
    expect(isLateInSession(session([loggedExercise("le1", "ex-hspu", [set()])]), LATE)).toBe(true);
  });

  it("s'ouvre à 10 séries effectives même avant 40 minutes", () => {
    // 10 séries de 8 reps = 10 unités effectives (seuil EFFECTIVE_REPS_PER_SET = 8).
    const many = Array.from({ length: FINISHER_PROMPT.MIN_EFFECTIVE_SETS }, (_, i) =>
      set({ reps: 8, weight: 40, timestamp: new Date(START.getTime() + i * 120_000) })
    );
    expect(isLateInSession(session([loggedExercise("le1", "ex-other", many)]), EARLY)).toBe(true);
  });

  it("reste fermée en début de séance", () => {
    expect(isLateInSession(session([loggedExercise("le1", "ex-hspu", [set()])]), EARLY)).toBe(false);
  });
});

describe("cas réel d'Evan — HSPU ×3 greffé en fin de séance", () => {
  it("propose un finisher quand on revient sur un exercice déjà travaillé", () => {
    const hspu = loggedExercise("le-hspu", "ex-hspu", [set({ reps: 6, timestamp: START })], 0);
    const autre = loggedExercise(
      "le-autre",
      "ex-autre",
      [set({ reps: 10, weight: 50, timestamp: new Date("2026-08-17T18:30:00") })],
      1
    );
    // 3 reps seulement : l'ancienne règle (>= 15 reps) ratait totalement ce cas.
    const reason = finisherPromptReason(session([hspu, autre]), hspu, HSPU, { reps: 3, timestamp: LATE }, SetType.work);
    expect(reason).toBe("late_return");
  });

  it("propose aussi pour un exercice ajouté en fin de séance (première série)", () => {
    const travail = loggedExercise("le-travail", "ex-autre", [set({ reps: 10, weight: 50 })], 0);
    const ajoute = loggedExercise("le-neuf", "ex-hspu", [], 1);
    const reason = finisherPromptReason(session([travail, ajoute]), ajoute, HSPU, { reps: 3, timestamp: LATE }, SetType.work);
    expect(reason).toBe("late_addition");
  });
});

describe("la proposition reste rare — pas à chaque série", () => {
  it("ne propose PAS pour la série suivante d'un exercice en cours", () => {
    // Même après 40 min : on enchaîne les séries du même exercice, rien ne rompt le bloc.
    const hspu = loggedExercise("le-hspu", "ex-hspu", [set({ reps: 6, timestamp: START }), set({ reps: 5, timestamp: LATE })]);
    expect(finisherPromptReason(session([hspu]), hspu, HSPU, { reps: 5, timestamp: LATE }, SetType.work)).toBeNull();
  });

  it("ne propose PAS en début de séance, même à hautes reps", () => {
    const hspu = loggedExercise("le-hspu", "ex-hspu", []);
    expect(finisherPromptReason(session([hspu]), hspu, HSPU, { reps: 30, timestamp: EARLY }, SetType.work)).toBeNull();
  });

  it("ne propose PAS pour un échauffement ni pour un finisher déjà explicite", () => {
    const travail = loggedExercise("le-travail", "ex-autre", [set({ reps: 10, weight: 50 })], 0);
    const ajoute = loggedExercise("le-neuf", "ex-hspu", [], 1);
    const s = session([travail, ajoute]);
    expect(finisherPromptReason(s, ajoute, HSPU, { reps: 3, timestamp: LATE }, SetType.warmup)).toBeNull();
    expect(finisherPromptReason(s, ajoute, HSPU, { reps: 3, timestamp: LATE }, SetType.finisher)).toBeNull();
  });

  it("ne propose PAS pour un membre de superset — l'alternance explique déjà la forme", () => {
    const membre = { ...loggedExercise("le-hspu", "ex-hspu", [set({ reps: 6 })]), supersetGroupId: "g1" };
    const autre = loggedExercise("le-autre", "ex-autre", [set({ timestamp: new Date("2026-08-17T18:30:00") })], 1);
    expect(finisherPromptReason(session([membre, autre]), membre, HSPU, { reps: 3, timestamp: LATE }, SetType.work)).toBeNull();
  });
});

describe("burnout à hautes reps", () => {
  it("reste détecté, mais seulement une fois la porte de position ouverte", () => {
    const hspu = loggedExercise("le-hspu", "ex-hspu", []);
    expect(finisherPromptReason(session([hspu]), hspu, HSPU, { reps: 20, timestamp: LATE }, SetType.work)).toBe("high_reps");
  });
});
