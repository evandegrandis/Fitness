import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OFFLINE_PWA_SPEC §4 (P4.4) — `writeThrough` est le seul endroit qui décide entre "écriture Neon
 * directe" et "mise en file offline" pour `updateSettings`/`upsertExercise`/`deleteExercise`
 * (`SettingsBodySection.tsx`/`SettingsPreferencesSection.tsx`/`ExerciseEditorSheet.tsx`).
 */
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

let navigatorOnLine = true;

beforeEach(() => {
  navigatorOnLine = true;
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  vi.stubGlobal("navigator", {
    get onLine() {
      return navigatorOnLine;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

const { PermanentMutationError, writeThrough } = await import("../write-through");
const { pendingCount } = await import("../outbox");
const { useSyncStatus } = await import("../status");
type UserSettingsType = import("@/lib/models/types").UserSettings;
type WorkoutSessionType = import("@/lib/models/types").WorkoutSession;

const SETTINGS: UserSettingsType = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "Evan",
  supersetRestSeconds: 180,
  bodyWeightKg: 80,
  gender: "male",
  ageYears: 30,
  trainingPhase: null,
  trainingPhaseStartedAt: null,
};

const ACTIVE_SESSION: WorkoutSessionType = {
  id: "active-session",
  date: new Date("2026-08-09T18:00:00.000Z"),
  startTime: new Date("2026-08-09T18:00:00.000Z"),
  endTime: null,
  notes: "",
  isActive: true,
  templateName: null,
  exercises: [],
  supersetGroups: [],
  cardioEntries: [],
};

describe("writeThrough (OFFLINE_PWA_SPEC §4, P4.4)", () => {
  it("en ligne : appelle directement l'action serveur, ne met rien en file", async () => {
    const direct = vi.fn(async () => undefined);
    await writeThrough({ kind: "settings", settings: SETTINGS }, direct);

    expect(direct).toHaveBeenCalledOnce();
    expect(pendingCount()).toBe(0);
  });

  it("hors-ligne : ne tente PAS l'appel direct, met en file immédiatement", async () => {
    navigatorOnLine = false;
    const direct = vi.fn(async () => undefined);
    await writeThrough({ kind: "exercise_delete", exerciseId: "ex-1" }, direct);

    expect(direct).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(1);
  });

  it("en ligne mais l'appel direct échoue (Neon KO/latence) : tombe dans la file, ne perd rien", async () => {
    const direct = vi.fn(async () => {
      throw new Error("Neon KO");
    });
    await writeThrough({ kind: "exercise_delete", exerciseId: "ex-1" }, direct);

    expect(direct).toHaveBeenCalledOnce();
    expect(pendingCount()).toBe(1);
  });

  it("ne met jamais une erreur métier permanente dans la file FIFO", async () => {
    const direct = vi.fn(async () => {
      throw new PermanentMutationError("Exercice utilisé dans l'historique");
    });

    await expect(
      writeThrough({ kind: "exercise_delete", exerciseId: "ex-used" }, direct)
    ).rejects.toThrow("Exercice utilisé dans l'historique");
    expect(direct).toHaveBeenCalledOnce();
    expect(pendingCount()).toBe(0);
  });

  it("met à jour le compteur `pending` du statut de sync après une mise en file", async () => {
    navigatorOnLine = false;
    await writeThrough({ kind: "exercise_delete", exerciseId: "ex-1" }, async () => undefined);

    expect(useSyncStatus.getState().pending).toBe(1);
  });

  it("ne dépasse pas une opération plus ancienne encore en file", async () => {
    navigatorOnLine = false;
    await writeThrough({ kind: "settings", settings: SETTINGS }, async () => undefined);
    navigatorOnLine = true;
    const direct = vi.fn(async () => undefined);

    await writeThrough({ kind: "exercise_delete", exerciseId: "ex-2" }, direct);

    expect(direct).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(2);
  });

  it("sécurise aussi l'autosave actif hors-ligne et dédoublonne ses snapshots", async () => {
    navigatorOnLine = false;
    const direct = vi.fn(async () => undefined);

    await writeThrough({ kind: "session", session: ACTIVE_SESSION }, direct);
    await writeThrough(
      { kind: "session", session: { ...ACTIVE_SESSION, notes: "snapshot plus récent" } },
      direct
    );

    expect(direct).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(1);
  });
});
