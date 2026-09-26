import { describe, expect, it } from "vitest";
import { buildPrCountBySessionId } from "@/components/history/historyHelpers";
import {
  exerciseStats,
  isBehindPace,
  PROGRESS_STATS,
  recordEvents,
  weekStreak,
  weekPace,
  weekStats,
  type WeekStat, weekTier, nextWeekTier, setsToNextTier
} from "@/lib/engines/progress-stats";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, MuscleGoal, WorkoutSession } from "@/lib/models/types";

// Jeudi 24/09/2026, 18 h : la semaine a commencé le lundi 21.
const NOW = new Date("2026-09-24T18:00:00");
const DAY = 86_400_000;

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "row", name: "Low Row Technogym", category: "Pull", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.latInf, coefficient: 1 }],
    lastUsed: null, movementPattern: "horizontal_pull", resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: null, profileSource: "legacy", ...overrides,
  };
}

let counter = 0;
/** Une séance il y a `daysAgo` jours, séries espacées de 3 minutes. */
function session(daysAgo: number, entries: { exercise: Exercise; sets: [number, number][] }[]): WorkoutSession {
  const date = new Date(NOW.getTime() - daysAgo * DAY);
  counter += 1;
  let minute = 0;
  return {
    id: `s${counter}`, date, startTime: date, endTime: date, notes: "", isActive: false, templateName: null, supersetGroups: [],
    exercises: entries.map((entry, orderIndex) => ({
      id: `l${counter}-${orderIndex}`, orderIndex, notes: "", exerciseId: entry.exercise.id, exerciseName: entry.exercise.name,
      supersetGroupId: null, plateauWeakPoint: null,
      sets: entry.sets.map(([weight, reps], setSlotIndex): LoggedSet => {
        minute += 3;
        return {
          id: `set${counter}-${orderIndex}-${setSlotIndex}`, weight, reps, setType: SetType.work, setSlotIndex, completed: true,
          supersetRoundIndex: null, timestamp: new Date(date.getTime() + minute * 60_000),
        };
      }),
    })),
  } as WorkoutSession;
}

const ROW = exercise();
const GOALS: MuscleGoal[] = [{ parent: MuscleParent.grandDorsal, weeklyGoalSets: 10 } as MuscleGoal];

describe("records : les étoiles de l'Historique", () => {
  it("compte exactement les séries étoilées de l'Historique, séance par séance", () => {
    const history = [
      session(30, [{ exercise: ROW, sets: [[60, 10], [60, 9], [60, 8]] }]),
      session(20, [{ exercise: ROW, sets: [[62.5, 10], [60, 11]] }]),
      session(10, [{ exercise: ROW, sets: [[62.5, 11], [65, 8]] }]),
      session(3, [{ exercise: ROW, sets: [[65, 10], [65, 9]] }]),
    ];
    const events = recordEvents(history, [ROW]);
    const expected = buildPrCountBySessionId(history, [ROW]);
    for (const s of history) {
      expect(events.filter((event) => event.sessionId === s.id)).toHaveLength(expected.get(s.id) ?? 0);
    }
    expect(events.filter((event) => event.sessionId === history[0].id)).toHaveLength(0);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("semaines", () => {
  it("score plafonné par muscle, séances, séries et records de chaque semaine civile", () => {
    const history = [
      session(10, [{ exercise: ROW, sets: [[60, 10], [60, 10], [60, 10]] }]),
      session(8, [{ exercise: ROW, sets: [[62.5, 10], [60, 10], [60, 10], [60, 10]] }]),
      session(2, [{ exercise: ROW, sets: [[62.5, 12], [62.5, 10]] }]),
    ];
    const weeks = weekStats(history, [ROW], GOALS, NOW, 3);
    expect(weeks).toHaveLength(3);
    const [, lastWeek, thisWeek] = weeks;
    expect(thisWeek.inProgress).toBe(true);
    expect(thisWeek.sessions).toBe(1);
    expect(thisWeek.sets).toBe(2);
    expect(thisWeek.score).toBeCloseTo(0.2, 5);
    expect(lastWeek.sessions).toBe(2);
    expect(lastWeek.score).toBeCloseTo(0.7, 5);
    expect(lastWeek.best).toBe(true);
    expect(thisWeek.best).toBe(false);
    expect(thisWeek.goalsTotal).toBe(1);
  });

  it("la série compte les semaines d'affilée au bronze ou mieux, la semaine en cours dès qu'elle y est", () => {
    const week = (tier: WeekStat["tier"], inProgress = false) => ({ tier, inProgress }) as WeekStat;
    expect(weekStreak([week(null), week("bronze"), week("or"), week(null, true)])).toMatchObject({ weeks: 2, currentCounted: false });
    expect(weekStreak([week(null), week("argent"), week("bronze"), week("bronze", true)])).toMatchObject({ weeks: 3, currentCounted: true });
    expect(weekStreak([week("or"), week("argent"), week(null, true)])).toMatchObject({ weeks: 2, capped: true });
  });

  it("jokers : une semaine or en rapporte un, une semaine sous le bronze le dépense sans casser la série", () => {
    const week = (tier: WeekStat["tier"], day: number, inProgress = false) => ({ tier, inProgress, start: new Date(2026, 8, day) }) as WeekStat;
    const kept = weekStreak([week("bronze", 1), week("or", 8), week(null, 15), week("argent", 22), week(null, 29, true)]);
    expect(kept).toMatchObject({ weeks: 3, jokers: 0, currentCounted: false });
    expect(kept.protectedWeeks).toEqual([new Date(2026, 8, 15)]);
    // Sans joker en réserve, la série casse ; et un joker ne se dépense pas sans série à protéger.
    expect(weekStreak([week("or", 1), week(null, 8), week(null, 15), week("bronze", 22)])).toMatchObject({ weeks: 1, jokers: 0 });
    expect(weekStreak([week(null, 1), week("or", 8), week("or", 15), week("or", 22), week("or", 29)])).toMatchObject({ weeks: 4, jokers: 3 });
  });

  it("rythme : 2 séances sur 4 habituelles, un muscle à 4 séries sur 10 est en retard", () => {
    const pace = weekPace(2, 4);
    expect(pace).toBe(0.5);
    expect(isBehindPace(4, 10, pace)).toBe(true);
    expect(isBehindPace(5, 10, pace)).toBe(false);
    expect(isBehindPace(0, 0, pace)).toBe(false);
  });
});

describe("exercices", () => {
  it("un exercice pas fait depuis 19 semaines n'a aucune tendance (fini « +50 % ce mois »)", () => {
    const history = [140, 135, 130, 133].map((daysAgo, i) =>
      session(daysAgo, [{ exercise: ROW, sets: [[60 + i * 10, 8]] }])
    );
    const [stat] = exerciseStats(history, [ROW], NOW);
    expect(stat.status).toBe("dormant");
    expect(stat.delta).toBeNull();
  });

  it("progression : meilleure des 3 dernières séances contre les 3 d'avant", () => {
    const loads = [60, 60, 62.5, 62.5, 65, 67.5];
    const history = loads.map((load, i) => session(40 - i * 6, [{ exercise: ROW, sets: [[load, 10]] }]));
    const [stat] = exerciseStats(history, [ROW], NOW);
    expect(stat.status).toBe("progress");
    expect(stat.delta).toBeCloseTo(67.5 / 62.5 - 1, 5);
    expect(stat.points).toHaveLength(6);
  });

  it("une séance fatiguée n'est pas une baisse : il faut perdre plus de 3 %", () => {
    const history = [65, 65, 65, 65, 64, 65].map((load, i) => session(40 - i * 6, [{ exercise: ROW, sets: [[load, 10]] }]));
    const [stat] = exerciseStats(history, [ROW], NOW);
    expect(stat.status).not.toBe("decline");
  });

  it("plateau : rien de mieux et aucune étoile sur les 4 dernières séances", () => {
    const history = [65, 65, 65, 65, 65, 65].map((load, i) => session(40 - i * 6, [{ exercise: ROW, sets: [[load, 10]] }]));
    const [stat] = exerciseStats(history, [ROW], NOW);
    expect(stat.status).toBe("plateau");
  });

  it("machine maxée : progresser en reps à la charge max n'est pas un plateau", () => {
    const abs = exercise({ id: "abs", name: "Abdominal LifeFitness", maxLoad: 85, muscleMappings: [{ muscleGroup: MuscleGroup.absHaut, coefficient: 1 }] });
    const history = [12, 12, 13, 14, 15, 16].map((reps, i) => session(40 - i * 6, [{ exercise: abs, sets: [[85, reps]] }]));
    const [stat] = exerciseStats(history, [abs], NOW);
    expect(stat.status).toBe("maxed");
  });

  it("changement de salle : une machine découverte s'étalonne, sans tendance ni verdict", () => {
    const fp = exercise({ id: "row-fp", name: "Low row Matrix", equivalenceKey: "solo:row-fp" });
    const history = [
      ...[60, 62.5, 65].map((load, i) => session(30 - i * 5, [{ exercise: ROW, sets: [[load, 10]] }])),
      session(1, [{ exercise: fp, sets: [[40, 10], [40, 9]] }]),
    ];
    const stats = exerciseStats(history, [ROW, fp], NOW);
    const newMachine = stats.find((stat) => stat.exercise.id === "row-fp")!;
    expect(newMachine.status).toBe("new");
    expect(newMachine.delta).toBeNull();
    expect(newMachine.records).toBe(0);
    expect(stats[0].exercise.id).toBe("row-fp");
  });

  it("au poids du corps, la capacité se lit en reps jusqu'à l'échec", () => {
    const dips = exercise({ id: "dips", name: "Dips", setPatternMode: "bodyweight", muscleMappings: [{ muscleGroup: MuscleGroup.tricepsLat, coefficient: 1 }] });
    const history = [10, 10, 11, 12].map((reps, i) => session(30 - i * 5, [{ exercise: dips, sets: [[0, reps]] }]));
    const [stat] = exerciseStats(history, [dips], NOW, null);
    expect(stat.axis).toBe("reps");
    expect(stat.points.map((point) => point.value)).toEqual([10, 10, 11, 12]);
  });

  it("lesté : le poids du corps entre dans la charge, PDC et lest se comparent", () => {
    const pullups = exercise({ id: "pull", name: "Tractions SN", setPatternMode: "weighted_bodyweight" });
    const history = [session(20, [{ exercise: pullups, sets: [[0, 12]] }]), session(10, [{ exercise: pullups, sets: [[10, 8]] }])];
    const [stat] = exerciseStats(history, [pullups], NOW, 75);
    expect(stat.axis).toBe("load");
    expect(stat.points[0].value).toBeGreaterThan(75);
    expect(stat.points[1].value).toBeGreaterThan(85);
  });

  it("les constantes restent celles documentées", () => {
    expect(PROGRESS_STATS.TREND_WINDOW).toBe(3);
    expect(PROGRESS_STATS.DORMANT_DAYS).toBe(28);
  });
});

describe("paliers de semaine (Evan, 26/09/2026)", () => {
  it("bronze à 40 %, argent à 55 %, or à 70 %, rien en dessous", () => {
    expect(weekTier(0.39)).toBeNull();
    expect(weekTier(0.4)).toBe("bronze");
    expect(weekTier(0.57)).toBe("argent");
    expect(weekTier(0.7)).toBe("or");
    expect(weekTier(1)).toBe("or");
  });

  it("dit le prochain palier et les séries qui manquent, rien une fois l'or atteint", () => {
    // Semaine du 21/09 : 57 % d'environ 150 séries d'objectifs.
    expect(nextWeekTier(0.57)?.tier).toBe("or");
    expect(setsToNextTier(0.57, 150)).toBe(Math.ceil((0.7 - 0.57) * 150));
    expect(setsToNextTier(0.1, 150)).toBe(45);
    expect(nextWeekTier(0.72)).toBeNull();
    expect(setsToNextTier(0.72, 150)).toBeNull();
  });

  it("au bord du seuil, il manque au moins une série, jamais zéro", () => {
    expect(setsToNextTier(0.3999, 150)).toBe(1);
  });
});
