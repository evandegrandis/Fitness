import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BenchmarkGauge } from "@/components/progress/BenchmarkGauge";
import type { ExerciseBenchmark, PersonalProgress } from "@/lib/engines/benchmark";

const SOURCE = {
  title: "StrengthLevel · Pull Ups",
  url: "https://strengthlevel.com/strength-standards/pull-ups/kg",
  loadConvention: "charge ajoutée au poids de corps",
  dataCutoff: "2026-03-05",
};

const LOAD_BENCHMARK: ExerciseBenchmark = {
  hasBenchmark: true,
  currentE1RM: 25,
  thresholds: { beginner: 5, novice: 14, intermediate: 33, advanced: 54, elite: 75 },
  position: 0.4,
  level: { key: "novice", label: "Novice", tone: "novice" },
  nextLevel: "intermediate",
  gapToNext: 8,
  source: SOURCE,
  profileLabel: "Référence Homme · 80 kg · 25–40 ans · profil 26 ans",
  unit: "reps_and_load",
  primaryAxis: "load",
  isMachine: false,
  caveat: null,
  secondary: {
    axis: "reps",
    currentValue: 5,
    thresholds: { beginner: 1, novice: 7, intermediate: 13, advanced: 21, elite: 30 },
    position: 0.17,
    level: { key: "beginner", label: "Débutant", tone: "beginner" },
    nextLevel: "novice",
    gapToNext: 2,
  },
};

describe("BenchmarkGauge — unités et axes", () => {
  it("rend les deux jauges avec kg pour la charge et reps pour l'axe secondaire", () => {
    const html = renderToStaticMarkup(createElement(BenchmarkGauge, { benchmark: LOAD_BENCHMARK }));

    expect(html).toContain("Repère StrengthLevel · 1RM estimé");
    expect(html).toContain("Repère StrengthLevel · répétitions");
    expect(html).toContain("e1RM 25kg");
    expect(html).toContain("5 reps");
    expect(html).toContain("encore 2 reps");
  });

  it("garde la progression personnelle visible quand le profil H80 absolu est indisponible", () => {
    const unavailable: ExerciseBenchmark = {
      ...LOAD_BENCHMARK,
      hasBenchmark: false,
      currentE1RM: 0,
      thresholds: null,
      position: null,
      level: null,
      nextLevel: null,
      gapToNext: null,
      source: null,
      profileLabel: null,
      unit: null,
      primaryAxis: null,
      secondary: null,
    };
    const personalProgress: PersonalProgress = {
      hasData: true,
      currentE1RM: 70,
      minE1RM: 60,
      maxE1RM: 80,
      percentile: 0.5,
    };

    const html = renderToStaticMarkup(
      createElement(BenchmarkGauge, { benchmark: unavailable, personalProgress })
    );
    expect(html).toContain("Progression perso · cet exercice");
    expect(html).not.toContain("Repère StrengthLevel");
  });
});
