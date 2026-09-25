import { describe, expect, it } from "vitest";
import {
  activeMuscleFraction,
  bodyWeightForSession,
  CALORIES,
  cardioKcal,
  estimateSessionCalories,
  isCompound,
  movedLoadKg,
  sessionCalories,
  setCost,
} from "@/lib/engines/calories";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { CardioEntry, Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const START = new Date("2026-09-24T18:00:00");
const BW = { kg: 78, source: "weigh_in" as const };

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex", name: "Exercice", category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [], lastUsed: null, movementPattern: null,
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null, maxLoad: null, profileSource: "legacy",
    ...overrides,
  };
}

const LEG_PRESS = exercise({
  id: "press", name: "Presse à cuisses", movementPattern: "squat", fatigueClass: "heavy",
  muscleMappings: [
    { muscleGroup: MuscleGroup.vasteLat, coefficient: 1 },
    { muscleGroup: MuscleGroup.vasteMed, coefficient: 1 },
    { muscleGroup: MuscleGroup.droitFemoral, coefficient: 0.7 },
    { muscleGroup: MuscleGroup.glutMax, coefficient: 0.6 },
    { muscleGroup: MuscleGroup.grandAdducteur, coefficient: 0.3 },
  ],
});
const CURL = exercise({
  id: "curl", name: "Curl haltères", movementPattern: "isolation", fatigueClass: "light",
  muscleMappings: [
    { muscleGroup: MuscleGroup.bicepsLong, coefficient: 1 },
    { muscleGroup: MuscleGroup.bicepsCourt, coefficient: 1 },
    { muscleGroup: MuscleGroup.bracchial, coefficient: 0.6 },
    { muscleGroup: MuscleGroup.brachioradial, coefficient: 0.3 },
  ],
});
const PULLDOWN = exercise({
  id: "pull", name: "Tirage vertical", movementPattern: "vertical_pull",
  muscleMappings: [
    { muscleGroup: MuscleGroup.latSup, coefficient: 1 },
    { muscleGroup: MuscleGroup.latInf, coefficient: 1 },
    { muscleGroup: MuscleGroup.bicepsLong, coefficient: 0.5 },
    { muscleGroup: MuscleGroup.rhomboides, coefficient: 0.5 },
  ],
});
const PULL_UP = exercise({ ...PULLDOWN, id: "pullup", name: "Tractions", setPatternMode: "bodyweight" });
const CATALOG = [LEG_PRESS, CURL, PULLDOWN, PULL_UP];

function set(weight: number, reps: number, overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: crypto.randomUUID(), weight, reps, setType: SetType.work, timestamp: START, setSlotIndex: 0,
    completed: true, supersetRoundIndex: null, reportedRir: 2, ...overrides,
  };
}

/** Séance de `minutes` minutes, séries horodatées à intervalle régulier. */
function session(
  minutes: number | null,
  entries: { exercise: Exercise; sets: LoggedSet[] }[],
  cardioEntries: CardioEntry[] = []
): WorkoutSession {
  const total = entries.reduce((sum, e) => sum + e.sets.length, 0);
  const step = ((minutes ?? total * 3) * 60_000) / Math.max(1, total);
  let index = 0;
  return {
    id: "s", date: START, startTime: START, endTime: minutes === null ? null : new Date(START.getTime() + minutes * 60_000),
    notes: "", isActive: false, templateName: null, supersetGroups: [], cardioEntries,
    exercises: entries.map((entry, orderIndex) => ({
      id: `l${orderIndex}`, orderIndex, notes: "", exerciseId: entry.exercise.id, exerciseName: entry.exercise.name,
      supersetGroupId: null, plateauWeakPoint: null,
      sets: entry.sets.map((s, slot) => ({ ...s, setSlotIndex: slot, timestamp: new Date(START.getTime() + index++ * step) })),
    })),
  };
}

function repeat(count: number, make: () => LoggedSet): LoggedSet[] {
  return Array.from({ length: count }, make);
}

/** Séance type d'Evan : 18 séries de travail en une heure. */
function typicalHour(minutes = 60): WorkoutSession {
  return session(minutes, [
    { exercise: LEG_PRESS, sets: repeat(5, () => set(140, 10)) },
    { exercise: PULLDOWN, sets: repeat(5, () => set(60, 10)) },
    { exercise: CURL, sets: repeat(4, () => set(14, 12)) },
    { exercise: PULL_UP, sets: repeat(4, () => set(0, 8)) },
  ]);
}

describe("ordres de grandeur", () => {
  it("une heure de musculation classique dépense ~200 à 400 kcal (Compendium : 3,5 à 6 MET)", () => {
    const estimate = estimateSessionCalories(typicalHour(), CATALOG, BW);
    expect(estimate.kcal).toBeGreaterThanOrEqual(200);
    expect(estimate.kcal).toBeLessThanOrEqual(400);
    // MET moyen de la séance entre la musculation légère et vigoureuse du Compendium.
    const met = estimate.kcal / BW.kg;
    expect(met).toBeGreaterThanOrEqual(3);
    expect(met).toBeLessThanOrEqual(6);
  });

  it("deux heures de musculation ne dépensent pas 1 000 kcal", () => {
    const long = session(120, [
      { exercise: LEG_PRESS, sets: repeat(8, () => set(160, 10, { reportedRir: 0 })) },
      { exercise: PULLDOWN, sets: repeat(8, () => set(70, 10, { reportedRir: 0 })) },
      { exercise: CURL, sets: repeat(8, () => set(16, 12, { reportedRir: 0 })) },
      { exercise: PULL_UP, sets: repeat(8, () => set(0, 10, { reportedRir: 0 })) },
    ]);
    const estimate = estimateSessionCalories(long, CATALOG, BW);
    expect(estimate.high).toBeLessThan(900);
    expect(estimate.kcal).toBeGreaterThan(350);
  });

  it("donne une fourchette qui encadre l'estimation et une part active inférieure au total", () => {
    const estimate = estimateSessionCalories(typicalHour(), CATALOG, BW);
    expect(estimate.low).toBeLessThan(estimate.kcal);
    expect(estimate.high).toBeGreaterThan(estimate.kcal);
    expect(estimate.activeKcal).toBeLessThan(estimate.kcal);
    // Repos : 1 kcal/kg/h.
    expect(estimate.kcal - estimate.activeKcal).toBeCloseTo(BW.kg, -1);
  });

  it("une séance vide ne dépense rien", () => {
    const estimate = estimateSessionCalories(session(45, []), CATALOG, BW);
    expect(estimate.kcal).toBe(0);
    expect(estimate.exercises).toEqual([]);
  });
});

describe("chaque facteur pèse dans le bon sens", () => {
  it("un gros groupe musculaire coûte plus qu'un petit, à charge et reps égales", () => {
    expect(activeMuscleFraction(LEG_PRESS)).toBeGreaterThan(5 * activeMuscleFraction(CURL));
    expect(setCost(set(20, 10), LEG_PRESS, 78).grossKcal).toBeGreaterThan(setCost(set(20, 10), CURL, 78).grossKcal);
  });

  it("un polyarticulaire est reconnu, même sans pattern déclaré", () => {
    expect(isCompound(PULLDOWN)).toBe(true);
    expect(isCompound(CURL)).toBe(false);
    expect(isCompound({ ...LEG_PRESS, movementPattern: null })).toBe(true);
    expect(isCompound({ ...CURL, movementPattern: null })).toBe(false);
  });

  it("plus de charge et plus de reps coûtent plus", () => {
    const light = setCost(set(100, 10), LEG_PRESS, 78).grossKcal;
    expect(setCost(set(180, 10), LEG_PRESS, 78).grossKcal).toBeGreaterThan(light);
    expect(setCost(set(100, 15), LEG_PRESS, 78).grossKcal).toBeGreaterThan(light);
  });

  it("l'intensité (RIR) et l'échauffement modulent la série", () => {
    const atFailure = setCost(set(100, 10, { reportedRir: 0 }), LEG_PRESS, 78).grossKcal;
    const easy = setCost(set(100, 10, { reportedRir: 4 }), LEG_PRESS, 78).grossKcal;
    const warmup = setCost(set(100, 10, { setType: SetType.warmup }), LEG_PRESS, 78).grossKcal;
    expect(atFailure).toBeGreaterThan(easy);
    expect(warmup).toBeLessThan(easy);
  });

  it("des repos plus longs allongent la séance : plus de kcal au total, moins par minute", () => {
    const dense = estimateSessionCalories(typicalHour(50), CATALOG, BW);
    const slow = estimateSessionCalories(typicalHour(90), CATALOG, BW);
    expect(slow.kcal).toBeGreaterThan(dense.kcal);
    expect(slow.kcal / slow.minutes).toBeLessThan(dense.kcal / dense.minutes);
  });

  it("un poids de corps plus élevé dépense plus", () => {
    const light = estimateSessionCalories(typicalHour(), CATALOG, { kg: 65, source: "weigh_in" });
    const heavy = estimateSessionCalories(typicalHour(), CATALOG, { kg: 90, source: "weigh_in" });
    expect(heavy.kcal).toBeGreaterThan(light.kcal);
  });

  it("au poids du corps, la charge vient du corps ; lestée elle s'ajoute, assistée elle se retranche", () => {
    expect(movedLoadKg(set(0, 8), PULL_UP, 78)).toBeCloseTo(78 * 0.95);
    expect(movedLoadKg(set(10, 8), { ...PULL_UP, setPatternMode: "weighted_bodyweight" }, 78)).toBeCloseTo(78 * 0.95 + 10);
    expect(movedLoadKg(set(30, 8), { ...PULL_UP, setPatternMode: "assisted_bodyweight" }, 78)).toBeCloseTo(78 * 0.95 - 30);
    expect(movedLoadKg(set(60, 8), PULLDOWN, 78)).toBe(60);
  });

  it("un exercice sans profil retombe sur son pattern, jamais sur zéro", () => {
    const unknown = exercise({ id: "new", movementPattern: "hinge" });
    expect(activeMuscleFraction(unknown)).toBeGreaterThan(0.1);
    expect(activeMuscleFraction(undefined)).toBeGreaterThan(0);
  });

  it("les séries non validées ne comptent pas", () => {
    const withGhost = session(60, [
      { exercise: LEG_PRESS, sets: [...repeat(4, () => set(140, 10)), set(140, 10, { completed: false })] },
    ]);
    expect(estimateSessionCalories(withGhost, CATALOG, BW).exercises[0].sets).toBe(4);
  });
});

describe("durée de séance", () => {
  it("une séance oubliée ouverte toute la nuit est bornée", () => {
    const forgotten = estimateSessionCalories(typicalHour(12 * 60), CATALOG, BW);
    expect(forgotten.minutes).toBeLessThanOrEqual(18 * CALORIES.MAX_MINUTES_PER_SET + CALORIES.MAX_EXTRA_MINUTES);
    expect(forgotten.kcal).toBeLessThan(700);
  });

  it("sans heure de fin, la durée vient des horodatages des séries", () => {
    const open = estimateSessionCalories(session(null, [{ exercise: CURL, sets: repeat(10, () => set(14, 12)) }]), CATALOG, BW);
    // 10 séries espacées de 3 min : ~27 min d'étendue + 3 min.
    expect(open.minutes).toBeGreaterThanOrEqual(25);
    expect(open.minutes).toBeLessThanOrEqual(35);
  });
});

describe("cardio", () => {
  const bike: CardioEntry = {
    id: "c", activityType: "cycling", activityName: "Vélo", machineName: null, machineModel: null, durationSeconds: 1800,
    level: null, resistance: null, distanceKm: null, averageWatts: null, averageHeartRateBpm: null, inclinePercent: null, orderIndex: 0,
  };

  it("les watts donnent la dépense (équation ACSM : 150 W 30 min ≈ 330 kcal pour 78 kg)", () => {
    expect(cardioKcal({ ...bike, averageWatts: 150 }, 78)).toBeGreaterThan(300);
    expect(cardioKcal({ ...bike, averageWatts: 150 }, 78)).toBeLessThan(360);
  });

  it("course : ~1 kcal par kg et par km", () => {
    const run = { ...bike, activityType: "running" as const, distanceKm: 5 };
    expect(cardioKcal(run, 78)).toBeCloseTo(78 * 5 + 78 * 0.5, 0);
  });

  it("le cardio s'ajoute et son temps ne compte pas deux fois comme repos", () => {
    const lift = typicalHour(60);
    const withBike = { ...lift, endTime: new Date(START.getTime() + 90 * 60_000), cardioEntries: [bike] };
    const a = estimateSessionCalories(lift, CATALOG, BW);
    const b = estimateSessionCalories(withBike, CATALOG, BW);
    expect(b.minutes).toBe(90);
    expect(b.strengthKcal).toBeCloseTo(a.strengthKcal, -1);
    expect(b.cardioKcal).toBeCloseTo(6.8 * 78 * 0.5, 0);
  });
});

describe("poids du corps", () => {
  const entries = [
    { id: "a", measuredOn: new Date("2026-09-01T00:00:00"), weightKg: 82 },
    { id: "b", measuredOn: new Date("2026-09-24T00:00:00"), weightKg: 79 },
    { id: "c", measuredOn: new Date("2026-09-28T00:00:00"), weightKg: 78 },
  ];

  it("prend la dernière pesée connue à la date de la séance, celle du jour incluse", () => {
    expect(bodyWeightForSession(START, entries, 70)).toEqual({ kg: 79, source: "weigh_in" });
    expect(bodyWeightForSession(new Date("2026-09-10T18:00:00"), entries, 70).kg).toBe(82);
  });

  it("avant toute pesée, prend la première ; sans pesée, le réglage ; sinon une valeur par défaut", () => {
    expect(bodyWeightForSession(new Date("2026-08-01T18:00:00"), entries, 70).kg).toBe(82);
    expect(bodyWeightForSession(START, [], 70)).toEqual({ kg: 70, source: "settings" });
    expect(bodyWeightForSession(START, [], null)).toEqual({ kg: CALORIES.DEFAULT_BODY_WEIGHT_KG, source: "default" });
  });

  it("sessionCalories enchaîne pesée et estimation", () => {
    const estimate = sessionCalories(typicalHour(), CATALOG, entries, null);
    expect(estimate.bodyWeightKg).toBe(79);
  });
});
