import { describe, expect, it } from "vitest";

import { seasonState, SEASONS } from "@/lib/engines/seasons";
import { weeklyQuest } from "@/lib/engines/weekly-quest";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, MuscleGoal, RecoveryCheckin, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;

function exercise(id: string, muscle: (typeof MuscleGroup)[keyof typeof MuscleGroup], overrides: Partial<Exercise> = {}): Exercise {
  return {
    id, name: id, category: "Legs", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 1,
    isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: muscle, coefficient: 1 }], lastUsed: null, movementPattern: "isolation",
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null, ...overrides,
  };
}

const CURL_JAMBES = exercise("leg-curl", MuscleGroup.bicepsFemoral);
const HIP_THRUST = exercise("hip-thrust", MuscleGroup.glutMax);
const CURL = exercise("curl", MuscleGroup.bicepsLong);
const CATALOG = [CURL_JAMBES, HIP_THRUST, CURL];

function session(date: Date, entries: [Exercise, number][]): WorkoutSession {
  return {
    id: `s-${date.getTime()}`, date, startTime: date, endTime: date, notes: "", isActive: false, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: entries.map(([ex, count], index) => ({
      id: `le-${date.getTime()}-${index}`, orderIndex: index, notes: "", exerciseId: ex.id, exerciseName: ex.name, supersetGroupId: null, plateauWeakPoint: null,
      sets: Array.from({ length: count }, (_, k): LoggedSet => ({
        id: `set-${date.getTime()}-${index}-${k}`, weight: 20, reps: 10, setType: "work", timestamp: new Date(date.getTime() + (index * 20 + k * 3) * 60_000),
        setSlotIndex: k, completed: true, supersetRoundIndex: null,
      })),
    })),
  };
}

// Lundi 21 septembre 2026 ; 12 semaines de biceps, jambes jamais travaillées.
const MONDAY = new Date(2026, 8, 21, 12);
const HISTORY = Array.from({ length: 12 }, (_, k) => session(new Date(MONDAY.getTime() - (k + 1) * 7 * DAY + DAY), [[CURL, 12]]));
const GOALS: MuscleGoal[] = [
  { parent: MuscleParent.biceps, weeklyGoalSets: 12 },
  { parent: MuscleParent.hamstrings, weeklyGoalSets: 9 },
  { parent: MuscleParent.glutes, weeklyGoalSets: 9 },
  { parent: MuscleParent.forearms, weeklyGoalSets: 9 },
];

describe("quête de la semaine", () => {
  it("vise le muscle le plus en retard, jamais les avant-bras, à hauteur de 3 séries au moins", () => {
    const quest = weeklyQuest({ history: HISTORY, catalog: CATALOG, goals: GOALS, checkins: [], now: MONDAY })!;
    expect([MuscleParent.hamstrings, MuscleParent.glutes]).toContain(quest.parent);
    expect(quest).toMatchObject({ target: 3, done: 0, completed: false, habit: 0 });
  });

  it("ne revient pas deux semaines de suite sur le même muscle", () => {
    const thisWeek = weeklyQuest({ history: HISTORY, catalog: CATALOG, goals: GOALS, checkins: [], now: MONDAY })!;
    const nextWeek = weeklyQuest({ history: HISTORY, catalog: CATALOG, goals: GOALS, checkins: [], now: new Date(MONDAY.getTime() + 7 * DAY) })!;
    expect(nextWeek.parent).not.toBe(thisWeek.parent);
  });

  it("se boucle avec les séries de la semaine, séance en cours comprise", () => {
    const quest = weeklyQuest({ history: HISTORY, catalog: CATALOG, goals: GOALS, checkins: [], now: MONDAY })!;
    const exerciseFor = quest.parent === MuscleParent.hamstrings ? CURL_JAMBES : HIP_THRUST;
    const active = { ...session(new Date(MONDAY.getTime() + 3_600_000), [[exerciseFor, 3]]), isActive: true };
    expect(weeklyQuest({ history: HISTORY, catalog: CATALOG, goals: GOALS, checkins: [], active, now: MONDAY })).toMatchObject({ done: 3, completed: true });
  });

  it("après une semaine de nuits courtes, la quête ne demande qu'une série de plus que l'habitude", () => {
    const habitual = HISTORY.map((past) => session(past.date, [[CURL, 12], [CURL_JAMBES, 4], [HIP_THRUST, 4]]));
    const nights: RecoveryCheckin[] = [1, 2, 3, 4].map((k) => ({
      id: `c${k}`, date: new Date(MONDAY.getTime() - k * DAY), tookCreatine: null, proteinTargetMet: null, sleepHours: 5.5, hadAlcohol: null,
    }));
    expect(weeklyQuest({ history: habitual, catalog: CATALOG, goals: GOALS, checkins: [], now: MONDAY })?.target).toBe(6);
    expect(weeklyQuest({ history: habitual, catalog: CATALOG, goals: GOALS, checkins: nights, now: MONDAY })?.target).toBe(5);
  });
});

describe("saisons", () => {
  const settings = { bodyWeightKg: 73.7, gender: "male", ageYears: 26, trainingPhase: null, trainingPhaseStartedAt: null } as UserSettings;
  const base = { history: HISTORY, catalog: CATALOG, goals: GOALS, bodyWeights: [], settings };

  it("annonce l'automne les jours qui précèdent, puis compte ses jours", () => {
    const before = seasonState({ ...base, now: new Date(2026, 8, 26, 12) })!;
    expect(before).toMatchObject({ status: "upcoming", day: 5 });
    expect(before.season.id).toBe("automne-2026");
    expect(before.objectives.every((objective) => objective.progress === 0)).toBe(true);
    const during = seasonState({ ...base, now: new Date(2026, 9, 10, 12) })!;
    expect(during).toMatchObject({ status: "running", day: 10, totalDays: 92 });
    expect(during.next?.id).toBe("hiver-2027");
  });

  it("quatre saisons qui se suivent sans trou, d'octobre 2026 à septembre 2027", () => {
    for (let index = 1; index < SEASONS.length; index += 1) expect(SEASONS[index].start).toEqual(SEASONS[index - 1].end);
    expect(SEASONS).toHaveLength(4);
  });
});
