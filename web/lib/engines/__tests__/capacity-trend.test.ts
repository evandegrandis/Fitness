import { describe, expect, it } from "vitest";
import {
  CAPACITY_TREND,
  PRIOR_CONTEXT_COST,
  capacityTrend,
  contextReps,
  learnContextCost,
  learnContextCosts,
  sessionForecastGap,
  setContext,
  trendNoise,
  type ContextPair,
} from "@/lib/engines/capacity-trend";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const DAY = 86_400_000;
const T0 = new Date("2026-09-01T16:00:00Z");

function exercise(id: string, muscles: { muscleGroup: MuscleGroup; coefficient: number }[]): Exercise {
  return {
    id, name: id, category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 2.5,
    isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: muscles, lastUsed: null, movementPattern: "isolation", resistanceProfile: null, strengthStandardKey: null,
    benchmarkUnit: null, maxLoad: null,
  };
}

const points = (values: number[], gapDays = 3) => values.map((value, index) => ({ date: new Date(T0.getTime() + index * gapDays * DAY), value }));

describe("contexte d'une série", () => {
  it("compte les séries des autres exercices faites avant elle, et le même muscle au coefficient du profil", () => {
    const dips = exercise("dips", [{ muscleGroup: MuscleGroup.tricepsLat, coefficient: 1 }]);
    const press = exercise("press", [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }, { muscleGroup: MuscleGroup.tricepsLat, coefficient: 0.5 }]);
    const curl = exercise("curl", [{ muscleGroup: MuscleGroup.bicepsLong, coefficient: 1 }]);
    const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
    const set = (minutes: number, reps = 10): LoggedSet => ({
      id: `s${minutes}`, weight: 20, reps, setType: SetType.work, timestamp: at(minutes), setSlotIndex: 0, completed: true, supersetRoundIndex: null,
    });
    const logged = (ex: Exercise, sets: LoggedSet[], orderIndex: number) => ({
      id: `l-${ex.id}`, orderIndex, notes: "", exerciseId: ex.id, exerciseName: ex.name, sets, supersetGroupId: null, plateauWeakPoint: null,
    });
    const session = {
      id: "s", date: T0, startTime: T0, endTime: at(90), notes: "", isActive: false, templateName: null, supersetGroups: [], cardioEntries: [],
      exercises: [logged(press, [set(0), set(3), set(6)], 0), logged(curl, [set(9), set(12)], 1), logged(dips, [set(20, 15), set(23, 12)], 2), logged(curl, [set(30)], 3)],
    } as WorkoutSession;
    const catalog = new Map([dips, press, curl].map((entry) => [entry.id, entry]));
    // Avant la 1re série de dips : 3 séries de développé (moitié triceps) et 2 de curl ; la 3e série de curl vient après.
    expect(setContext(session, dips, at(20), catalog)).toEqual({ sets: 5, sameMuscleSets: 1.5 });
    // Les séries de dips elles-mêmes ne comptent pas.
    expect(setContext(session, dips, at(23), catalog)).toEqual({ sets: 5, sameMuscleSets: 1.5 });
    expect(contextReps({ perSet: 0.1, perSameMuscleSet: 0.6, pairs: 0 }, { sets: 5, sameMuscleSets: 1.5 })).toBeCloseTo(1.4, 9);
  });
});

describe("coût du contexte appris", () => {
  it("sans paire, garde l'a priori : l'ancienne règle fixe rendue continue", () => {
    expect(learnContextCost([])).toEqual(PRIOR_CONTEXT_COST);
    expect(PRIOR_CONTEXT_COST.perSet).toBe(0.25);
  });

  it("retrouve le coût qui a produit les données, la progression d'une séance à l'autre restant libre", () => {
    // Vérité : 0,15 rep par série faite avant, 0,8 de plus par série du même muscle, +0,3 rep de progression par séance.
    const pairs: ContextPair[] = [];
    for (let i = 0; i < 400; i += 1) {
      const setsGap = ((i * 7) % 13) - 6;
      const sameMuscleGap = ((i * 5) % 9) - 4;
      pairs.push({ setsGap, sameMuscleGap, repsGap: 0.3 - 0.15 * setsGap - 0.8 * sameMuscleGap + (i % 2 ? 0.5 : -0.5) });
    }
    const cost = learnContextCost(pairs);
    expect(cost.perSet).toBeCloseTo(0.15, 1);
    expect(cost.perSameMuscleSet).toBeCloseTo(0.8, 1);
    expect(cost.pairs).toBe(400);
  });

  it("avec peu de paires, reste près de l'a priori ; jamais un coût négatif", () => {
    const few = learnContextCost([{ setsGap: 6, sameMuscleGap: 6, repsGap: -30 }]);
    expect(few.perSameMuscleSet).toBeLessThan(CAPACITY_TREND.MAX_REPS_PER_SET + 1e-9);
    const stronger = learnContextCost(Array.from({ length: 50 }, (_, i) => ({ setsGap: i % 2 ? 4 : -4, sameMuscleGap: 0, repsGap: i % 2 ? 2 : -2 })));
    expect(stronger.perSet).toBe(0);
  });

  it("un axe sans paire prend le coût appris sur tous les exercices", () => {
    const pairs = Array.from({ length: 60 }, (_, i) => ({ axis: "load" as const, setsGap: (i % 5) - 2, sameMuscleGap: (i % 3) - 1, repsGap: -0.2 * ((i % 5) - 2) - 0.9 * ((i % 3) - 1) }));
    const costs = learnContextCosts(pairs);
    expect(costs.reps.pairs).toBe(0);
    expect(costs.reps.perSet).toBeCloseTo(learnContextCost(pairs).perSet, 9);
    expect(costs.reps.perSameMuscleSet).toBeCloseTo(learnContextCost(pairs).perSameMuscleSet, 9);
  });
});

describe("bruit d'une séance à l'autre", () => {
  it("sans historique, l'a priori de l'axe ; avec, le bruit de l'exercice rétréci vers celui de son axe", () => {
    expect(trendNoise([])("x", "load")).toBeCloseTo(CAPACITY_TREND.PRIOR_NOISE_LOAD, 9);
    expect(trendNoise([])("x", "reps")).toBeCloseTo(CAPACITY_TREND.PRIOR_NOISE_REPS, 9);
    const steady = Array.from({ length: 30 }, (_, i) => ({ exerciseId: "steady", axis: "load" as const, logGap: i % 2 ? 0.01 : -0.01 }));
    const noisy = Array.from({ length: 30 }, (_, i) => ({ exerciseId: "noisy", axis: "load" as const, logGap: i % 2 ? 0.12 : -0.12 }));
    const noise = trendNoise([...steady, ...noisy]);
    expect(noise("steady", "load")).toBeLessThan(noise("noisy", "load"));
    expect(noise("steady", "load")).toBeGreaterThan(0.01 / Math.SQRT2);
  });
});

describe("tendance : écart à la prévision", () => {
  it("moins de 4 séances : pas de tendance", () => {
    expect(capacityTrend(points([100, 101, 102]), 0.05)).toEqual({ delta: null, threshold: null, direction: null });
  });

  it("écart moyen (géométrique) des 3 dernières aux 3 d'avant, jugé contre le bruit", () => {
    const trend = capacityTrend(points([100, 100, 100, 110, 110, 110]), 0.03);
    expect(trend.delta).toBeCloseTo(0.1, 9);
    expect(trend.threshold).toBeCloseTo(Math.exp(CAPACITY_TREND.Z * 0.03 * Math.sqrt(2 / 3)) - 1, 9);
    expect(trend.direction).toBe("up");
    // Le même écart sur un exercice bien plus bruité n'est pas une tendance.
    expect(capacityTrend(points([100, 100, 100, 110, 110, 110]), 0.1).direction).toBe("flat");
    expect(capacityTrend(points([100, 100, 100, 90, 90, 90]), 0.03).direction).toBe("down");
  });

  it("une reprise après plus de 28 jours ne se compare pas à l'avant-pause", () => {
    const before = points([80, 80, 80]);
    const after = points([100, 100, 100], 3).map((point) => ({ ...point, date: new Date(point.date.getTime() + 60 * DAY) }));
    expect(capacityTrend([...before, ...after], 0.03).direction).toBeNull();
    const more = points([100, 100, 100, 100], 3).map((point) => ({ ...point, date: new Date(point.date.getTime() + 60 * DAY) }));
    expect(capacityTrend([...before, ...more], 0.03)).toMatchObject({ delta: 0, direction: "flat" });
  });

  it("écart d'une séance seule à sa prévision, avec le bruit d'une séance seule", () => {
    const series = points([100, 100, 100, 90]);
    expect(sessionForecastGap(series, 2, 0.05)).toBeNull();
    const gap = sessionForecastGap(series, 3, 0.05)!;
    expect(gap.gap).toBeCloseTo(-0.1, 9);
    expect(gap.threshold).toBeCloseTo(Math.exp(CAPACITY_TREND.Z * 0.05 * Math.sqrt(4 / 3)) - 1, 9);
    expect(gap.direction).toBe("down");
    expect(sessionForecastGap(series, 3, 0.1)!.direction).toBe("flat");
  });
});
