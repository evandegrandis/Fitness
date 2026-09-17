import { describe, expect, it } from "vitest";

import { detectGranularity, parseActivityLines } from "./ingest";

describe("parseActivityLines", () => {
  it("lit les lignes « date | valeur » telles que Raccourcis les compose", () => {
    const { lines, rejected } = parseActivityLines([
      "17 sept. 2026 à 14:00 | 1 234 pas",
      "17 sept. 2026 à 15:00 | 87 pas",
      "",
      "16 sept. 2026 à 00:00\t9 870 pas",
      "n'importe quoi",
    ].join("\n"));
    expect(rejected).toBe(1);
    expect(lines).toEqual([
      { at: "2026-09-17T14:00:00+02:00", value: 1234 },
      { at: "2026-09-17T15:00:00+02:00", value: 87 },
      { at: "2026-09-16T00:00:00+02:00", value: 9870 },
    ]);
  });

  it("accepte des valeurs décimales (énergie active) et rejette les négatives", () => {
    const { lines, rejected } = parseActivityLines("17 sept. 2026 à 14:00 | 123,4 kcal\n17 sept. 2026 à 15:00 | -3");
    expect(lines).toEqual([{ at: "2026-09-17T14:00:00+02:00", value: 123.4 }]);
    expect(rejected).toBe(1);
  });
});

describe("detectGranularity", () => {
  it("des totaux tous à minuit sont des jours, sinon des heures", () => {
    expect(detectGranularity([{ at: "2026-09-16T00:00:00+02:00", value: 9870 }, { at: "2026-09-15T00:00:00+02:00", value: 8000 }])).toBe("day");
    expect(detectGranularity([{ at: "2026-09-17T00:00:00+02:00", value: 10 }, { at: "2026-09-17T14:00:00+02:00", value: 1234 }])).toBe("hour");
  });
});
