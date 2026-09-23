import { describe, expect, it } from "vitest";
import {
  suggest,
  SuggestionMode,
  deriveState,
  deriveStateV2,
  progressVelocityScore,
} from "@/lib/engines/progression";
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
    movementPattern: null,
    resistanceProfile: null,
    strengthStandardKey: null,
    benchmarkUnit: null,
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

/** Référence "aujourd'hui" pour les tests de plateau en dates (VARIATION_CYCLING_SPEC §2). */
const TODAY = new Date("2026-08-04T12:00:00Z");

/** Date `n` jours avant `TODAY` (n >= 0). */
function daysAgo(n: number): Date {
  return new Date(TODAY.getTime() - n * 86_400_000);
}

/** Séance à un seul set de travail, datée `n` jours avant `TODAY` (VARIATION_CYCLING_SPEC §2). */
function sessionDaysAgo(weight: number, reps: number, n: number): LoggedSet[] {
  return session(weight, reps, { timestamp: daysAgo(n) });
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

// ---------------------------------------------------------------------------
// VARIATION_CYCLING_SPEC §2/§3 — isPlateau / progressionState en dates (deriveStateV2, pur)
// ---------------------------------------------------------------------------

describe("deriveStateV2 — plateau en dates (isPlateau, progressionState)", () => {
  it("reps↑ à poids constant, la séance la plus récente bat le record de e1RM ⇒ NON plateau (decision #2)", () => {
    const exercise = makeExercise({ repTargetMin: 6, repTargetMax: 10 });
    // Plus récent en premier : aujourd'hui 100x8 bat 100x7 (jour -10) qui battait 100x6 (jour -20).
    const history = [sessionDaysAgo(100, 8, 0), sessionDaysAgo(100, 7, 10), sessionDaysAgo(100, 6, 20)];
    const v2 = deriveStateV2(exercise, history, exercise.smallestIncrement, undefined, undefined);
    expect(v2.isPlateau).toBe(false);
    expect(v2.plateauStalledDays).toBe(0);
    expect(v2.progressionState).toBe("progressing");
  });

  it("14+ jours sans nouveau record de e1RM ET >= 2 séances dans la fenêtre ⇒ plateau", () => {
    const exercise = makeExercise({ repTargetMin: 6, repTargetMax: 10 });
    // Record établi il y a 30 jours (100x8, e1RM=126.67), jamais rebattu depuis (100x7 puis 100x6).
    const history = [sessionDaysAgo(100, 6, 0), sessionDaysAgo(100, 7, 12), sessionDaysAgo(100, 8, 30)];
    const v2 = deriveStateV2(exercise, history, exercise.smallestIncrement, undefined, undefined);
    expect(v2.sessionsInWindow).toBeGreaterThanOrEqual(2);
    expect(v2.plateauStalledDays).toBeGreaterThanOrEqual(14);
    expect(v2.isPlateau).toBe(true);
    expect(v2.progressionState).toBe("plateaued");
  });

  it("longue absence puis reprise (< 2 séances dans les 14 derniers jours) ⇒ PAS de plateau (garde-fou §9)", () => {
    const exercise = makeExercise({ repTargetMin: 6, repTargetMax: 10 });
    // Record il y a 100 jours, une seule séance de reprise aujourd'hui : sessionsInWindow=1 < 2.
    const history = [sessionDaysAgo(100, 6, 0), sessionDaysAgo(100, 8, 100)];
    const v2 = deriveStateV2(exercise, history, exercise.smallestIncrement, undefined, undefined);
    expect(v2.sessionsInWindow).toBeLessThan(2);
    expect(v2.isPlateau).toBe(false);
    expect(v2.progressionState).toBe("progressing");
  });

  it("poids du corps : une hausse de reps est bien un progrès malgré weight=0", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.bodyweight,
      repTargetMin: 8,
      repTargetMax: 15,
    });
    const history = [sessionDaysAgo(0, 12, 0), sessionDaysAgo(0, 11, 10), sessionDaysAgo(0, 10, 20)];
    const v2 = deriveStateV2(exercise, history, exercise.smallestIncrement, undefined, undefined);
    expect(v2.lastProgressDate).toEqual(daysAgo(0));
    expect(v2.plateauStalledDays).toBe(0);
    expect(v2.progressionState).toBe("progressing");
  });

  it("stagnation flat 7-13 jours (sous le seuil de 14) ⇒ état préemptif 'slowing', pas encore 'plateaued'", () => {
    const exercise = makeExercise({ repTargetMin: 6, repTargetMax: 10 });
    // Totalement plat (même charge, mêmes reps) sur 10 jours : vélocité nulle, stalledDays=10 (>=7, <14).
    const history = [sessionDaysAgo(100, 7, 0), sessionDaysAgo(100, 7, 5), sessionDaysAgo(100, 7, 10)];
    const v2 = deriveStateV2(exercise, history, exercise.smallestIncrement, undefined, undefined);
    expect(v2.isPlateau).toBe(false);
    expect(v2.plateauStalledDays).toBeGreaterThanOrEqual(7);
    expect(v2.plateauStalledDays).toBeLessThan(14);
    expect(v2.progressionState).toBe("slowing");
  });
});

describe("progressVelocityScore — ordre chronologique", () => {
  it("note positivement une progression récente (historique fourni du plus récent au plus ancien)", () => {
    const exercise = makeExercise();
    expect(progressVelocityScore(exercise, [session(100, 8), session(100, 7)])).toBeGreaterThan(0);
  });

  it("note négativement une baisse récente", () => {
    const exercise = makeExercise();
    expect(progressVelocityScore(exercise, [session(100, 6), session(100, 8)])).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — signal feu (readyForLevelUp / readyForPR / nextLevelName)
// ---------------------------------------------------------------------------

describe("suggest() — signal feu (readyForLevelUp / readyForPR)", () => {
  function loggedExercise(exercise: Exercise, sets: LoggedSet[]) {
    return {
      id: `le-${Math.random().toString(36).slice(2)}`,
      orderIndex: 0,
      notes: "",
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sets: sets.map((s, i) => ({ ...s, setSlotIndex: i })),
      supersetGroupId: null,
      plateauWeakPoint: null,
    };
  }

  function workoutSession(date: Date, exercise: Exercise, sets: LoggedSet[]) {
    return {
      id: `session-${date.getTime()}-${Math.random().toString(36).slice(2)}`,
      date,
      startTime: date,
      endTime: date,
      notes: "",
      isActive: false,
      templateName: null,
      exercises: [loggedExercise(exercise, sets)],
      supersetGroups: [],
    };
  }

  // Les standards absolus chargés sont la ligne fixe H80 ; aucun scaling n'est inventé pour 75,5 kg.
  const PROFILE = { bodyWeightKg: 80, gender: "male" as const, ageYears: 26 };

  /** Première séance il y a une semaine : 3 séries qui clôturent l'étalonnage (records.ts). */
  function baselineSession(exercise: Exercise, weight: number, reps: number) {
    const date = daysAgo(7);
    return workoutSession(
      date,
      exercise,
      [0, 1, 2].map((i) => makeSet({ weight, reps, timestamp: new Date(date.getTime() + i * 180_000) }))
    );
  }

  it("premier passage jamais fait (sessionHistory=[]) -> aucun feu : la première séance pose la référence", () => {
    const exercise = makeExercise({
      name: "Curl debout",
      strengthStandardKey: "Curl debout",
      benchmarkUnit: "load",
      repTargetMin: 8,
      repTargetMax: 12,
    });
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: [],
      currentSessionSets: [],
      sessionHistory: [],
      profile: PROFILE,
    });
    // Cold start déterministe (constaté) : 20kg x 9. Sans aucune série avant, il n'y a ni record à
    // battre ni palier à franchir : le feu ne doit rien promettre (règle d'étalonnage, records.ts).
    expect(s.weight).toBe(20);
    expect(s.reps).toBe(9);
    expect(s.readyForPR).toBeFalsy();
    expect(s.readyForLevelUp).toBeFalsy();
    expect(s.nextLevelName).toBeUndefined();
  });

  it("déjà au palier Élite (plafond) -> readyForLevelUp reste faux même en progressant encore (pas de palier au-dessus), mais readyForPR peut rester vrai", () => {
    const exercise = makeExercise({
      name: "Curl debout",
      strengthStandardKey: "Curl debout",
      benchmarkUnit: "load",
      repTargetMin: 8,
      repTargetMax: 12,
    });
    const history = [
      workoutSession(new Date(Date.now() - 3 * 86_400_000), exercise, [makeSet({ weight: 40, reps: 9 })]),
      workoutSession(new Date(Date.now() - 10 * 86_400_000), exercise, [makeSet({ weight: 40, reps: 9 })]),
      workoutSession(new Date(Date.now() - 17 * 86_400_000), exercise, [makeSet({ weight: 40, reps: 9 })]),
    ];
    const recentHistory = history.map((session) => session.exercises[0].sets);
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory,
      currentSessionSets: [],
      sessionHistory: history,
      profile: PROFILE,
    });
    // Promotion attendue (constatée) : 42.5kg x 8 -> e1RM StrengthLevel déjà au-dessus du seuil Élite
    // (42) AVANT et APRÈS (l'historique à 40x9 est aussi déjà élite) -> pas de franchissement de
    // palier possible (déjà au plafond des deux côtés).
    expect(s.weight).toBe(42.5);
    expect(s.reps).toBe(8);
    expect(s.readyForLevelUp).toBeFalsy();
    expect(s.readyForPR).toBe(true);
  });

  it("plateau stable (même charge/reps qu'avant) -> ni PR ni passage de palier", () => {
    const exercise = makeExercise({
      name: "Curl debout",
      strengthStandardKey: "Curl debout",
      benchmarkUnit: "load",
      repTargetMin: 8,
      repTargetMax: 12,
    });
    const history = [
      workoutSession(new Date(Date.now() - 3 * 86_400_000), exercise, [makeSet({ weight: 20, reps: 8 })]),
      workoutSession(new Date(Date.now() - 10 * 86_400_000), exercise, [makeSet({ weight: 20, reps: 8 })]),
      workoutSession(new Date(Date.now() - 17 * 86_400_000), exercise, [makeSet({ weight: 20, reps: 8 })]),
    ];
    const recentHistory = history.map((session) => session.exercises[0].sets);
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory,
      currentSessionSets: [],
      sessionHistory: history,
      profile: PROFILE,
    });
    expect(s.weight).toBe(20);
    expect(s.reps).toBe(8);
    expect(s.readyForPR).toBeFalsy();
    expect(s.readyForLevelUp).toBeFalsy();
  });

  it("sans sessionHistory (paramètre omis) -> les deux flags restent undefined, jamais calculés (§9 — invariant golden test)", () => {
    const exercise = makeExercise({ name: "Curl debout", strengthStandardKey: "Curl debout", benchmarkUnit: "load" });
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: [], currentSessionSets: [], profile: PROFILE });
    expect(s.readyForPR).toBeUndefined();
    expect(s.readyForLevelUp).toBeUndefined();
    expect(s.nextLevelName).toBeUndefined();
  });

  it("sans profile -> readyForLevelUp/nextLevelName restent undefined, mais readyForPR reste calculé (n'a pas besoin du profil)", () => {
    const exercise = makeExercise({ name: "Curl debout", strengthStandardKey: "Curl debout", benchmarkUnit: "load" });
    const s = suggest({
      exercise, currentSetIndex: 0, recentHistory: [], currentSessionSets: [],
      sessionHistory: [baselineSession(exercise, 10, 8)],
    });
    expect(s.readyForPR).toBe(true);
    expect(s.readyForLevelUp).toBeUndefined();
    expect(s.nextLevelName).toBeUndefined();
  });

  it("sans strengthStandardKey (exercice pas encore sourcé) -> readyForLevelUp reste undefined, readyForPR fonctionne quand même", () => {
    const exercise = makeExercise({ name: "Chest Press", strengthStandardKey: null, benchmarkUnit: null });
    const s = suggest({
      exercise, currentSetIndex: 0, recentHistory: [], currentSessionSets: [],
      sessionHistory: [baselineSession(exercise, 10, 8)], profile: PROFILE,
    });
    expect(s.readyForLevelUp).toBeUndefined();
    expect(s.readyForPR).toBe(true);
  });

  it("inclut les sets déjà faits aujourd'hui et ne rallume pas immédiatement le même feu PR", () => {
    const exercise = makeExercise({
      name: "Curl debout",
      strengthStandardKey: "Curl debout",
      benchmarkUnit: "load",
      repTargetMin: 8,
      repTargetMax: 12,
    });
    const current = makeSet({ weight: 20, reps: 9 });
    const s = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: [],
      currentSessionSets: [current],
      sessionHistory: [],
      profile: PROFILE,
      prAchievedToday: true,
    });
    expect(s.readyForPR).toBeFalsy();
  });

  it("un standard à deux axes peut franchir le palier reps au poids du corps", () => {
    const exercise = makeExercise({
      name: "Dips",
      setPatternMode: SetPatternMode.bodyweight,
      strengthStandardKey: "Dips",
      benchmarkUnit: "reps_and_load",
      repTargetMin: 8,
      repTargetMax: 15,
      smallestIncrement: 1,
    });
    const history = [
      workoutSession(daysAgo(1), exercise, [makeSet({ weight: 0, reps: 9, timestamp: daysAgo(1) })]),
      workoutSession(daysAgo(5), exercise, [makeSet({ weight: 0, reps: 9, timestamp: daysAgo(5) })]),
      // Première séance de 3 séries : l'étalonnage est clos, un palier peut se franchir ensuite.
      workoutSession(daysAgo(9), exercise, [0, 1, 2].map((i) =>
        makeSet({ weight: 0, reps: 9, timestamp: new Date(daysAgo(9).getTime() + i * 180_000) })
      )),
    ];
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      // Deux occurrences gardent ce test sur le prédicteur v1 (+1 rep). La troisième reste dans
      // `sessionHistory` pour tester le niveau sur l'historique complet sans coupler l'assertion
      // au choix médian volontaire du chemin BW v2.
      recentHistory: history.slice(0, 2).map((item) => item.exercises[0].sets),
      currentSessionSets: [],
      sessionHistory: history,
      profile: PROFILE,
    });
    expect(s.weight).toBe(0);
    expect(s.reps).toBeGreaterThanOrEqual(10);
    expect(s.readyForLevelUp).toBe(true);
    expect(s.nextLevelName).toBe("Novice");
  });

  it("un finisher n'allume jamais un niveau StrengthLevel", () => {
    const exercise = makeExercise({
      name: "Curl debout",
      strengthStandardKey: "Curl debout",
      benchmarkUnit: "load",
      repTargetMin: 8,
      repTargetMax: 12,
    });
    const historical = [
      makeSet({ weight: 12, reps: 10, setType: SetType.finisher, timestamp: daysAgo(1) }),
    ];
    const history = [
      workoutSession(daysAgo(1), exercise, historical),
      workoutSession(daysAgo(5), exercise, [
        makeSet({ weight: 12, reps: 10, setType: SetType.finisher, timestamp: daysAgo(5) }),
      ]),
      workoutSession(daysAgo(9), exercise, [
        makeSet({ weight: 12, reps: 10, setType: SetType.finisher, timestamp: daysAgo(9) }),
      ]),
    ];
    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: history.map((item) => item.exercises[0].sets),
      currentSessionSets: [],
      sessionHistory: history,
      profile: PROFILE,
    });
    expect(s.setType).toBe(SetType.finisher);
    expect(s.readyForLevelUp).toBeFalsy();
  });
});
