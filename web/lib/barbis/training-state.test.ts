import { describe, expect, it } from "vitest";

import { buildTrainingState } from "@/lib/barbis/training-state";
import { recordEvents } from "@/lib/engines/progress-stats";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, RecoveryCheckin, UserSettings, WorkoutSession } from "@/lib/models/types";

const DEFAULT_SETTINGS: UserSettings = {
  usesKilograms: true, defaultSmallestIncrement: 2.5, defaultRestTimerSeconds: 120, defaultRepTargetMin: 8, defaultRepTargetMax: 12,
  userName: "Evan", supersetRestSeconds: 180, bodyWeightKg: null, gender: null, ageYears: null, trainingPhase: null,
  trainingPhaseStartedAt: null, weeklyCardioMinutesGoal: null,
};


const HOUR = 3_600_000;
// Mardi 06/10/2026, 20:00 à Paris.
const NOW = new Date("2026-10-06T18:00:00Z");

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "pec", name: "Pec deck", category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
    lastUsed: null, movementPattern: "isolation", resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: null, ...overrides,
  };
}

const PEC = exercise();
const CURL = exercise({ id: "curl", name: "Curl debout", muscleMappings: [{ muscleGroup: MuscleGroup.bicepsLong, coefficient: 1 }] });

let counter = 0;
function set(at: Date, minutes: number, weight: number, reps: number, suggested?: [number, number]): LoggedSet {
  counter += 1;
  return {
    id: `s${counter}`, weight, reps, setType: SetType.work, timestamp: new Date(at.getTime() + minutes * 60_000),
    setSlotIndex: 0, completed: true, supersetRoundIndex: null,
    suggestedWeight: suggested?.[0] ?? null, suggestedReps: suggested?.[1] ?? null,
  };
}

function session(id: string, start: Date, entries: { ex: Exercise; sets: (at: Date) => LoggedSet[] }[]): WorkoutSession {
  return {
    id, date: start, startTime: start, endTime: new Date(start.getTime() + HOUR), notes: "", isActive: false, templateName: null,
    supersetGroups: [], cardioEntries: [],
    exercises: entries.map(({ ex, sets }, index) => ({
      id: `${id}-le-${index}`, orderIndex: index, notes: "", exerciseId: ex.id, exerciseName: ex.name, sets: sets(start),
      supersetGroupId: null, plateauWeakPoint: null,
    })),
  };
}

const at = (iso: string) => new Date(iso);
// Pec : quatre séances, la dernière au-dessus de la tendance ; curl seulement les deux dernières.
const sessions = [
  session("a", at("2026-09-24T16:00:00Z"), [{ ex: PEC, sets: (s) => [set(s, 0, 60, 10), set(s, 3, 60, 9)] }]),
  session("b", at("2026-09-27T16:00:00Z"), [{ ex: PEC, sets: (s) => [set(s, 0, 60, 10, [60, 10]), set(s, 3, 60, 9, [60, 9])] }]),
  session("c", at("2026-09-30T16:00:00Z"), [
    { ex: PEC, sets: (s) => [set(s, 0, 60, 10, [60, 10]), set(s, 3, 60, 8, [60, 9])] },
    { ex: CURL, sets: (s) => [set(s, 10, 15, 10), set(s, 13, 15, 9)] },
  ]),
  session("d", at("2026-10-05T16:30:00Z"), [
    { ex: PEC, sets: (s) => [set(s, 0, 65, 10, [60, 10]), set(s, 3, 60, 9, [60, 9]), set(s, 6, 60, 7, [60, 9])] },
    { ex: CURL, sets: (s) => [set(s, 10, 15, 10, [15, 10])] },
  ]),
];

const checkins: RecoveryCheckin[] = [
  // Jour J-1 de la séance du 05/10 : la date d'un check-in est minuit, heure de Paris.
  { id: "c1", date: at("2026-10-03T22:00:00Z"), sleepHours: 5.5, hadAlcohol: true, proteinTargetMet: true, tookCreatine: null },
];

const state = buildTrainingState({
  sessions,
  catalog: [PEC, CURL],
  goals: [{ parent: "pectoraux", weeklyGoalSets: 10 }, { parent: "biceps", weeklyGoalSets: 10 }],
  settings: DEFAULT_SETTINGS,
  checkins,
  bodyWeights: [],
  now: NOW,
  days: 120,
});

describe("état d'entraînement servi à Barbis", () => {
  it("donne une ligne par séance, la plus récente d'abord, à l'heure de Paris", () => {
    expect(state.sessions.map((row) => row.id)).toEqual(["d", "c", "b", "a"]);
    expect(state.sessions[0]).toMatchObject({ date: "2026-10-05", start: "18:30", durationMin: 60, template: null });
  });

  it("juge chaque série contre sa suggestion, comme le compteur de la séance", () => {
    // 65 × 10 pour 60 × 10 : battue ; 60 × 9 : tenue ; 60 × 7 pour 60 × 9 : en dessous ; curl tenu.
    expect(state.sessions[0].suggestions).toEqual({ rated: 4, beat: 1, held: 2, below: 1 });
    // Séance « b » : pec déjà connu, deux séries tenues ; « a » n'a aucune suggestion enregistrée.
    expect(state.sessions[2].suggestions).toEqual({ rated: 2, beat: 0, held: 2, below: 0 });
    expect(state.sessions[3].suggestions.rated).toBe(0);
  });

  it("compte les heures depuis la dernière séance de chaque muscle", () => {
    const [d, c, , a] = state.sessions;
    expect(d.muscles.find((row) => row.muscle === "pectoraux")?.hoursSinceLast).toBe(120.5);
    expect(d.muscles.find((row) => row.muscle === "biceps")?.hoursSinceLast).toBe(120.5);
    expect(c.muscles.find((row) => row.muscle === "biceps")?.hoursSinceLast).toBeNull();
    expect(a.muscles.map((row) => row.hoursSinceLast)).toEqual([null]);
  });

  it("rattache le check-in de la veille (alcool de J-1, nuit de J-1 à J)", () => {
    expect(state.sessions[0].checkinDayBefore).toEqual({ date: "2026-10-04", sleepHours: 5.5, alcohol: true, protein: true, creatine: null });
    expect(state.sessions[1].checkinDayBefore).toBeNull();
  });

  it("mesure la capacité de la séance contre la moyenne des 3 précédentes", () => {
    const d = state.sessions[0];
    expect(d.capacity?.exercises).toBe(1);
    expect(d.capacity?.vsTrendPct).toBeGreaterThan(0);
    expect(state.sessions[1].capacity).toBeNull();
  });

  it("sert les records exactement comme les étoiles de l'Historique", () => {
    const stars = recordEvents(sessions, [PEC, CURL]);
    expect(state.records).toHaveLength(stars.length);
    expect(state.records.map((record) => record.sessionId).sort()).toEqual(stars.map((event) => event.sessionId).sort());
    expect(state.sessions[0].records.length).toBe(stars.filter((event) => event.sessionId === "d").length);
  });

  it("décrit la semaine en cours et la dernière semaine terminée", () => {
    expect(state.currentWeek).toMatchObject({ start: "2026-10-05", end: "2026-10-11", inProgress: true, sessions: 1, goalSetsTotal: 20 });
    expect(state.lastWeek).toMatchObject({ start: "2026-09-28", end: "2026-10-04", inProgress: false, sessions: 1 });
    const pec = state.currentWeek.muscles.find((row) => row.muscle === "pectoraux");
    expect(pec).toMatchObject({ goal: 10, sets: 3, remaining: 7 });
    // 4 séries sur 20 d'objectif = 20 % : il en manque 4 pour le bronze (40 %), 10 pour l'or (70 %).
    expect(state.currentWeek.scorePct).toBe(20);
    expect(state.currentWeek.nextTier).toEqual({ tier: "bronze", setsMissing: 4 });
    expect(state.currentWeek.setsToGold).toBe(10);
  });

  it("ne garde que les exercices de la salle actuelle", () => {
    expect(state.exercises.map((row) => row.exercise).sort()).toEqual(["Curl debout", "Pec deck"]);
  });

  it("ne sert que la fenêtre demandée", () => {
    const short = buildTrainingState({ sessions, catalog: [PEC, CURL], goals: [], settings: DEFAULT_SETTINGS, checkins, bodyWeights: [], now: NOW, days: 3 });
    expect(short.sessions.map((row) => row.id)).toEqual(["d"]);
    expect(short.records.every((record) => record.date >= "2026-10-03")).toBe(true);
  });
});


