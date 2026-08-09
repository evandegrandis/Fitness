import { afterEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => ({
  loadFullDatasetFromDisk: vi.fn(),
}));

vi.mock("@/lib/data/build-dataset", () => ({
  loadFullDatasetFromDisk: dataMocks.loadFullDatasetFromDisk,
}));

/**
 * OFFLINE_PWA_SPEC §3 (P4.2) — `getInitialData()` est appelée depuis un Server Component
 * `force-dynamic` (`app/(app)/layout.tsx`) : si Neon est injoignable, elle NE DOIT JAMAIS lever.
 * `getAllData` est mocké pour simuler cet échec réseau SANS toucher au vrai client Drizzle/Neon
 * (`emptyAllData` est reproduit ici pour ne pas initialiser le vrai client Drizzle ; seule
 * `getAllData` est remplacée par un mock qui rejette).
 */
vi.mock("@/lib/db/queries", async () => {
  const empty = () => ({
    exercises: [],
    sessions: [],
    activeSession: null,
    goals: [],
    settings: {
      usesKilograms: true,
      defaultSmallestIncrement: 2.5,
      defaultRestTimerSeconds: 120,
      defaultRepTargetMin: 8,
      defaultRepTargetMax: 12,
      userName: "Evan",
      supersetRestSeconds: 180,
      bodyWeightKg: null,
      gender: null,
      ageYears: null,
    },
    templates: [],
    recoveryCheckins: [],
  });
  return {
    emptyAllData: empty,
    getAllData: vi.fn().mockRejectedValue(new Error("Neon injoignable (test)")),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  dataMocks.loadFullDatasetFromDisk.mockReset();
  vi.resetModules();
});

describe("getInitialData ne lève jamais (OFFLINE_PWA_SPEC §3, P4.2)", () => {
  it("DATABASE_URL présent mais Neon injoignable -> renvoie AllData vide au lieu de lever", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://fake-host/db");
    const { getInitialData } = await import("@/lib/data");

    await expect(getInitialData()).resolves.toMatchObject({
      exercises: [],
      sessions: [],
      goals: [],
      templates: [],
      recoveryCheckins: [],
    });

    const { getInitialDataResult } = await import("@/lib/data");
    const result = await getInitialDataResult();
    expect(result).toMatchObject({ source: "unavailable" });
    expect(Number.isFinite(Date.parse(result.fetchedAt))).toBe(true);
  });

  it("en production sans DATABASE_URL, n'ouvre jamais le dataset privé embarqué", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const { getInitialDataResult } = await import("@/lib/data");

    await expect(getInitialDataResult()).resolves.toMatchObject({
      source: "unavailable",
      data: { activeSession: null, sessions: [] },
    });
    expect(dataMocks.loadFullDatasetFromDisk).not.toHaveBeenCalled();
  });
});
