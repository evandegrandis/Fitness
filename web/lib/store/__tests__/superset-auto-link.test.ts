import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Même stub de `localStorage` que `workout.test.ts`, posé avant d'importer le store.
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
const { CATALOG, HISTORY_BEFORE_1510, LATERAL, PREACHER, TIRAGE, WIDE } = await import(
  "@/lib/engines/__tests__/superset-habits.fixtures"
);
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
  trainingPhase: null,
  trainingPhaseStartedAt: null,
  weeklyCardioMinutesGoal: null,
};

const store = () => useWorkoutStore.getState();
const logged = (exerciseId: string) => store().active!.exercises.find((exercise) => exercise.exerciseId === exerciseId)!;
const groups = () => store().active!.supersetGroups;

/** Le 15/10 à 17:08, comme Evan : séance vide, puis les exercices un à un. */
function startLike1510() {
  store().hydrate({ catalog: CATALOG, history: HISTORY_BEFORE_1510, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
  store().startEmpty("normal");
}

describe("supersets habituels : le lien se fait tout seul dans la séance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T17:08:00Z"));
    useWorkoutStore.setState({ active: null, undo: null, supersetAutoLinkDeclined: null, armedSupersetExerciseId: null });
  });
  afterEach(() => vi.useRealTimers());

  it("ajouter Wide Chest Press après une série de Lateral raises forme le superset, et il le voit", () => {
    startLike1510();
    store().addExercise(LATERAL.id);
    store().logSet(logged(LATERAL.id).id, { weight: 16, reps: 10 });
    expect(groups()).toHaveLength(0);

    store().addExercise(WIDE.id);
    expect(groups()).toHaveLength(1);
    // L'exercice déjà commencé reste premier, l'autre le rejoint : comme un lien fait à la main.
    expect(groups()[0].memberOrder).toEqual([logged(LATERAL.id).id, logged(WIDE.id).id]);
    expect(logged(WIDE.id).supersetGroupId).toBe(groups()[0].id);
    expect(store().undo?.message).toBe("Superset avec Lateral raises (lié 2 fois ces 4 semaines)");
  });

  it("l'ordre d'ajout ne compte pas : les deux, dans n'importe quel ordre, se lient", () => {
    startLike1510();
    store().addExercise(WIDE.id);
    store().addExercise(LATERAL.id);
    expect(groups()).toHaveLength(1);
    expect(new Set(groups()[0].memberOrder)).toEqual(new Set([logged(WIDE.id).id, logged(LATERAL.id).id]));
  });

  it("« Annuler » défait le lien, qui ne revient pas quand il ajoute un autre exercice", () => {
    startLike1510();
    store().addExercise(LATERAL.id);
    store().addExercise(WIDE.id);
    store().undoLastAction();
    expect(groups()).toHaveLength(0);
    expect(store().active!.exercises).toHaveLength(2); // l'exercice ajouté reste

    store().addExercise(TIRAGE.id);
    expect(groups()).toHaveLength(0);
  });

  it("détacher depuis la carte défait aussi le lien pour la séance", () => {
    startLike1510();
    store().addExercise(WIDE.id);
    store().addExercise(LATERAL.id);
    expect(groups()).toHaveLength(1);

    store().detachFromSupersetGroup(logged(LATERAL.id).id);
    store().addExercise(TIRAGE.id);
    expect(groups()).toHaveLength(0);
  });

  it("une paire liée une seule fois (Wide + Preacher, le 11/10) ne se lie pas", () => {
    startLike1510();
    store().addExercise(WIDE.id);
    store().addExercise(PREACHER.id);
    expect(groups()).toHaveLength(0);
    expect(store().undo).toBeNull();
  });

  it("un exercice déjà lié à la main à un autre n'est pas repris", () => {
    startLike1510();
    store().addExercise(WIDE.id);
    store().addExercise(PREACHER.id);
    store().handleSupersetLink(logged(WIDE.id).id);
    store().handleSupersetLink(logged(PREACHER.id).id);
    expect(groups()).toHaveLength(1);

    store().addExercise(LATERAL.id);
    expect(groups()).toHaveLength(1);
    expect(logged(LATERAL.id).supersetGroupId).toBeNull();
  });

  it("une séance reprise ou un modèle qui contient les deux part déjà lié", () => {
    store().hydrate({
      catalog: CATALOG,
      history: HISTORY_BEFORE_1510,
      goals: [],
      settings: SETTINGS,
      templates: [
        {
          id: "t-haut",
          name: "Haut",
          createdAt: new Date("2026-10-01T00:00:00Z"),
          sortOrder: 0,
          exercises: [
            { exerciseName: WIDE.name, orderIndex: 0, targetSets: 4 },
            { exerciseName: PREACHER.name, orderIndex: 1, targetSets: 3 },
            { exerciseName: LATERAL.name, orderIndex: 2, targetSets: 4 },
          ],
        },
      ],
      recoveryCheckins: [],
      bodyWeights: [],
    });
    store().startFromTemplate("t-haut", "normal");
    expect(groups()).toHaveLength(1);
    const order = [...store().active!.exercises].sort((a, b) => a.orderIndex - b.orderIndex).map((exercise) => exercise.exerciseId);
    expect(order).toEqual([WIDE.id, LATERAL.id, PREACHER.id]); // Lateral rejoint Wide
    expect(store().undo?.message).toBe("Superset Wide Chest Press Technogym + Lateral raises (lié 2 fois ces 4 semaines)");
  });
});
