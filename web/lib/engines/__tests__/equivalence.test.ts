import { describe, expect, it } from "vitest";
import {
  areEquivalent,
  conversionBetween,
  defaultEquivalent,
  equivalenceKey,
  familyHistory,
  freshCapacity,
} from "@/lib/engines/equivalence";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

function exercise(id: string, name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id, name, category: "Push", setPatternMode: "straight", repTargetMin: 6, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: true, sortOrder: 0,
    suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
    lastUsed: null, movementPattern: null, resistanceProfile: null,
    strengthStandardKey: null, benchmarkUnit: null,
    ...overrides,
  };
}

const OLD = exercise("old", "Chest Press");
const NEW = exercise("new", "Chest Press LifeFitness");
const PEC = exercise("pec", "Pec deck");
const CATALOG = [OLD, NEW, PEC];

const day = (d: number, minutes = 0) => new Date(Date.UTC(2026, 7, d, 17, minutes));

function logged(ex: Exercise, sets: { w: number; r: number; at: Date; rir?: number }[], orderIndex = 0): LoggedExercise {
  return {
    id: `le-${ex.id}-${sets[0]?.at.getTime()}`,
    orderIndex,
    notes: "",
    exerciseId: ex.id,
    exerciseName: ex.name,
    supersetGroupId: null,
    plateauWeakPoint: null,
    sets: sets.map((s, i): LoggedSet => ({
      id: `s-${ex.id}-${s.at.getTime()}-${i}`,
      weight: s.w,
      reps: s.r,
      setType: SetType.work,
      timestamp: s.at,
      setSlotIndex: i,
      completed: true,
      supersetRoundIndex: null,
      reportedRir: s.rir ?? null,
    })),
  };
}

function session(at: Date, exercises: LoggedExercise[]): WorkoutSession {
  return {
    id: `session-${at.getTime()}`,
    date: at,
    startTime: at,
    endTime: at,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
    cardioEntries: [],
  };
}

/** Une séance, un exercice, des séries à 3 min d'écart. */
function solo(ex: Exercise, d: number, sets: [number, number][]): WorkoutSession {
  const start = day(d);
  return session(start, [
    logged(ex, sets.map(([w, r], i) => ({ w, r, at: new Date(start.getTime() + i * 180_000) }))),
  ]);
}

describe("familles de machines équivalentes", () => {
  it("réunit le même mouvement sur deux marques", () => {
    expect(areEquivalent(OLD, NEW)).toBe(true);
    expect(areEquivalent({ name: "Low row" }, { name: "Low Row Technogym" })).toBe(true);
    expect(areEquivalent({ name: "Leg curl" }, { name: "Leg curl LifeFitness" })).toBe(true);
  });

  it("réunit les noms qui diffèrent au-delà de la marque", () => {
    expect(areEquivalent({ name: "Pec deck" }, { name: "Pectoral fly LifeFitness" })).toBe(true);
    expect(areEquivalent({ name: "Presse à cuisses" }, { name: "Leg Press Technogym" })).toBe(true);
    expect(areEquivalent({ name: "Crunch machine" }, { name: "Abdominal LifeFitness" })).toBe(true);
    expect(areEquivalent({ name: "Pulley serré" }, { name: "Tirage horizontal poulie basse" })).toBe(true);
  });

  it("ne réunit pas deux choix différents du même muscle", () => {
    expect(areEquivalent({ name: "Lateral raises" }, { name: "Delts machine Technogym" })).toBe(false);
    expect(areEquivalent({ name: "Pec deck" }, { name: "Pec deck bras tendus" })).toBe(false);
    expect(areEquivalent({ name: "Low row" }, { name: "Pulley serré" })).toBe(false);
  });

  it("ne transforme pas « Hammer curl » en « curl »", () => {
    expect(equivalenceKey({ name: "Hammer curl" })).toBe("hammer curl");
  });
});

describe("machine par défaut", () => {
  it("est la dernière machine utilisée de la famille", () => {
    const history = [solo(OLD, 1, [[100, 10]]), solo(NEW, 20, [[72.5, 10]])];
    expect(defaultEquivalent(OLD, CATALOG, history).id).toBe(NEW.id);
    expect(defaultEquivalent(NEW, CATALOG, history).id).toBe(NEW.id);
  });

  it("revient à l'ancienne machine si c'est elle qui a servi en dernier", () => {
    const history = [solo(NEW, 1, [[72.5, 10]]), solo(OLD, 20, [[100, 10]])];
    expect(defaultEquivalent(NEW, CATALOG, history).id).toBe(OLD.id);
  });
});

describe("capacité à frais", () => {
  it("ajoute le RIR rapporté : une série arrêtée loin de l'échec vaut plus que ses reps", () => {
    const start = day(1);
    const plain = session(start, [logged(OLD, [{ w: 100, r: 10, at: start }])]);
    const withRir = session(start, [logged(OLD, [{ w: 100, r: 10, at: start, rir: 2 }])]);
    const byId = new Map(CATALOG.map((e) => [e.id, e]));
    expect(freshCapacity(withRir, OLD, byId)!).toBeGreaterThan(freshCapacity(plain, OLD, byId)!);
  });

  it("corrige la fatigue : la même série vaut plus quand le muscle était déjà entamé", () => {
    const start = day(1);
    const fresh = session(start, [logged(NEW, [{ w: 70, r: 10, at: start }])]);
    const tired = session(start, [
      logged(PEC, [0, 1, 2, 3].map((i) => ({ w: 60, r: 10, at: new Date(start.getTime() + i * 120_000) })), 0),
      logged(NEW, [{ w: 70, r: 10, at: new Date(start.getTime() + 20 * 60_000) }], 1),
    ]);
    const byId = new Map(CATALOG.map((e) => [e.id, e]));
    expect(freshCapacity(tired, NEW, byId)!).toBeGreaterThan(freshCapacity(fresh, NEW, byId)!);
  });
});

describe("facteur de conversion", () => {
  it("se mesure sur le niveau récent avant le changement, pas sur le premier record", () => {
    // Progression continue sur l'ancienne machine : 60 × 10 au début, 80 × 10 juste avant le départ.
    const history = [
      solo(OLD, 1, [[60, 10]]),
      solo(OLD, 8, [[70, 10]]),
      solo(OLD, 15, [[80, 10]]),
      solo(OLD, 18, [[80, 10]]),
      solo(NEW, 22, [[72, 10]]),
    ];
    const conversion = conversionBetween(OLD, NEW, CATALOG, history)!;
    expect(conversion.ratio).toBeGreaterThan(0.85);
    expect(conversion.ratio).toBeLessThan(0.95);
  });

  it("tient compte de la fatigue : une nouvelle machine faite en fin de séance n'est pas sous-cotée", () => {
    const history = [solo(OLD, 15, [[80, 10]]), solo(OLD, 18, [[80, 10]])];
    const start = day(22);
    const tiredNew = session(start, [
      logged(PEC, [0, 1, 2, 3].map((i) => ({ w: 60, r: 10, at: new Date(start.getTime() + i * 120_000) })), 0),
      logged(NEW, [{ w: 72, r: 10, at: new Date(start.getTime() + 20 * 60_000) }], 1),
    ]);
    const raw = conversionBetween(OLD, NEW, CATALOG, [...history, solo(NEW, 22, [[72, 10]])])!;
    const corrected = conversionBetween(OLD, NEW, CATALOG, [...history, tiredNew])!;
    expect(corrected.ratio).toBeGreaterThan(raw.ratio);
  });

  it("est l'inverse dans l'autre sens", () => {
    const history = [solo(OLD, 15, [[80, 10]]), solo(NEW, 22, [[72, 10]])];
    const there = conversionBetween(OLD, NEW, CATALOG, history)!.ratio;
    const back = conversionBetween(NEW, OLD, CATALOG, history)!.ratio;
    expect(there * back).toBeCloseTo(1, 6);
  });

  it("ne mesure rien si les deux machines sont trop éloignées dans le temps", () => {
    // Plus de 8 semaines d'écart : la progression entre-temps rendrait la mesure fausse.
    const late = new Date(Date.UTC(2026, 9, 30, 17));
    const farNew = session(late, [logged(NEW, [{ w: 72, r: 10, at: late }])]);
    expect(conversionBetween(OLD, NEW, CATALOG, [solo(OLD, 1, [[80, 10]]), farNew])).toBeNull();
  });

  it("n'existe pas avant la première séance sur la nouvelle machine", () => {
    expect(conversionBetween(OLD, NEW, CATALOG, [solo(OLD, 15, [[80, 10]])])).toBeNull();
  });
});

describe("historique continu du mouvement", () => {
  it("convertit l'ancienne machine dans les charges de la nouvelle, arrondies à son incrément", () => {
    const history = [solo(OLD, 15, [[80, 10]]), solo(NEW, 22, [[72, 10]])];
    const family = familyHistory(NEW, CATALOG, history);
    const converted = family.history
      .flatMap((s) => s.exercises)
      .filter((l) => l.exerciseId === NEW.id && l.id.includes("~"));
    expect(converted).toHaveLength(1);
    const weight = converted[0].sets[0].weight;
    expect(weight % NEW.smallestIncrement).toBe(0);
    expect(weight).toBeGreaterThan(65);
    expect(weight).toBeLessThan(80);
  });

  it("signale que la séance la plus récente du mouvement a été faite sur une autre machine", () => {
    const history = [solo(OLD, 15, [[80, 10]]), solo(NEW, 22, [[72, 10]]), solo(OLD, 25, [[82.5, 10]])];
    expect(familyHistory(NEW, CATALOG, history).latestFrom?.exercise.id).toBe(OLD.id);
    expect(familyHistory(OLD, CATALOG, history).latestFrom).toBeNull();
  });

  it("ne touche à rien tant que le facteur est inconnu", () => {
    const history = [solo(OLD, 15, [[80, 10]])];
    const family = familyHistory(NEW, CATALOG, history);
    expect(family.conversions).toEqual([]);
    expect(family.history).toEqual(history);
  });
});
