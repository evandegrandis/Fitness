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
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
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
    plateauWeakPoint: null,
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

/**
 * Séance historique à un seul exercice / un seul set de travail.
 * VARIATION_CYCLING_SPEC §2 (P1.3) : le `timestamp` du `LoggedSet` doit être propagé à `daysAgo`
 * (pas seulement `WorkoutSession.date`) — `deriveStateV2`/`isPlateau` lisent `LoggedSet.timestamp`
 * exclusivement (§2 : "Dates come from LoggedSet.timestamp"). Avant ce fix, `set()` gardait son
 * timestamp par défaut identique pour toutes les séances passées, ce qui rendait `plateauStalledDays`
 * toujours 0 (bug de fixture, pas du moteur — révélé par le passage au plateau daté).
 */
function pastSession(daysAgo: number, exercise: Exercise, weight: number, reps: number): WorkoutSession {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return session(date, [loggedExercise(exercise, [set({ weight, reps, timestamp: date })])]);
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

  it("une charge supérieure à 1 rep n'équivaut pas à la référence si ce n'est pas un PR", () => {
    const priorRecord = pastSession(30, BENCH, 102.5, 1);
    const todayLogged = loggedExercise(BENCH, [set({ weight: 102.5, reps: 1 })]);
    const today = session(new Date(), [todayLogged]);
    const reference = {
      weight: 100, reps: 8, setType: SetType.work, explanation: "test", confidence: 1,
      reasonCodes: [], mode: "record_attempt" as const, sessionFatigueWarning: null,
      role: "straight" as const, switchToVariantId: null, intensityTechnique: null,
    };

    const review = buildSessionReview(today, [priorRecord], [BENCH], [], {
      referenceSuggestionByLoggedExerciseId: { [todayLogged.id]: reference },
    });
    expect(review.exercises[0].performed).toBe(false);
  });

  it("un vrai PR du jour neutralise la sous-performance", () => {
    const todayLogged = loggedExercise(BENCH, [set({ weight: 102.5, reps: 1 })]);
    const today = session(new Date(), [todayLogged]);
    const reference = {
      weight: 100, reps: 8, setType: SetType.work, explanation: "test", confidence: 1,
      reasonCodes: [], mode: "record_attempt" as const, sessionFatigueWarning: null,
      role: "straight" as const, switchToVariantId: null, intensityTechnique: null,
    };
    const review = buildSessionReview(today, [], [BENCH], [], {
      referenceSuggestionByLoggedExerciseId: { [todayLogged.id]: reference },
    });
    expect(review.exercises[0].recordKinds).toContain("heaviestWeight");
    expect(review.exercises[0].performed).toBe(true);
    expect(review.underperformed).not.toContain(BENCH.name);
  });

  it("le bilan réapplique le gap daté de la suggestion live", () => {
    const oldDate = new Date("2026-05-01T10:00:00Z");
    const reviewDate = new Date("2026-06-30T10:00:00Z");
    const history = [session(oldDate, [loggedExercise(BENCH, [set({ weight: 100, reps: 8 })])])];
    const today = session(reviewDate, [loggedExercise(BENCH, [set({ weight: 85, reps: 8 })])]);
    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].referenceWeight).toBe(85);
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
    // VARIATION_CYCLING_SPEC §2 (P1.3) : trigger officiel isPlateau + message bilan EN JOURS
    // (plus "depuis N séances") ; plateauStalledDaysBefore reflète le vrai record e1RM (jour -24,
    // jamais rebattu par la suite car les 4 séances sont identiques).
    expect(review.exercises[0].plateau.plateauStalledDaysBefore).toBeGreaterThanOrEqual(14);
    expect(review.exercises[0].plateau.message).toMatch(/jours?/);
    expect(review.exercises[0].plateau.message).not.toMatch(/séances?/);
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
// VARIATION_CYCLING_SPEC §8 — carte de suggestion de variante (plateau v2 uniquement)
// ---------------------------------------------------------------------------

describe("plateau — carte de suggestion de variante (§8)", () => {
  // Même recouvrement musculaire que BENCH (pect_stern, coefficient 1.0) et movementPattern=null
  // des deux côtés -> passe le repli musculaire de `selectAlternative` (§9).
  const DUMBBELL_PRESS: Exercise = { ...BENCH, id: "ex-db-press", name: "Développé haltères" };

  it("plateau toujours actif (v2) + catalogue avec un pair valide -> suggestedVariant non null, explication FR mentionne le plateau ET le candidat", () => {
    const history = [
      pastSession(3, BENCH, 60, 8),
      pastSession(10, BENCH, 60, 8),
      pastSession(17, BENCH, 60, 8),
      pastSession(24, BENCH, 60, 8),
    ];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH, DUMBBELL_PRESS]);

    expect(review.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(review.exercises[0].plateau.suggestedVariant).not.toBeNull();
    expect(review.exercises[0].plateau.suggestedVariant!.exerciseId).toBe(DUMBBELL_PRESS.id);
    expect(review.exercises[0].plateau.suggestedVariant!.exerciseName).toBe("Développé haltères");
    expect(review.exercises[0].plateau.suggestedVariant!.explanationFR).toContain("Plateau sur Développé couché");
    expect(review.exercises[0].plateau.suggestedVariant!.explanationFR).toContain("Développé haltères");
  });

  it("plateau actif mais catalogue SANS pair valide -> suggestedVariant reste null (pas de crash, §9)", () => {
    const history = [
      pastSession(3, BENCH, 60, 8),
      pastSession(10, BENCH, 60, 8),
      pastSession(17, BENCH, 60, 8),
      pastSession(24, BENCH, 60, 8),
    ];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(review.exercises[0].plateau.suggestedVariant).toBeNull();
  });

  it("plateau cassé aujourd'hui -> suggestedVariant reste null (inutile de proposer une bascule sur un plateau qu'on vient de casser)", () => {
    const history = [
      pastSession(3, BENCH, 60, 8),
      pastSession(10, BENCH, 60, 8),
      pastSession(17, BENCH, 60, 8),
      pastSession(24, BENCH, 60, 8),
    ];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 8 })])]);

    const review = buildSessionReview(today, history, [BENCH, DUMBBELL_PRESS]);
    expect(review.exercises[0].plateau.brokenToday).toBe(true);
    expect(review.exercises[0].plateau.suggestedVariant).toBeNull();
  });

  it("pas de plateau -> suggestedVariant reste null même avec un pair valide dans le catalogue", () => {
    const history = [pastSession(3, BENCH, 65, 8), pastSession(10, BENCH, 62.5, 8), pastSession(17, BENCH, 60, 7)];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 9 })])]);

    const review = buildSessionReview(today, history, [BENCH, DUMBBELL_PRESS]);
    expect(review.exercises[0].plateau.wasInPlateau).toBe(false);
    expect(review.exercises[0].plateau.suggestedVariant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Plateau — capture 1-tap du point faible mesuré (VARIATION_CYCLING_SPEC §5.3/§8, P2.1)
// ---------------------------------------------------------------------------

describe("plateau — capture 1-tap du point faible (§5.3/§8, P2.1)", () => {
  // Même recouvrement musculaire que BENCH (pect_stern, coefficient 1.0), movementPattern=null
  // des deux côtés -> passe le repli musculaire de `selectAlternative` (§9). `resistanceProfile`
  // taggé "lockout" pour vérifier l'activation de `weakPointFit` de bout en bout.
  const DUMBBELL_PRESS_LOCKOUT: Exercise = {
    ...BENCH,
    id: "ex-db-press-lockout",
    name: "Développé haltères",
    resistanceProfile: "lockout",
  };

  function plateauedHistory() {
    return [pastSession(3, BENCH, 60, 8), pastSession(10, BENCH, 60, 8), pastSession(17, BENCH, 60, 8), pastSession(24, BENCH, 60, 8)];
  }

  it("plateau toujours actif + pas encore répondu (LoggedExercise.plateauWeakPoint=null) -> needsWeakPointCapture=true, weakPoint=null", () => {
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 8 })])]);
    const review = buildSessionReview(today, plateauedHistory(), [BENCH, DUMBBELL_PRESS_LOCKOUT]);

    expect(review.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(review.exercises[0].plateau.weakPoint).toBeNull();
    expect(review.exercises[0].plateau.needsWeakPointCapture).toBe(true);
  });

  it("plateau toujours actif + DÉJÀ répondu (plateauWeakPoint sur le LoggedExercise du jour) -> needsWeakPointCapture=false, weakPoint reflété, weakPointFit actif dans suggestedVariant", () => {
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 60, reps: 8 })], { plateauWeakPoint: "lockout" }),
    ]);
    const review = buildSessionReview(today, plateauedHistory(), [BENCH, DUMBBELL_PRESS_LOCKOUT]);

    expect(review.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(review.exercises[0].plateau.weakPoint).toBe("lockout");
    expect(review.exercises[0].plateau.needsWeakPointCapture).toBe(false);
    // Le candidat matche le point faible -> `selectAlternative` l'annonce dans l'explication (§6).
    expect(review.exercises[0].plateau.suggestedVariant).not.toBeNull();
    expect(review.exercises[0].plateau.suggestedVariant!.explanationFR).toContain("point faible");
  });

  it("pas de plateau -> needsWeakPointCapture=false même sans réponse (contextuel, §8 'apparaît au bon moment')", () => {
    const history = [pastSession(3, BENCH, 65, 8), pastSession(10, BENCH, 62.5, 8), pastSession(17, BENCH, 60, 7)];
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 9 })])]);

    const review = buildSessionReview(today, history, [BENCH, DUMBBELL_PRESS_LOCKOUT]);
    expect(review.exercises[0].plateau.wasInPlateau).toBe(false);
    expect(review.exercises[0].plateau.needsWeakPointCapture).toBe(false);
  });

  it("plateau cassé aujourd'hui -> needsWeakPointCapture=false (§8, inutile une fois le plateau cassé)", () => {
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 65, reps: 8 })])]);
    const review = buildSessionReview(today, plateauedHistory(), [BENCH, DUMBBELL_PRESS_LOCKOUT]);

    expect(review.exercises[0].plateau.brokenToday).toBe(true);
    expect(review.exercises[0].plateau.needsWeakPointCapture).toBe(false);
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

  it("un record vieux de plus de 20 séances reste all-time", () => {
    const history = Array.from({ length: 20 }, (_, index) => pastSession(index + 1, BENCH, 60, 8));
    history.push(pastSession(30, BENCH, 100, 8));
    const today = session(new Date(), [loggedExercise(BENCH, [set({ weight: 90, reps: 8 })])]);
    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises[0].recordKinds).not.toContain("heaviestWeight");
  });

  it("le libellé d'un record PDC utilise le set PDC exact", () => {
    const pullups: Exercise = {
      ...ROW,
      id: "pullups",
      name: "Tractions",
      setPatternMode: "weighted_bodyweight",
      repTargetMin: 6,
      repTargetMax: 10,
    };
    const history = [pastSession(7, pullups, 0, 10), pastSession(8, pullups, 20, 6)];
    const today = session(new Date(), [
      loggedExercise(pullups, [set({ weight: 0, reps: 12 }), set({ weight: 20, reps: 4 })]),
    ]);
    const review = buildSessionReview(today, history, [pullups]);
    const bwRecord = review.records.find((record) => record.kind === "bodyweightReps");
    expect(bwRecord?.weight).toBe(0);
    expect(bwRecord?.reps).toBe(12);
    expect(bwRecord?.label).toContain("BW×12");
  });

  it("fusionne deux occurrences du même exercice dans le bilan", () => {
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 60, reps: 8, timestamp: new Date("2026-07-14T10:00:00Z") })], { orderIndex: 0 }),
      loggedExercise(BENCH, [set({ weight: 60, reps: 6, timestamp: new Date("2026-07-14T10:30:00Z") })], { orderIndex: 4 }),
    ]);
    const review = buildSessionReview(today, [], [BENCH]);
    expect(review.exercises).toHaveLength(1);
  });

  it("affiche un PR finisher séparé sans inventer une comparaison de performance normale", () => {
    const oldDate = new Date(Date.now() - 7 * 86_400_000);
    const history = [
      session(oldDate, [
        loggedExercise(BENCH, [set({ weight: 0, reps: 16, setType: SetType.finisher, timestamp: oldDate })]),
      ]),
    ];
    const today = session(new Date(), [
      loggedExercise(BENCH, [set({ weight: 0, reps: 18, setType: SetType.finisher })]),
    ]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.exercises).toHaveLength(0);
    expect(review.records).toContainEqual(
      expect.objectContaining({ kind: "finisherReps", exerciseName: BENCH.name, weight: 0, reps: 18 })
    );
    expect(review.coverage.workedParents.length).toBeGreaterThan(0);
  });

  it("une continuation composite n'ajoute jamais un second record au bilan", () => {
    const history = [pastSession(7, BENCH, 75, 8)];
    const started = new Date("2026-07-14T10:00:00Z");
    const today = session(new Date(), [
      loggedExercise(BENCH, [
        set({ weight: 100, reps: 4, timestamp: started }),
        set({
          weight: 75,
          reps: 12,
          setType: SetType.backoff,
          timestamp: new Date(started.getTime() + 10_000),
        }),
      ]),
    ]);

    const review = buildSessionReview(today, history, [BENCH]);
    expect(review.records).toHaveLength(1);
    expect(review.records[0]).toEqual(expect.objectContaining({ kind: "heaviestWeight", weight: 100, reps: 4 }));
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

describe("phase déclarée — la sèche change la lecture, pas les suggestions", () => {
  /** Trois séances identiques : la définition même d'un plateau pour le moteur. */
  const stagnant = [
    pastSession(3, BENCH, 60, 8),
    pastSession(10, BENCH, 60, 8),
    pastSession(17, BENCH, 60, 8),
  ];
  const today = () => session(new Date(), [loggedExercise(BENCH, [set({ weight: 60, reps: 8 })])]);

  it("signale le plateau sans phase déclarée (comportement historique)", () => {
    const review = buildSessionReview(today(), stagnant, [BENCH]);
    expect(review.plateauMuted).toBe(false);
    expect(review.enteringPlateau).toContain("Développé couché");
  });

  it("met l'alerte plateau en veille en sèche : tenir sa charge en déficit est le résultat visé", () => {
    const review = buildSessionReview(today(), stagnant, [BENCH], [], { trainingPhase: "cut" });
    expect(review.plateauMuted).toBe(true);
    expect(review.enteringPlateau).toEqual([]);
  });

  it("garde l'alerte en prise et en maintien — là, stagner est bien une information", () => {
    for (const phase of ["bulk", "maintain"] as const) {
      const review = buildSessionReview(today(), stagnant, [BENCH], [], { trainingPhase: phase });
      expect(review.plateauMuted).toBe(false);
      expect(review.enteringPlateau).toContain("Développé couché");
    }
  });

  it("ne touche NI les suggestions NI le signal de performance — seule la lecture change", () => {
    const sans = buildSessionReview(today(), stagnant, [BENCH]);
    const cut = buildSessionReview(today(), stagnant, [BENCH], [], { trainingPhase: "cut" });
    expect(cut.performanceSignal).toBe(sans.performanceSignal);
    expect(cut.exercises[0].referenceWeight).toBe(sans.exercises[0].referenceWeight);
    expect(cut.exercises[0].referenceReps).toBe(sans.exercises[0].referenceReps);
    expect(cut.exercises[0].performed).toBe(sans.exercises[0].performed);
  });
});
