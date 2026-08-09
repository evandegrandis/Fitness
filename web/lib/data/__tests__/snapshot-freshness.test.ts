import { describe, expect, it } from "vitest";

import { shouldApplyServerSnapshot } from "../snapshot-freshness";

describe("shouldApplyServerSnapshot", () => {
  const fresh = "2026-08-09T18:00:00.000Z";
  const old = "2026-08-08T18:00:00.000Z";

  it("accepte le premier snapshot DB valide", () => {
    expect(shouldApplyServerSnapshot({
      source: "database",
      fetchedAt: fresh,
      lastAppliedAt: null,
      hasPendingOutbox: false,
    })).toBe(true);
  });

  it("refuse un snapshot plus ancien ou égal au watermark local", () => {
    for (const fetchedAt of [old, fresh]) {
      expect(shouldApplyServerSnapshot({
        source: "database",
        fetchedAt,
        lastAppliedAt: fresh,
        hasPendingOutbox: false,
      })).toBe(false);
    }
  });

  it("refuse toute hydratation tant qu'une outbox locale est en attente", () => {
    expect(shouldApplyServerSnapshot({
      source: "database",
      fetchedAt: fresh,
      lastAppliedAt: old,
      hasPendingOutbox: true,
    })).toBe(false);
  });

  it("refuse une source indisponible ou un watermark serveur invalide", () => {
    expect(shouldApplyServerSnapshot({
      source: "unavailable",
      fetchedAt: fresh,
      lastAppliedAt: null,
      hasPendingOutbox: false,
    })).toBe(false);
    expect(shouldApplyServerSnapshot({
      source: "database",
      fetchedAt: "invalide",
      lastAppliedAt: null,
      hasPendingOutbox: false,
    })).toBe(false);
  });
});
