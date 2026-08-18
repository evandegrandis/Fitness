import { describe, expect, it } from "vitest";
import {
  buildWeightTrend,
  latestBodyWeight,
  normalizeEntries,
  smoothedSeries,
  WEIGHT_TREND,
  type BodyWeightEntry,
} from "@/lib/engines/body-weight";

function entry(day: string, weightKg: number): BodyWeightEntry {
  return { id: `w-${day}`, measuredOn: new Date(`${day}T07:00:00`), weightKg };
}

/** Série descendante régulière, une pesée par jour. */
function series(startKg: number, days: number, dailyDeltaKg: number): BodyWeightEntry[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(2026, 7, 1 + i);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return entry(iso, Math.round((startKg + i * dailyDeltaKg) * 100) / 100);
  });
}

describe("normalisation des pesées", () => {
  it("garde une seule pesée par jour civil — la dernière saisie corrige la précédente", () => {
    const rows = [entry("2026-08-01", 77), { ...entry("2026-08-01", 76.4), id: "w-corrige" }];
    const normalized = normalizeEntries(rows);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].weightKg).toBe(76.4);
  });

  it("ordonne chronologiquement et ignore les valeurs aberrantes", () => {
    const rows = [entry("2026-08-03", 76.5), entry("2026-08-01", 77), { ...entry("2026-08-02", 0), id: "zero" }];
    expect(normalizeEntries(rows).map((r) => r.weightKg)).toEqual([77, 76.5]);
  });
});

describe("lissage — le bruit quotidien ne doit pas devenir un signal", () => {
  it("absorbe une pesée aberrante isolée", () => {
    // Poids stable à 77 kg, avec un jour à 79 (repas salé) : la tendance ne doit quasiment pas bouger.
    const rows = [
      entry("2026-08-01", 77),
      entry("2026-08-02", 77),
      entry("2026-08-03", 77),
      entry("2026-08-04", 79),
    ];
    const smoothed = smoothedSeries(rows);
    expect(smoothed.at(-1)!.rawKg).toBe(79);
    expect(smoothed.at(-1)!.smoothedKg).toBeCloseTo(77.5, 1);
  });

  it("ne moyenne que sur 7 jours calendaires, pas sur les 7 dernières pesées", () => {
    // Une pesée tous les 10 jours : chaque point est donc seul dans sa fenêtre.
    const rows = [entry("2026-08-01", 80), entry("2026-08-11", 78), entry("2026-08-21", 76)];
    expect(smoothedSeries(rows).map((p) => p.smoothedKg)).toEqual([80, 78, 76]);
  });
});

describe("vitesse de perte — le couloir 0,4 à 0,7 %/semaine", () => {
  it("classe « on_track » une perte d'environ 0,5 %/semaine", () => {
    // 77 kg, -0,055 kg/jour ≈ -0,385 kg/semaine ≈ -0,5 %/semaine.
    const trend = buildWeightTrend(series(77, 28, -0.055));
    expect(trend.weeklyPct).toBeLessThan(0);
    expect(trend.verdict).toBe("on_track");
  });

  it("alerte « too_fast » au-delà de 0,7 %/semaine — c'est là qu'on paie en masse maigre", () => {
    const trend = buildWeightTrend(series(77, 28, -0.15));
    expect(trend.verdict).toBe("too_fast");
  });

  it("signale « too_slow » sous 0,4 %/semaine", () => {
    const trend = buildWeightTrend(series(77, 28, -0.01));
    expect(trend.verdict).toBe("too_slow");
  });

  it("distingue une prise de poids d'une perte trop lente", () => {
    expect(buildWeightTrend(series(77, 28, +0.05)).verdict).toBe("gaining");
  });

  it("refuse de conclure sur une fenêtre trop courte plutôt que de deviner", () => {
    const trend = buildWeightTrend(series(77, 4, -0.3));
    expect(trend.weeklyPct).toBeNull();
    expect(trend.verdict).toBe("unknown");
    // La variation reste connue : c'est la VITESSE qui n'est pas estimable.
    expect(trend.deltaKg).toBeLessThan(0);
  });
});

describe("jalons de perte", () => {
  it("franchit -5 % puis -7 %", () => {
    const petit = buildWeightTrend(series(77, 40, -0.11)); // ~ -4,3 kg ≈ -5,6 %
    expect(petit.reachedMilestones).toEqual([5]);
    expect(petit.nextMilestonePct).toBe(7);
    expect(petit.kgToNextMilestone).toBeGreaterThan(0);

    const gros = buildWeightTrend(series(77, 60, -0.11)); // ~ -6,5 kg ≈ -8,5 %
    expect(gros.reachedMilestones).toEqual([5, 7]);
    expect(gros.nextMilestonePct).toBeNull();
  });

  it("compte les kilos restants jusqu'au prochain jalon", () => {
    // 77 kg stables : -5 % vise 73,15 kg, il reste donc 3,85 kg.
    const trend = buildWeightTrend(series(77, 14, 0));
    expect(trend.kgToNextMilestone).toBeCloseTo(3.85, 1);
  });
});

describe("origine du calcul", () => {
  it("repart du début de phase et ignore l'historique antérieur", () => {
    const rows = [...series(85, 20, -0.2), ...series(77, 20, -0.05).map((e, i) => ({
      ...e,
      id: `phase-${i}`,
      measuredOn: new Date(2026, 8, 1 + i),
    }))];
    const trend = buildWeightTrend(rows, new Date(2026, 8, 1));
    expect(trend.startKg).toBeCloseTo(77, 0);
    expect(trend.points.every((p) => p.date >= new Date(2026, 8, 1))).toBe(true);
  });

  it("ne casse pas sur un historique vide", () => {
    const trend = buildWeightTrend([]);
    expect(trend.currentKg).toBeNull();
    expect(trend.verdict).toBe("unknown");
    expect(trend.nextMilestonePct).toBe(5);
  });
});

describe("dernier poids connu", () => {
  it("renvoie la pesée la plus récente, pas la valeur lissée", () => {
    expect(latestBodyWeight([entry("2026-08-01", 77), entry("2026-08-05", 76.2)])).toBe(76.2);
    expect(latestBodyWeight([])).toBeNull();
  });
});

describe("constantes du couloir", () => {
  it("reste aligné sur la littérature citée (0,4 à 0,7 %/semaine)", () => {
    expect(WEIGHT_TREND.MIN_WEEKLY_LOSS_PCT).toBe(0.4);
    expect(WEIGHT_TREND.MAX_WEEKLY_LOSS_PCT).toBe(0.7);
  });
});
