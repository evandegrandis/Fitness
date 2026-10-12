import { describe, expect, it } from "vitest";

import { comparePerformance, repsAtLoad, setVersusSuggestion, versusReference } from "@/lib/engines/versus";
import type { Exercise, LoggedSet } from "@/lib/models/types";

const exercise = (overrides: Partial<Exercise> = {}) =>
  ({ setPatternMode: "straight", repTargetMin: 6, repTargetMax: 10, smallestIncrement: 2.5, ...overrides }) as Exercise;
const PRESS = exercise();
const vs = (weight: number, reps: number, target: [number, number], ex: Exercise = PRESS) =>
  versusReference(ex, { weight, reps }, { weight: target[0], reps: target[1] });

describe("battre la cible : une seule règle, celle du moteur (décision d'Evan du 12/10/2026)", () => {
  it("à la charge de la cible, les reps décident", () => {
    expect(vs(100, 9, [100, 8])).toBe("beat");
    expect(vs(100, 8, [100, 8])).toBe("met");
    expect(vs(100, 7, [100, 8])).toBe("below");
  });

  it("plus lourd dans la fourchette : battue ; sous la fourchette : en dessous", () => {
    expect(vs(105, 7, [100, 8])).toBe("beat");
    expect(vs(102.5, 6, [100, 10])).toBe("beat");
    expect(vs(110, 5, [100, 8])).toBe("below");
  });

  it("plus léger : ramenée à la charge de la cible, 7,5 % de charge = 1 rep", () => {
    // 95 kg : 1 rep vaut 7,125 kg, 5 kg plus léger coûte 0,7 rep.
    expect(repsAtLoad(PRESS, { weight: 95, reps: 10 }, 100)).toBeCloseTo(10 - 5 / 7.125, 6);
    expect(vs(95, 10, [100, 8])).toBe("beat"); // 9,3 -> 9
    expect(vs(95, 9, [100, 8])).toBe("met"); // 8,3 -> 8
    expect(vs(95, 8, [100, 8])).toBe("below"); // 7,3 -> 7
    // Epley demandait 10 reps à 95 kg pour tenir 100 × 8 (11 pour la battre) ; la règle du moteur, 9 (10).
    expect(vs(90, 5, [100, 4])).toBe("below"); // sous la fourchette, même si 5 > 4
  });

  it("un cran au moins par rep sur les petites charges", () => {
    // 10 kg : 7,5 % = 0,75 kg, mais le cran de l'exercice (2,5 kg) l'emporte.
    expect(repsAtLoad(PRESS, { weight: 10, reps: 12 }, 12.5)).toBeCloseTo(11, 6);
    expect(vs(10, 12, [12.5, 10])).toBe("beat");
  });

  it("assisté : plus d'assistance = plus léger, jugé sur la charge effective (poids du corps du moteur)", () => {
    const dips = exercise({ setPatternMode: "assisted_bodyweight", smallestIncrement: 5 });
    expect(vs(15, 8, [20, 8], dips)).toBe("beat"); // moins d'assistance
    // 75 − 25 = 50 kg effectifs, 1 rep = 5 kg (le cran) : 10 reps à 25 kg d'assistance valent 9 à 20 kg.
    expect(vs(25, 10, [20, 8], dips)).toBe("beat");
    expect(vs(25, 9, [20, 8], dips)).toBe("met");
  });

  it("poids du corps lesté : la charge ajoutée compte sur le poids du corps", () => {
    const pullups = exercise({ setPatternMode: "weighted_bodyweight", smallestIncrement: 1.25 });
    // 75 kg effectifs à vide, 80 lesté de 5 kg : 1 rep = 5,625 kg, 5 kg en moins coûtent 0,9 rep.
    expect(vs(0, 9, [5, 8], pullups)).toBe("met");
    expect(vs(0, 10, [5, 8], pullups)).toBe("beat");
  });

  it("le verdict d'une série et la comparaison du bilan disent la même chose", () => {
    const set = (weight: number, reps: number): LoggedSet =>
      ({ id: "s", weight, reps, setType: "work", completed: true, suggestedWeight: 100, suggestedReps: 8 }) as LoggedSet;
    for (const [weight, reps] of [[100, 9], [100, 8], [100, 7], [105, 7], [110, 5], [95, 10], [95, 9], [95, 8]] as const) {
      const verdict = setVersusSuggestion(PRESS, set(weight, reps));
      expect(comparePerformance(PRESS, set(weight, reps), { weight: 100, reps: 8 }).performed).toBe(verdict !== "below");
    }
    expect(setVersusSuggestion(PRESS, { ...set(100, 8), suggestedReps: null })).toBeNull();
  });
});
