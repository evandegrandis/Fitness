import { describe, expect, it } from "vitest";
import {
  coverageForWeek,
  leafSets,
  liveParentImpact,
  liveParentImpactForSets,
  parentSets,
  parentTotals,
  parentsWorkedInWeek,
  rolling7DayGlobalCoverage,
  rolling7DayLeafBreakdown,
  rolling7DayProgress,
  rollingPriorities,
  rollingStatusLine,
} from "@/lib/engines/effective-sets";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedExercise, LoggedSet, MuscleGoal, WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BENCH: Exercise = {
  id: "ex-bench",
  name: "Développé couché",
  category: "push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 10,
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
  // Pectoraux (0.8 clav / 1.0 stern) + Triceps synergiste (0.3 long) — modèle
  // volontairement simple pour vérifier l'agrégation max au niveau parent.
  muscleMappings: [
    { muscleGroup: MuscleGroup.pectClav, coefficient: 0.8 },
    { muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 },
    { muscleGroup: MuscleGroup.tricepsLong, coefficient: 0.3 },
  ],
  lastUsed: null,
};

function set(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-10T10:00:00"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function loggedExercise(exerciseId: string, sets: LoggedSet[], overrides: Partial<LoggedExercise> = {}): LoggedExercise {
  return {
    id: `le-${Math.random().toString(36).slice(2)}`,
    orderIndex: 0,
    notes: "",
    exerciseId,
    exerciseName: "Développé couché",
    sets,
    supersetGroupId: null,
    ...overrides,
  };
}

function session(date: Date, exercises: LoggedExercise[], overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: `session-${date.getTime()}-${Math.random().toString(36).slice(2)}`,
    date,
    startTime: date,
    endTime: date,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
    ...overrides,
  };
}

// Référence fixe : 2026-07-14 (mardi), heure de midi pour éviter tout souci
// de bord de journée.
const REF = new Date("2026-07-14T12:00:00");

describe("leafSets / parentSets", () => {
  it("multiplie completedWorkSets.length par le coefficient de chaque feuille", () => {
    const le = loggedExercise("ex-bench", [set({ reps: 8 }), set({ reps: 8 }), set({ setType: SetType.warmup })]);
    const leaves = leafSets(le, BENCH);
    // 2 sets de travail complétés (le warmup est exclu)
    expect(leaves.get(MuscleGroup.pectClav)).toBeCloseTo(1.6);
    expect(leaves.get(MuscleGroup.pectStern)).toBeCloseTo(2.0);
    expect(leaves.get(MuscleGroup.tricepsLong)).toBeCloseTo(0.6);
  });

  it("parentSets utilise le MAX des feuilles du même parent, jamais la somme", () => {
    const le = loggedExercise("ex-bench", [set({ reps: 8 })]);
    const parents = parentSets(le, BENCH);
    // Pectoraux : max(0.8, 1.0) = 1.0 (PAS 1.8, qui serait la somme)
    expect(parents.get(MuscleParent.pectoraux)).toBeCloseTo(1.0);
    expect(parents.get(MuscleParent.triceps)).toBeCloseTo(0.3);
  });

  it("retourne une map vide si aucun set de travail complété", () => {
    const le = loggedExercise("ex-bench", [set({ completed: false })]);
    expect(leafSets(le, BENCH).size).toBe(0);
    expect(parentSets(le, BENCH).size).toBe(0);
  });

  it("compte un drop-set 4+6 très rapproché comme une seule série effective, pas deux", () => {
    const started = new Date("2026-07-10T10:00:00.000Z");
    const le = loggedExercise("ex-bench", [
      set({ weight: 100, reps: 4, setSlotIndex: 0, timestamp: started }),
      set({
        weight: 75,
        reps: 6,
        setSlotIndex: 1,
        timestamp: new Date(started.getTime() + 15_000),
        setType: SetType.backoff,
      }),
    ]);

    expect(parentSets(le, BENCH).get(MuscleParent.pectoraux)).toBeCloseTo(1);
    expect(leafSets(le, BENCH).get(MuscleGroup.pectClav)).toBeCloseTo(0.8);
  });

  it("un composite sous 10 reps contribue proportionnellement mais ne vaut jamais une série pleine", () => {
    const started = new Date("2026-07-10T10:00:00.000Z");
    const le = loggedExercise("ex-bench", [
      set({ weight: 100, reps: 4, setSlotIndex: 0, timestamp: started }),
      set({ weight: 75, reps: 3, setSlotIndex: 1, timestamp: new Date(started.getTime() + 10_000) }),
    ]);

    expect(parentSets(le, BENCH).get(MuscleParent.pectoraux)).toBeCloseTo(0.7);
  });
});

describe("fenêtre roulante 7 jours — demi-ouverte", () => {
  it("inclut un set exactement à J-7 (borne de début incluse)", () => {
    // referenceDate = 2026-07-14T12:00 → fenêtre = [2026-07-08T00:00, 2026-07-15T00:00)
    const exactlyJMinus7 = new Date("2026-07-08T09:00:00");
    const s = session(exactlyJMinus7, [loggedExercise("ex-bench", [set({ reps: 8 })])]);
    const goals: MuscleGoal[] = [{ parent: MuscleParent.pectoraux, weeklyGoalSets: 10 }];

    const progress = rolling7DayProgress([s], [BENCH], goals, REF);
    const pect = progress.find((p) => p.parent === MuscleParent.pectoraux);
    expect(pect?.effectiveSets).toBeCloseTo(1.0);
  });

  it("exclut un set juste avant J-7 (hors fenêtre)", () => {
    const beforeWindow = new Date("2026-07-07T23:00:00");
    const s = session(beforeWindow, [loggedExercise("ex-bench", [set({ reps: 8 })])]);
    const goals: MuscleGoal[] = [{ parent: MuscleParent.pectoraux, weeklyGoalSets: 10 }];

    const progress = rolling7DayProgress([s], [BENCH], goals, REF);
    const pect = progress.find((p) => p.parent === MuscleParent.pectoraux);
    expect(pect?.effectiveSets ?? 0).toBe(0);
  });

  it("exclut un set à la borne de fin (referenceDate + 1 jour, exclusif)", () => {
    const afterWindow = new Date("2026-07-15T00:00:00");
    const s = session(afterWindow, [loggedExercise("ex-bench", [set({ reps: 8 })])]);
    const goals: MuscleGoal[] = [{ parent: MuscleParent.pectoraux, weeklyGoalSets: 10 }];

    const progress = rolling7DayProgress([s], [BENCH], goals, REF);
    const pect = progress.find((p) => p.parent === MuscleParent.pectoraux);
    expect(pect?.effectiveSets ?? 0).toBe(0);
  });

  it("exclut les sessions actives des totaux, sauf via liveSession explicite", () => {
    const active = session(new Date("2026-07-13T10:00:00"), [loggedExercise("ex-bench", [set({ reps: 8 })])], {
      isActive: true,
    });
    const totalsWithoutLive = parentTotals([active], [BENCH], new Date("2026-07-08"), new Date("2026-07-15"));
    expect(totalsWithoutLive.get(MuscleParent.pectoraux) ?? 0).toBe(0);

    const totalsWithLive = parentTotals(
      [active],
      [BENCH],
      new Date("2026-07-08"),
      new Date("2026-07-15"),
      active
    );
    expect(totalsWithLive.get(MuscleParent.pectoraux)).toBeCloseTo(1.0);
  });
});

describe("statuts de couverture aux 4 seuils", () => {
  const goals: MuscleGoal[] = [{ parent: MuscleParent.pectoraux, weeklyGoalSets: 10 }];

  function progressFor(completedSets: number) {
    const sets = Array.from({ length: completedSets }, () => set({ reps: 8 }));
    const s = session(new Date("2026-07-13T10:00:00"), [loggedExercise("ex-bench", sets)]);
    return rolling7DayProgress([s], [BENCH], goals, REF).find((p) => p.parent === MuscleParent.pectoraux)!;
  }

  it(">= 100% → covered", () => {
    // pectoraux coeff = 1.0 (max), donc 10 sets → 10.0 effective / 10 goal = 100%
    expect(progressFor(10).status).toBe("covered");
    expect(progressFor(10).coverage).toBe(1.0);
  });

  it(">= 70% et < 100% → onTrack", () => {
    expect(progressFor(7).status).toBe("onTrack");
  });

  it(">= 40% et < 70% → toStrengthen", () => {
    expect(progressFor(4).status).toBe("toStrengthen");
  });

  it("< 40% → priority", () => {
    expect(progressFor(3).status).toBe("priority");
  });

  it("remaining = max(0, goal - effective), plafonné à 0 au-delà de l'objectif", () => {
    expect(progressFor(15).remaining).toBe(0);
    expect(progressFor(4).remaining).toBeCloseTo(6.0);
  });
});

describe("rolling7DayGlobalCoverage / rollingStatusLine / rollingPriorities", () => {
  it("calcule la couverture globale pondérée et exclut les priorités couvertes", () => {
    const goals: MuscleGoal[] = [
      { parent: MuscleParent.pectoraux, weeklyGoalSets: 10 },
      { parent: MuscleParent.triceps, weeklyGoalSets: 5 },
    ];
    const sets = Array.from({ length: 10 }, () => set({ reps: 8 }));
    const s = session(new Date("2026-07-13T10:00:00"), [loggedExercise("ex-bench", sets)]);

    // Pectoraux: 10 effective / 10 goal = 100% couvert (coeff max 1.0)
    // Triceps: 3 effective / 5 goal = 60% (coeff 0.3 x 10 sets = 3.0)
    const globalCoverage = rolling7DayGlobalCoverage([s], [BENCH], goals, REF);
    expect(globalCoverage).toBeCloseTo((10 + 3) / 15);

    const progress = rolling7DayProgress([s], [BENCH], goals, REF);
    const priorities = rollingPriorities([s], [BENCH], goals, REF);
    // Triceps reste prioritaire (remaining = 2 >= 0.5), pectoraux non (remaining = 0)
    expect(priorities).toEqual([[MuscleParent.triceps, 2]]);

    const line = rollingStatusLine(progress, [s], REF);
    expect(line).toContain("triceps");
  });

  it("rollingStatusLine renvoie le message par défaut sans objectifs", () => {
    expect(rollingStatusLine([], [], REF)).toBe("Pas encore d'objectifs configurés");
  });
});

describe("coverageForWeek / parentsWorkedInWeek — semaine calendaire (historique uniquement)", () => {
  it("agrège sur [weekStart, weekStart+7) indépendamment de la fenêtre roulante", () => {
    const weekStart = new Date("2026-07-06T00:00:00"); // lundi
    const s = session(new Date("2026-07-08T10:00:00"), [loggedExercise("ex-bench", [set({ reps: 8 })])]);
    const goals: MuscleGoal[] = [{ parent: MuscleParent.pectoraux, weeklyGoalSets: 5 }];

    expect(coverageForWeek([s], [BENCH], goals, weekStart)).toBeCloseTo(1.0 / 5);
    expect(parentsWorkedInWeek([s], [BENCH], weekStart)).toBe(2); // pectoraux + triceps
  });
});

describe("rolling7DayLeafBreakdown et liveParentImpact", () => {
  it("trie les feuilles par sets décroissants", () => {
    const s = session(new Date("2026-07-13T10:00:00"), [loggedExercise("ex-bench", [set({ reps: 8 })])]);
    const breakdown = rolling7DayLeafBreakdown([s], [BENCH], MuscleParent.pectoraux, REF);
    expect(breakdown[0].leaf).toBe(MuscleGroup.pectStern); // 1.0 > 0.8
    expect(breakdown[0].sets).toBeCloseTo(1.0);
    expect(breakdown[1].leaf).toBe(MuscleGroup.pectClav);
  });

  it("liveParentImpact calcule l'impact direct par parent (aggregateCoefficient x completedSets)", () => {
    const impact = liveParentImpact(BENCH, 3);
    expect(impact.get(MuscleParent.pectoraux)).toBeCloseTo(3.0);
    expect(impact.get(MuscleParent.triceps)).toBeCloseTo(0.9);
  });

  it("liveParentImpactForSets normalise les mini-blocs avant l'impact en direct", () => {
    const started = new Date("2026-07-10T10:00:00.000Z");
    const impact = liveParentImpactForSets(BENCH, [
      set({ weight: 100, reps: 4, setSlotIndex: 0, timestamp: started }),
      set({ weight: 75, reps: 6, setSlotIndex: 1, timestamp: new Date(started.getTime() + 10_000) }),
    ]);
    expect(impact.get(MuscleParent.pectoraux)).toBeCloseTo(1);
    expect(impact.get(MuscleParent.triceps)).toBeCloseTo(0.3);
  });
});
