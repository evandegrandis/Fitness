import { describe, expect, it } from "vitest";
import { formatAxisNumber, yAxisWidth } from "./chart-axis";

describe("axe Y des graphiques", () => {
  it("s'élargit quand les charges passent à trois chiffres", () => {
    expect(yAxisWidth([68, 107], 0, 10)).toBeGreaterThan(yAxisWidth([40, 98], 0, 10));
  });

  it("réserve la place de la virgule et des décimales", () => {
    expect(yAxisWidth([76, 81], 1, 10)).toBeGreaterThan(yAxisWidth([76, 81], 0, 10));
  });

  it("contient toujours sa plus longue étiquette", () => {
    const label = formatAxisNumber(107, 0);
    expect(yAxisWidth([68, 107], 0, 10)).toBeGreaterThanOrEqual(label.length * 10 * 0.6);
  });

  it("formate à la française, sans décimales parasites", () => {
    expect(formatAxisNumber(78.5, 1)).toBe("78,5");
    expect(formatAxisNumber(75.83333, 1)).toBe("75,8");
    expect(formatAxisNumber(80, 1)).toBe("80");
  });
});
