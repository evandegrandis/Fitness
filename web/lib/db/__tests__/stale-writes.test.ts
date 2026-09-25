import { describe, expect, it } from "vitest";

import { isStaleWrite, STALE_TOLERANCE_MS, staleWriteMessage } from "../stale-writes";

describe("écritures périmées", () => {
  const decided = Date.parse("2026-08-21T18:00:00.000Z");

  it("une ligne jamais écrite ou inchangée depuis la décision accepte l'écriture", () => {
    expect(isStaleWrite(null, decided)).toBe(false);
    expect(isStaleWrite(decided - 60_000, decided)).toBe(false);
  });

  it("tolère l'écart d'horloge du téléphone, pas plus", () => {
    expect(isStaleWrite(decided + STALE_TOLERANCE_MS, decided)).toBe(false);
    expect(isStaleWrite(decided + STALE_TOLERANCE_MS + 1, decided)).toBe(true);
  });

  it("une écriture d'août ne passe pas sur une ligne modifiée en septembre", () => {
    expect(isStaleWrite(Date.parse("2026-09-24T12:00:00.000Z"), decided)).toBe(true);
  });

  it("sans heure de décision (ancienne version de l'app), toute ligne existante gagne", () => {
    expect(isStaleWrite(Date.parse("2026-09-26T01:00:00.000Z"), undefined)).toBe(true);
    expect(staleWriteMessage(Date.parse("2026-09-26T01:00:00.000Z"), undefined)).toContain("ancienne version de l'app");
  });

  it("le message donne les deux heures, à Paris", () => {
    const message = staleWriteMessage(Date.parse("2026-09-24T12:00:00.000Z"), decided);
    expect(message).toContain("24/09/2026 14:00");
    expect(message).toContain("21/08/2026 20:00");
  });
});
