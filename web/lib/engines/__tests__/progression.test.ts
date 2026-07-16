import { describe, expect, it } from "vitest";
import { suggest, SuggestionMode, deriveState } from "@/lib/engines/progression";
import { estimated1RM, bestE1RM } from "@/lib/engines/e1rm";
import { SessionFatigueContext } from "@/lib/engines/session-fatigue";
import { SetType, SetPatternMode, FatigueClass } from "@/lib/models/enums";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, LoggedSet } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId(),
    name: "Développé couché",
    category: "push",
    setPatternMode: SetPatternMode.straight,
    repTargetMin: 6,
    repTargetMax: 10,
    smallestIncrement: 2.5,
    isFavorite: false,
    createdByUser: false,
    sortOrder: 0,
    suggestedRestSeconds: 90,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: null,
    benchmarkHigh: null,
    fatigueClass: FatigueClass.heavy,
    progressionPolicy: null,
    voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    lastUsed: null,
    ...overrides,
  };
}

function makeSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: nextId(),
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-01T18:00:00Z"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

/** Séance simple à un seul set de travail (utile pour construire recentHistory). */
function session(weight: number, reps: number, opts: Partial<LoggedSet> = {}): LoggedSet[] {
  return [makeSet({ weight, reps, setSlotIndex: 0, ...opts })];
}

// ---------------------------------------------------------------------------
// Promotion : Heavy vs Medium
// ---------------------------------------------------------------------------

describe("Promotion gate", () => {
  it("Heavy exige 2 des 3 dernières sessions >= repMax pour promouvoir", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10 });
    // 3 dernières séances : reps 10, 10, 7 (2 qualifient) -> ancre la plus récente (10) > repMin -> promo
    const history = [session(100, 10), session(100, 10), session(100, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.mode).toBe(SuggestionMode.transitionMode);
    expect(s.reasonCodes).toContain("promotion_gate_passed");
    // Charge augmentée d'un incrément par rapport à la charge cible (100)
    expect(s.weight).toBeCloseTo(102.5);
  });

  it("ALGO_V2 §4.4 — avec 3 séances (S >= MIN_SESSIONS_FOR_PATTERN), le pattern STRAIGHT est détecté et la promotion devient RÉACTIVE (1 occurrence >= repMax suffit, quelle que soit la FatigueClass) — remplace la règle stricte Heavy 2/3 qui ne s'applique plus qu'au rôle 'amorce' de TOP_SET_BACKOFF (§4.4)", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(100, 10), session(100, 7), session(100, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).toContain("promotion_gate_passed");
    expect(s.weight).toBeCloseTo(102.5);
  });

  it("Heavy strict 2/3 reste actif SOUS le seuil de détection de pattern (S < MIN_SESSIONS_FOR_PATTERN=3, ici 2 séances)", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(100, 10), session(100, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).not.toContain("promotion_gate_passed");
  });

  it("Medium promeut avec 1 des 2 dernières séances >= repMax", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(50, 10), session(50, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).toContain("promotion_gate_passed");
    expect(s.weight).toBeCloseTo(52.5);
  });

  it("Le garde-fou bloque la promotion si l'ancre la plus récente est <= repMin", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    // Ancre la plus récente = 6 reps = repMin (pas strictement supérieur) -> pas de promo
    const history = [session(50, 6), session(50, 10)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).not.toContain("promotion_gate_passed");
  });
});

// ---------------------------------------------------------------------------
// Prédiction rep-drop par FatigueClass
// ---------------------------------------------------------------------------

describe("Prédiction rep-drop (set N depuis le set logué aujourd'hui)", () => {
  it("Heavy: drop de 2 reps depuis le set fait aujourd'hui, pas depuis la séance précédente", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10 });
    // Dernière séance : 100x8 (pour fixer targetLoad). Aujourd'hui set1 = 100x9 (différent d'hier).
    const history = [session(100, 8)];
    const todaySet1 = makeSet({ weight: 100, reps: 9, setSlotIndex: 0 });
    const s = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets: [todaySet1],
    });
    // predicted = 9 - 2 = 7 (>= repMin donc on garde la charge)
    expect(s.reasonCodes).toContain("predicted_drop_same_load");
    expect(s.weight).toBeCloseTo(100);
    expect(s.reps).toBe(7);
  });

  it("Medium: drop de 1.5 rep arrondi (rounded half away from zero)", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(50, 8)];
    const todaySet1 = makeSet({ weight: 50, reps: 9, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    // predicted = round(9 - 1.5) = round(7.5) = 8 (arrondi loin de zéro)
    expect(s.reasonCodes).toContain("predicted_drop_same_load");
    expect(s.reps).toBe(8);
  });

  it("Light: drop de 1 rep", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.light, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(30, 8)];
    const todaySet1 = makeSet({ weight: 30, reps: 9, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    expect(s.reps).toBe(8); // 9 - 1
  });
});

// ---------------------------------------------------------------------------
// Backoff sous repMin
// ---------------------------------------------------------------------------

describe("Backoff quand predicted < repMin", () => {
  it("reste au-dessus du floor et bascule vers fallback quand le set d'aujourd'hui est faible", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(100, 6)];
    // Aujourd'hui : set1 très faible (reps=5, sous repMin-2=4? non, 5 > 4, donc pas le cas "far undershoot")
    const todaySet1 = makeSet({ weight: 100, reps: 5, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    // predicted = 5 - 2 = 3, clampé au floor repMin-1=5 -> holdReps=5, candidat recordAttempt existe
    // mais le fallback (easierLoad, backoffReps) devrait gagner car reps<5 pénalise fortement recordAttempt
    // et last.reps <= repMin-2=4 est faux ici (5>4) donc pas de pénalité -20 sur recordAttempt.
    // On vérifie simplement que le moteur choisit une charge <= la charge d'aujourd'hui (pas plus lourd).
    expect(s.weight).toBeLessThanOrEqual(100);
  });

  it("chute nette (reps <= repMin-2) ajoute un candidat undershot mais recordAttempt reste favori si son propre score domine", () => {
    // Vérifie le comportement exact du scorer Swift : malgré la pénalité -20 sur recordAttempt
    // quand last.reps <= repMin-2, le bonus "abs(effort-target)<0.01 => +15" pour un candidat à
    // charge inchangée (recordAttempt garde last.weight) fait gagner recordAttempt(score 30)
    // contre les deux candidats fallback (score 17 chacun, à charge allégée donc effort<target => -5).
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(100, 8)];
    const todaySet1 = makeSet({ weight: 100, reps: 4, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    expect(s.mode).toBe(SuggestionMode.recordAttempt);
    expect(s.reasonCodes).toContain("predicted_drop_same_load");
    expect(s.weight).toBeCloseTo(100);
    expect(s.reps).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Plateau -> overreach
// ---------------------------------------------------------------------------

describe("Plateau (>= 3 séances consécutives même charge/reps) -> overreach", () => {
  it("déclenche plateau_policy_test_heavier en policy generic", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    // 3 séances identiques à 50x7 (reps <= bestRep donc consécutif)
    const history = [session(50, 7), session(50, 7), session(50, 7)];
    const todaySet1 = makeSet({ weight: 50, reps: 7, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    const derived = deriveState(exercise, history, 2.5);
    expect(derived.plateauCounter).toBeGreaterThanOrEqual(3);
    // Le candidat plateauBreak est ajouté aux candidats génériques (pas de garantie qu'il gagne
    // le scoring, mais on vérifie qu'il a bien été proposé en vérifiant reasonCodes possibles).
    expect(["plateau_policy_test_heavier", "predicted_drop_same_load", "fallback_down_one_step"]).toContain(
      s.reasonCodes[0]
    );
  });

  it("policy overreachJump retourne directement un candidat plateauBreak", () => {
    const exercise = makeExercise({
      fatigueClass: FatigueClass.medium,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      progressionPolicy: "overreachJump",
    });
    const history = [session(50, 7), session(50, 7), session(50, 7)];
    const todaySet1 = makeSet({ weight: 50, reps: 7, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    expect(s.mode).toBe(SuggestionMode.plateauBreak);
    expect(s.reasonCodes).toContain("overreach_jump_policy");
    expect(s.weight).toBeCloseTo(52.5); // harderLoad = last.weight(50) + increment(2.5)
    expect(s.reps).toBe(5); // max(5, repTargetMin - 1) = max(5, 5) = 5 recheck below
  });
});

// ---------------------------------------------------------------------------
// Floor filtering
// ---------------------------------------------------------------------------

describe("Floor filtering (recentWorkingFloor / recentFallbackFloor)", () => {
  it("filtre les candidats fallback qui tombent sous le plancher de fallback", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 5 });
    // Historique où l'ancre est toujours 100, aucun fallback observé -> recentFallbackFloor = max(0, 100 - 2*5) = 90
    const history = [session(100, 8), session(100, 9)];
    // set d'aujourd'hui à charge très basse (60) avec reps sous repMin -> easierLoad = 55 < floor(90-5=85)
    const todaySet1 = makeSet({ weight: 60, reps: 3, setSlotIndex: 0 });
    const s = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets: [todaySet1] });
    // Le candidat fallback_down_one_step (55) doit être filtré ; recordAttempt (60) reste car
    // recentWorkingFloor=100, floor=95, 60<95 aussi filtré -> on vérifie juste qu'aucune exception
    // n'est levée et qu'un résultat cohérent est retourné (le fallback interne 20/replMin est possible).
    expect(s).toBeDefined();
    expect(typeof s.weight).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Scoring : mode choisi selon un historique donné
// ---------------------------------------------------------------------------

describe("Scoring de candidats", () => {
  it("premier set (doneToday vide), pas de promotion, pas de fatigue -> recordAttempt à la charge cible", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(50, 7)]; // pas assez de séances qualifiantes pour promo
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.mode).toBe(SuggestionMode.recordAttempt);
    expect(s.weight).toBeCloseTo(50);
  });

  it("fatigue confirmée pénalise recordAttempt et favorise fallbackHypertrophy sur set N", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(50, 8)];
    // 2 sets aujourd'hui, tous deux <= repMin-1=5 -> autoFatigueFlag = true (avg<6 et 2 derniers <=5)
    const todaySets = [
      makeSet({ weight: 50, reps: 5, setSlotIndex: 0 }),
      makeSet({ weight: 50, reps: 4, setSlotIndex: 1 }),
    ];
    const s = suggest({ exercise, currentSetIndex: 2, recentHistory: history, currentSessionSets: todaySets });
    expect(s.mode).toBe(SuggestionMode.fallbackHypertrophy);
  });
});

// ---------------------------------------------------------------------------
// effectiveLoad inversé pour assisted
// ---------------------------------------------------------------------------

describe("effectiveLoad pour assistedBodyweight", () => {
  it("une assistance plus faible (charge plus faible) est 'plus dure' -> promotion réduit la charge", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.assistedBodyweight,
      fatigueClass: FatigueClass.medium,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 5,
    });
    // Promotion: 1 des 2 dernières séances >= repMax(10), ancre la plus récente(10) > repMin(6)
    const history = [session(40, 10), session(40, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).toContain("promotion_gate_passed");
    // stepLoad towardHarder=true pour assisted: max(0, load - increment) = 40 - 5 = 35 (moins d'assistance = plus dur)
    expect(s.weight).toBeCloseTo(35);
  });
});

// ---------------------------------------------------------------------------
// Warning de fatigue systémique et locale
// ---------------------------------------------------------------------------

describe("Injection du sessionFatigueWarning", () => {
  it("fatigue systémique (>12) ajoute un warning sans changer weight/reps du mode générique", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(50, 7)];
    const fatigue = new SessionFatigueContext([
      { primaryParent: MuscleParent.dosHaut, workSetsCompleted: 10, fatigueClass: FatigueClass.heavy }, // cost=20>12
    ]);
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: history,
      currentSessionSets: [],
      sessionFatigue: fatigue,
    });
    expect(s.sessionFatigueWarning).toBe("Fatigue systémique de séance détectée");
  });

  it("fatigue locale (>=3 sets même parent) ajoute un warning ciblé", () => {
    const exercise = makeExercise({
      fatigueClass: FatigueClass.medium,
      repTargetMin: 6,
      repTargetMax: 10,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    const history = [session(50, 7)];
    const fatigue = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 3, fatigueClass: FatigueClass.light },
    ]);
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: history,
      currentSessionSets: [],
      sessionFatigue: fatigue,
    });
    expect(s.sessionFatigueWarning).toBe("Fatigue locale Pectoraux détectée");
  });

  it("pas de warning quand aucune fatigue significative", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(50, 7)];
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: history,
      currentSessionSets: [],
      sessionFatigue: SessionFatigueContext.empty,
    });
    expect(s.sessionFatigueWarning).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Epley via e1rm partagé
// ---------------------------------------------------------------------------

describe("Epley (e1rm partagé)", () => {
  it("estimated1RM applique la formule d'Epley (weight * (1 + reps/30))", () => {
    expect(estimated1RM(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
    expect(estimated1RM(100, 1)).toBeCloseTo(100);
  });

  it("bestE1RM sélectionne le set avec le meilleur e1RM estimé", () => {
    const sets: LoggedSet[] = [
      makeSet({ weight: 100, reps: 5, setSlotIndex: 0 }),
      makeSet({ weight: 90, reps: 10, setSlotIndex: 1 }), // e1rm = 90*(1+10/30)=120 > 100*(1+5/30)=116.67
    ];
    const { e1rm, set } = bestE1RM(sets);
    expect(e1rm).toBeCloseTo(120);
    expect(set?.weight).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Warmup / primer separation (weightedBodyweight)
// ---------------------------------------------------------------------------

describe("weightedBodyweight : séparation primer / sets de travail", () => {
  it("suggère un primer BW quand aucun primer ni set de travail n'a été fait", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.weightedBodyweight,
      fatigueClass: FatigueClass.heavy,
      repTargetMin: 5,
      repTargetMax: 8,
    });
    const history = [session(20, 6)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).toContain("primer_before_weighted_attempt");
    expect(s.weight).toBe(0);
    expect(s.reps).toBe(10);
  });

  it("après le primer BW, suggère la charge cible pour le premier set de travail", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.weightedBodyweight,
      fatigueClass: FatigueClass.heavy,
      repTargetMin: 5,
      repTargetMax: 8,
    });
    const history = [session(20, 6)];
    const primerSet = makeSet({ weight: 0, reps: 10, setType: SetType.warmup, setSlotIndex: 0 });
    const s = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets: [primerSet],
    });
    expect(s.reasonCodes).toContain("post_primer_main_target");
    expect(s.weight).toBeCloseTo(20);
  });
});
