import { describe, expect, it } from "vitest";
import { learnedRepDrop, pairsFromSets, REP_DROP, repDropAfter, repDropPairs } from "@/lib/engines/rep-drop";
import { reprojectSuggestionAtWeight, suggest } from "@/lib/engines/progression";
import { suggestionReason, learnedDropText } from "@/lib/engines/suggestion-reason";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import { primaryParent } from "@/lib/models/types";
import { SessionFatigueContext } from "@/lib/engines/session-fatigue";

const NOW = new Date("2026-10-11T16:00:00Z");
const DAY = 86_400_000;

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "curl", name: "Curl debout", category: "Pull", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.bicepsLong, coefficient: 1 }],
    lastUsed: null, movementPattern: "isolation", resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: null, ...overrides,
  };
}

let seq = 0;
function set(weight: number, reps: number, rir: number | null, at: Date, extra: Partial<LoggedSet> = {}): LoggedSet {
  seq += 1;
  return {
    id: `s${seq}`, weight, reps, setType: SetType.work, timestamp: at, setSlotIndex: seq, completed: true,
    supersetRoundIndex: null, reportedRir: rir, ...extra,
  };
}

/** Une séance de `exerciseId` il y a `daysAgo` jours, séries à 3 min d'intervalle. */
function session(exerciseId: string, daysAgo: number, specs: [number, number, number | null][], extra: Partial<LoggedSet>[] = []): WorkoutSession {
  const start = new Date(NOW.getTime() - daysAgo * DAY);
  return {
    id: `${exerciseId}-${daysAgo}`, date: start, startTime: start, endTime: start, notes: "", isActive: false, templateName: null,
    supersetGroups: [], cardioEntries: [],
    exercises: [{
      id: `le-${exerciseId}-${daysAgo}`, orderIndex: 0, notes: "", exerciseId, exerciseName: exerciseId, supersetGroupId: null,
      plateauWeakPoint: null,
      sets: specs.map(([w, r, rir], i) => set(w, r, rir, new Date(start.getTime() + i * 180_000), extra[i] ?? {})),
    }],
  };
}

describe("paires de séries consécutives", () => {
  it("perte = reps au RIR visé de la première moins celles de la seconde, à même charge", () => {
    const at = new Date(NOW);
    // 12 à RIR 2 (13 au RIR 1) puis 10 à RIR 0 (9 au RIR 1) : 4 reps perdues.
    expect(pairsFromSets([set(20, 12, 2, at), set(20, 10, 0, at)], "curl").map((p) => p.drop)).toEqual([4]);
  });

  it("ignore charge différente, RIR absent, complément de série, finisher et série arrêtée pour douleur", () => {
    const at = new Date(NOW);
    const lead = set(20, 6, 0, at);
    expect(pairsFromSets([set(20, 12, 1, at), set(17.5, 10, 1, at)], "curl")).toEqual([]);
    expect(pairsFromSets([set(20, 12, null, at), set(20, 10, 1, at)], "curl")).toEqual([]);
    expect(pairsFromSets([lead, set(20, 3, 0, at, { logicalSetId: lead.id, setTechnique: "completion" })], "curl")).toEqual([]);
    expect(pairsFromSets([set(20, 12, 1, at), set(20, 10, 1, at, { setType: SetType.finisher })], "curl")).toEqual([]);
    expect(pairsFromSets([set(20, 12, 1, at), set(20, 10, 1, at, { stopReason: "pain" })], "curl")).toEqual([]);
  });

  it("borne une paire aberrante", () => {
    const at = new Date(NOW);
    expect(pairsFromSets([set(20, 15, 4, at), set(20, 2, 0, at)], "curl")[0].drop).toBe(REP_DROP.PAIR_MAX);
  });

  it("la première séance d'un exercice est un étalonnage : ses paires ne comptent pas", () => {
    const history = [session("curl", 20, [[20, 12, 1], [20, 8, 1]]), session("curl", 10, [[20, 12, 1], [20, 10, 1]])];
    expect(repDropPairs(history).map((p) => p.drop)).toEqual([2]);
  });
});

describe("perte de reps apprise", () => {
  it("sans historique : la constante de la classe de fatigue, comme avant", () => {
    const estimate = learnedRepDrop(exercise({ fatigueClass: "heavy" }), undefined, NOW);
    expect(estimate).toMatchObject({ drop: 2, source: "class" });
    expect(learnedRepDrop(exercise(), [], NOW)).toMatchObject({ drop: 1, source: "class" });
  });

  it("un historique sans RIR ne change rien", () => {
    const history = [session("curl", 30, [[20, 12, null]]), session("curl", 3, [[20, 12, null], [20, 9, null]])];
    expect(learnedRepDrop(exercise(), history, NOW)).toMatchObject({ drop: 1, source: "class" });
  });

  it("rétrécit la moyenne de l'exercice vers l'a priori, lui-même rétréci vers la constante de classe", () => {
    // Étalonnage puis 12 séances récentes (même jour pour un poids de récence ~1) : curl perd 3 reps, l'autre 1.
    const history = [session("curl", 40, [[20, 12, 1]]), session("row", 40, [[50, 12, 1]])];
    for (let i = 0; i < 6; i++) {
      history.push(session("curl", 0.01 * (i + 1), [[20, 12, 1], [20, 9, 1]]));
      history.push(session("row", 0.01 * (i + 1) + 0.001, [[50, 12, 1], [50, 11, 1]]));
    }
    const estimate = learnedRepDrop(exercise(), history, NOW);
    const w = Math.pow(0.5, 0.06 / REP_DROP.HALF_LIFE_DAYS); // ~1
    expect(w).toBeGreaterThan(0.999);
    const prior = (6 * 3 + 6 * 1 + REP_DROP.PRIOR_K * 1) / (12 + REP_DROP.PRIOR_K);
    const expected = (6 * 3 + REP_DROP.SHRINK_K * prior) / (6 + REP_DROP.SHRINK_K);
    expect(estimate.prior).toBeCloseTo(prior, 2);
    expect(estimate.drop).toBeCloseTo(expected, 2);
    expect(estimate.source).toBe("exercise");
    expect(estimate.exercisePairs).toBe(6);
  });

  it("un nouvel exercice part de l'a priori appris", () => {
    const history = [session("row", 40, [[50, 12, 1]])];
    for (let i = 0; i < 20; i++) history.push(session("row", 0.01 * (i + 1), [[50, 12, 1], [50, 9, 1]]));
    const estimate = learnedRepDrop(exercise({ id: "nouveau" }), history, NOW);
    expect(estimate.exercisePairs).toBe(0);
    expect(estimate.source).toBe("prior");
    expect(estimate.drop).toBeCloseTo((20 * 3 + REP_DROP.PRIOR_K * 1) / (20 + REP_DROP.PRIOR_K), 2);
  });

  it("reste dans ses bornes", () => {
    const high = [session("curl", 40, [[20, 12, 1]])];
    const low = [session("curl", 40, [[20, 12, 1]])];
    for (let i = 0; i < 40; i++) {
      high.push(session("curl", 0.01 * (i + 1), [[20, 15, 1], [20, 9, 1]]));
      low.push(session("curl", 0.01 * (i + 1), [[20, 10, 1], [20, 11, 1]]));
    }
    expect(learnedRepDrop(exercise(), high, NOW).drop).toBe(REP_DROP.MAX);
    expect(learnedRepDrop(exercise(), low, NOW).drop).toBe(REP_DROP.MIN);
  });

  it("une paire ancienne pèse moins qu'une récente : le moteur suit les habitudes qui changent", () => {
    const history = [session("curl", 400, [[20, 12, 1]])];
    for (let i = 0; i < 8; i++) history.push(session("curl", 300 + i, [[20, 12, 1], [20, 8, 1]]));
    for (let i = 0; i < 8; i++) history.push(session("curl", 1 + i, [[20, 12, 1], [20, 11, 1]]));
    const estimate = learnedRepDrop(exercise(), history, NOW);
    expect(estimate.exerciseMean!).toBeLessThan(1.6);
  });
});

describe("perte proportionnelle aux reps de la série d'avant (15/10/2026)", () => {
  it("il perd plus après une série longue qu'après une courte : la perte suit les reps de la série d'avant", () => {
    // Il perd 3 reps après 13 (au RIR visé) et 1 après 7 : un taux d'environ 20 %, rétréci vers l'a priori.
    const history = [session("curl", 60, [[20, 12, 1]])];
    for (let i = 0; i < 10; i++) history.push(session("curl", 1 + i, [[20, 13, 1], [20, 10, 1], [24, 7, 1], [24, 5, 2]]));
    const estimate = learnedRepDrop(exercise(), history, NOW);
    expect(estimate.rate!).toBeGreaterThan(0.15);
    expect(estimate.rate!).toBeLessThan(0.3);
    const afterLong = learnedRepDrop(exercise(), history, NOW, 12).drop;
    const afterShort = learnedRepDrop(exercise(), history, NOW, 6).drop;
    expect(afterLong).toBeCloseTo(estimate.rate! * 12, 6);
    expect(afterShort).toBeCloseTo(estimate.rate! * 6, 6);
    expect(afterLong).toBeGreaterThan(afterShort + 1);
    expect(repDropAfter(estimate, 8)).toBeCloseTo(estimate.rate! * 8, 6);
  });

  it("des paires parties d'une rep à l'échec (0 rep au RIR visé) ne produisent jamais une perte indéfinie", () => {
    const history = [session("curl", 60, [[20, 12, 1]]), session("curl", 3, [[30, 1, 0], [30, 1, 0]])];
    const estimate = learnedRepDrop(exercise(), history, NOW, 6);
    expect(Number.isFinite(estimate.drop)).toBe(true);
    expect(Number.isFinite(estimate.rate!)).toBe(true);
  });
});

describe("séries suivantes dans le moteur", () => {
  // Charge en hausse d'une séance à l'autre : pas de plateau.
  const history3 = [
    session("curl", 20, [[15, 10, 1], [15, 8, 1]]),
    session("curl", 13, [[17.5, 10, 1], [17.5, 8, 1]]),
    session("curl", 6, [[20, 10, 1], [20, 8, 1]]),
  ];

  it("« baisser d'un cran » part de la série qui vient d'être faite, plus du milieu de fourchette", () => {
    const today = [set(20, 7, 0, new Date(NOW.getTime() - 60_000))];
    const result = suggest({ exercise: exercise(), currentSetIndex: 1, recentHistory: history3.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: today, now: NOW });
    expect(result.reasonCodes[0]).toBe("fallback_down_one_step");
    expect(result.weight).toBe(17.5);
    // 7 à RIR 0 = 6 au RIR visé, moins 1 (classe légère, sans historique fourni), plus 2,5 kg / 2,5 kg par rep = 6.
    expect(result.reps).toBe(6);
  });

  it("la perte apprise remplace la constante quand l'historique est fourni, et la raison le dit", () => {
    const history = [
      session("curl", 34, [[12.5, 12, 1]]),
      session("curl", 27, [[12.5, 12, 1], [12.5, 9, 1]]),
      session("curl", 20, [[15, 12, 1], [15, 9, 1]]),
      session("curl", 13, [[17.5, 12, 1], [17.5, 9, 1]]),
      session("curl", 6, [[20, 12, 1], [20, 9, 1]]),
    ];
    const today = [set(20, 12, 1, new Date(NOW.getTime() - 60_000))];
    const recent = history.slice(1).map((s) => s.exercises[0].sets).reverse();
    const result = suggest({ exercise: exercise(), currentSetIndex: 1, recentHistory: recent, currentSessionSets: today, sessionHistory: history, now: NOW });
    expect(result.reasonCodes[0]).toBe("predicted_drop_same_load");
    expect(result.repDrop?.source).toBe("exercise");
    // 4 paires à 3 reps, rétrécies vers un a priori lui-même tiré vers la constante (1) : entre 1,7 et 3.
    expect(result.repDrop!.drop).toBeGreaterThan(1.7);
    expect(result.repDrop!.drop).toBeLessThan(3);
    expect(result.reps).toBe(Math.round(12 - result.repDrop!.drop));
    expect(result.reasonCodes).toContain("learned_rep_drop");
    expect(suggestionReason(result)).toBe(
      `Même charge, la fatigue de la série d'avant retire des reps (${learnedDropText(result.repDrop!.drop)})`
    );
  });

  it("une série faite très en dessous de l'historique n'aboutit plus au « Point de départ 20 kg »", () => {
    const heavy = [20, 13, 6].map((d, i) => session("curl", d, [[40 + 2.5 * i, 10, 1], [40 + 2.5 * i, 8, 1]]));
    const today = [set(20, 7, 0, new Date(NOW.getTime() - 60_000))];
    const result = suggest({ exercise: exercise(), currentSetIndex: 1, recentHistory: heavy.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: today, now: NOW });
    expect(result.reasonCodes).not.toContain("fallback");
    expect(result.weight).toBe(20);
  });

  it("une série de retour n'est jamais plus lourde que la série qui vient d'être faite", () => {
    const press = exercise({ id: "press", name: "Wide Chest Press", setPatternMode: "top_set_backoff", fatigueClass: "medium" });
    const history = [20, 13, 6].map((d, i) =>
      session("press", d, [[100 + 2.5 * i, 10, 1], [120 + 2.5 * i, 6, 1], [110, 8, 0]])
    );
    const t = (min: number) => new Date(NOW.getTime() - min * 60_000);
    // 120 × 11 suggéré, 150 × 6 fait, puis 130 × 9 : la série suivante ne remonte pas à 142,5.
    const today = [set(120, 11, 1, t(12)), set(150, 6, 1, t(8)), set(130, 9, 0, t(4))];
    const result = suggest({ exercise: press, currentSetIndex: 3, recentHistory: history.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: today, now: NOW });
    expect(result.reasonCodes[0]).toBe("backoff_v2");
    expect(result.weight).toBeLessThanOrEqual(130);
    // 9 à RIR 0 = 8 au RIR visé, moins la perte de la classe moyenne (1,5) : 6,5, arrondi à 7.
    expect(result.reps).toBe(7);
  });

  it("le texte arrondit à la demi-rep, au singulier sous 1", () => {
    expect(learnedDropText(2.37)).toBe("tu perds d'habitude 2,5 reps d'une série à l'autre ici");
    expect(learnedDropText(0.6)).toBe("tu perds d'habitude 0,5 rep d'une série à l'autre ici");
  });
});

describe("poids du corps : la 1re série suit les reps démontrées", () => {
  const dips = exercise({ id: "dips", name: "Dips", setPatternMode: "bodyweight", fatigueClass: "medium", maxLoad: null });
  // Trois séances : 1re série à 16 reps au RIR visé ; la prévision enregistrée avait été plafonnée à 12.
  const history = [9, 6, 3].map((d) =>
    session("dips", d, [[0, 16, 1], [0, 14, 1]], [{ predictedRepsAtActualWeight: 12 }, { predictedRepsAtActualWeight: 12 }])
  );

  it("le décalage appris ne la ramène plus au haut de la fourchette", () => {
    const result = suggest({ exercise: dips, currentSetIndex: 0, recentHistory: history.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: [], now: NOW });
    expect(result.reasonCodes).toContain("bw_rep_v2_first_set");
    expect(result.reps).toBeGreaterThanOrEqual(16);
  });

  it("en fin de séance, la fatigue de séance retire des reps comme sur les autres premières séries", () => {
    const recent = history.map((s) => s.exercises[0].sets).reverse();
    const fresh = suggest({ exercise: dips, currentSetIndex: 0, recentHistory: recent, currentSessionSets: [], now: NOW });
    const tired = new SessionFatigueContext([{ primaryParent: primaryParent(dips)!, workSetsCompleted: 6, fatigueClass: "heavy" }]);
    const late = suggest({ exercise: dips, currentSetIndex: 0, recentHistory: recent, currentSessionSets: [], sessionFatigue: tired, now: NOW });
    expect(tired.fatiguePenalty(primaryParent(dips))).toBe(3);
    expect(fresh.reps - late.reps).toBe(3);
  });

  it("la reprojection au poids du corps garde les reps proposées au-delà de la fourchette", () => {
    const suggestion = { weight: 0, reps: 17, setType: SetType.work, explanation: "", confidence: 1, reasonCodes: [], mode: "record_attempt" as const, sessionFatigueWarning: null };
    expect(reprojectSuggestionAtWeight(suggestion, dips, 0).reps).toBe(17);
  });
});
