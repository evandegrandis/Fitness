/**
 * Tests ciblés ALGO_V2 (ALGO_SPEC_HARDENED.md) — complète `progression.test.ts` /
 * `deload.test.ts` (comportement v1) avec les scénarios propres à v2 : détection de pattern,
 * références par rôle, `predictReps` (pente 7.5%/rep), promotion réactive vs démotion stricte,
 * escalade plateau, bascule de variante, cluster machine.
 */
import { describe, expect, it } from "vitest";
import {
  SUGGESTION_ENGINE_VERSION,
  deriveStateV2,
  detectPattern,
  predictReps,
  reprojectSuggestionAtWeight,
  suggest,
  SuggestionMode,
} from "@/lib/engines/progression";
import {
  activeCluster,
  classifySessionRoles,
  clusterLoads,
  collectExerciseHistory,
  preprocessHistory,
} from "@/lib/engines/patterns";
import { SetType, SetPatternMode, FatigueClass, MovementPattern } from "@/lib/models/enums";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import { SessionFatigueContext } from "@/lib/engines/session-fatigue";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import type { SetSuggestion } from "@/lib/engines/progression";

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

  it("une position tardive et peu de sets ne suffisent jamais à inventer un finisher", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 8, repTargetMax: 12 });
    const history = [sTSB([12, 10], [12, 7]), sTSB([12, 10], [12, 8]), sTSB([12, 10], [12, 7])];
    const positions = [
      { position: 8, sessionExerciseCount: 10 },
      { position: 7, sessionExerciseCount: 9 },
      { position: 9, sessionExerciseCount: 11 },
    ];
    expect(detectPattern(exercise, history, positions)).toBe("STRAIGHT");
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

  it("un exercice PDC tardif reste BW_REP sans setType finisher explicite", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.bodyweight, repTargetMin: 6, repTargetMax: 12 });
    const history = [s1(0, 16), s1(0, 14), s1(0, 13)];
    const positions = history.map(() => ({ position: 7, sessionExerciseCount: 8 }));

    expect(detectPattern(exercise, history, positions)).toBe("BW_REP");
    const processed = preprocessHistory(history, exercise, exercise.smallestIncrement, {
      positions,
      preserveDedicatedFinishers: true,
    });
    expect(processed.map((session) => session.workSets.length)).toEqual([1, 1, 1]);
  });

  it("un finisher explicitement persisté conserve immédiatement un profil dédié", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight });
    const finisher = makeSet({ weight: 12, reps: 12, setType: SetType.finisher });
    expect(detectPattern(exercise, [[finisher]])).toBe("ISOLATION_FINISHER");
    const processed = preprocessHistory([[finisher]], exercise, exercise.smallestIncrement, {
      preserveDedicatedFinishers: true,
    });
    expect(processed[0].workSets).toHaveLength(1);
  });

  it("un profil finisher explicite suggère et enchaîne des sets typés finisher", () => {
    const exercise = makeExercise({ repTargetMin: 8, repTargetMax: 12 });
    const historicalFinisher = makeSet({ weight: 12, reps: 12, setType: SetType.finisher });

    const first = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: [[historicalFinisher]],
      currentSessionSets: [],
    });
    expect(first.setType).toBe(SetType.finisher);

    const second = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: [[historicalFinisher]],
      currentSessionSets: [
        makeSet({ weight: first.weight, reps: first.reps, setType: SetType.finisher }),
      ],
    });
    expect(second.setType).toBe(SetType.finisher);
    expect(second.reps).toBeLessThanOrEqual(exercise.repTargetMax);
  });

  it("collecte les warmups et fusionne les doublons intra-séance avant P2/P5", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.topSetBackoff, repTargetMin: 6 });
    const at = (minute: number) => new Date(`2026-07-30T10:${String(minute).padStart(2, "0")}:00Z`);
    const warmup = makeSet({ weight: 100, reps: 10, setType: SetType.warmup, timestamp: at(0), setSlotIndex: 0 });
    const top = makeSet({ weight: 120, reps: 6, timestamp: at(2), setSlotIndex: 1 });
    const backoff = makeSet({ weight: 100, reps: 6, timestamp: at(4), setSlotIndex: 2 });
    const reminder1 = makeSet({ weight: 80, reps: 12, timestamp: at(40), setSlotIndex: 0 });
    const reminder2 = makeSet({ weight: 80, reps: 12, timestamp: at(42), setSlotIndex: 1 });
    const old = (id: string, day: string) => ({
      id,
      date: new Date(day), startTime: new Date(day), endTime: new Date(day), notes: "", isActive: false,
      templateName: null, supersetGroups: [], cardioEntries: [],
      exercises: [{ id: `${id}-le`, orderIndex: 0, notes: "", exerciseId: exercise.id, exerciseName: exercise.name,
        sets: [makeSet({ weight: 100, reps: 10, timestamp: new Date(day) })], supersetGroupId: null, plateauWeakPoint: null }],
    });
    const recent = {
      id: "recent", date: at(0), startTime: at(0), endTime: at(50), notes: "", isActive: false,
      templateName: null, supersetGroups: [], cardioEntries: [],
      exercises: [
        { id: "first", orderIndex: 0, notes: "", exerciseId: exercise.id, exerciseName: exercise.name,
          sets: [warmup, top, backoff], supersetGroupId: null, plateauWeakPoint: null },
        { id: "other", orderIndex: 1, notes: "", exerciseId: "other", exerciseName: "Other", sets: [], supersetGroupId: null, plateauWeakPoint: null },
        { id: "reminder", orderIndex: 2, notes: "", exerciseId: exercise.id, exerciseName: exercise.name,
          sets: [reminder1, reminder2], supersetGroupId: null, plateauWeakPoint: null },
      ],
    };
    const collected = collectExerciseHistory(
      [recent, old("old-1", "2026-07-25T10:00:00Z"), old("old-2", "2026-07-20T10:00:00Z")],
      exercise.id,
      10
    );

    expect(collected.sets).toHaveLength(3);
    expect(collected.sets[0]).toHaveLength(5);
    expect(collected.sets[0].map((set) => set.setSlotIndex)).toEqual([0, 1, 2, 3, 4]);
    const processed = preprocessHistory(collected.sets, exercise, exercise.smallestIncrement, {
      positions: collected.positions,
    });
    expect(processed[0].workSets).toHaveLength(3);
    expect(processed[0].amorce?.weight).toBe(100);
    expect(processed[0].top?.weight).toBe(120);
    expect(processed[0].workSets.some((set) => set.id === reminder2.id)).toBe(false);

    const permuted = collectExerciseHistory(
      [old("old-2b", "2026-07-20T10:00:00Z"), recent, old("old-1b", "2026-07-25T10:00:00Z")],
      exercise.id,
      2
    );
    expect(permuted.sets.map((sets) => sets[0].timestamp.getTime())).toEqual([
      collected.sets[0][0].timestamp.getTime(),
      new Date("2026-07-25T10:00:00Z").getTime(),
    ]);
  });

  it("ne classe jamais comme backoff un set placé avant le top", () => {
    const roles = classifySessionRoles(
      [sTSB([90, 6])[0], sTSB([80, 10])[0], sTSB([100, 6])[0]].map((set, index) => ({ ...set, setSlotIndex: index })),
      2.5
    );
    expect(roles.roles).toEqual(["straight", "amorce", "top"]);
    expect(roles.backoffs).toEqual([]);
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

describe("ALGO_V2 §4.2 — ancre STRAIGHT = set chargé valide", () => {
  it("garde 80x7 comme ancre plutôt que le set plus léger à davantage de reps", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 8,
      repTargetMax: 12,
      smallestIncrement: 5,
    });
    const descendingSession = (day: number): LoggedSet[] => [
      makeSet({ weight: 80, reps: 7, setSlotIndex: 0, timestamp: new Date(`2026-08-0${day}T10:00:00Z`) }),
      makeSet({ weight: 75, reps: 10, setSlotIndex: 1, timestamp: new Date(`2026-08-0${day}T10:03:00Z`) }),
    ];
    const history = [descendingSession(7), descendingSession(4), descendingSession(1)];

    const state = deriveStateV2(exercise, history, exercise.smallestIncrement, undefined, undefined);
    const suggestion = suggest({ exercise, currentSetIndex: 0, recentHistory: history, currentSessionSets: [] });

    expect(state.pattern).toBe("STRAIGHT");
    expect(state.amorceHistory[0]).toEqual({ weight: 80, reps: 7 });
    // Le premier record du run est daté sur le set-ancre 80x7 (10:00), jamais sur le 75x10
    // sélectionné auparavant comme `p.amorce` (10:03).
    expect(state.lastProgressDate).toEqual(new Date("2026-08-01T10:00:00Z"));
    expect(suggestion.weight).toBe(80);
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

  it("plafonne au haut de la fourchette de l'exercice (le plafond global à 10 reps est abrogé)", () => {
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
    expect(reps).toBeGreaterThan(10);
    expect(reps).toBeLessThanOrEqual(20);
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

describe("régression intra-séance — BW_REP indexé par position", () => {
  it("HSPU après BW×10 ne retombe jamais à BW×8 sans fatigue, même si la médiane historique vaut 8", () => {
    const exercise = makeExercise({
      name: "HSPU",
      setPatternMode: SetPatternMode.bodyweight,
      repTargetMin: 5,
      repTargetMax: 10,
      smallestIncrement: 1.25,
    });
    const bwSession = (secondReps: number): LoggedSet[] => [
      makeSet({ weight: 0, reps: 10, setSlotIndex: 0 }),
      makeSet({ weight: 0, reps: secondReps, setSlotIndex: 1 }),
    ];
    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: [bwSession(13), bwSession(8), bwSession(7)],
      currentSessionSets: [makeSet({ weight: 0, reps: 10, setSlotIndex: 0 })],
    });

    expect(suggestion.reasonCodes).toContain("bw_rep_v2_predicted");
    expect(suggestion.weight).toBe(0);
    expect(suggestion.reps).toBe(10);
  });
});

describe("reprojectSuggestionAtWeight", () => {
  const baseSuggestion: SetSuggestion = {
    weight: 80,
    reps: 8,
    setType: SetType.work,
    explanation: "Tentative de record · 80 kg × 8",
    confidence: 0.9,
    reasonCodes: [],
    mode: SuggestionMode.recordAttempt,
    sessionFatigueWarning: null,
  };

  it("reprojette les reps à la hausse/baisse sans dépasser le haut de la fourchette", () => {
    const exercise = makeExercise({ repTargetMin: 6, repTargetMax: 12, smallestIncrement: 5 });
    const heavier = reprojectSuggestionAtWeight(baseSuggestion, exercise, 85);
    const lighter = reprojectSuggestionAtWeight(baseSuggestion, exercise, 65);

    expect(heavier.weight).toBe(85);
    expect(heavier.reps).toBeLessThan(baseSuggestion.reps);
    expect(heavier.explanation).toContain(`85 kg × ${heavier.reps}`);
    expect(lighter.reps).toBeGreaterThan(baseSuggestion.reps);
    expect(lighter.reps).toBeLessThanOrEqual(exercise.repTargetMax);
  });

  it("intègre le poids du corps pour le lest et inverse correctement l'assistance", () => {
    const weighted = makeExercise({ setPatternMode: SetPatternMode.weightedBodyweight, smallestIncrement: 5 });
    const assisted = makeExercise({ setPatternMode: SetPatternMode.assistedBodyweight, smallestIncrement: 5 });
    const weightedBase = { ...baseSuggestion, weight: 20 };
    const assistedBase = { ...baseSuggestion, weight: 30 };

    expect(reprojectSuggestionAtWeight(weightedBase, weighted, 25, 80).reps).toBeLessThan(weightedBase.reps);
    expect(reprojectSuggestionAtWeight(assistedBase, assisted, 25, 80).reps).toBeLessThan(assistedBase.reps);
    expect(reprojectSuggestionAtWeight(assistedBase, assisted, 35, 80).reps).toBeGreaterThan(assistedBase.reps);
  });

  it("expose la version stable destinée aux snapshots suggestion/réel", () => {
    expect(SUGGESTION_ENGINE_VERSION).toBe("web-v2.6-2026-10-24");
  });
});

describe("calibration suggestion → performance réelle", () => {
  it("corrige progressivement un biais répété sans dépasser deux reps", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 15,
      smallestIncrement: 5,
    });
    const actualHistory = [s1(80, 6), s1(80, 6), s1(80, 6)];
    const measuredHistory = actualHistory.map((session) =>
      session.map((set) => ({
        ...set,
        logicalSetId: set.id,
        predictedRepsAtActualWeight: 4,
      }))
    );

    const baseline = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: actualHistory,
      currentSessionSets: [],
    });
    const calibrated = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: measuredHistory,
      currentSessionSets: [],
    });

    expect(calibrated.reasonCodes).toContain("prediction_bias_calibrated");
    expect(calibrated.reps).toBe(Math.min(10, baseline.reps + 1));
    expect(calibrated.explanation).toMatch(new RegExp(`× ${calibrated.reps}$`));
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

  it("ne traite pas 7 reps sur un minimum de 8 comme un overreach raté", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 8, repTargetMax: 12, smallestIncrement: 5 });
    const history = [s1(80, 8), s1(80, 8), s1(80, 8)];
    const moderateMiss = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets: [makeSet({ weight: 85, reps: 7 })],
    });
    const trueOverreach = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets: [makeSet({ weight: 85, reps: 5 })],
    });

    expect(moderateMiss.reasonCodes).not.toContain("post_overreach_return_to_anchor");
    expect(trueOverreach.reasonCodes).toContain("post_overreach_return_to_anchor");
    expect(trueOverreach.weight).toBe(80);
  });

  it("garde l'explication synchronisée avec les reps, sans dépasser le haut de la fourchette", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 10, repTargetMax: 15, smallestIncrement: 2.5 });
    const fatigue = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 5, fatigueClass: FatigueClass.medium },
    ]);
    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: [s1(80, 10), s1(80, 10), s1(80, 10)],
      currentSessionSets: [makeSet({ weight: 80, reps: 10 })],
      sessionFatigue: fatigue,
    });

    expect(suggestion.reps).toBeLessThanOrEqual(exercise.repTargetMax);
    expect(suggestion.explanation).toMatch(new RegExp(`× ${suggestion.reps}$`));
  });
});

// ---------------------------------------------------------------------------
// Escalade plateau (§8 ALGO_SPEC_HARDENED, ANTI_PLATEAU_SCIENCE.md §2)
// ---------------------------------------------------------------------------

describe("VARIATION_CYCLING_SPEC §4 décision #3 — l'escalade d'intensité (rest-pause/overreach) est RETIRÉE", () => {
  it("plateauCounter >= 3 seul (sans plateau daté) ne déclenche plus AUCUNE escalade — intensityTechnique toujours null", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight, repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5 });
    // 4 séances identiques à 80x7, mais TOUTES au même timestamp (fixture `s1`/`makeSet` par défaut)
    // -> plateauStalledDays=0 -> isPlateau=false (VARIATION_CYCLING_SPEC §2, date-based) malgré
    // plateauCounter=4 : preuve que l'ancien seuil par nombre de séances ne ressuscite pas l'escalade.
    const history = [s1(80, 7), s1(80, 7), s1(80, 7), s1(80, 7)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0 })];
    const suggestion = suggest({ exercise, currentSetIndex: 1, recentHistory: history, currentSessionSets });
    expect(suggestion.mode).not.toBe(SuggestionMode.plateauBreak);
    expect(suggestion.intensityTechnique).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("rest_pause");
    expect(suggestion.reasonCodes).not.toContain("plateau_break");
  });
});

// ---------------------------------------------------------------------------
// Rotation de variation sur plateau DATÉ (remplace l'escalade d'intensité, §2/§4/§6/§8)
// ---------------------------------------------------------------------------

describe("VARIATION_CYCLING_SPEC §2/§4/§6/§8 — rotation de variation sur plateau daté (isPlateau)", () => {
  /** Ancre datée `n` jours avant `TODAY`, même poids/reps (aucun nouveau max d'e1RM -> plateau). */
  const TODAY = new Date("2026-08-04T12:00:00Z");
  function daysAgo(n: number): Date {
    return new Date(TODAY.getTime() - n * 86_400_000);
  }
  function datedSession(weight: number, reps: number, n: number): LoggedSet[] {
    return [makeSet({ weight, reps, setSlotIndex: 0, timestamp: daysAgo(n) })];
  }

  it("isPlateau (14j+, >=2 séances, aucun progrès) + catalogue avec un pair même pattern -> switchToVariantId = un exerciseId réel, reasonCodes contient 'variation', AUCUNE mutation de weight/reps/mode", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const candidate = makeExercise({
      name: "Développé militaire haltères",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    // Même charge/reps depuis 21 jours, >= 2 séances dans la fenêtre de 14j -> isPlateau=true.
    const history = [datedSession(80, 7, 3), datedSession(80, 7, 10), datedSession(80, 7, 21)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0, timestamp: TODAY })];

    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      catalog: [current, candidate],
      sessionHistory: [],
      goals: [],
      now: TODAY,
    });

    expect(suggestion.switchToVariantId).toBe(candidate.id);
    expect(suggestion.reasonCodes).toContain("variation");
    // Non destructif : la rotation ne mute ni la charge, ni les reps, ni le mode de CETTE suggestion.
    expect(suggestion.mode).not.toBe(SuggestionMode.plateauBreak);
    expect(suggestion.intensityTechnique).toBeNull();
  });

  it("VARIATION_CYCLING_SPEC §3/§4.2 (P2.3) — rotation PRÉEMPTIVE sur 'slowing' (PAS encore isPlateau) : switchToVariantId posé, reasonCodes contient 'variation_preemptive' (pas 'variation')", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const candidate = makeExercise({
      name: "Développé militaire haltères",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    // Totalement plat (même charge/reps) sur 10 jours : vélocité nulle, stalledDays ~10 (>= 7, < 14)
    // -> "slowing", PAS "plateaued" (le seuil isPlateau est 14j) — même fixture que
    // progression.test.ts "stagnation flat 7-13 jours".
    const history = [datedSession(80, 7, 0), datedSession(80, 7, 5), datedSession(80, 7, 10)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0, timestamp: TODAY })];

    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      catalog: [current, candidate],
      sessionHistory: [],
      goals: [],
      now: TODAY,
    });

    expect(suggestion.progressionState).toBe("slowing");
    expect(suggestion.switchToVariantId).toBe(candidate.id);
    expect(suggestion.reasonCodes).toContain("variation_preemptive");
    expect(suggestion.reasonCodes).not.toContain("variation");
  });

  it("progressionState='progressing' (reps en hausse à charge constante) -> AUCUNE proposition, même avec catalogue/pair disponibles", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const candidate = makeExercise({
      name: "Développé militaire haltères",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    // Reps en hausse à charge constante -> §2 décision #2 : progrès, jamais "slowing"/"plateaued".
    const history = [datedSession(80, 9, 0), datedSession(80, 8, 5), datedSession(80, 7, 10)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 9, setSlotIndex: 0, timestamp: TODAY })];

    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      catalog: [current, candidate],
      sessionHistory: [],
      goals: [],
      now: TODAY,
    });

    expect(suggestion.progressionState).toBe("progressing");
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("variation");
    expect(suggestion.reasonCodes).not.toContain("variation_preemptive");
  });

  it("un PR du jour annule un état stale et toute rotation de variante", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1 }],
    });
    const candidate = makeExercise({
      name: "Développé militaire haltères",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1 }],
    });
    const history = [datedSession(80, 7, 3), datedSession(80, 7, 10), datedSession(80, 7, 21)];
    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets: [makeSet({ weight: 82.5, reps: 7, setSlotIndex: 0, timestamp: TODAY })],
      catalog: [current, candidate],
      sessionHistory: [],
      prAchievedToday: true,
      now: TODAY,
    });

    expect(suggestion.progressionState).toBe("progressing");
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("variation");
    expect(suggestion.reasonCodes).not.toContain("variation_preemptive");
  });

  it("VARIATION_CYCLING_SPEC §5.3/§6 (P2.1) — le point faible capturé sur une séance passée (`sessionHistory`) départage les candidats via weakPointFit", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const shared = {
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
      category: "push",
      fatigueClass: "medium" as const,
      name: "Développé variante",
    };
    const matching = makeExercise({ ...shared, resistanceProfile: "lockout" });
    const nonMatching = makeExercise({ ...shared, resistanceProfile: "bottom" });
    const history = [datedSession(80, 7, 3), datedSession(80, 7, 10), datedSession(80, 7, 21)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0, timestamp: TODAY })];
    // Capture 1-tap déjà faite sur une séance PASSÉE (§5.3) : "où ça a calé ?" -> "lockout".
    const sessionHistory = [
      {
        id: "past-session-weakpoint",
        date: daysAgo(21),
        startTime: daysAgo(21),
        endTime: daysAgo(21),
        notes: "",
        isActive: false,
        templateName: null,
        supersetGroups: [],
        exercises: [
          {
            id: "logged-past",
            orderIndex: 0,
            notes: "",
            exerciseId: current.id,
            exerciseName: current.name,
            supersetGroupId: null,
            plateauWeakPoint: "lockout" as const,
            sets: datedSession(80, 7, 21),
          },
        ],
      },
    ];

    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      catalog: [current, matching, nonMatching],
      sessionHistory,
      goals: [],
      now: TODAY,
    });

    expect(suggestion.switchToVariantId).toBe(matching.id);
  });

  it("le premier set de la séance n'est JAMAIS touché, même en plateau daté avec un candidat disponible", () => {
    const current = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const candidate = makeExercise({
      name: "Candidat",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const history = [datedSession(80, 7, 3), datedSession(80, 7, 10), datedSession(80, 7, 21)];
    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 0,
      recentHistory: history,
      currentSessionSets: [], // aucun set fait aujourd'hui -> c'est le premier set
      catalog: [current, candidate],
      sessionHistory: [],
      goals: [],
      now: TODAY,
    });
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("variation");
  });

  it("isPlateau=true mais `catalog`/`sessionHistory` non fournis -> aucune proposition, switchToVariantId reste null (dégradation gracieuse §9)", () => {
    const current = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.verticalPress,
    });
    const history = [datedSession(80, 7, 3), datedSession(80, 7, 10), datedSession(80, 7, 21)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0, timestamp: TODAY })];
    const suggestion = suggest({ exercise: current, currentSetIndex: 1, recentHistory: history, currentSessionSets, now: TODAY });
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("variation");
  });

  it("isPlateau=true et catalogue fourni mais SANS pair valide (aucun autre exercice du même pattern) -> selectAlternative renvoie null, pas de crash", () => {
    const current = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      movementPattern: MovementPattern.isolation,
    });
    const history = [datedSession(80, 7, 3), datedSession(80, 7, 10), datedSession(80, 7, 21)];
    const currentSessionSets = [makeSet({ weight: 80, reps: 7, setSlotIndex: 0, timestamp: TODAY })];
    const suggestion = suggest({
      exercise: current,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      catalog: [current],
      sessionHistory: [],
      goals: [],
      now: TODAY,
    });
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("variation");
  });
});

// ---------------------------------------------------------------------------
// Bascule de variante (Ab roller debout -> genoux, §7.4/§9) — switchToVariantId porte un exerciseId
// ---------------------------------------------------------------------------

describe("ALGO_V2 §7.4/§9 — bascule de variante (Ab roller debout -> genoux)", () => {
  it("< VARIANT_SWITCH_FLOOR(4) reps sur 'Ab roller debout' -> propose la bascule vers l'exerciseId de 'Ab roller genoux' (résolu via `catalog`, plus un nom — VARIATION_CYCLING_SPEC §8)", () => {
    const exercise = makeExercise({
      name: "Ab roller debout",
      setPatternMode: SetPatternMode.bodyweight,
      repTargetMin: 4,
      repTargetMax: 10,
      smallestIncrement: 2.5,
    });
    const easierVariant = makeExercise({ name: "Ab roller genoux" });
    const history = [s1(0, 4), s1(0, 6), s1(0, 3)];
    const currentSessionSets = [makeSet({ weight: 0, reps: 3, setSlotIndex: 0 })];
    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      catalog: [exercise, easierVariant],
    });
    expect(suggestion.switchToVariantId).toBe(easierVariant.id);
    expect(suggestion.reasonCodes).toContain("variant_switch_easier");
    expect(suggestion.reps).toBe(10);
  });

  it("un PR déjà réalisé aujourd'hui interdit aussi la bascule BW vers une variante facile", () => {
    const exercise = makeExercise({
      name: "Ab roller debout",
      setPatternMode: SetPatternMode.bodyweight,
      repTargetMin: 4,
      repTargetMax: 10,
    });
    const easierVariant = makeExercise({ name: "Ab roller genoux" });
    const suggestion = suggest({
      exercise,
      currentSetIndex: 2,
      recentHistory: [s1(0, 4), s1(0, 6), s1(0, 3)],
      currentSessionSets: [makeSet({ weight: 0, reps: 10 }), makeSet({ weight: 0, reps: 3, setSlotIndex: 1 })],
      catalog: [exercise, easierVariant],
      prAchievedToday: true,
    });

    expect(suggestion.progressionState).toBe("progressing");
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("variant_switch_easier");
    expect(suggestion.explanation).not.toContain("Variante facile");
  });

  it("< VARIANT_SWITCH_FLOOR(4) reps mais `catalog` non fourni -> switchToVariantId reste null (plus jamais un nom brut, dégradation gracieuse)", () => {
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
    expect(suggestion.switchToVariantId).toBeNull();
    expect(suggestion.reasonCodes).toContain("variant_switch_easier");
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

describe("TOP_SET_BACKOFF — le set réel et le RIR pilotent la suite", () => {
  it("ne propose jamais 3 reps après une amorce solide à RIR3, même après 11 jours", () => {
    const exercise = makeExercise({
      name: "DC assisté",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      fatigueClass: FatigueClass.heavy,
    });
    const history = [
      sTSB([80, 10], [100, 7]),
      sTSB([80, 10], [100, 6]),
      sTSB([80, 9], [100, 6]),
    ];
    const currentSessionSets = [
      makeSet({ weight: 80, reps: 10, reportedRir: 3, setSlotIndex: 0 }),
    ];

    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      gapDays: 11,
    });

    expect(suggestion.weight).toBeGreaterThanOrEqual(95);
    expect(suggestion.reps).toBeGreaterThanOrEqual(exercise.repTargetMin);
    expect(suggestion.reasonCodes).not.toContain("deload_after_gap");
  });

  it("après 100x8 RIR1, propose un backoff proche du top et dans la plage hypertrophie", () => {
    const exercise = makeExercise({
      name: "DC assisté",
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
      fatigueClass: FatigueClass.heavy,
    });
    const history = [
      sTSB([80, 10], [100, 7]),
      sTSB([80, 10], [100, 6]),
      sTSB([80, 9], [100, 6]),
    ];
    const currentSessionSets = [
      makeSet({ weight: 80, reps: 10, reportedRir: 3, setSlotIndex: 0 }),
      makeSet({ weight: 100, reps: 8, reportedRir: 1, setSlotIndex: 1 }),
    ];

    const suggestion = suggest({
      exercise,
      currentSetIndex: 2,
      recentHistory: history,
      currentSessionSets,
      gapDays: 11,
    });

    expect(suggestion.weight).toBe(95);
    expect(suggestion.reps).toBe(7);
    expect(suggestion.reasonCodes).toContain("backoff_v2");
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

  it("autorise le lest via le gap exercice mais déleste via le gap du dernier lest", () => {
    const exercise = makeExercise({
      name: "Tractions SN",
      setPatternMode: SetPatternMode.weightedBodyweight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 1.25,
    });
    const history = [
      sTSB([0, 10], [20, 4]),
      sTSB([0, 10], [15, 6]),
      sTSB([0, 10], [15, 7]),
    ];
    const currentSessionSets = [makeSet({ weight: 0, reps: 10, setSlotIndex: 0 })];
    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: history,
      currentSessionSets,
      gapDays: 2,
      gapLestDays: 45,
      bodyweightKg: 75,
    });
    expect(suggestion.reasonCodes).toContain("wbw_v2_lest");
    expect(suggestion.weight).toBe(17.5);
    expect(suggestion.weight).toBeLessThan(20);
  });
});

describe("ALGO_V2 §6.1 — fatigue sur l'excès", () => {
  it("baisse le premier set d'un incrément quand fatiguePenalty >= 2", () => {
    const exercise = makeExercise({
      setPatternMode: SetPatternMode.straight,
      repTargetMin: 6,
      repTargetMax: 10,
      smallestIncrement: 2.5,
    });
    const fatigue = new SessionFatigueContext(
      Array.from({ length: 4 }, () => ({
        primaryParent: MuscleParent.pectoraux,
        workSetsCompleted: 1,
        fatigueClass: FatigueClass.medium,
      }))
    );
    const suggestion = suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: [s1(100, 8), s1(100, 8), s1(100, 8)],
      currentSessionSets: [],
      sessionFatigue: fatigue,
    });
    expect(fatigue.fatiguePenalty(MuscleParent.pectoraux)).toBe(2);
    expect(suggestion.weight).toBe(97.5);
    expect(suggestion.reasonCodes).toContain("session_fatigue_load_reduction");
  });

  it("un PR du jour masque l'alerte de fatigue contradictoire", () => {
    const exercise = makeExercise({ setPatternMode: SetPatternMode.straight });
    const fatigue = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 8, fatigueClass: FatigueClass.heavy },
    ]);
    const suggestion = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: [s1(60, 8), s1(60, 8), s1(60, 8)],
      currentSessionSets: [makeSet({ weight: 62.5, reps: 8 })],
      sessionFatigue: fatigue,
      prAchievedToday: true,
    });
    expect(suggestion.sessionFatigueWarning).toBeNull();
    expect(suggestion.reasonCodes).not.toContain("session_fatigue_load_reduction");

    const withoutContextPenalty = suggest({
      exercise,
      currentSetIndex: 1,
      recentHistory: [s1(60, 8), s1(60, 8), s1(60, 8)],
      currentSessionSets: [makeSet({ weight: 62.5, reps: 8 })],
      prAchievedToday: true,
    });
    expect(suggestion.weight).toBe(withoutContextPenalty.weight);
    expect(suggestion.reps).toBe(withoutContextPenalty.reps);
  });
});
