import { beforeEach, describe, expect, it } from "vitest";

// Le store persiste via `localStorage` (middleware `persist` de Zustand),
// indisponible dans l'environnement Vitest par défaut du projet (`node`, cf.
// vitest.config.ts — non modifié ici). Ni jsdom ni le `localStorage`
// expérimental de Node 22+ ne l'exposent de façon fiable dans ce sandbox, donc
// on stub un `localStorage` in-memory minimal avant d'importer le store (qui
// construit `persist(...)` au chargement du module).
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

globalThis.localStorage = new MemoryStorage();

const { useWorkoutStore } = await import("@/lib/store/workout");
const { MuscleGroup } = await import("@/lib/models/muscles");
type ExerciseType = import("@/lib/models/types").Exercise;
type UserSettingsType = import("@/lib/models/types").UserSettings;

const BENCH: ExerciseType = {
  id: "ex-bench",
  name: "Développé couché",
  category: "push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 10,
  smallestIncrement: 2.5,
  isFavorite: false,
  createdByUser: false,
  sortOrder: 0,
  suggestedRestSeconds: 120,
  machineSetting: "",
  setupNotes: "",
  benchmarkLow: null,
  benchmarkHigh: null,
  fatigueClass: "heavy",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
  lastUsed: null,
};

const SETTINGS: UserSettingsType = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "Evan",
  supersetRestSeconds: 180,
  bodyWeightKg: null,
};

const DIPS: ExerciseType = {
  ...BENCH,
  id: "ex-dips",
  name: "Dips",
  setPatternMode: "bodyweight",
  repTargetMin: 8,
  repTargetMax: 15,
  smallestIncrement: 1,
  fatigueClass: "light",
};

function resetStore() {
  useWorkoutStore.setState({
    catalog: [],
    history: [],
    goals: [],
    settings: SETTINGS,
    templates: [],
    recoveryCheckins: [],
    active: null,
    activeMode: "normal",
    selectedStartMode: "normal",
    rest: null,
    undo: null,
    achievement: null,
    armedSupersetExerciseId: null,
    justHitRecord: {},
    recordsCache: {},
    hasHydratedStorage: false,
  });
}

describe("useWorkoutStore", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it("hydrate -> startEmpty -> addExercise -> logSet x2 -> suggestion cohérente, rest timer, finish() move vers history", () => {
    const store = useWorkoutStore.getState();

    // 1. hydrate
    store.hydrate({
      catalog: [BENCH],
      history: [],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
    });

    // 2. startEmpty
    store.startEmpty("normal");
    expect(useWorkoutStore.getState().active).not.toBeNull();
    expect(useWorkoutStore.getState().active?.exercises).toHaveLength(0);

    // 3. addExercise
    store.addExercise(BENCH.id);
    const afterAdd = useWorkoutStore.getState().active!;
    expect(afterAdd.exercises).toHaveLength(1);
    const loggedExerciseId = afterAdd.exercises[0].id;

    // First suggestion with no history: generic first-anchor fallback (default start load).
    const firstSuggestion = useWorkoutStore.getState().suggestion(loggedExerciseId);
    expect(firstSuggestion.weight).toBeGreaterThan(0);
    expect(firstSuggestion.reps).toBeGreaterThanOrEqual(BENCH.repTargetMin);

    // 4. logSet #1 — hits repMin so it should be workable as an anchor next time.
    store.logSet(loggedExerciseId, { weight: 60, reps: 8 });
    let active = useWorkoutStore.getState().active!;
    let logged = active.exercises.find((e) => e.id === loggedExerciseId)!;
    expect(logged.sets).toHaveLength(1);
    expect(logged.sets[0].completed).toBe(true);

    // Rest timer should have started (not a superset, so standard rest applies).
    const restAfterFirstSet = useWorkoutStore.getState().rest;
    expect(restAfterFirstSet).not.toBeNull();
    expect(restAfterFirstSet?.exerciseId).toBe(loggedExerciseId);
    expect(restAfterFirstSet?.targetSeconds).toBe(BENCH.suggestedRestSeconds);

    // 5. suggestion() after set 1 predicts from TODAY's set (rule: never replay last session).
    const secondSuggestion = useWorkoutStore.getState().suggestion(loggedExerciseId);
    // baseRepDrop for heavy = 2.0 -> predicted reps = 8 - 2 = 6 (repTargetMin), same load held.
    expect(secondSuggestion.reps).toBeLessThanOrEqual(8);
    expect(secondSuggestion.reps).toBeGreaterThanOrEqual(BENCH.repTargetMin - 1);

    // 6. logSet #2
    store.logSet(loggedExerciseId, { weight: secondSuggestion.weight, reps: secondSuggestion.reps });
    active = useWorkoutStore.getState().active!;
    logged = active.exercises.find((e) => e.id === loggedExerciseId)!;
    expect(logged.sets).toHaveLength(2);

    // 7. finish() -> snapshot with correct setCount, session moved to history.
    const result = useWorkoutStore.getState().finish();
    expect(result).not.toBeNull();
    expect(result!.snapshot.setCount).toBe(2);
    expect(result!.snapshot.exerciseCount).toBe(1);

    const stateAfterFinish = useWorkoutStore.getState();
    expect(stateAfterFinish.active).toBeNull();
    expect(stateAfterFinish.history).toHaveLength(1);
    expect(stateAfterFinish.history[0].id).toBe(result!.session.id);
    expect(stateAfterFinish.history[0].isActive).toBe(false);
    expect(stateAfterFinish.history[0].endTime).not.toBeNull();
  });

  it("logSet sur un exercice avec poids >= 40kg déclenche un warmupSuggestion tant qu'aucun set de travail n'est complété", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({
      catalog: [BENCH],
      history: [
        {
          id: "sess-1",
          date: new Date("2026-07-01T10:00:00"),
          startTime: new Date("2026-07-01T10:00:00"),
          endTime: new Date("2026-07-01T11:00:00"),
          notes: "",
          isActive: false,
          templateName: null,
          exercises: [
            {
              id: "logged-1",
              orderIndex: 0,
              notes: "",
              exerciseId: BENCH.id,
              exerciseName: BENCH.name,
              supersetGroupId: null,
              sets: [
                {
                  id: "set-hist-1",
                  weight: 80,
                  reps: 8,
                  setType: "work",
                  timestamp: new Date("2026-07-01T10:05:00"),
                  setSlotIndex: 0,
                  completed: true,
                  supersetRoundIndex: null,
                },
              ],
            },
          ],
          supersetGroups: [],
        },
      ],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
    });

    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;

    const warmup = useWorkoutStore.getState().warmupSuggestion(loggedExerciseId);
    expect(warmup).not.toBeNull();
    expect(warmup!.setType).toBe("warmup");
    expect(warmup!.weight).toBeGreaterThanOrEqual(20);

    // Once a work set is completed, warmup is no longer offered.
    store.logSet(loggedExerciseId, { weight: 80, reps: 8 });
    expect(useWorkoutStore.getState().warmupSuggestion(loggedExerciseId)).toBeNull();
  });

  it("discard() efface la séance active sans la déplacer vers history", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    expect(useWorkoutStore.getState().active).not.toBeNull();

    store.discard();
    expect(useWorkoutStore.getState().active).toBeNull();
    expect(useWorkoutStore.getState().history).toHaveLength(0);
  });

  it("propose de compléter immédiatement un mini-set sans le compter comme deux séries", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;

    store.logSet(loggedExerciseId, { weight: 100, reps: 4 });
    const completion = useWorkoutStore.getState().suggestion(loggedExerciseId);

    expect(completion.reasonCodes).toContain("drop_set_completion");
    expect(completion.weight).toBe(97.5);
    expect(completion.reps).toBe(6);
    expect(completion.setType).toBe("backoff");
  });

  it("garde la continuation immédiate d'un drop-set dans le même round de superset", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const [benchLogged, dipsLogged] = useWorkoutStore.getState().active!.exercises;
    store.handleSupersetLink(benchLogged.id);
    store.handleSupersetLink(dipsLogged.id);

    store.logSet(benchLogged.id, { weight: 100, reps: 4 });
    useWorkoutStore.setState((state) => ({
      active: state.active
        ? {
            ...state.active,
            exercises: state.active.exercises.map((logged) =>
              logged.id === benchLogged.id
                ? {
                    ...logged,
                    sets: logged.sets.map((loggedSet) => ({
                      ...loggedSet,
                      timestamp: new Date(Date.now() - 1_000),
                    })),
                  }
                : logged
            ),
          }
        : null,
    }));
    store.logSet(benchLogged.id, { weight: 97.5, reps: 6, setType: "backoff" });
    store.logSet(benchLogged.id, { weight: 100, reps: 8 });

    const sets = useWorkoutStore.getState().active!.exercises[0].sets;
    expect(sets.map((loggedSet) => loggedSet.supersetRoundIndex)).toEqual([1, 1, 2]);
    expect(useWorkoutStore.getState().finish()!.snapshot.setCount).toBe(2);
  });

  it("marque automatiquement un gros set tardif de dips comme finisher", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const [benchLogged, dipsLogged] = useWorkoutStore.getState().active!.exercises;

    for (let index = 0; index < 5; index += 1) {
      store.logSet(benchLogged.id, { weight: 80, reps: 8 });
    }
    store.logSet(dipsLogged.id, { weight: 0, reps: 16 });

    const finisher = useWorkoutStore.getState().active!.exercises[1].sets[0];
    expect(finisher.setType).toBe("finisher");
    expect(useWorkoutStore.getState().finish()!.snapshot.setCount).toBe(5);
  });

  it("ajoute et supprime le cardio sans créer de set de musculation", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [] });
    store.startEmpty("normal");

    store.addCardioEntry({ activityName: "Cardio", durationSeconds: 120, level: 10, distanceKm: 1 });
    const entry = useWorkoutStore.getState().active!.cardioEntries![0];
    expect(entry).toMatchObject({ activityName: "Cardio", durationSeconds: 120, level: 10, distanceKm: 1 });
    expect(useWorkoutStore.getState().active!.exercises).toHaveLength(0);

    store.deleteCardioEntry(entry.id);
    expect(useWorkoutStore.getState().active!.cardioEntries).toEqual([]);
  });
});
