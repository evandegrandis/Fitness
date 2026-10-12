import { describe, expect, it } from "vitest";
import { ambitionMargin, heavyReturnLoad, isHeavySet, TARGET, targetFromPrediction, usualWorkingLoad } from "@/lib/engines/target";
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
  it("sans cible enregistrée par ce moteur : l'a priori (prévision battue 45 % du temps, 64 % à une rep de moins)", () => {
    const prior = -1 + (TARGET.PRIOR_BEAT_M1 - TARGET.GOAL) / (TARGET.PRIOR_BEAT_M1 - TARGET.PRIOR_BEAT_0);
    expect(ambitionMargin(undefined, undefined, true, NOW).margin).toBeCloseTo(prior, 5);
    expect(ambitionMargin([], [exercise()], false, NOW).margin).toBeCloseTo(prior, 5);
    expect(prior).toBeLessThan(0);
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

describe("cible construite sur la prévision", () => {
  it("garde la charge de la dernière série et vise la prévision à cette charge plus la marge", () => {
    // Prévision : 120 × 11 ; dernière série à 130 kg ; 9 kg par rep à 120 kg : 11 − 10/9 = 9,9.
    const t = targetFromPrediction({ weight: 120, reps: 11, push: false }, exercise(), 130, 1, 2.5, undefined);
    expect(t.weight).toBe(130);
    expect(t.predictedReps).toBeCloseTo(9.89, 1);
    expect(t.reps).toBe(11);
  });

  it("ne baisse pas la charge pour revenir dans la fourchette, sauf nettement en dessous et de deux crans au plus", () => {
    // 1 rep sous la fourchette : la charge reste.
    expect(targetFromPrediction({ weight: 100, reps: 7, push: false }, exercise(), 100, 0, 2.5, undefined)).toMatchObject({ weight: 100, reps: 7, lowered: 0 });
    // 4 reps sous la fourchette : deux crans au plus (4 + 5 / 7,5 = 4,7, soit 5 reps à 95 kg).
    expect(targetFromPrediction({ weight: 100, reps: 4, push: false }, exercise(), 100, 0, 2.5, undefined)).toMatchObject({ weight: 95, reps: 5, lowered: 2, floored: false });
  });

  it("plancher : jamais moins de repMin − 3 reps sur une série chargée, la charge descend par la règle 7,5 %", () => {
    // Prévision 100 × 2 (fourchette 8-12) : deux crans donnent 95 × 3, sous le plancher de 5 ; à 7,5 kg par rep,
    // il faut 80 kg (2 + 20 / 7,5 = 4,7, soit 5).
    expect(targetFromPrediction({ weight: 100, reps: 2, push: false }, exercise(), 100, 0, 2.5, undefined)).toMatchObject({ weight: 80, reps: 5, floored: true });
    // Charge tenue à 80 kg alors que la prévision est à 70 × 5 (fourchette 6-12, marge −1 : 80 × 2 avant) : la cible
    // prend la charge de la prévision, 70 × 4, au plancher de 3.
    const pecDeck = exercise({ repTargetMin: 6 });
    const anchor = { load: 80, reps: 3.4 };
    expect(targetFromPrediction({ weight: 70, reps: 5, push: false, anchor }, pecDeck, 80, -1, 2.5, undefined)).toMatchObject({ weight: 70, reps: 4, floored: true });
    // Le poids du corps garde ses règles.
    const lest = exercise({ setPatternMode: "weighted_bodyweight", repTargetMin: 6 });
    expect(targetFromPrediction({ weight: 15, reps: 2, push: false }, lest, 15, 0, 2.5, 74)).toMatchObject({ floored: false });
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

  it("une montée de charge du moteur (dépassement, promotion, plateau) reste telle quelle", () => {
    expect(targetFromPrediction({ weight: 105, reps: 8, push: true }, exercise(), 100, 2, 2.5, undefined)).toMatchObject({ weight: 105, reps: 8 });
  });

  it("au poids du corps, la charge ne bouge pas", () => {
    const dips = exercise({ setPatternMode: "bodyweight" });
    expect(targetFromPrediction({ weight: 0, reps: 3, push: false }, dips, 0, 0, 2.5, 74)).toMatchObject({ weight: 0, reps: 3, lowered: 0 });
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
    const usual = Math.round(shown.ambition!.predictedReps);
    expect(suggestionReason(shown)).toBe(`Cible à battre : tu fais d'habitude ${usual} à ${usual + 1} ici`);
  });
});
