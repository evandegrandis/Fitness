import { describe, expect, it } from "vitest";
import { suggest, SuggestionMode } from "@/lib/engines/progression";
import { applyDeload, deloadTierForGap, deloadMessage } from "@/lib/engines/deload";
import { SetType, SetPatternMode, FatigueClass } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet } from "@/lib/models/types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `deload-id-${idCounter}`;
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
    timestamp: new Date("2026-06-01T18:00:00Z"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function session(weight: number, reps: number, opts: Partial<LoggedSet> = {}): LoggedSet[] {
  return [makeSet({ weight, reps, setSlotIndex: 0, ...opts })];
}

// ---------------------------------------------------------------------------
// Barème pur (deload.ts)
// ---------------------------------------------------------------------------

describe("deloadTierForGap / applyDeload — barème conservateur", () => {
  it("<=14 jours : aucun ajustement", () => {
    expect(deloadTierForGap(0)).toBe("none");
    expect(deloadTierForGap(14)).toBe("none");
    expect(deloadTierForGap(undefined)).toBe("none");
  });

  it("15-27 jours : -1 incrément", () => {
    expect(deloadTierForGap(15)).toBe("increment");
    expect(deloadTierForGap(27)).toBe("increment");
    const result = applyDeload(100, 15, 2.5);
    expect(result.applied).toBe(true);
    expect(result.load).toBeCloseTo(97.5);
  });

  it("28-42 jours : -10%", () => {
    expect(deloadTierForGap(28)).toBe("percent10");
    expect(deloadTierForGap(42)).toBe("percent10");
    const result = applyDeload(100, 30, 2.5);
    expect(result.tier).toBe("percent10");
    expect(result.load).toBeCloseTo(90); // 100*0.9=90, déjà sur l'incrément
  });

  it("> 42 jours : -15%, arrondi au smallestIncrement", () => {
    expect(deloadTierForGap(43)).toBe("percent15");
    const result = applyDeload(100, 60, 2.5);
    expect(result.tier).toBe("percent15");
    // 100*0.85 = 85, déjà rond
    expect(result.load).toBeCloseTo(85);
  });

  it("arrondit au smallestIncrement le plus proche (cas non-rond)", () => {
    const result = applyDeload(83, 30, 5); // 83*0.9=74.7 -> round(74.7/5)*5 = round(14.94)*5 = 15*5=75
    expect(result.load).toBeCloseTo(75);
  });

  it("ne descend jamais sous 0", () => {
    const result = applyDeload(2, 60, 5); // 2*0.85=1.7 -> round(1.7/5)*5=0
    expect(result.load).toBeGreaterThanOrEqual(0);
  });

  it("message FR mentionne le nombre de semaines", () => {
    expect(deloadMessage(28)).toBe("Reprise après 4 semaines — charge ajustée");
    expect(deloadMessage(7)).toBe("Reprise après 1 semaine — charge ajustée");
  });
});

// ---------------------------------------------------------------------------
// Cas PEC : 4 semaines d'absence + ancres en baisse
// ---------------------------------------------------------------------------

describe("Cas PEC — 4 semaines d'absence après une baisse de perf", () => {
  it("suggère une charge <= ancienne charge - 10% avec le reasonCode deload_after_gap", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    // Historique pré-pause : ancre stable à 100kg. Pas de promotion (reps <= repMax partout).
    const history = [session(100, 8), session(100, 7), session(100, 8)];
    const gapDays = 28; // 4 semaines -> tier percent10

    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [], gapDays });

    expect(s.reasonCodes).toContain("deload_after_gap");
    expect(s.explanation).toContain("Reprise après 4 semaines");
    expect(s.weight).toBeLessThanOrEqual(100 * 0.9 + 0.01);
  });

  it("sans date (gapDays undefined) -> comportement inchangé, PAS de deload_after_gap", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(100, 8), session(100, 7), session(100, 8)];

    const withoutDate = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(withoutDate.reasonCodes).not.toContain("deload_after_gap");
    expect(withoutDate.weight).toBeCloseTo(100);
  });

  it("lastSessionDate + now équivalent à gapDays explicite", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(100, 8)];
    const now = new Date("2026-07-14T00:00:00Z");
    const lastSessionDate = new Date("2026-06-16T00:00:00Z"); // 28 jours avant

    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [], lastSessionDate, now });
    expect(s.reasonCodes).toContain("deload_after_gap");
    expect(s.weight).toBeCloseTo(90);
  });

  it("freshOverride annule le deload même avec gapDays fourni", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(100, 8), session(100, 7), session(100, 8)];

    const s = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: history,
      currentSessionSets: [],
      gapDays: 60,
      freshOverride: true,
    });
    expect(s.reasonCodes).not.toContain("deload_after_gap");
    expect(s.weight).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// Remontée rapide : portillon de promotion assoupli tant que < niveau connu
// ---------------------------------------------------------------------------

describe("Remontée rapide après deload — portillon assoupli", () => {
  it("re-promeut dès 1 séance >= repMax alors que la charge courante (fenêtre de décision) est post-deload (< niveau connu sur 10 séances)", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    // Fenêtre de DÉCISION (5 premières séances) : ne voit que la reprise à charge réduite (90kg),
    // targetLoad = 90. Fenêtre de VÉLOCITÉ/niveau connu (10 séances) : voit aussi les 3 séances
    // pré-pause à 100kg (6e-8e séance) -> knownLevel = 100 > targetLoad(90) -> isRecovering=true.
    // Une seule séance récente >= repMax(10) à 90kg doit alors suffire à re-promouvoir (portillon
    // assoupli), alors que la règle stricte Heavy (2/3 dernières séances) ne le ferait pas.
    const history = [
      session(90, 10), // séance 1 (plus récente, post-reprise) : repMax atteint à charge réduite
      session(90, 7),  // séance 2
      session(90, 6),  // séance 3
      session(90, 7),  // séance 4
      session(90, 6),  // séance 5 (dernière de la fenêtre de décision)
      session(100, 8), // séance 6 (hors fenêtre de décision, dans la fenêtre de vélocité/niveau connu)
      session(100, 9), // séance 7
      session(100, 8), // séance 8
    ];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).toContain("promotion_gate_passed");
    expect(s.mode).toBe(SuggestionMode.transitionMode);
    expect(s.weight).toBeCloseTo(92.5); // targetLoad(90) + increment(2.5)
  });

  it("ALGO_V2 §4.4 — sans phase de reprise (charge courante == niveau connu) mais avec S=3 séances, le pattern STRAIGHT est détecté et sa promotion réactive (1 occurrence) prime sur la règle stricte v1 Heavy 2/3, qui ne régit plus que le rôle 'amorce' de TOP_SET_BACKOFF", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(100, 10), session(100, 7), session(100, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).toContain("promotion_gate_passed");
  });

  it("la règle stricte Heavy 2/3 (WS4 checkPromotionGateWithRecovery) reste active sous le seuil de détection de pattern (S=2)", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.heavy, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [session(100, 10), session(100, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.reasonCodes).not.toContain("promotion_gate_passed");
  });
});

// ---------------------------------------------------------------------------
// Non-régression : suggest() sans gapDays == comportement d'avant WS4 (69 tests existants)
// ---------------------------------------------------------------------------

describe("Non-régression WS4", () => {
  it("suggest(sans gapDays/lastSessionDate) ne modifie ni weight ni reps ni mode par rapport au comportement documenté", () => {
    const exercise = makeExercise({ fatigueClass: FatigueClass.medium, repTargetMin: 6, repTargetMax: 10 });
    const history = [session(50, 7)];
    const s = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(s.mode).toBe(SuggestionMode.recordAttempt);
    expect(s.weight).toBeCloseTo(50);
    expect(s.reasonCodes).not.toContain("deload_after_gap");
  });
});
