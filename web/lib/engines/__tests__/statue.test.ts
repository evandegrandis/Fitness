import { describe, expect, it } from "vitest";

import { statue } from "@/lib/engines/statue";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, MuscleGoal, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;
// Samedi 26/09/2026 : la semaine en cours a commencé le lundi 21.
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

const CATALOG = [exercise("curl", MuscleGroup.bicepsLong), exercise("lateral", MuscleGroup.deltLat), exercise("pushdown", MuscleGroup.tricepsLong)];

/** Une séance `daysAfterMonday` jours après le lundi de la semaine en cours, `sets` séries par exercice. */
function session(daysAfterMonday: number, sets: Record<string, number>, isActive = false): WorkoutSession {
  const date = new Date(MONDAY.getTime() + daysAfterMonday * DAY);
  return {
    id: `s${daysAfterMonday}`, date, startTime: date, endTime: date, notes: "", isActive, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: Object.entries(sets).map(([exerciseId, count], index) => ({
      id: `${exerciseId}-${daysAfterMonday}`, orderIndex: index, notes: "", exerciseId, exerciseName: exerciseId, supersetGroupId: null, plateauWeakPoint: null,
      sets: Array.from({ length: count }, (_, k): LoggedSet => ({
        id: `${exerciseId}-${daysAfterMonday}-${k}`, weight: 20, reps: 10, setType: "work", timestamp: new Date(date.getTime() + k * 180_000), setSlotIndex: k, completed: true, supersetRoundIndex: null,
      })),
    })),
  };
}

const BICEPS_12: MuscleGoal[] = [{ parent: MuscleParent.biceps, weeklyGoalSets: 12 }];
const ARMS: MuscleGoal[] = [...BICEPS_12, { parent: MuscleParent.triceps, weeklyGoalSets: 12 }];
const zone = (result: ReturnType<typeof statue>, key: string) => result.zones.find((entry) => entry.key === key)!;
const biceps = (history: WorkoutSession[], active: WorkoutSession | null = null) =>
  zone(statue({ history, catalog: CATALOG, goals: BICEPS_12, now: NOW, active }), "biceps");

describe("statue de la semaine", () => {
  it("bronze, marbre au tiers de l'objectif, argent aux deux tiers, or à l'objectif", () => {
    expect(biceps([session(1, { curl: 3 })]).state).toBe(0);
    expect(biceps([session(1, { curl: 4 })]).state).toBe(1);
    expect(biceps([session(1, { curl: 8 })]).state).toBe(2);
    expect(biceps([session(1, { curl: 12 })]).state).toBe(3);
  });

  it("seule la semaine en cours compte, séance en cours comprise ; lundi tout repart du bronze", () => {
    const lastWeek = session(-3, { curl: 12 });
    expect(biceps([lastWeek]).state).toBe(0);
    expect(biceps([lastWeek, session(1, { curl: 4 })], session(5, { curl: 4 }, true)).state).toBe(2);
  });

  it("les veines du palier suivant apparaissent à mi-chemin et se densifient jusqu'au palier", () => {
    // Argent (8/12) vers or (12/12) : mi-chemin à 10 séries.
    expect(biceps([session(1, { curl: 9 })]).veins).toBe(0);
    expect(biceps([session(1, { curl: 10 })]).veins).toBeCloseTo(0.2);
    expect(biceps([session(1, { curl: 11 })]).veins).toBeCloseTo(0.6);
    expect(biceps([session(1, { curl: 12 })]).veins).toBe(0);
  });

  it("chaque faisceau d'épaule est sa propre zone ; un faisceau sans objectif suit sa voisine", () => {
    const goals: MuscleGoal[] = [
      { parent: MuscleParent.pectoraux, weeklyGoalSets: 12 },
      { parent: MuscleParent.deltLateral, weeklyGoalSets: 16 },
      { parent: MuscleParent.deltPosterieur, weeklyGoalSets: 10 },
    ];
    const result = statue({ history: [session(1, { lateral: 16 })], catalog: CATALOG, goals, now: NOW });
    expect(zone(result, "delt_lateral").state).toBe(3);
    expect(zone(result, "delt_posterieur").state).toBe(0);
    expect(zone(result, "delt_anterieur").coverage).toBeNull();
    expect(zone(result, "delt_anterieur").state).toBe(zone(result, "pectoraux").state);
  });

  it("avant-bras sur le plus faible des bras, reste de la statue sur le muscle le plus faible", () => {
    const result = statue({ history: [session(1, { curl: 12, pushdown: 8 })], catalog: CATALOG, goals: ARMS, now: NOW });
    expect(zone(result, "biceps").state).toBe(3);
    expect(zone(result, "avant_bras").state).toBe(2);
    expect(zone(result, "neutre").state).toBe(2);
    const gold = statue({ history: [session(1, { curl: 12, pushdown: 12 })], catalog: CATALOG, goals: ARMS, now: NOW });
    expect(gold.zones.every((entry) => entry.state === 3)).toBe(true);
    expect(gold.toGold).toBe(0);
    expect(gold.next).toEqual([]);
  });

  it("fumée : les muscles travaillés fument 22 h après leur dernière série, de moins en moins", () => {
    const at = (hoursAgo: number, sets: number) => {
      const done = session(0, { curl: sets });
      const shift = NOW.getTime() - hoursAgo * 3_600_000 - done.date.getTime();
      done.exercises[0].sets.forEach((set, k) => (set.timestamp = new Date(done.date.getTime() + shift - (sets - 1 - k) * 180_000)));
      return biceps([done]).smoke;
    };
    expect(at(0, 4)).toBeCloseTo(1);
    expect(at(11, 4)).toBeCloseTo(0.5);
    expect(at(0, 2)).toBeCloseTo(0.5);
    expect(at(22, 4)).toBe(0);
    // Séance en cours : fumée tout de suite ; les muscles non travaillés ne fument pas.
    const live = session(5, { curl: 4 }, true);
    live.exercises[0].sets.forEach((set) => (set.timestamp = NOW));
    const result = statue({ history: [], catalog: CATALOG, goals: ARMS, now: NOW, active: live });
    expect(zone(result, "biceps").smoke).toBeCloseTo(1);
    expect(zone(result, "triceps").smoke).toBe(0);
  });

  it("prochain palier : les séries qui manquent, la moins chère d'abord ; séries pour tout en or", () => {
    const result = statue({ history: [session(1, { curl: 7, pushdown: 2 })], catalog: CATALOG, goals: ARMS, now: NOW });
    expect(result.next).toEqual([
      { zone: "biceps", label: "Biceps", to: "Argent", sets: 1 },
      { zone: "triceps", label: "Triceps", to: "Marbre", sets: 2 },
    ]);
    expect(result.toGold).toBe(15);
  });
});
