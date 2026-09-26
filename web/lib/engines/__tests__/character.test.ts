import { describe, expect, it } from "vitest";

import { characterSheet } from "@/lib/engines/character";
import type { SessionRank } from "@/lib/engines/session-rank";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, RecoveryCheckin, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;
const NOW = new Date("2026-09-26T12:00:00");

function exercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "ex", name: "Ex", category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 1,
    isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.deltLat, coefficient: 1 }], lastUsed: null, movementPattern: "isolation",
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null, ...overrides,
  };
}

const LATERAL = exercise({ id: "lat", name: "Lateral raises", strengthStandardKey: "Lateral raises", benchmarkUnit: "load" });
const PEC = exercise({ id: "pec", name: "Pec deck", strengthStandardKey: "Pec deck", benchmarkUnit: "load" });
const SETTINGS = { bodyWeightKg: 73.7, gender: "male", ageYears: 26, trainingPhase: null, trainingPhaseStartedAt: null } as UserSettings;

function session(daysAgo: number, lateral: number, pec: number): WorkoutSession {
  const date = new Date(NOW.getTime() - daysAgo * DAY);
  const sets = (id: string, weight: number): LoggedSet[] =>
    [0, 1, 2, 3, 4].map((k) => ({ id: `${id}-${daysAgo}-${k}`, weight, reps: 10, setType: "work", timestamp: new Date(date.getTime() + k * 180_000), setSlotIndex: k, completed: true, supersetRoundIndex: null }));
  return {
    id: `s${daysAgo}`, date, startTime: date, endTime: date, notes: "", isActive: false, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: [
      { id: `a${daysAgo}`, orderIndex: 0, notes: "", exerciseId: LATERAL.id, exerciseName: LATERAL.name, sets: sets("lat", lateral), supersetGroupId: null, plateauWeakPoint: null },
      { id: `b${daysAgo}`, orderIndex: 1, notes: "", exerciseId: PEC.id, exerciseName: PEC.name, sets: sets("pec", pec), supersetGroupId: null, plateauWeakPoint: null },
    ],
  };
}

const HISTORY = [20, 13, 6].map((daysAgo) => session(daysAgo, 12, 200));
const rank = (rated: number, performed: number, held: number) => ({ rated, performed, held }) as SessionRank;

function sheet(checkins: RecoveryCheckin[] = [], ranks: { date: Date; rank: SessionRank | null }[] = []) {
  const stats = characterSheet({ history: HISTORY, catalog: [LATERAL, PEC], goals: [], checkins, ranks, settings: SETTINGS, now: NOW });
  return Object.fromEntries(stats.map((stat) => [stat.key, stat]));
}

describe("fiche de personnage", () => {
  it("la force ne lit que les repères fiables : le Pec deck à 200 kg (machine) ne compte pas", () => {
    const force = sheet().force;
    expect(force.how).toContain("1 exercice libre");
    expect(force.next).toMatch(/^Lateral raises .* près\u00a0: \+\d+ pts?\.$/);
    expect(force.value).toBeGreaterThan(0);
    expect(force.value).toBeLessThan(80);
  });

  it("récupération : sommeil rapporté à 8 h et soirs sans alcool, sur ce qui est renseigné", () => {
    const night = (daysAgo: number, sleepHours: number, hadAlcohol: boolean): RecoveryCheckin => ({
      id: `c${daysAgo}`, date: new Date(NOW.getTime() - daysAgo * DAY), tookCreatine: null, proteinTargetMet: null, sleepHours, hadAlcohol,
    });
    const recovery = sheet([night(1, 8, false), night(2, 6, true)]).recuperation;
    expect(recovery.value).toBe(Math.round(((7 / 8 + 1 / 2) / 2) * 100));
    expect(recovery.how).toBe("Moyenne de tes bilans des 14 derniers jours : 7 h de sommeil sur 8, 1 soir d'alcool sur 2.");
    // Le levier le plus rentable : l'alcool (0,5) avant le sommeil (0,875).
    expect(recovery.next).toBe("aucun soir d'alcool sur 14 jours\u00a0: +25 pts.");
  });

  it("discipline : exercices tenus ou battus sur les 4 dernières semaines", () => {
    const discipline = sheet([], [
      { date: new Date(NOW.getTime() - 3 * DAY), rank: rank(6, 4, 1) },
      { date: new Date(NOW.getTime() - 10 * DAY), rank: rank(4, 2, 0) },
      { date: new Date(NOW.getTime() - 40 * DAY), rank: rank(5, 0, 0) },
    ]).discipline;
    expect(discipline.value).toBe(70);
    expect(discipline.how).toContain("7 exercices sur 10");
    expect(discipline.next).toContain("+10 pts");
  });

  it("sans donnée, une caractéristique reste vide plutôt que nulle", () => {
    expect(sheet().recuperation.value).toBeNull();
    expect(sheet().discipline.value).toBeNull();
  });
});
