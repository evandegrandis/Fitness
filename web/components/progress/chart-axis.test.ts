import { describe, expect, it } from "vitest";
import { formatChartNumber, yAxisWidth } from "./chart-axis";

describe("axe Y des graphiques", () => {
  it("s'élargit quand les charges passent à trois chiffres", () => {
    expect(yAxisWidth([68, 107], 0, 10)).toBeGreaterThan(yAxisWidth([40, 98], 0, 10));
  });

  it("réserve la place de la virgule et des décimales", () => {
    expect(yAxisWidth([76, 81], 1, 10)).toBeGreaterThan(yAxisWidth([76, 81], 0, 10));
  });

  it("contient toujours sa plus longue étiquette", () => {
    const label = formatChartNumber(107, 0);
    expect(yAxisWidth([68, 107], 0, 10)).toBeGreaterThanOrEqual(label.length * 10 * 0.6);
  });

  it("formate à la française, sans décimales parasites", () => {
    expect(formatChartNumber(78.5, 1)).toBe("78,5");
    expect(formatChartNumber(75.83333, 1)).toBe("75,8");
    expect(formatChartNumber(80, 1)).toBe("80");
  });

  it("n'affiche jamais un résidu de calcul flottant", () => {
    expect(formatChartNumber(0.1 * 3 + 59.7, 1)).toBe("60");
    expect(formatChartNumber(59.99999999999994, 1)).toBe("60");
  });
});
