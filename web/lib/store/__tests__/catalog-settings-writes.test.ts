import { describe, expect, it } from "vitest";

// Voir workout.test.ts / offline-cache.test.ts — même stub localStorage in-memory nécessaire avant
// d'importer le store (persist(...) est construit au chargement du module).
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
type ExerciseType = import("@/lib/models/types").Exercise;
type UserSettingsType = import("@/lib/models/types").UserSettings;

const SETTINGS: UserSettingsType = {
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
  muscleMappings: [],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

describe("écritures catalogue/réglages reflétées dans le store (OFFLINE_PWA_SPEC §4, P4.4)", () => {
  it("setSettings remplace intégralement settings (ex. corriger le poids de corps hors-ligne)", () => {
    useWorkoutStore.setState({ settings: SETTINGS });
    useWorkoutStore.getState().setSettings({ ...SETTINGS, bodyWeightKg: 80 });
    expect(useWorkoutStore.getState().settings.bodyWeightKg).toBe(80);
  });

  it("upsertExerciseInCatalog ajoute un nouvel exercice absent du catalogue", () => {
    useWorkoutStore.setState({ catalog: [] });
    useWorkoutStore.getState().upsertExerciseInCatalog(BENCH);
    expect(useWorkoutStore.getState().catalog).toEqual([BENCH]);
  });

  it("upsertExerciseInCatalog remplace un exercice existant (même id) sans dupliquer", () => {
    useWorkoutStore.setState({ catalog: [BENCH] });
    const edited = { ...BENCH, name: "Développé incliné" };
    useWorkoutStore.getState().upsertExerciseInCatalog(edited);

    const catalog = useWorkoutStore.getState().catalog;
    expect(catalog).toHaveLength(1);
    expect(catalog[0].name).toBe("Développé incliné");
  });

  it("removeExerciseFromCatalog retire l'exercice ciblé, laisse les autres intacts", () => {
    const other: ExerciseType = { ...BENCH, id: "ex-other", name: "Squat" };
    useWorkoutStore.setState({ catalog: [BENCH, other] });
    useWorkoutStore.getState().removeExerciseFromCatalog(BENCH.id);

    const catalog = useWorkoutStore.getState().catalog;
    expect(catalog).toEqual([other]);
  });
});
