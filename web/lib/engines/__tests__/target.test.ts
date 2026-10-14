import { describe, expect, it } from "vitest";
import { ambitionMargin, chooseTarget, completionTarget, heavyReturnLoad, isHeavySet, TARGET, usualWorkingLoad, type TodaySet } from "@/lib/engines/target";
import { suggest, SUGGESTION_ENGINE_VERSION } from "@/lib/engines/progression";
import { suggestionReason } from "@/lib/engines/suggestion-reason";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const NOW = new Date("2026-10-11T16:00:00Z");
const DAY = 86_400_000;

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "press", name: "Wide Chest Press", category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: true, sortOrder: 0, suggestedRestSeconds: 120,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
    lastUsed: null, movementPattern: null, resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: null, ...overrides,
  };
}

let seq = 0;
function set(weight: number, reps: number, at: Date, extra: Partial<LoggedSet> = {}): LoggedSet {
  seq += 1;
  return { id: `t${seq}`, weight, reps, setType: SetType.work, timestamp: at, setSlotIndex: seq, completed: true, supersetRoundIndex: null, ...extra };
}

/** Séance où chaque série porte une prévision et une cible enregistrées par un moteur à deux couches. */
function session(daysAgo: number, specs: { reps: number; predicted: number; target: number }[], version = SUGGESTION_ENGINE_VERSION): WorkoutSession {
  const start = new Date(NOW.getTime() - daysAgo * DAY);
  return {
    id: `s-${daysAgo}`, date: start, startTime: start, endTime: start, notes: "", isActive: false, templateName: null,
    supersetGroups: [], cardioEntries: [],
    exercises: [{
      id: `le-${daysAgo}`, orderIndex: 0, notes: "", exerciseId: "press", exerciseName: "press", supersetGroupId: null, plateauWeakPoint: null,
      sets: specs.map((spec, i) =>
        set(100, spec.reps, new Date(start.getTime() + i * 180_000), {
          predictedRepsAtActualWeight: spec.predicted, suggestedWeight: 100, suggestedReps: spec.target, suggestionEngineVersion: version,
        })
      ),
    }],
  };
}

describe("marge d'ambition", () => {
  it("sans cible enregistrée par ce moteur : l'a priori, légèrement optimiste (prévision battue 45 % du temps, objectif 40 %)", () => {
    const prior = (TARGET.PRIOR_BEAT_0 - TARGET.GOAL) / (TARGET.PRIOR_BEAT_0 - TARGET.PRIOR_BEAT_1);
    expect(ambitionMargin(undefined, undefined, true, NOW).margin).toBeCloseTo(prior, 5);
    expect(ambitionMargin([], [exercise()], false, NOW).margin).toBeCloseTo(prior, 5);
    expect(prior).toBeGreaterThan(0);
    expect(prior).toBeLessThan(1);
  });

  it("monte quand il dépasse souvent la prévision, sans dépasser 2 reps", () => {
    const history = [session(40, [{ reps: 10, predicted: 8, target: 8 }])];
    for (let i = 0; i < 30; i++) history.push(session(1 + i * 0.1, [{ reps: 11, predicted: 8, target: 9 }, { reps: 9, predicted: 7, target: 8 }]));
    const margin = ambitionMargin(history, [exercise()], false, NOW);
    expect(margin.margin).toBeGreaterThan(1);
    expect(margin.margin).toBeLessThanOrEqual(TARGET.MAX);
    expect(margin.beatRate).toBe(1);
  });

  it("n'apprend que des séries d'un moteur à deux couches (la prévision enregistrée avant était une cible)", () => {
    const history = [session(40, [{ reps: 10, predicted: 8, target: 8 }], "web-v2.2-2026-08-30")];
    for (let i = 0; i < 30; i++) history.push(session(1 + i * 0.1, [{ reps: 11, predicted: 8, target: 9 }], "web-v2.2-2026-08-30"));
    const margin = ambitionMargin(history, [exercise()], true, NOW);
    expect(margin.beatRate).toBeNull();
    expect(margin.margin).toBeCloseTo(ambitionMargin(undefined, undefined, true, NOW).margin, 5);
  });

  it("la boucle de long terme la baisse quand il bat moins de 40 % des cibles", () => {
    const history = [session(40, [{ reps: 10, predicted: 8, target: 8 }])];
    // Il fait 3 de plus que la prévision (marge brute au maximum) mais n'a battu aucune cible affichée.
    for (let i = 0; i < 30; i++) history.push(session(1 + i * 0.1, [{ reps: 10, predicted: 7, target: 11 }]));
    const margin = ambitionMargin(history, [exercise()], true, NOW);
    expect(margin.beatRate).toBe(0);
    expect(margin.margin).toBeCloseTo(TARGET.MAX - TARGET.LOOP_STEP, 5);
  });
});

describe("après une série lourde, la cible revient à la charge de travail", () => {
  it("150 × 6 au-dessus d'une habitude à 110-120 : la cible redescend vers la charge de travail, pas 145 × 4", () => {
    const history = [20, 13, 6].map((d, i) => ({
      ...session(d, []),
      exercises: [{
        id: `h-${d}`, orderIndex: 0, notes: "", exerciseId: "press", exerciseName: "press", supersetGroupId: null, plateauWeakPoint: null,
        sets: [set(110 + 5 * i, 10, new Date(NOW.getTime() - d * DAY)), set(110 + 5 * i, 8, new Date(NOW.getTime() - d * DAY + 180_000))],
      }],
    }));
    const today = [set(150, 6, new Date(NOW.getTime() - 60_000), { reportedRir: 1 })];
    const params = { exercise: exercise(), currentSetIndex: 1, recentHistory: history.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: today, sessionHistory: history, catalog: [exercise()], now: NOW, target: true };
    const shown = suggest(params);
    // La prévision ne descend que d'un cran (147,5) : la cible redescend d'au moins 11 % (7 crans), à 132,5.
    expect(shown.prediction!.weight).toBe(147.5);
    expect(shown.weight).toBe(heavyReturnLoad(147.5, 150, exercise(), 2.5));
    expect(shown.weight).toBe(132.5);
  });
});

/** Prévision linéaire : `reps0` à `load0`, une rep de plus tous les `kgPerRep` kg plus léger (règle du moteur). */
const proj = (load0: number, reps0: number, kgPerRep: number) => (load: number) => reps0 + (load0 - load) / kgPerRep;
const done = (...sets: [number, number, number | null][]): TodaySet[] => sets.map(([weight, reps, rir]) => ({ weight, reps, rir, continuation: false }));
const epley = (load: number, repsToFailure: number) => load * (1 + repsToFailure / 30);

describe("cible construite sur la prévision", () => {
  it("dans la fourchette : garde la charge de la dernière série et vise la prévision plus la marge", () => {
    // Après 130 × 10 au RIR 2 (fourchette 8-12) : 9,9 reps prévues à 130 kg, marge 1 : 130 × 11.
    const t = chooseTarget({ predictedAt: proj(130, 9.9, 9.75), startLoad: 130, push: false, ceiling: null, today: done([130, 10, 2]), margin: 1 }, exercise(), 2.5, undefined);
    expect(t).toMatchObject({ weight: 130, reps: 11 });
  });

  it("sous la fourchette : la charge baisse jusqu'à ce que le bas soit à portée, puis la cible le demande (pas 14 × 5)", () => {
    // 13/10 : 16 × 7 au RIR 0 aux élévations latérales (8-12, cran de 2 kg = 1 rep), 4,6 reps prévues à 16 kg.
    const lateral = exercise({ smallestIncrement: 2 });
    const t = chooseTarget({ predictedAt: proj(16, 4.6, 2), startLoad: 16, push: false, ceiling: 16, today: done([16, 7, 0]), margin: 0 }, lateral, 2, undefined);
    expect(t).toMatchObject({ weight: 14, reps: 8 });
    expect(t.codes).toEqual(expect.arrayContaining(["target_range", "target_lifted"]));
  });

  it("l'étirement est borné : loin sous la fourchette, la charge descend davantage", () => {
    // Prévision 100 × 2 (fourchette 8-12, 7,5 kg par rep) : le bas de la fourchette est à portée de κ reps à 87,5 kg.
    const t = chooseTarget({ predictedAt: proj(100, 2, 7.5), startLoad: 100, push: false, ceiling: null, today: [], margin: 0 }, exercise(), 2.5, undefined);
    expect(t.weight).toBe(87.5);
    expect(t.reps).toBe(8);
    expect(t.reps - t.predictedReps).toBeLessThanOrEqual(TARGET.RANGE_STRETCH + 0.5);
  });

  it("jamais plus lourd que le plafond : après 100 × 8 au RIR 0, pas 127,5 × 1", () => {
    const today = done([140, 8, 0], [160, 1, 0], [120, 7, 0], [100, 8, 0]);
    const t = chooseTarget({ predictedAt: proj(127.5, 1.4, 9.6), startLoad: 127.5, push: true, ceiling: 100, today, margin: 0 }, exercise(), 2.5, undefined);
    expect(t.weight).toBeLessThanOrEqual(100);
    expect(t.reps).toBeGreaterThanOrEqual(8);
    expect(t.codes).toContain("target_push_withheld");
  });

  it("ne demande jamais plus que le 1RM montré aujourd'hui : après 140 × 8 au RIR 0, pas 140 × 9", () => {
    const t = chooseTarget({ predictedAt: proj(140, 10, 10.5), startLoad: 140, push: false, ceiling: 140, today: done([140, 8, 0]), margin: 0 }, exercise(), 2.5, undefined);
    expect(epley(t.weight, t.reps + 1)).toBeLessThanOrEqual(epley(140, 8) + 1e-6);
    expect(t).toMatchObject({ weight: 135, reps: 8 });
    expect(t.codes).toContain("target_capacity");
  });

  it("une montée de charge du moteur reste la sienne quand elle est cohérente", () => {
    // Après 100 × 13 au RIR 2 (au-dessus de la fourchette), le moteur monte à 105 × 10.
    const t = chooseTarget({ predictedAt: proj(105, 10, 7.875), startLoad: 105, push: true, ceiling: null, today: done([100, 13, 2]), margin: 0 }, exercise(), 2.5, undefined);
    expect(t).toMatchObject({ weight: 105, reps: 10 });
  });

  it("au poids du corps, la charge ne bouge pas et les reps restent sous ce qu'il a montré", () => {
    const dips = exercise({ setPatternMode: "bodyweight" });
    expect(chooseTarget({ predictedAt: () => 14, startLoad: 0, push: false, ceiling: null, today: done([0, 12, 0]), margin: 0 }, dips, 2.5, 74)).toMatchObject({ weight: 0, reps: 11 });
  });

  it("série lourde : reps au RIR visé sous la fourchette, au-dessus de la charge habituelle", () => {
    expect(isHeavySet(6, 150, 125, exercise(), 2.5, undefined)).toBe(true);
    expect(isHeavySet(9, 150, 125, exercise(), 2.5, undefined)).toBe(false);
    expect(isHeavySet(6, 125, 125, exercise(), 2.5, undefined)).toBe(false);
    expect(isHeavySet(6, 150, null, exercise(), 2.5, undefined)).toBe(false);
    expect(usualWorkingLoad([[set(120, 10, NOW), set(130, 8, NOW)], [set(125, 9, NOW)]])).toBe(125);
  });

  it("charge de retour : la prévision si elle est déjà assez légère (retour du moteur), sinon 11 % plus léger", () => {
    expect(heavyReturnLoad(120, 150, exercise(), 2.5)).toBe(120);
    expect(heavyReturnLoad(147.5, 150, exercise(), 2.5)).toBe(132.5);
  });

  it("dans le moteur : la suggestion affichée est la cible, la prévision reste jointe, la raison l'assume", () => {
    const history = [20, 13, 6].map((d, i) => ({
      ...session(d, []),
      exercises: [{
        id: `h-${d}`, orderIndex: 0, notes: "", exerciseId: "press", exerciseName: "press", supersetGroupId: null, plateauWeakPoint: null,
        sets: [set(110 + 5 * i, 10, new Date(NOW.getTime() - d * DAY)), set(110 + 5 * i, 8, new Date(NOW.getTime() - d * DAY + 180_000))],
      }],
    }));
    const today = [set(130, 9, new Date(NOW.getTime() - 60_000), { reportedRir: 0 })];
    const params = { exercise: exercise(), currentSetIndex: 1, recentHistory: history.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: today, sessionHistory: history, catalog: [exercise()], now: NOW };
    const prediction = suggest(params);
    const shown = suggest({ ...params, target: true });
    expect(shown.prediction).toEqual({ weight: prediction.weight, reps: prediction.reps });
    expect(shown.weight).toBe(130);
    expect(shown.reasonCodes[0]).toBe("target_to_beat");
    // 130 × 9 au RIR 0 : la prévision à 130 kg tombe sous la fourchette, la cible y demande le bas (8) et le dit.
    const usual = Math.round(shown.ambition!.predictedReps);
    expect(shown.reps).toBe(8);
    expect(usual).toBeLessThan(8);
    expect(suggestionReason(shown)).toBe(`Cible à battre : le bas de ta fourchette, tu fais d'habitude ${usual} à ${usual + 1} ici`);
  });
});

describe("après un essai quasi maximal (13/10/2026 : 140 × 8, puis 160 × 1 au RIR 0)", () => {
  const history = [20, 13, 6].map((d) => ({
    ...session(d, []),
    exercises: [{
      id: `h-${d}`, orderIndex: 0, notes: "", exerciseId: "press", exerciseName: "press", supersetGroupId: null, plateauWeakPoint: null,
      sets: [set(130, 9, new Date(NOW.getTime() - d * DAY), { reportedRir: 1 }), set(130, 8, new Date(NOW.getTime() - d * DAY + 180_000), { reportedRir: 0 })],
    }],
  }));
  const today = [
    set(140, 8, new Date(NOW.getTime() - 300_000), { reportedRir: 0 }),
    set(160, 1, new Date(NOW.getTime() - 120_000), { reportedRir: 0 }),
  ];
  const params = { exercise: exercise(), currentSetIndex: 2, recentHistory: history.map((s) => s.exercises[0].sets).reverse(), currentSessionSets: today, sessionHistory: history, catalog: [exercise()], now: NOW, target: true };

  it("revient à la charge de travail, avec la fatigue de l'essai : jamais au-dessus de 140, sous le 1RM de 140 × 8", () => {
    const shown = suggest(params);
    expect(shown.reasonCodes).toContain("target_after_attempt");
    expect(shown.weight).toBeLessThan(140);
    expect(shown.reps).toBeGreaterThanOrEqual(8);
    expect(epley(shown.weight, shown.reps + 1)).toBeLessThan(epley(140, 8));
    expect(suggestionReason(shown)).toMatch(/^Cible à battre après ton essai lourd : retour à ta charge de travail/);
  });

  it("jamais de série à finir à la charge d'un essai raté : 157,5 × 7 est hors de portée", () => {
    expect(completionTarget({ weight: 160, reps: 1, rir: 0, continuation: false }, 7, true, exercise(), 2.5, undefined)).toBeNull();
    expect(completionTarget({ weight: 160, reps: 1, rir: 0, continuation: false }, 7, false, exercise(), 2.5, undefined)).toBeNull();
  });

  it("une série à finir n'est proposée qu'à une charge où les reps restantes sont à portée en enchaînant", () => {
    // 87,5 × 5 au RIR 0 : 3 reps à finir demandent 3 × 6,6 kg de moins, soit 67,5 kg (il enchaîne à 15-25 % plus léger).
    expect(completionTarget({ weight: 87.5, reps: 5, rir: 0, continuation: false }, 3, false, exercise(), 2.5, undefined)).toEqual({ weight: 67.5, reps: 3 });
  });
});
