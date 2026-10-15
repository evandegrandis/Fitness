import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Le store persiste via `localStorage`, absent de l'environnement `node` de Vitest : même stub
// en mémoire que `workout.test.ts`, posé avant d'importer le store.
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
const {
  SUPERSET_LINK_TIMEOUT_MS,
  isSupersetLinkTap,
  useSupersetLinkNotice,
  watchSupersetLinkMode,
} = await import("@/lib/store/superset-link-mode");
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
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};
const CURL: ExerciseType = { ...BENCH, id: "ex-curl", name: "Curl debout", category: "pull", fatigueClass: "medium" };
const RAISE: ExerciseType = { ...BENCH, id: "ex-raise", name: "Élévations latérales", fatigueClass: "light" };

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
  trainingPhase: null,
  trainingPhaseStartedAt: null,
  weeklyCardioMinutesGoal: null,
};

/** Séance à trois exercices, aucun lié. Renvoie les ids des exercices de la séance. */
function startSession() {
  const store = useWorkoutStore.getState();
  store.hydrate({ catalog: [BENCH, CURL, RAISE], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
  store.startEmpty("normal");
  store.addExercise(BENCH.id);
  store.addExercise(CURL.id);
  store.addExercise(RAISE.id);
  const [bench, curl, raise] = useWorkoutStore.getState().active!.exercises.map((exercise) => exercise.id);
  return { bench, curl, raise };
}

const armed = () => useWorkoutStore.getState().armedSupersetExerciseId;
const notice = () => useSupersetLinkNotice.getState().notice;

describe("mode « lier en superset » : il s'arrête dès qu'Evan fait autre chose", () => {
  let stopWatching: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    useWorkoutStore.setState({ active: null, armedSupersetExerciseId: null, rest: null, undo: null });
    useSupersetLinkNotice.setState({ notice: null });
  });

  afterEach(() => {
    stopWatching();
    vi.useRealTimers();
  });

  it("s'arrête seul après 15 s sans choix, et dit pourquoi", () => {
    const { bench } = startSession();
    stopWatching = watchSupersetLinkMode();

    useWorkoutStore.getState().handleSupersetLink(bench);
    expect(armed()).toBe(bench);

    vi.advanceTimersByTime(SUPERSET_LINK_TIMEOUT_MS - 1);
    expect(armed()).toBe(bench);

    vi.advanceTimersByTime(1);
    expect(armed()).toBeNull();
    expect(notice()?.reason).toBe("timeout");
    // Rien n'a été lié.
    expect(useWorkoutStore.getState().active!.supersetGroups).toHaveLength(0);
  });

  it("s'arrête dès qu'une série est validée, même sur un autre exercice", () => {
    const { bench, curl } = startSession();
    stopWatching = watchSupersetLinkMode();

    useWorkoutStore.getState().handleSupersetLink(bench);
    useWorkoutStore.getState().logSet(curl, { weight: 20, reps: 10 });

    expect(armed()).toBeNull();
    expect(notice()?.reason).toBe("set_logged");
    // Plus de délai en cours : rien ne se rejoue 15 s plus tard.
    useSupersetLinkNotice.setState({ notice: null });
    vi.advanceTimersByTime(SUPERSET_LINK_TIMEOUT_MS * 2);
    expect(notice()).toBeNull();
  });

  it("lier normalement crée le superset, sans message ni fin différée", () => {
    const { bench, curl } = startSession();
    stopWatching = watchSupersetLinkMode();

    useWorkoutStore.getState().handleSupersetLink(bench);
    vi.advanceTimersByTime(SUPERSET_LINK_TIMEOUT_MS / 2);
    useWorkoutStore.getState().handleSupersetLink(curl);

    const session = useWorkoutStore.getState().active!;
    expect(session.supersetGroups).toHaveLength(1);
    expect(session.supersetGroups[0].memberOrder).toEqual([bench, curl]);
    expect(armed()).toBeNull();
    vi.advanceTimersByTime(SUPERSET_LINK_TIMEOUT_MS);
    expect(notice()).toBeNull();
  });

  it("chaque armement repart pour 15 s entiers", () => {
    const { bench } = startSession();
    stopWatching = watchSupersetLinkMode();

    useWorkoutStore.getState().handleSupersetLink(bench);
    vi.advanceTimersByTime(10_000);
    useWorkoutStore.getState().handleSupersetLink(bench); // Annuler
    expect(armed()).toBeNull();
    expect(notice()).toBeNull();
    useWorkoutStore.getState().handleSupersetLink(bench); // réarmé
    vi.advanceTimersByTime(10_000);
    expect(armed()).toBe(bench);
    vi.advanceTimersByTime(5_000);
    expect(armed()).toBeNull();
  });

  it("quitter l'écran de séance (changement d'onglet) l'arrête sans message", () => {
    const { bench } = startSession();
    stopWatching = watchSupersetLinkMode();
    useWorkoutStore.getState().handleSupersetLink(bench);

    stopWatching();
    stopWatching = () => {};
    expect(armed()).toBeNull();
    expect(notice()).toBeNull();
  });

  it("un mode trouvé armé à l'ouverture de l'écran tombe sans bruit", () => {
    const { bench } = startSession();
    useWorkoutStore.setState({ armedSupersetExerciseId: bench });

    stopWatching = watchSupersetLinkMode();
    expect(armed()).toBeNull();
    expect(notice()).toBeNull();
  });

  it("n'est plus persisté : un rechargement ne le réarme pas", () => {
    const { bench } = startSession();
    stopWatching = watchSupersetLinkMode();
    useWorkoutStore.getState().handleSupersetLink(bench);

    const persisted = JSON.parse(localStorage.getItem("jeera-workout-store") ?? "{}");
    expect(persisted.state).toBeDefined();
    expect(persisted.state).not.toHaveProperty("armedSupersetExerciseId");
  });

  it("un tap sur le bandeau ou une carte à lier fait partie du geste, tout le reste l'annule", () => {
    const inside = { closest: (selector: string) => (selector === "[data-superset-link]" ? {} : null) };
    const outside = { closest: () => null };
    expect(isSupersetLinkTap(inside as unknown as EventTarget)).toBe(true);
    expect(isSupersetLinkTap(outside as unknown as EventTarget)).toBe(false);
    expect(isSupersetLinkTap(null)).toBe(false);
  });
});
