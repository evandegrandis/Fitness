import { describe, expect, it } from "vitest";

import { statue, STATUE_ZONES } from "@/lib/engines/statue";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, MuscleGoal, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;
// Samedi 26/09/2026 : semaine en cours depuis le lundi 21, fenêtre = les 8 semaines du 27/07 au 20/09.
const NOW = new Date("2026-09-26T12:00:00");
const MONDAY = new Date("2026-09-21T10:00:00");

function exercise(id: string, muscleGroup: MuscleGroup): Exercise {
  return {
    id, name: id, category: "Pull", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 1,
    isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup, coefficient: 1 }], lastUsed: null, movementPattern: "isolation",
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  };
}

const CURL = exercise("curl", MuscleGroup.bicepsLong);
const LATERAL = exercise("lateral", MuscleGroup.deltLat);
const CATALOG = [CURL, LATERAL];

/** Une séance le mardi de la semaine `weeksAgo` (0 = semaine en cours), `sets` séries par exercice. */
function session(weeksAgo: number, sets: Record<string, number>): WorkoutSession {
  const date = new Date(MONDAY.getTime() - weeksAgo * 7 * DAY + DAY);
  return {
    id: `s${weeksAgo}`, date, startTime: date, endTime: date, notes: "", isActive: false, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: Object.entries(sets).map(([exerciseId, count], index) => ({
      id: `${exerciseId}-${weeksAgo}`, orderIndex: index, notes: "", exerciseId, exerciseName: exerciseId, supersetGroupId: null, plateauWeakPoint: null,
      sets: Array.from({ length: count }, (_, k): LoggedSet => ({
        id: `${exerciseId}-${weeksAgo}-${k}`, weight: 20, reps: 10, setType: "work", timestamp: new Date(date.getTime() + k * 180_000), setSlotIndex: k, completed: true, supersetRoundIndex: null,
      })),
    })),
  };
}

const weeks = (from: number, to: number, sets: Record<string, number>) => Array.from({ length: to - from + 1 }, (_, i) => session(from + i, sets));
const zone = (result: ReturnType<typeof statue>, key: string) => result.zones.find((entry) => entry.key === key)!;
const BICEPS_10: MuscleGoal[] = [{ parent: MuscleParent.biceps, weeklyGoalSets: 10 }];

describe("statue de marbre", () => {
  it("l'état d'une zone suit les paliers de la semaine, sur 8 semaines terminées", () => {
    const at = (perWeek: number) => zone(statue({ history: weeks(1, 8, { curl: perWeek }), catalog: CATALOG, goals: BICEPS_10, now: NOW }), "biceps");
    expect(at(3).state).toBe(0);
    expect(at(4).state).toBe(1);
    expect(at(6).state).toBe(2);
    expect(at(7).state).toBe(3);
    expect(at(7).coverage).toBeCloseTo(0.7);
  });

  it("une semaine au-delà de l'objectif compte pour l'objectif, pas plus", () => {
    const history = [session(1, { curl: 40 }), ...weeks(2, 8, { curl: 0 })];
    expect(zone(statue({ history, catalog: CATALOG, goals: BICEPS_10, now: NOW }), "biceps").coverage).toBeCloseTo(1 / 8);
  });

  it("la semaine en cours et celles d'avant la fenêtre ne comptent pas dans l'état", () => {
    const history = [session(0, { curl: 10 }), session(9, { curl: 10 }), ...weeks(1, 8, { curl: 5 })];
    expect(zone(statue({ history, catalog: CATALOG, goals: BICEPS_10, now: NOW }), "biceps").coverage).toBeCloseTo(0.5);
  });

  it("prochain palier : ce qu'il reste à faire cette semaine pour passer lundi", () => {
    // 50 % → poli à 55 % : lundi la semaine en cours remplace une semaine à 50 %, il lui faut 90 %.
    const history = [session(0, { curl: 3 }), ...weeks(1, 8, { curl: 5 })];
    expect(statue({ history, catalog: CATALOG, goals: BICEPS_10, now: NOW }).next).toEqual([{ zone: "biceps", label: "Biceps", to: "Poli", sets: 6 }]);
    // Hors de portée en une semaine (il faudrait plus que l'objectif) : rien n'est promis.
    expect(statue({ history: weeks(1, 8, { curl: 1 }), catalog: CATALOG, goals: BICEPS_10, now: NOW }).next).toEqual([]);
  });

  it("zone à plusieurs groupes : chaque groupe plafonné à son objectif, le groupe sans objectif ignoré", () => {
    const goals: MuscleGoal[] = [
      { parent: MuscleParent.deltLateral, weeklyGoalSets: 16 },
      { parent: MuscleParent.deltPosterieur, weeklyGoalSets: 10 },
    ];
    const epaules = zone(statue({ history: weeks(1, 8, { lateral: 30 }), catalog: CATALOG, goals, now: NOW }), "epaules");
    expect(epaules.coverage).toBeCloseTo(16 / 26);
    expect(epaules.state).toBe(2);
  });

  it("le reste de la statue et les zones sans objectif prennent la moyenne des zones notées", () => {
    const goals: MuscleGoal[] = [...BICEPS_10, { parent: MuscleParent.deltLateral, weeklyGoalSets: 10 }];
    const result = statue({ history: weeks(1, 8, { curl: 7, lateral: 0 }), catalog: CATALOG, goals, now: NOW });
    const index = (key: string) => STATUE_ZONES.findIndex((entry) => entry.key === key);
    expect(result.levels[index("biceps")]).toBe(3);
    expect(result.levels[index("epaules")]).toBe(0);
    expect(result.levels[index("neutre")]).toBe(1.5);
    expect(result.levels[index("avant_bras")]).toBe(1.5);
    expect(zone(result, "avant_bras").coverage).toBeNull();
  });
});
