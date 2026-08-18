import { beforeEach, describe, expect, it } from "vitest";

// Voir workout.test.ts — même stub localStorage in-memory (persist(...) est construit au
// chargement du module `@/lib/store/workout`, avant que jsdom puisse exposer un vrai localStorage
// dans ce sandbox Vitest).
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
const { MuscleGroup, MuscleParent } = await import("@/lib/models/muscles");
const { SetType } = await import("@/lib/models/enums");
type ExerciseType = import("@/lib/models/types").Exercise;
type WorkoutSessionType = import("@/lib/models/types").WorkoutSession;
type UserSettingsType = import("@/lib/models/types").UserSettings;
type WorkoutTemplateType = import("@/lib/models/types").WorkoutTemplate;
type RecoveryCheckinType = import("@/lib/models/types").RecoveryCheckin;

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
  weeklyCardioMinutesGoal: null,
};

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
  lastUsed: new Date("2026-08-01T09:00:00.000Z"),
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

const SESSION: WorkoutSessionType = {
  id: "s1",
  date: new Date("2026-08-01T10:00:00.000Z"),
  startTime: new Date("2026-08-01T10:00:00.000Z"),
  endTime: new Date("2026-08-01T11:00:00.000Z"),
  notes: "",
  isActive: false,
  templateName: null,
  supersetGroups: [],
  cardioEntries: [],
  exercises: [
    {
      id: "le1",
      orderIndex: 0,
      notes: "",
      exerciseId: "ex-bench",
      exerciseName: "Développé couché",
      supersetGroupId: null,
      plateauWeakPoint: null,
      sets: [
        {
          id: "set1",
          weight: 80,
          reps: 5,
          setType: SetType.work,
          timestamp: new Date("2026-08-01T10:05:00.000Z"),
          setSlotIndex: 0,
          completed: true,
          supersetRoundIndex: null,
        },
      ],
    },
  ],
};

const TEMPLATE: WorkoutTemplateType = {
  id: "t1",
  name: "Push day",
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
  sortOrder: 0,
  exercises: [{ exerciseName: "Développé couché", orderIndex: 0, targetSets: 3 }],
};

const CHECKIN: RecoveryCheckinType = {
  id: "c1",
  date: new Date("2026-08-01T07:00:00.000Z"),
  tookCreatine: true,
  proteinTargetMet: true,
  sleepHours: 8,
  hadAlcohol: false,
};

/** Simule le passage par localStorage : Dates -> ISO strings, comme le ferait `JSON.stringify` réel. */
function roundTripThroughJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("cache offline des données de référence (OFFLINE_PWA_SPEC §2, P4.1)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("partialize inclut catalog/history/goals/settings/templates/recoveryCheckins", () => {
    const options = useWorkoutStore.persist.getOptions();
    expect(options.partialize).toBeDefined();

    useWorkoutStore.setState({
      catalog: [BENCH],
      history: [SESSION],
      goals: [{ parent: MuscleParent.pectoraux, weeklyGoalSets: 10 }],
      settings: SETTINGS,
      templates: [TEMPLATE],
      recoveryCheckins: [CHECKIN],
      selectedStartMode: "monk",
      lastServerSnapshotAt: "2026-08-09T18:00:00.000Z",
    });

    const persisted = options.partialize!(useWorkoutStore.getState()) as Record<string, unknown>;
    for (const key of [
      "catalog",
      "history",
      "goals",
      "settings",
      "templates",
      "recoveryCheckins",
      "selectedStartMode",
      "lastServerSnapshotAt",
    ]) {
      expect(persisted).toHaveProperty(key);
    }
    expect(persisted.catalog).toEqual([BENCH]);
    expect(persisted.settings).toEqual(SETTINGS);
    expect(persisted.selectedStartMode).toBe("monk");
    expect(persisted.lastServerSnapshotAt).toBe("2026-08-09T18:00:00.000Z");
  });

  it("merge revit en vraies Date les sessions d'history + LoggedSet.timestamp après un aller-retour JSON", () => {
    const options = useWorkoutStore.persist.getOptions();
    const persistedFromStorage = roundTripThroughJSON({ history: [SESSION] });
    // Après un aller-retour JSON, les Date sont devenues des strings — condition exacte reproduite
    // par un cold-start hors-ligne relisant localStorage.
    expect(typeof (persistedFromStorage.history[0] as unknown as { date: unknown }).date).toBe("string");

    const merged = options.merge!(persistedFromStorage, useWorkoutStore.getState());
    expect(merged.history[0].date).toBeInstanceOf(Date);
    expect(merged.history[0].date.getTime()).toBe(SESSION.date.getTime());
    expect(merged.history[0].startTime).toBeInstanceOf(Date);
    expect(merged.history[0].endTime).toBeInstanceOf(Date);
    expect(merged.history[0].exercises[0].sets[0].timestamp).toBeInstanceOf(Date);
    expect(merged.history[0].exercises[0].sets[0].timestamp.getTime()).toBe(
      SESSION.exercises[0].sets[0].timestamp.getTime()
    );
  });

  it("merge revit Exercise.lastUsed (catalog) après un aller-retour JSON", () => {
    const options = useWorkoutStore.persist.getOptions();
    const persistedFromStorage = roundTripThroughJSON({ catalog: [BENCH] });

    const merged = options.merge!(persistedFromStorage, useWorkoutStore.getState());
    expect(merged.catalog[0].lastUsed).toBeInstanceOf(Date);
    expect(merged.catalog[0].lastUsed?.getTime()).toBe(BENCH.lastUsed?.getTime());
  });

  it("merge revit aussi recoveryCheckins.date et templates.createdAt (non nommés à la lettre du spec, mais des Date tout autant)", () => {
    const options = useWorkoutStore.persist.getOptions();
    const persistedFromStorage = roundTripThroughJSON({ recoveryCheckins: [CHECKIN], templates: [TEMPLATE] });

    const merged = options.merge!(persistedFromStorage, useWorkoutStore.getState());
    expect(merged.recoveryCheckins[0].date).toBeInstanceOf(Date);
    expect(merged.templates[0].createdAt).toBeInstanceOf(Date);
  });

  it("merge garde les données courantes quand le cache persisté ne contient pas encore la clé (jamais [] qui écrase)", () => {
    const options = useWorkoutStore.persist.getOptions();
    useWorkoutStore.setState({ catalog: [BENCH], history: [SESSION] });

    const merged = options.merge!({}, useWorkoutStore.getState());
    expect(merged.catalog).toEqual([BENCH]);
    expect(merged.history).toEqual([SESSION]);
  });
});
