import { describe, expect, it } from "vitest";
import {
  benchmarkBoundsForLoggedWeight,
  benchmarkLevel,
  benchmarkPosition,
  exerciseBenchmark,
} from "@/lib/engines/benchmark";
import type { Exercise } from "@/lib/models/types";

const CHEST_PRESS: Exercise = {
  id: "ex-chest-press",
  name: "Chest Press",
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
  benchmarkLow: 75,
  benchmarkHigh: 135,
  fatigueClass: "heavy",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [],
  lastUsed: null,
};

const NO_BENCHMARK: Exercise = { ...CHEST_PRESS, id: "ex-no-benchmark", benchmarkLow: null, benchmarkHigh: null };

const WEIGHTED_PULLUP: Exercise = {
  ...CHEST_PRESS,
  id: "ex-tractions-sn",
  name: "Tractions SN",
  setPatternMode: "weighted_bodyweight",
  benchmarkLow: 25.5,
  benchmarkHigh: 69.8,
};

describe("benchmarkPosition", () => {
  it("position 0 pile au niveau avancé", () => {
    expect(benchmarkPosition(75, 75, 135)).toBe(0);
  });

  it("position 1 pile au niveau élite", () => {
    expect(benchmarkPosition(135, 75, 135)).toBe(1);
  });

  it("position intermédiaire entre avancé et élite", () => {
    expect(benchmarkPosition(105, 75, 135)).toBeCloseTo(0.5, 5);
  });

  it("position négative sous le niveau avancé", () => {
    expect(benchmarkPosition(60, 75, 135)).toBeLessThan(0);
  });

  it("position > 1 au-dessus du niveau élite", () => {
    expect(benchmarkPosition(150, 75, 135)).toBeGreaterThan(1);
  });

  it("bornes incohérentes (high <= low) => binaire 0/1", () => {
    expect(benchmarkPosition(80, 100, 100)).toBe(0);
    expect(benchmarkPosition(120, 100, 100)).toBe(1);
  });
});

describe("benchmarkLevel", () => {
  it("sous avancé => Intermédiaire+", () => {
    expect(benchmarkLevel(-0.2)).toEqual({ label: "Intermédiaire+", tone: "below" });
  });

  it("entre avancé et élite => pourcentage affiché", () => {
    expect(benchmarkLevel(0.62)).toEqual({ label: "Avancé → Élite (62%)", tone: "progressing" });
  });

  it("pile au niveau avancé => 0%", () => {
    expect(benchmarkLevel(0)).toEqual({ label: "Avancé → Élite (0%)", tone: "progressing" });
  });

  it("au-dessus (ou pile) de l'élite => Élite+", () => {
    expect(benchmarkLevel(1)).toEqual({ label: "Élite+", tone: "elite" });
    expect(benchmarkLevel(1.3)).toEqual({ label: "Élite+", tone: "elite" });
  });
});

describe("exerciseBenchmark", () => {
  it("exercice sans benchmark => hasBenchmark false, tout le reste null", () => {
    const result = exerciseBenchmark(NO_BENCHMARK, 80);
    expect(result.hasBenchmark).toBe(false);
    expect(result.low).toBeNull();
    expect(result.high).toBeNull();
    expect(result.position).toBeNull();
    expect(result.level).toBeNull();
    expect(result.gapToAdvanced).toBeNull();
    expect(result.gapToElite).toBeNull();
    // La charge courante reste calculée (mode external => identité).
    expect(result.currentLoad).toBe(80);
  });

  it("charge externe sous l'avancé => tone below + gap correct", () => {
    const result = exerciseBenchmark(CHEST_PRESS, 60);
    expect(result.hasBenchmark).toBe(true);
    expect(result.currentLoad).toBe(60);
    expect(result.level?.tone).toBe("below");
    expect(result.gapToAdvanced).toBeCloseTo(15, 5);
    expect(result.gapToElite).toBeCloseTo(75, 5);
  });

  it("charge externe entre avancé et élite => tone progressing", () => {
    const result = exerciseBenchmark(CHEST_PRESS, 105);
    expect(result.level?.tone).toBe("progressing");
    expect(result.level?.label).toBe("Avancé → Élite (50%)");
    expect(result.gapToAdvanced).toBe(0);
    expect(result.gapToElite).toBeCloseTo(30, 5);
  });

  it("charge externe au-dessus de l'élite => tone elite, gaps à 0", () => {
    const result = exerciseBenchmark(CHEST_PRESS, 150);
    expect(result.level?.tone).toBe("elite");
    expect(result.gapToAdvanced).toBe(0);
    expect(result.gapToElite).toBe(0);
  });

  it("exercice lesté (weighted bodyweight) : charge comparée = poids de corps + lest", () => {
    // 65kg de corps + 15kg de lest = 80kg de charge totale, entre 25.5 et 69.8 => au-dessus de l'élite.
    const result = exerciseBenchmark(WEIGHTED_PULLUP, 15, 65);
    expect(result.currentLoad).toBe(80);
    expect(result.level?.tone).toBe("elite");
  });

  it("exercice lesté sans bodyWeightKg fourni => repli sur le poids de corps par défaut du moteur (75kg)", () => {
    // 75kg (défaut) + 0kg de lest = 75kg => au-dessus de l'élite (69.8kg).
    const result = exerciseBenchmark(WEIGHTED_PULLUP, 0);
    expect(result.currentLoad).toBe(75);
    expect(result.level?.tone).toBe("elite");
  });

  it("exercice lesté à charge totale intermédiaire => progressing avec le bon %", () => {
    // 65kg de corps + 5kg de lest = 70kg, entre 25.5 et 69.8 => tout juste au-dessus de l'élite.
    const result = exerciseBenchmark(WEIGHTED_PULLUP, 5, 65);
    expect(result.currentLoad).toBe(70);
    const pos = benchmarkPosition(70, 25.5, 69.8);
    expect(result.position).toBeCloseTo(pos, 5);
  });
});

describe("benchmarkBoundsForLoggedWeight", () => {
  it("exercice sans benchmark => null", () => {
    expect(benchmarkBoundsForLoggedWeight(NO_BENCHMARK)).toBeNull();
  });

  it("mode external => bornes identiques (déjà dans la bonne unité)", () => {
    expect(benchmarkBoundsForLoggedWeight(CHEST_PRESS)).toEqual({ low: 75, high: 135 });
  });

  it("mode lesté => bornes converties en lest externe (total - poids de corps)", () => {
    // 65kg de corps : low = 25.5 - 65 (négatif, cohérent si le low < bodyweight), high = 69.8 - 65 = 4.8
    const bounds = benchmarkBoundsForLoggedWeight(WEIGHTED_PULLUP, 65);
    expect(bounds).not.toBeNull();
    expect(bounds!.low).toBeCloseTo(25.5 - 65, 5);
    expect(bounds!.high).toBeCloseTo(69.8 - 65, 5);
  });

  it("mode lesté sans bodyWeightKg => repli sur le défaut moteur (75kg)", () => {
    const bounds = benchmarkBoundsForLoggedWeight(WEIGHTED_PULLUP);
    expect(bounds).toEqual({ low: 25.5 - 75, high: 69.8 - 75 });
  });

  it("mode assisté => bornes inversées (moins d'assistance = charge externe plus faible = niveau plus haut)", () => {
    const assisted: Exercise = { ...CHEST_PRESS, setPatternMode: "assisted_bodyweight", benchmarkLow: 20, benchmarkHigh: 50 };
    const bounds = benchmarkBoundsForLoggedWeight(assisted, 80);
    // total = bw - P => P = bw - total. low(=20, moins bon) => P haut ; high(=50, meilleur) => P bas.
    expect(bounds).toEqual({ low: 80 - 50, high: 80 - 20 });
    expect(bounds!.low).toBeLessThan(bounds!.high);
  });
});
