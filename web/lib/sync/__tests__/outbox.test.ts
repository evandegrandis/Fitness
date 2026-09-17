import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deadLetters, discardDeadLetter, enqueue, flush, OutboxPersistenceError, pendingCount, retryDeadLetter, snapshot,
  type OutboxHandlers,
} from "../outbox";
import type { Exercise, RecoveryCheckinInput, UserSettings, WorkoutSession } from "@/lib/models/types";

class MemoryStorage {
  private values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.values.set(key, value);
  }
}

const session: WorkoutSession = {
  id: "session-offline",
  date: new Date("2026-08-04T10:00:00.000Z"),
  startTime: new Date("2026-08-04T10:00:00.000Z"),
  endTime: new Date("2026-08-04T11:00:00.000Z"),
  notes: "",
  isActive: false,
  templateName: null,
  exercises: [],
  supersetGroups: [],
  cardioEntries: [],
};

const settings: UserSettings = {
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
  weeklyCardioMinutesGoal: null,
};

const exercise: Exercise = {
  id: "ex-offline",
  name: "Développé couché",
  category: "push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 10,
  smallestIncrement: 2.5,
  isFavorite: false,
  createdByUser: true,
  sortOrder: 0,
  suggestedRestSeconds: 120,
  machineSetting: "",
  setupNotes: "",
  benchmarkLow: null,
  benchmarkHigh: null,
  fatigueClass: "medium",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [],
  lastUsed: new Date("2026-08-04T09:00:00.000Z"),
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

function install(storage: MemoryStorage): void {
  vi.stubGlobal("window", {
    localStorage: storage,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

function noopHandlers(overrides: Partial<OutboxHandlers> = {}): OutboxHandlers {
  return {
    session: vi.fn(async () => undefined),
    sessionDelete: vi.fn(async () => undefined),
    settings: vi.fn(async () => undefined),
    goals: vi.fn(async () => undefined),
    recoveryCheckin: vi.fn(async () => undefined),
    bodyWeight: vi.fn(async () => undefined),
    exerciseUpsert: vi.fn(async () => undefined),
    exerciseDelete: vi.fn(async () => undefined),
    templateUpsert: vi.fn(async () => undefined),
    templateDelete: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("offline outbox persistence", () => {
  it("refuses to claim enqueue success when localStorage rejects the write", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    install(storage);

    expect(() => enqueue({ kind: "session", session })).toThrow(OutboxPersistenceError);
  });

  it("surfaces corrupt JSON without silently replacing the queue with an empty one", () => {
    const storage = new MemoryStorage();
    storage.setItem("jeera_sync_outbox_v1", "{broken");
    install(storage);

    expect(() => pendingCount()).toThrow(OutboxPersistenceError);
    expect(storage.getItem("jeera_sync_outbox_v1")).toBe("{broken");
  });

  it("keeps a failed server save queued for the next retry", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "session", session });

    const remaining = await flush(
      noopHandlers({
        session: async () => {
          throw new Error("network down");
        },
      })
    );

    expect(remaining).toBe(1);
    expect(pendingCount()).toBe(1);
  });

  it("removes a session entry only after the server save and verified local write succeed", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "session", session });
    const save = vi.fn(async () => undefined);

    expect(await flush(noopHandlers({ session: save }))).toBe(0);
    expect(save).toHaveBeenCalledOnce();
    expect(pendingCount()).toBe(0);
  });

  it("revives session Date fields (date/startTime/endTime/set timestamps) after a localStorage round-trip", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({
      kind: "session",
      session: {
        ...session,
        exercises: [
          {
            id: "le1",
            orderIndex: 0,
            notes: "",
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            supersetGroupId: null,
            plateauWeakPoint: null,
            sets: [
              {
                id: "set1",
                weight: 80,
                reps: 5,
                setType: "work",
                timestamp: new Date("2026-08-04T10:05:00.000Z"),
                setSlotIndex: 0,
                completed: true,
                supersetRoundIndex: null,
              },
            ],
          },
        ],
      },
    });

    let capturedDate: Date | undefined;
    let capturedTimestamp: Date | undefined;
    await flush(
      noopHandlers({
        session: async (s) => {
          capturedDate = s.date;
          capturedTimestamp = s.exercises[0]?.sets[0]?.timestamp;
        },
      })
    );

    expect(capturedDate).toBeInstanceOf(Date);
    expect(capturedTimestamp).toBeInstanceOf(Date);
  });

  it("settings op: dedupes to the latest value when enqueued twice before a flush (singleton)", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "settings", settings });
    enqueue({ kind: "settings", settings: { ...settings, userName: "Camille" } });

    expect(pendingCount()).toBe(1); // pas 2 : la 2e écrase la 1re, jamais un état intermédiaire rejoué

    let captured: UserSettings | undefined;
    await flush(noopHandlers({ settings: async (s) => void (captured = s) }));
    expect(captured?.userName).toBe("Camille");
  });

  it("exercise_upsert op: dedupes by exercise id, revives lastUsed after a round-trip", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "exercise_upsert", exercise });
    enqueue({ kind: "exercise_upsert", exercise: { ...exercise, name: "Développé incliné" } });

    expect(pendingCount()).toBe(1);

    let captured: Exercise | undefined;
    await flush(noopHandlers({ exerciseUpsert: async (e) => void (captured = e) }));
    expect(captured?.name).toBe("Développé incliné");
    expect(captured?.lastUsed).toBeInstanceOf(Date);
  });

  it("garde l'upsert d'un nouvel exercice avant la séance qui en dépend lorsqu'il est réédité", async () => {
    const storage = new MemoryStorage();
    install(storage);
    const dependentSession: WorkoutSession = {
      ...session,
      exercises: [
        {
          id: "logged-new-exercise",
          orderIndex: 0,
          notes: "",
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          supersetGroupId: null,
          plateauWeakPoint: null,
          sets: [],
        },
      ],
    };

    enqueue({ kind: "exercise_upsert", exercise });
    enqueue({ kind: "session", session: dependentSession });
    enqueue({
      kind: "exercise_upsert",
      exercise: { ...exercise, name: "Développé incliné" },
    });

    const calls: string[] = [];
    await flush(
      noopHandlers({
        exerciseUpsert: async (value) => void calls.push(`upsert:${value.name}`),
        session: async (value) => void calls.push(`session:${value.id}`),
      })
    );

    expect(calls).toEqual([
      "upsert:Développé incliné",
      `session:${dependentSession.id}`,
    ]);
    expect(pendingCount()).toBe(0);
  });

  it("rejoue un check-in tout-null comme intention de suppression avec sa date revivifiée", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({
      kind: "recovery_checkin",
      checkin: {
        id: "recovery-delete",
        date: new Date("2026-08-08T22:00:00.000Z"),
        tookCreatine: null,
        proteinTargetMet: null,
        sleepHours: null,
        hadAlcohol: null,
      },
    });

    const replay = vi.fn(async (_checkin: RecoveryCheckinInput) => {
      void _checkin;
    });
    await flush(noopHandlers({ recoveryCheckin: replay }));

    expect(replay).toHaveBeenCalledOnce();
    const replayed = replay.mock.calls[0]?.[0];
    expect(replayed).toMatchObject({
      id: "recovery-delete",
      tookCreatine: null,
      proteinTargetMet: null,
      sleepHours: null,
      hadAlcohol: null,
    });
    expect(replayed?.date).toBeInstanceOf(Date);
    expect(pendingCount()).toBe(0);
  });

  it("exercise_delete op: replays independently of an earlier upsert for a DIFFERENT exercise (no cross-kind dedupe)", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "exercise_upsert", exercise });
    enqueue({ kind: "exercise_delete", exerciseId: "ex-other" });

    expect(pendingCount()).toBe(2);

    const calls: string[] = [];
    await flush(
      noopHandlers({
        exerciseUpsert: async (e) => void calls.push(`upsert:${e.id}`),
        exerciseDelete: async (id) => void calls.push(`delete:${id}`),
      })
    );
    expect(calls).toEqual(["upsert:ex-offline", "delete:ex-other"]);
    expect(pendingCount()).toBe(0);
  });

  it("upsert-then-delete of the SAME exercise keeps only the latest intent (deleted)", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "exercise_upsert", exercise });
    enqueue({ kind: "session", session });
    enqueue({ kind: "exercise_delete", exerciseId: exercise.id });

    const calls: string[] = [];
    await flush(
      noopHandlers({
        exerciseUpsert: async (e) => void calls.push(`upsert:${e.id}`),
        exerciseDelete: async (id) => void calls.push(`delete:${id}`),
        session: async (value) => void calls.push(`session:${value.id}`),
      })
    );
    expect(pendingCount()).toBe(0);
    expect(calls).toEqual(["delete:ex-offline", "session:session-offline"]);
  });

  it("save-then-delete de la même séance garde seulement la suppression", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "session", session });
    enqueue({ kind: "session_delete", sessionId: session.id });

    const save = vi.fn(async () => undefined);
    const remove = vi.fn(async () => undefined);
    await flush(noopHandlers({ session: save, sessionDelete: remove }));

    expect(save).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(session.id);
    expect(pendingCount()).toBe(0);
  });

  it("a failed op blocks every later op so causal order is preserved", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "settings", settings });
    enqueue({ kind: "exercise_delete", exerciseId: exercise.id });

    const remaining = await flush(
      noopHandlers({
        settings: async () => {
          throw new Error("Neon KO");
        },
      })
    );

    expect(remaining).toBe(2);
    expect(pendingCount()).toBe(2);
  });

  it("does not resurrect an exercise when an upsert fails before a delete", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "exercise_upsert", exercise });
    enqueue({ kind: "exercise_delete", exerciseId: "ex-other" });

    const deleteHandler = vi.fn(async () => undefined);
    expect(
      await flush(
        noopHandlers({
          exerciseUpsert: async () => {
            throw new Error("Neon KO");
          },
          exerciseDelete: deleteHandler,
        })
      )
    ).toBe(2);
    expect(deleteHandler).not.toHaveBeenCalled();
  });

  it("preserves a newer value enqueued for the same target while the old value is flushing", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "settings", settings });

    expect(
      await flush(
        noopHandlers({
          settings: async () => {
            enqueue({ kind: "settings", settings: { ...settings, userName: "Camille" } });
          },
        })
      )
    ).toBe(1);

    let captured: UserSettings | undefined;
    await flush(noopHandlers({ settings: async (value) => void (captured = value) }));
    expect(captured?.userName).toBe("Camille");
    expect(pendingCount()).toBe(0);
  });

  it("coalesce deux flush concurrents et ne rejoue pas deux fois la même écriture", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "session", session });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi.fn(async () => gate);
    const handlers = noopHandlers({ session: save });
    const first = flush(handlers);
    const second = flush(handlers);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([0, 0]);
    expect(save).toHaveBeenCalledOnce();
  });
});

describe("refus permanents : isolés, visibles, jamais bloquants (17/09/2026)", () => {
  const permanent = { ok: false as const, kind: "permanent" as const, code: "23503", message: "violates foreign key constraint" };
  const checkin: RecoveryCheckinInput = {
    id: "recovery-perm", date: new Date("2026-09-16T22:00:00.000Z"), tookCreatine: true, proteinTargetMet: true, sleepHours: 7, hadAlcohol: false,
  };

  it("une écriture refusée définitivement devient une dead letter et la suite de la file passe", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "session", session });
    enqueue({ kind: "settings", settings });
    enqueue({ kind: "recovery_checkin", checkin });

    const handlers = noopHandlers({ session: vi.fn(async () => permanent) });
    const remaining = await flush(handlers);

    expect(remaining).toBe(0);
    expect(handlers.settings).toHaveBeenCalledTimes(1);
    expect(handlers.recoveryCheckin).toHaveBeenCalledTimes(1);
    const letters = deadLetters();
    expect(letters).toHaveLength(1);
    expect(letters[0]!.op.kind).toBe("session");
    expect(letters[0]!.error).toEqual({ code: "23503", message: "violates foreign key constraint" });
    expect(snapshot()).toMatchObject({ pending: 0, deadLetters: 1 });
  });

  it("un échec transitoire (exception) conserve l'ordre causal et note la tentative", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "settings", settings });
    enqueue({ kind: "exercise_delete", exerciseId: exercise.id });

    const handlers = noopHandlers({ settings: async () => { throw new Error("fetch failed"); } });
    await flush(handlers);

    expect(pendingCount()).toBe(2);
    expect(handlers.exerciseDelete).not.toHaveBeenCalled();
    expect(deadLetters()).toHaveLength(0);
    const state = snapshot();
    expect(state.lastError).toMatchObject({ kind: "transient", message: "fetch failed" });
    expect(state.oldestPendingAt).not.toBeNull();
  });

  it("un résultat transitoire explicite se comporte comme une exception", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "settings", settings });
    const handlers = noopHandlers({ settings: async () => ({ ok: false, kind: "transient", code: null, message: "Neon 503" }) });
    await flush(handlers);
    expect(pendingCount()).toBe(1);
    expect(deadLetters()).toHaveLength(0);
  });

  it("une dead letter se rejoue explicitement (retour en file) ou s'abandonne explicitement", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "session", session });
    await flush(noopHandlers({ session: async () => permanent }));
    const [letter] = deadLetters();

    expect(retryDeadLetter(letter!.entryId)).toBe(true);
    expect(deadLetters()).toHaveLength(0);
    expect(pendingCount()).toBe(1);

    await flush(noopHandlers({ session: async () => permanent }));
    const [again] = deadLetters();
    expect(again!.attempts).toBe(1);
    expect(discardDeadLetter(again!.entryId)).toBe(true);
    expect(deadLetters()).toHaveLength(0);
    expect(discardDeadLetter("inconnu")).toBe(false);
  });

  it("une dépendante refusée après sa dépendance refusée devient visible à son tour, rien ne gèle", async () => {
    const storage = new MemoryStorage();
    install(storage);
    enqueue({ kind: "exercise_upsert", exercise });
    enqueue({ kind: "session", session });
    enqueue({ kind: "settings", settings });
    const handlers = noopHandlers({ exerciseUpsert: async () => permanent, session: async () => permanent });
    const remaining = await flush(handlers);
    expect(remaining).toBe(0);
    expect(deadLetters().map((letter) => letter.op.kind).sort()).toEqual(["exercise_upsert", "session"]);
    expect(handlers.settings).toHaveBeenCalledTimes(1);
  });
});
