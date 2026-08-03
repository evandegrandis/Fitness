/**
 * Tests ciblés ALGO_V2 (ALGO_SPEC_HARDENED.md) — complète `progression.test.ts` /
 * `deload.test.ts` (comportement v1) avec les scénarios propres à v2 : détection de pattern,
 * références par rôle, `predictReps` (pente 7.5%/rep), promotion réactive vs démotion stricte,
 * escalade plateau, bascule de variante, cluster machine.
 */
import { describe, expect, it } from "vitest";
import { suggest, SuggestionMode, detectPattern, predictReps } from "@/lib/engines/progression";
import { clusterLoads, activeCluster, preprocessHistory } from "@/lib/engines/patterns";
import { SetType, SetPatternMode, FatigueClass } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet } from "@/lib/models/types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `algo-v2-id-${idCounter}`;
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId(),
    name: "Exercice test",
    category: "push",
    setPatternMode: SetPatternMode.straight,
    repTargetMin: 8,
    repTargetMax: 12,
    smallestIncrement: 2.5,
    isFavorite: false,
    createdByUser: false,
    sortOrder: 0,
    suggestedRestSeconds: 90,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: null,
    benchmarkHigh: null,
    fatigueClass: FatigueClass.medium,
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

/** Séance à 1 set. */
function s1(weight: number, reps: number): LoggedSet[] {
  return [makeSet({ weight, reps, setSlotIndex: 0 })];
}

/** Séance top-set-backoff à 2-3 sets (chronologique par setSlotIndex). */
function sTSB(...pairs: [number, number][]): LoggedSet[] {
  return pairs.map(([weight, reps], i) => makeSet({ weight, reps, setSlotIndex: i }));
}

// ---------------------------------------------------------------------------
// detectPattern
// ---------------------------------------------------------------------------

describe("ALGO_V2 §2 — detectPattern", () => {
  it("moins de 3 séances -> suit setPatternMode figé, jamais TOP_SET_BACKOFF détecté par erreur", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight });
    const history = [s1(100, 8), s1(100, 7)];
    expect(detectPattern(exercise, history)).toBe("STRAIGHT");
  });

  it("verrou assisted_bodyweight : toujours ASSISTED_BW quel que soit l'historique", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.assistedBodyweight });
    const history = [sTSB([40, 8], [30, 6]), sTSB([40, 8], [30, 6]), sTSB([40, 8], [30, 6])];
    expect(detectPattern(exercise, history)).toBe("ASSISTED_BW");
  });

  it("WEIGHTED_BW_VARIABLE : >= 2 séances mixtes (set BW + set lesté) sur la fenêtre", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.weightedBodyweight, repTargetMin: 5, repTargetMax: 10 });
    const history = [
      sTSB([0, 10], [15, 5]), // mixte
      sTSB([0, 10], [15, 6]), // mixte
      sTSB([0, 10]),
    ];
    expect(detectPattern(exercise, history)).toBe("WEIGHTED_BW_VARIABLE");
  });

  it("BW_REP : >= 60% des sets à poids 0", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.bodyweight, repTargetMin: 6, repTargetMax: 10 });
    const history = [s1(0, 10), s1(0, 9), s1(0, 8)];
    expect(detectPattern(exercise, history)).toBe("BW_REP");
  });

  it("TOP_SET_BACKOFF détecté même si l'exercice est taggé straight (corrige les métadonnées figées)", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, smallestIncrement: 2.5 });
    // set2 nettement plus lourd que set1 dans >= 50% des séances à 2+ sets.
    const history = [
      sTSB([100, 10], [120, 7]),
      sTSB([100, 10], [120, 6]),
      sTSB([100, 10], [120, 5]),
    ];
    expect(detectPattern(exercise, history)).toBe("TOP_SET_BACKOFF");
  });

  it("STRAIGHT par défaut quand aucun autre pattern ne matche", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight });
    const history = [sTSB([60, 8], [60, 7]), sTSB([60, 8], [60, 6]), sTSB([60, 8], [60, 7])];
    expect(detectPattern(exercise, history)).toBe("STRAIGHT");
  });

  it("ISOLATION_FINISHER : exercice court placé tard dans les séances", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 8, repTargetMax: 12 });
    const history = [sTSB([12, 10], [12, 7]), sTSB([12, 10], [12, 8]), sTSB([12, 10], [12, 7])];
    const positions = [
      { position: 8, sessionExerciseCount: 10 },
      { position: 7, sessionExerciseCount: 9 },
      { position: 9, sessionExerciseCount: 11 },
    ];
    expect(detectPattern(exercise, history, positions)).toBe("ISOLATION_FINISHER");
  });
});

// ---------------------------------------------------------------------------
// Drop-sets / finishers : nettoyage des ancres et du profil empirique
// ---------------------------------------------------------------------------

describe("structure intra-exercice — historique normalisé pour la prédiction", () => {
  it("un drop-set immédiat ne crée qu'un set structurel et sa continuation n'entre pas dans les samples", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, smallestIncrement: 2.5 });
    const started = new Date("2026-08-01T10:00:00.000Z");
    const lead = makeSet({ weight: 100, reps: 4, setSlotIndex: 0, timestamp: started });
    const drop = makeSet({
      weight: 75,
      reps: 6,
      setSlotIndex: 1,
      timestamp: new Date(started.getTime() + 15_000),
      setType: SetType.backoff,
    });

    const processed = preprocessHistory([[lead, drop]], exercise, exercise.smallestIncrement);
    expect(processed[0].workSets).toEqual([lead]);
    expect(processed[0].amorce?.id).toBe(lead.id);
  });

  it("un burnout final hautes reps après baisse franche est exclu de l'ancre normale", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, smallestIncrement: 2.5 });
    const started = new Date("2026-08-01T10:00:00.000Z");
    const normal = makeSet({ weight: 20, reps: 6, setSlotIndex: 0, timestamp: started });
    const finisher = makeSet({
      weight: 0,
      reps: 15,
      setSlotIndex: 1,
      timestamp: new Date(started.getTime() + 300_000),
      setType: SetType.backoff,
    });

    const processed = preprocessHistory([[normal, finisher]], exercise, exercise.smallestIncrement);
    expect(processed[0].workSets).toEqual([normal]);
    expect(processed[0].amorce?.id).toBe(normal.id);
  });

  it("les sets d'un finisher dédié restent disponibles dans sa branche spécifique", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, smallestIncrement: 2.5 });
    const sets = sTSB([12, 10], [12, 7]);
    const processed = preprocessHistory([sets], exercise, exercise.smallestIncrement, {
      positions: [{ position: 8, sessionExerciseCount: 10 }],
      preserveDedicatedFinishers: true,
    });
    expect(processed[0].workSets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Références par rôle : amorce = set au max de reps (pas le premier set chronologique)
// ---------------------------------------------------------------------------

describe("ALGO_V2 §4.2/§7.1 — amorce = set au max de reps (inversion)", () => {
  it("séance avec top set fait en premier (inversion) : l'amorce historique reste le set au max de reps, pas le premier chronologique", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.topSetBackoff,
      fatigueClass: FatigueClass.heavy,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
    });
    // Session la plus récente : top fait EN PREMIER (120x7), puis amorce/backoff (100x10) ensuite.
    const history = [
      sTSB([120, 7], [100, 10]),
      sTSB([100, 10], [120, 6]),
      sTSB([100, 10], [120, 5]),
    ];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    // L'amorce cible doit rester ancrée près de 100 (le set au max de reps), pas dériver vers 120.
    expect(suggestion.weight).toBeGreaterThanOrEqual(100);
    expect(suggestion.weight).toBeLessThan(115);
  });
});

// ---------------------------------------------------------------------------
// predictReps — pente 7.5%/rep (§5.2)
// ---------------------------------------------------------------------------

describe("ALGO_V2 §5.2 — predictReps pente REP_SLOPE_PCT (7.5%/rep)", () => {
  it("sans échantillon direct au poids demandé, extrapole via la pente 7.5% (plus lourd -> moins de reps)", () => {
    // Un seul point de référence à 100kg x 6 (role "top"), demande à un poids plus lourd (110kg).
    const reps = predictReps(110, "top", {
      mode: "external",
      repTargetMin: 4,
      repTargetMax: 10,
      increment: 2.5,
      samples: [
        { role: "top", weight: 100, reps: 6 },
        { role: "top", weight: 100, reps: 6 }, // >= 2 échantillons pour permettre la médiane directe à 100
      ],
    });
    // kgPerRep = max(2.5, 0.075*100) = 7.5 ; delta = 10kg -> ~1.33 rep de moins -> 6-1.33 ≈ 4.67 -> round 5.
    expect(reps).toBe(5);
  });

  it("cap absolu à WORK_REP_CAP (10) même si repTargetMax est plus haut", () => {
    const reps = predictReps(50, "straight", {
      mode: "external",
      repTargetMin: 8,
      repTargetMax: 20,
      increment: 2.5,
      samples: [
        { role: "straight", weight: 50, reps: 15 },
        { role: "straight", weight: 50, reps: 14 },
      ],
    });
    expect(reps).toBeLessThanOrEqual(10);
  });

  it("cold start (aucun échantillon exploitable) -> milieu de la fourchette de reps", () => {
    const reps = predictReps(50, "amorce", {
      mode: "external",
      repTargetMin: 6,
      repTargetMax: 10,
      increment: 2.5,
      samples: [],
    });
    expect(reps).toBe(8); // ceil((6+10)/2)
  });
});

// ---------------------------------------------------------------------------
// Récence bornée : clusters machine (Isolateral row ~110 pas 120)
// ---------------------------------------------------------------------------

describe("ALGO_V2 §3 — clusters de charge (machine à marques multiples)", () => {
  it("deux charges éloignées (>tolérance) forment deux clusters séparés ; le cluster actif = la séance la plus récente", () => {
    const increment = 2.5;
    // Cluster A (récent) : 110/120 (écart <= max(2*2.5, 12%*120)=14.4) -> même cluster.
    // Cluster B (ancien) : 80 (écart avec 110 = 30 > 14.4) -> cluster séparé.
    const entries = [
      { load: 120, sessionIndex: 5 },
      { load: 120, sessionIndex: 4 },
      { load: 120, sessionIndex: 3 },
      { load: 110, sessionIndex: 0 }, // le plus récent
      { load: 80, sessionIndex: 6 },
    ];
    const clusters = clusterLoads(entries, increment);
    expect(clusters.length).toBe(2);
    const active = activeCluster(clusters);
    expect(active).not.toBeNull();
    expect(active!.loads).toContain(110);
    expect(active!.loads).not.toContain(80);
  });

  it("bout en bout : historique récent 110/120 + un ancien 80 isolé -> suggestion ancrée ~110, pas 120, pas 80", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 8,
      repTargetMax: 12,
      smallestIncrement: 2.5,
      fatigueClass: FatigueClass.medium,
    });
    const history = [
      s1(110, 6), // le plus récent : mauvais jour au load du cluster actif
      s1(120, 8),
      s1(120, 8),
      s1(120, 8),
      s1(80, 8), // cluster machine différent, ne doit pas influencer la référence
    ];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    // Mauvais jour (6 < repMin=8, mais >= repMin-2=6 -> pas de démotion) : la référence reste 110, pas 120 ni 80.
    expect(suggestion.weight).toBeCloseTo(110);
  });
});

// ---------------------------------------------------------------------------
// Promotion réactive (STRAIGHT/top) vs démotion stricte
// ---------------------------------------------------------------------------

describe("ALGO_V2 §4.4/§4.2 — promotion réactive vs démotion stricte", () => {
  it("STRAIGHT : 1 seule occurrence >= min(9,repTargetMax) sur la dernière séance suffit à promouvoir (réactif)", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [s1(80, 9), s1(80, 7), s1(80, 6)];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(suggestion.mode).toBe(SuggestionMode.transitionMode);
    expect(suggestion.reasonCodes).toContain("promotion_gate_passed");
    expect(suggestion.weight).toBeCloseTo(82.5);
  });

  it("démotion stricte : reps < repMin - DEMOTION_MARGIN(2) sur la dernière séance -> référence recule d'un incrément", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 8, repTargetMax: 12, smallestIncrement: 2.5 });
    // last reps = 5 < repMin(8) - 2 = 6 -> échec net -> démotion.
    const history = [s1(80, 5), s1(80, 9), s1(80, 9)];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(suggestion.weight).toBeCloseTo(77.5);
  });

  it("mauvais jour (repMin-2 <= reps < repMin) : la référence NE BOUGE PAS (ni promotion ni démotion)", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 8, repTargetMax: 12, smallestIncrement: 2.5 });
    // last reps = 7 : dans [repMin-2=6, repMin=8) -> mauvais jour, pas de changement.
    const history = [s1(80, 7), s1(80, 9), s1(80, 9)];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(suggestion.weight).toBeCloseTo(80);
  });
});

// ---------------------------------------------------------------------------
// Escalade plateau (§8 ALGO_SPEC_HARDENED, ANTI_PLATEAU_SCIENCE.md §2)
// ---------------------------------------------------------------------------

describe("ALGO_V2 §8 — escalade plateau (surcharge / rest-pause), jamais sur le premier set", () => {
  it("le premier set de la séance n'est JAMAIS touché par l'escalade plateau, même si plateauCounter >= 3", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    // 4 séances identiques à 80x8 (mauvais jour recurrent, pas de promotion, plateau détecté).
    const history = [s1(80, 7), s1(80, 7), s1(80, 7), s1(80, 7)];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(suggestion.mode).not.toBe(SuggestionMode.plateauBreak);
    expect(suggestion.intensityTechnique).toBeNull();
  });

  it("set 2+ en plateau (>=3 séances identiques) : escalade appliquée (surcharge OU rest-pause selon la parité de plateauCounter-3)", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [s1(80, 7), s1(80, 7), s1(80, 7), s1(80, 7)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0 })];
    const suggestion = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets });
    expect(suggestion.mode).toBe(SuggestionMode.plateauBreak);
    // plateauCounter=4 ici (4 séances identiques) -> (4-3)%2=1 -> impair -> rest-pause (ANTI_PLATEAU_SCIENCE.md §2, étape 4).
    expect(suggestion.intensityTechnique).toBe("rest_pause");
    expect(suggestion.reasonCodes).toContain("rest_pause");
  });

  it("plateauCounter=3 (premier cycle) : escalade PAIRE = surcharge +1 incrément, 5 reps", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    const history = [s1(80, 7), s1(80, 7), s1(80, 7)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0 })];
    const suggestion = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets });
    expect(suggestion.mode).toBe(SuggestionMode.plateauBreak);
    expect(suggestion.reasonCodes).toContain("plateau_break");
    expect(suggestion.weight).toBeCloseTo(82.5);
    expect(suggestion.reps).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Bascule de variante (Ab roller debout -> genoux, §7.4/§9)
// ---------------------------------------------------------------------------

describe("ALGO_V2 §7.4/§9 — bascule de variante (Ab roller debout -> genoux)", () => {
  it("< VARIANT_SWITCH_FLOOR(4) reps sur 'Ab roller debout' -> propose la bascule vers 'Ab roller genoux'", () => {
    const exercise = makeExercise({
      name: "Ab roller debout",
      setPatternMode: SetPatternMode.bodyweight,
      repTargetMin: 4,
      repTargetMax: 10,
      smallestIncrement: 2.5,
    });
    const history = [s1(0, 4), s1(0, 6), s1(0, 3)];
    const currentSessionSets = [makeSet({ weight: 0, reps: 3, setSlotIndex: 0 })];
    const suggestion = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets });
    expect(suggestion.switchToVariantId).toBe("Ab roller genoux");
    expect(suggestion.reasonCodes).toContain("variant_switch_easier");
    expect(suggestion.reps).toBe(10);
  });

  it("exercice sans variante liée -> switchToVariantId reste null même en échec net", () => {
    const exercise = makeExercise({
      name: "Un autre exercice BW",
      setPatternMode: SetPatternMode.bodyweight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
    });
    const history = [s1(0, 8), s1(0, 8), s1(0, 8)];
    const currentSessionSets = [makeSet({ weight: 0, reps: 2, setSlotIndex: 0 })];
    const suggestion = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets });
    expect(suggestion.switchToVariantId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WEIGHTED_BW_VARIABLE (Tractions SN) — primer, décision lest/3xBW
// ---------------------------------------------------------------------------

describe("ALGO_V2 §7.5 — WEIGHTED_BW_VARIABLE : primer BW puis décision lest/3xBW", () => {
  it("séance sans set aujourd'hui -> primer BW x10 (jamais lesté en premier)", () => {
    const exercise = makeExercise({
      name: "Tractions SN",
      setPatternMode: SetPatternMode.weightedBodyweight,
      repTargetMin: 5,
      repTargetMax: 10,
      smallestIncrement: 1.25,
    });
    const history = [sTSB([0, 10], [15, 5]), sTSB([0, 10], [15, 6]), sTSB([0, 10])];
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });
    expect(suggestion.weight).toBe(0);
    expect(suggestion.reps).toBe(10);
  });

  it("primer réussi (10 BW) + frais (gap faible, pas de fatigue) -> propose du lest", () => {
    const exercise = makeExercise({
      name: "Tractions SN",
      setPatternMode: SetPatternMode.weightedBodyweight,
      repTargetMin: 5,
      repTargetMax: 10,
      smallestIncrement: 1.25,
    });
    const history = [sTSB([0, 10], [15, 5]), sTSB([0, 10], [15, 6]), sTSB([0, 10])];
    const currentSessionSets = [makeSet({ weight: 0, reps: 10, setSlotIndex: 0 })];
    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      gapDays: 2,
    });
    expect(suggestion.weight).toBeGreaterThan(0);
  });
});
