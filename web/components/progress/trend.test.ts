import { describe, expect, it } from "vitest";

import { exerciseProgressAxis, trendBadge } from "./trend";

describe("axe et tendance d'un exercice", () => {
  const points = [
    { date: new Date("2026-06-01T10:00:00Z"), weight: 0, reps: 10 },
    { date: new Date("2026-06-08T10:00:00Z"), weight: 0, reps: 12 },
    { date: new Date("2026-06-15T10:00:00Z"), weight: 0, reps: 14 },
  ];

  it("suit les reps pour un historique PDC sans standard publié", () => {
    expect(exerciseProgressAxis(points, null)).toBe("reps");
  });

  it("respecte explicitement l'axe publié", () => {
    expect(exerciseProgressAxis(points, "reps")).toBe("reps");
    expect(exerciseProgressAxis([{ ...points[0], weight: 20 }], "load")).toBe("load");
  });

  it("ne transforme pas une hausse de reps au PDC en faux plateau à 0 kg", () => {
    expect(trendBadge(points.map((point) => ({ date: point.date, value: point.reps })))).toEqual({
      label: "+40% ce mois",
      tone: "up",
    });
  });
});
