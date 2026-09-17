import { describe, expect, it } from "vitest";

import { parseMeasuredOn, parseNumberish } from "./parse";

describe("parseMeasuredOn", () => {
  it("garde un ISO complet tel quel", () => {
    expect(parseMeasuredOn("2026-09-17T07:40:00+02:00")).toBe("2026-09-17T07:40:00+02:00");
  });
  it("lit un jour simple à 08:00 heure de Paris (été puis hiver)", () => {
    expect(parseMeasuredOn("2026-09-17")).toBe("2026-09-17T08:00:00+02:00");
    expect(parseMeasuredOn("2026-12-17")).toBe("2026-12-17T08:00:00+01:00");
  });
  it("lit la date française moyenne rendue par Raccourcis", () => {
    expect(parseMeasuredOn("15 sept. 2026 à 09:41")).toBe("2026-09-15T09:41:00+02:00");
    expect(parseMeasuredOn("1er août 2026 à 07:05")).toBe("2026-08-01T07:05:00+02:00");
    expect(parseMeasuredOn("3 févr. 2026 à 22:10")).toBe("2026-02-03T22:10:00+01:00");
    expect(parseMeasuredOn("15 septembre 2026")).toBe("2026-09-15T08:00:00+02:00");
  });
  it("lit le format numérique français", () => {
    expect(parseMeasuredOn("15/09/2026 09:41")).toBe("2026-09-15T09:41:00+02:00");
    expect(parseMeasuredOn("15/09/2026")).toBe("2026-09-15T08:00:00+02:00");
  });
  it("refuse l'illisible", () => {
    expect(parseMeasuredOn("hier")).toBeNull();
    expect(parseMeasuredOn("15 xyz 2026")).toBeNull();
  });
});

describe("parseNumberish", () => {
  it("lit les rendus français de Raccourcis", () => {
    expect(parseNumberish("75,6 kg")).toBe(75.6);
    expect(parseNumberish("76 kg")).toBe(76);
    expect(parseNumberish("12 345 pas")).toBe(12345);
    expect(parseNumberish("12\u202f345 pas")).toBe(12345);
    expect(parseNumberish("1 234,5 kcal")).toBe(1234.5);
    expect(parseNumberish("75.59999999999999")).toBeCloseTo(75.6);
    expect(Number.isNaN(parseNumberish("aucun"))).toBe(true);
  });
});
