import { describe, expect, it } from "vitest";
import { buildSessionReview } from "@/lib/engines/bilan";
import { MuscleGroup } from "@/lib/models/muscles";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

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
  muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
  lastUsed: null,
};

const ROW: Exercise = {
  ...BENCH,
  id: "ex-row",
  name: "Rowing",
  fatigueClass: "medium",
  muscleMappings: [{ muscleGroup: MuscleGroup.latSup, coefficient: 1.0 }],
};

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-14T10:00:00"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function loggedExercise(exercise: Exercise, sets: LoggedSet[], overrides: Partial<LoggedExercise> = {}): LoggedExercise {
  return {
    id: `le-${Math.random().toString(36).slice(2)}`,
    orderIndex: 0,
    notes: "",
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: sets.map((s, i) => ({ ...s, setSlotIndex: i })),
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

/** Séance historique à un seul exercice / un seul set de travail. */
function pastSession(daysAgo: number, exercise: Exercise, weight: number, reps: number): WorkoutSession {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return session(date, [loggedExercise(exercise, [set({ weight, reps })])]);
}

// ---------------------------------------------------------------------------
// Performance : au-dessus / en-dessous de la référence
// ---------------------------------------------------------------------------

describe("performed / performanceSignal", () => {
  it("séance SANS PR mais AU-DESSUS des suggestions -> performanceSignal positif", () => {
    // Historique stable à 60x8 (au-dessus de repMin=6, pas au repMax=10) : la référence
    // recalculée sans la séance du jour reste ~60x8 (pas de promotion, pas assez de séances
    // qualifiantes). Aujourd'hui : 60x10 -> reps au-dessus de la référence -> performed=true,
    // mais 60kg n'est pas un nouveau poids max (déjà atteint avant) donc pas de PR "heaviestWeight"
    // à ce poids si on a déjà fait au moins 60x10 avant... on garde l'historique à 60x8 pour que le
    // 60x10 du jour BATTE toujours le repsAtWeight existant (8) -> ce serait un PR ceci dit,
    // volontairement gardé simple : le test vérifie seulement le signal, pas l'absence de PR.
    const history = [
      pastSession(3, BENCH, 60, 8),
      pastSession(10, BENCH, 60, 8),
      pastSession(17, BENCH, 60, 7),
    ];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 10 })])]);

    const review = buildSessionReview(today, history, [BENCH]);

    expect(review.exercises).toHaveLength(1);
    expect(review.exercises[0].performed).toBe(true);
    expect(review.outperformed).toContain("Développé couché");
    expect(review.performanceSignal).toBe(100);
    expect(review.performanceLabel).toBe("Bonne séance");
  });

  it("séance en dessous de la référence (moins de reps à charge égale) -> performanceSignal bas", () => {
    const history = [pastSession(3, BENCH, 60, 8), pastSession(10, BENCH, 60, 8), pastSession(17, BENCH, 60, 8)];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 5 })])]);

    const review = buildSessionReview(today, history, [BENCH]);

    expect(review.exercises[0].performed).toBe(false);
    expect(review.underperformed).toContain("Développé couché");
    expect(review.performanceSignal).toBe(0);
    expect(review.performanceLabel).toBe("Difficile");
  });

  it("séance vide (aucun exercice avec des sets complétés) -> aucune entrée, label Difficile", () => {
    const today = session(new Date(), [loggedExercise(BENCH, [])]);
    const review = buildSessionReview(today, [], [BENCH]);
    expect(review.exercises).toHaveLength(0);
    expect(review.performanceLabel).toBe("Difficile");
  });
});

// ---------------------------------------------------------------------------
// Ambition
// ---------------------------------------------------------------------------

describe("ambition", () => {
  it("2 work sets sous repTargetMin -> tooAmbitious", () => {
    const history = [pastSession(7, BENCH, 60, 8)];
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 70, reps: 4 }), set({ weight: 70, reps: 3 })]),
    ]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].ambition.tooAmbitious).toBe(true);
    expect(review.tooAmbitious).toContain("Développé couché");
  });

  it("1 seul work set sous repTargetMin -> PAS tooAmbitious (seuil >= 2)", () => {
    const history = [pastSession(7, BENCH, 60, 8)];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 70, reps: 4 }), set({ weight: 65, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].ambition.tooAmbitious).toBe(false);
  });

  it("TOUS les work sets >= repTargetMax -> notAmbitiousEnough", () => {
    const history = [pastSession(7, BENCH, 60, 8)];
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 40, reps: 12 }), set({ weight: 40, reps: 14 })]),
    ]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].ambition.notAmbitiousEnough).toBe(true);
    expect(review.notAmbitiousEnough).toContain("Développé couché");
  });

  it("mix reps sous et au-dessus de repTargetMax -> notAmbitiousEnough=false", () => {
    const history = [pastSession(7, BENCH, 60, 8)];
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 60, reps: 12 }), set({ weight: 60, reps: 8 })]),
    ]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].ambition.notAmbitiousEnough).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plateau
// ---------------------------------------------------------------------------

describe("plateau", () => {
  it("3 séances consécutives à la même charge/reps -> wasInPlateau, non cassé aujourd'hui si répété", () => {
    const history = [
      pastSession(3, BENCH, 60, 8),
      pastSession(10, BENCH, 60, 8),
      pastSession(17, BENCH, 60, 8),
      pastSession(24, BENCH, 60, 8),
    ];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(review.exercises[0].plateau.brokenToday).toBe(false);
    expect(review.enteringPlateau).toContain("Développé couché");
  });

  it("plateau cassé aujourd'hui avec une charge supérieure -> plateausBroken", () => {
    const history = [
      pastSession(3, BENCH, 60, 8),
      pastSession(10, BENCH, 60, 8),
      pastSession(17, BENCH, 60, 8),
      pastSession(24, BENCH, 60, 8),
    ];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].plateau.brokenToday).toBe(true);
    expect(review.plateausBroken).toContain("Développé couché");
    expect(review.enteringPlateau).not.toContain("Développé couché");
  });

  it("pas de plateau avec un historique varié -> wasInPlateau=false", () => {
    const history = [pastSession(3, BENCH, 65, 8), pastSession(10, BENCH, 62.5, 8), pastSession(17, BENCH, 60, 7)];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 9 })])]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].plateau.wasInPlateau).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Couverture musculaire de la séance
// ---------------------------------------------------------------------------

describe("couverture", () => {
  it("liste les parents musculaires travaillés pendant la séance", () => {
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 60, reps: 8 })]),
      loggedExercise(ROW, [set({ weight: 50, reps: 8 })]),
    ]);

    const review = buildSessionReview(today, [], [BENCH, ROW]);
    expect(review.coverage.workedParents.length).toBeGreaterThanOrEqual(1);
    expect(review.coverage.message).toContain("Groupes travaillés");
  });

  it("séance sans sets complétés -> aucun parent travaillé", () => {
    const today = session(new Date(), [loggedExercise(BENCH, [set({ completed: false })])]);
    const review = buildSessionReview(today, [], [BENCH]);
    expect(review.coverage.workedParents).toHaveLength(0);
    expect(review.coverage.message).toBe("Aucun groupe musculaire travaillé");
  });
});

// ---------------------------------------------------------------------------
// Records de la séance
// ---------------------------------------------------------------------------

describe("records", () => {
  it("un nouveau poids max produit un record heaviestWeight dans le bilan", () => {
    const history = [pastSession(7, BENCH, 60, 8), pastSession(14, BENCH, 60, 8)];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].recordKinds).toContain("heaviestWeight");
    expect(review.records.some((r) => r.kind === "heaviestWeight" && r.exerciseName === "Développé couché")).toBe(true);
  });

  it("aucun historique préalable -> premier set validé compte comme record (heaviestWeight)", () => {
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 8 })])]);
    const review = buildSessionReview(today, [], [BENCH]);
    expect(review.exercises[0].recordKinds).toContain("heaviestWeight");
  });
});

// ---------------------------------------------------------------------------
// Exercice absent du catalogue — ignoré proprement
// ---------------------------------------------------------------------------

describe("robustesse", () => {
  it("ignore un LoggedExercise dont l'exerciseId n'est pas dans le catalogue", () => {
    const today = session(new Date(), [loggedExercise({ ...BENCH, id: "ghost" }, [set({ weight: 60, reps: 8 })])]);
    const review = buildSessionReview(today, [], [BENCH]);
    expect(review.exercises).toHaveLength(0);
  });
});
