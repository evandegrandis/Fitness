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
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
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
  gender: null,
  ageYears: null,
  trainingPhase: null,
  trainingPhaseStartedAt: null,
  weeklyCardioMinutesGoal: null,
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

const CURL: ExerciseType = {
  ...BENCH,
  id: "ex-curl",
  name: "Curl debout",
  category: "pull",
  repTargetMin: 6,
  repTargetMax: 10,
  smallestIncrement: 2,
  fatigueClass: "medium",
};

function resetStore() {
  useWorkoutStore.setState({
    catalog: [],
    history: [],
    goals: [],
    settings: SETTINGS,
    templates: [],
    recoveryCheckins: [],
    bodyWeights: [],
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
    pendingVariantSwitches: {},
    treatedVariantSuggestions: {},
    rotationAcceptedAt: {},
  });
}

function singleExerciseHistory(
  exercise: ExerciseType,
  id: string,
  daysAgo: number,
  weight: number,
  reps: number
) {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return {
    id,
    date,
    startTime: date,
    endTime: date,
    notes: "",
    isActive: false,
    templateName: null,
    exercises: [{
      id: `logged-${id}`,
      orderIndex: 0,
      notes: "",
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      supersetGroupId: null,
      plateauWeakPoint: null,
      sets: [{
        id: `set-${id}`,
        weight,
        reps,
        setType: "work" as const,
        timestamp: date,
        setSlotIndex: 0,
        completed: true,
        supersetRoundIndex: null,
      }],
    }],
    supersetGroups: [],
    cardioEntries: [],
  };
}

/**
 * Première séance qui pose la référence de l'exercice : 3 séries (règle d'étalonnage, records.ts).
 * Sans elle, aucune série suivante ne peut être un record.
 */
function baselineHistory(exercise: ExerciseType, id: string, daysAgo: number, weight: number, reps: number) {
  const session = singleExerciseHistory(exercise, id, daysAgo, weight, reps);
  const [template] = session.exercises[0].sets;
  return {
    ...session,
    exercises: [{
      ...session.exercises[0],
      sets: [0, 1, 2].map((i) => ({
        ...template,
        id: `${template.id}-${i}`,
        setSlotIndex: i,
        timestamp: new Date(template.timestamp.getTime() + i * 180_000),
      })),
    }],
  };
}

describe("useWorkoutStore", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it("normalise un historique importé avant que repeatLast et les moteurs ne lisent history[0]", () => {
    const makeSession = (id: string, iso: string) => ({
      id,
      date: new Date(iso),
      startTime: new Date(iso),
      endTime: new Date(iso),
      notes: "",
      isActive: false,
      templateName: null,
      exercises: [],
      supersetGroups: [],
      cardioEntries: [],
    });
    const oldest = makeSession("oldest", "2026-07-01T10:00:00Z");
    const newest = makeSession("newest", "2026-07-15T10:00:00Z");
    const middle = makeSession("middle", "2026-07-08T10:00:00Z");

    useWorkoutStore.getState().hydrate({
      catalog: [],
      history: [oldest, newest, middle],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
      bodyWeights: [],
    });

    expect(useWorkoutStore.getState().history.map((session) => session.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("un PR masque le contexte antérieur, mais pas la fatigue réellement accumulée après lui", () => {
    const OTHER: ExerciseType = { ...BENCH, id: "ex-other", name: "Autre poussée" };
    const at = (minute: number) => new Date(`2026-08-09T18:${String(minute).padStart(2, "0")}:00Z`);
    const prSet = {
      id: "pr-set",
      weight: 80,
      reps: 8,
      setType: "work" as const,
      timestamp: at(10),
      setSlotIndex: 0,
      completed: true,
      supersetRoundIndex: null,
    };
    const otherSets = (minutes: number[]) =>
      minutes.map((minute, index) => ({
        id: `other-${minute}`,
        weight: 60,
        reps: 8,
        setType: "work" as const,
        timestamp: at(minute),
        setSlotIndex: index,
        completed: true,
        supersetRoundIndex: null,
      }));
    const activeWith = (minutes: number[]) => ({
      id: "active-pr",
      date: at(0),
      startTime: at(0),
      endTime: null,
      notes: "",
      isActive: true,
      templateName: null,
      exercises: [
        {
          id: "logged-bench",
          orderIndex: 0,
          notes: "",
          exerciseId: BENCH.id,
          exerciseName: BENCH.name,
          sets: [prSet],
          supersetGroupId: null,
          plateauWeakPoint: null,
        },
        {
          id: "logged-other",
          orderIndex: 1,
          notes: "",
          exerciseId: OTHER.id,
          exerciseName: OTHER.name,
          sets: otherSets(minutes),
          supersetGroupId: null,
          plateauWeakPoint: null,
        },
      ],
      supersetGroups: [],
      cardioEntries: [],
    });

    useWorkoutStore.setState({
      catalog: [BENCH, OTHER],
      active: activeWith([11, 12, 13]),
      justHitRecord: { [prSet.id]: "heaviestWeight" },
    });
    expect(useWorkoutStore.getState().suggestion("logged-bench").sessionFatigueWarning).not.toBeNull();

    useWorkoutStore.setState({ active: activeWith([1, 2, 3]) });
    expect(useWorkoutStore.getState().suggestion("logged-bench").sessionFatigueWarning).toBeNull();
  });

  it("un finisher tardif de la cible n'étend pas sa baseline de fatigue au travail fait après le bloc normal", () => {
    const OTHER: ExerciseType = { ...BENCH, id: "ex-other", name: "Autre poussée" };
    const at = (day: number, minute: number) =>
      new Date(`2026-08-${String(day).padStart(2, "0")}T18:${String(minute).padStart(2, "0")}:00Z`);
    const makeSet = (id: string, timestamp: Date, setType: "work" | "finisher" = "work") => ({
      id,
      weight: setType === "finisher" ? 0 : 60,
      reps: setType === "finisher" ? 20 : 8,
      setType,
      timestamp,
      setSlotIndex: 0,
      completed: true,
      supersetRoundIndex: null,
    });
    const logged = (
      id: string,
      exercise: ExerciseType,
      sets: ReturnType<typeof makeSet>[],
      orderIndex: number
    ) => ({
      id,
      orderIndex,
      notes: "",
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sets,
      supersetGroupId: null,
      plateauWeakPoint: null,
    });
    const historical = {
      id: "historical",
      date: at(1, 0),
      startTime: at(1, 0),
      endTime: at(1, 55),
      notes: "",
      isActive: false,
      templateName: null,
      exercises: [
        logged("old-target", BENCH, [
          makeSet("old-work", at(1, 10)),
          makeSet("old-finisher", at(1, 50), "finisher"),
        ], 0),
        logged("old-other", OTHER, [
          makeSet("old-other-1", at(1, 30)),
          { ...makeSet("old-other-2", at(1, 31)), setSlotIndex: 1 },
          { ...makeSet("old-other-3", at(1, 32)), setSlotIndex: 2 },
        ], 1),
      ],
      supersetGroups: [],
      cardioEntries: [],
    };
    const active = {
      ...historical,
      id: "active-baseline",
      date: at(9, 0),
      startTime: at(9, 0),
      endTime: null,
      isActive: true,
      exercises: [
        logged("target-now", BENCH, [], 0),
        logged("other-now", OTHER, [
          makeSet("now-other-1", at(9, 10)),
          { ...makeSet("now-other-2", at(9, 11)), setSlotIndex: 1 },
          { ...makeSet("now-other-3", at(9, 12)), setSlotIndex: 2 },
        ], 1),
      ],
    };

    useWorkoutStore.setState({
      catalog: [BENCH, OTHER],
      history: [historical],
      active,
      justHitRecord: {},
    });
    expect(useWorkoutStore.getState().suggestion("target-now").sessionFatigueWarning).not.toBeNull();
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
      bodyWeights: [],
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

    // 7. finish() -> le minimum est 6 reps : les deux séries comptent (ancien seuil 8 : une seule).
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
              plateauWeakPoint: null,
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
      bodyWeights: [],
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

  it("remplacer un exercice qui porte des séries se rattrape par « Annuler », pas un exercice vide", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, CURL, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const logged = useWorkoutStore.getState().active!.exercises;
    const bench = logged.find((e) => e.exerciseId === BENCH.id)!;
    const dips = logged.find((e) => e.exerciseId === DIPS.id)!;
    store.logSet(bench.id, { weight: 80, reps: 8 });

    // Machine prise avant la première série : rien à annuler, pas de toast parasite.
    store.replaceExercise(dips.id, CURL.id);
    expect(useWorkoutStore.getState().undo).toBeNull();

    store.replaceExercise(bench.id, DIPS.id);
    const replaced = useWorkoutStore.getState().active!.exercises.find((e) => e.id === bench.id)!;
    expect(replaced.exerciseId).toBe(DIPS.id);
    expect(replaced.sets).toHaveLength(0);
    expect(useWorkoutStore.getState().undo?.message).toBe("Développé couché remplacé");

    useWorkoutStore.getState().undoLastAction();
    const restored = useWorkoutStore.getState().active!.exercises.find((e) => e.id === bench.id)!;
    expect(restored.exerciseId).toBe(BENCH.id);
    expect(restored.sets.map((set) => [set.weight, set.reps])).toEqual([[80, 8]]);
  });

  it("discard() efface la séance active sans la déplacer vers history", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    expect(useWorkoutStore.getState().active).not.toBeNull();

    store.discard();
    expect(useWorkoutStore.getState().active).toBeNull();
    expect(useWorkoutStore.getState().history).toHaveLength(0);
  });

  it("propose de compléter immédiatement un mini-set sans le compter comme deux séries", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;

    store.logSet(loggedExerciseId, { weight: 100, reps: 4 });
    const completion = useWorkoutStore.getState().suggestion(loggedExerciseId);

    expect(completion.reasonCodes).toContain("logical_set_completion");
    expect(completion.weight).toBe(97.5);
    expect(completion.reps).toBe(4);
    expect(completion.setType).toBe("work");

    // Rend le signal temporel non ambigu (les imports à timestamp identique ne
    // sont volontairement jamais fusionnés), puis complète bien à 4+4=8.
    useWorkoutStore.setState((state) => ({
      active: state.active
        ? {
            ...state.active,
            exercises: state.active.exercises.map((logged) =>
              logged.id === loggedExerciseId
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
    store.logSet(loggedExerciseId, {
      weight: completion.weight,
      reps: completion.reps,
      setType: completion.setType,
      suggestedWeight: completion.weight,
      suggestedReps: completion.reps,
      suggestedSetType: completion.setType,
      suggestionMode: completion.mode,
      suggestionReasonCodes: completion.reasonCodes,
    });

    const afterCompletion = useWorkoutStore.getState().suggestion(loggedExerciseId);
    expect(afterCompletion.reasonCodes).not.toContain("drop_set_completion");
    expect(useWorkoutStore.getState().finish()!.snapshot.setCount).toBe(1);
  });

  it.each([0, 1])(
    "ne propose jamais une complétion absurde après 18×7 à RIR %i",
    (reportedRir) => {
      const store = useWorkoutStore.getState();
      store.hydrate({ catalog: [CURL], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
      store.startEmpty("normal");
      store.addExercise(CURL.id);
      const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;

      store.logSet(loggedExerciseId, { weight: 18, reps: 7, reportedRir });
      const next = useWorkoutStore.getState().suggestion(loggedExerciseId);

      expect(next.reasonCodes).not.toContain("logical_set_completion");
      // Cible à battre (`target.ts`, 11/10/2026) : la charge portée est gardée, les reps sont la prévision
      // à cette charge ; elle ne décroche que nettement sous la fourchette.
      expect(next.weight).toBe(18);
      expect(next.prediction).toBeDefined();
      // Reps = prévision à cette charge + marge d'ambition (négative sans historique : une prévision juste
      // n'est battue que 45 % du temps) ; jamais une mini-série de complément.
      expect(next.reps).toBe(Math.max(1, Math.round(next.ambition!.predictedReps + next.ambition!.margin)));
      expect(next.reps).toBeGreaterThanOrEqual(CURL.repTargetMin - 2);
    }
  );

  it("ne fusionne pas deux mini-séries séparées par un autre exercice", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const benchLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === BENCH.id)!;
    const dipsLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === DIPS.id)!;

    store.logSet(benchLogged.id, { weight: 100, reps: 5 });
    store.logSet(dipsLogged.id, { weight: 0, reps: 8 });
    const completion = useWorkoutStore.getState().suggestion(benchLogged.id);
    store.logSet(benchLogged.id, {
      weight: 97.5,
      reps: 5,
      suggestionReasonCodes: completion.reasonCodes,
    });

    const benchSets = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === BENCH.id)!.sets;
    expect(benchSets[0].logicalSetId).not.toBe(benchSets[1].logicalSetId);
  });

  it("répare les groupes logiques et invalide la projection quand un set est édité", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;

    store.logSet(loggedExerciseId, { weight: 85, reps: 5 });
    const completion = useWorkoutStore.getState().suggestion(loggedExerciseId);
    store.logSet(loggedExerciseId, {
      weight: 75,
      reps: 8,
      predictedRepsAtActualWeight: 5,
      suggestionReasonCodes: completion.reasonCodes,
    });
    const before = useWorkoutStore.getState().active!.exercises[0].sets;
    expect(before[0].logicalSetId).toBe(before[1].logicalSetId);

    store.editSet(before[0].id, { weight: 85, reps: 10 });
    const after = useWorkoutStore.getState().active!.exercises[0].sets;
    // Les deux séries restent liées : 85→75 enchaîné est un DROP-SET, une technique qui ne dépend
    // pas du nombre de reps de la série d'ouverture (avant, le lien tenait au fait qu'elle était
    // « incomplète » à 5 reps, et l'édition à 10 le rompait).
    expect(after[0].logicalSetId).toBe(after[1].logicalSetId);
    expect(after[1].setTechnique).toBe("drop_set");
    store.editSet(after[1].id, { weight: 75, reps: 8 });
    expect(useWorkoutStore.getState().active!.exercises[0].sets[1].predictedRepsAtActualWeight).toBeNull();
    // Un drop-set reste une seule série physiologique : 10 + 8 reps = 1 unité.
    expect(useWorkoutStore.getState().finish()!.snapshot.setCount).toBe(1);
  });

  it("garde la continuation immédiate d'un drop-set dans le même round de superset", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const benchLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === BENCH.id)!;
    const dipsLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === DIPS.id)!;
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

  it("propose — sans l'imposer — un finisher pour un set tardif de dips", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const benchLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === BENCH.id)!;
    const dipsLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === DIPS.id)!;

    // 10 séries effectives ouvrent la porte de position sans attendre 40 minutes.
    for (let index = 0; index < 10; index += 1) {
      store.logSet(benchLogged.id, { weight: 80, reps: 8 });
    }
    store.logSet(dipsLogged.id, { weight: 0, reps: 16 });

    // Le reclassement silencieux a disparu : la série reste une série de travail…
    const logged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.id === dipsLogged.id)!.sets[0];
    expect(logged.setType).toBe("work");
    // …et c'est une proposition explicite qui est mise en attente.
    const prompt = useWorkoutStore.getState().pendingFinisherPrompt;
    expect(prompt).toMatchObject({ setId: logged.id, loggedExerciseId: dipsLogged.id, reason: "late_addition" });

    useWorkoutStore.getState().confirmFinisherPrompt();

    const finisher = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.id === dipsLogged.id)!.sets[0];
    expect(finisher.setType).toBe("finisher");
    expect(useWorkoutStore.getState().pendingFinisherPrompt).toBeNull();
    // Requalifier retire l'étoile de la piste NORMALE et n'en décerne aucune sur la piste
    // finisher : battre un finisher se ferait en baissant la charge (décision du 18/08/2026).
    expect(useWorkoutStore.getState().justHitRecord[finisher.id]).toBeUndefined();
    expect(useWorkoutStore.getState().records(DIPS.id).isEmpty).toBe(true);

    const result = useWorkoutStore.getState().finish()!;
    expect(result.snapshot.setCount).toBe(11);
    expect(result.snapshot.exerciseCount).toBe(2);
    // Le bench garde ses PR ; seul le finisher Dips n'en décroche aucun.
    expect(result.snapshot.prHighlights.some((pr) => pr.title === DIPS.name)).toBe(false);
  });

  it("propose un finisher au retour sur un exercice déjà travaillé (cas HSPU d'Evan)", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(DIPS.id);
    store.addExercise(BENCH.id);
    const [dipsLogged, benchLogged] = useWorkoutStore.getState().active!.exercises;

    // Bloc de travail sur les dips, puis on passe à un autre exercice…
    for (let index = 0; index < 10; index += 1) {
      store.logSet(dipsLogged.id, { weight: 0, reps: 10 });
    }
    store.logSet(benchLogged.id, { weight: 80, reps: 8 });
    useWorkoutStore.getState().dismissFinisherPrompt();

    // …puis on revient sur les dips pour une série courte : c'est le finisher.
    store.logSet(dipsLogged.id, { weight: 0, reps: 3 });

    expect(useWorkoutStore.getState().pendingFinisherPrompt).toMatchObject({
      loggedExerciseId: dipsLogged.id,
      reason: "late_return",
    });
  });

  it("ne repose plus la question sur un exercice où le finisher a été refusé", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DIPS], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(DIPS.id);
    const benchLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === BENCH.id)!;
    const dipsLogged = useWorkoutStore.getState().active!.exercises.find((exercise) => exercise.exerciseId === DIPS.id)!;

    for (let index = 0; index < 10; index += 1) {
      store.logSet(benchLogged.id, { weight: 80, reps: 8 });
    }
    store.logSet(dipsLogged.id, { weight: 0, reps: 16 });
    expect(useWorkoutStore.getState().pendingFinisherPrompt).not.toBeNull();

    useWorkoutStore.getState().dismissFinisherPrompt();
    expect(useWorkoutStore.getState().pendingFinisherPrompt).toBeNull();

    // Deuxième série tardive sur le même exercice : plus aucune sollicitation.
    store.logSet(dipsLogged.id, { weight: 0, reps: 18 });
    expect(useWorkoutStore.getState().pendingFinisherPrompt).toBeNull();
    expect(
      useWorkoutStore.getState().active!.exercises
        .find((exercise) => exercise.id === dipsLogged.id)!
        .sets.every((set) => set.setType === "work")
    ).toBe(true);
  });

  it("ajoute et supprime le cardio sans créer de set de musculation", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");

    store.addCardioEntry({
      activityType: "other",
      activityName: "Cardio",
      machineName: null,
      machineModel: null,
      durationSeconds: 120,
      level: 10,
      resistance: null,
      distanceKm: 1,
      averageWatts: null,
      averageHeartRateBpm: null,
      inclinePercent: null,
    });
    const entry = useWorkoutStore.getState().active!.cardioEntries![0];
    expect(entry).toMatchObject({ activityName: "Cardio", durationSeconds: 120, level: 10, distanceKm: 1 });
    expect(useWorkoutStore.getState().active!.exercises).toHaveLength(0);

    store.deleteCardioEntry(entry.id);
    expect(useWorkoutStore.getState().active!.cardioEntries).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // VARIATION_CYCLING_SPEC §8 — rotation de variation acceptée/refusée depuis le bilan
  // -------------------------------------------------------------------------

  it("acceptVariantSwitch() sans séance active en attente -> pendingVariantSwitches puis consommé au prochain repeatLast()", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();
    const lastSession = {
      id: "sess-last",
      date: new Date("2026-07-01T10:00:00"),
      startTime: new Date("2026-07-01T10:00:00"),
      endTime: new Date("2026-07-01T11:00:00"),
      notes: "",
      isActive: false,
      templateName: null,
      exercises: [
        {
          id: "logged-last-1",
          orderIndex: 0,
          notes: "",
          exerciseId: BENCH.id,
          exerciseName: BENCH.name,
          supersetGroupId: null,
          plateauWeakPoint: null,
          sets: [
            {
              id: "set-last-1",
              weight: 60,
              reps: 8,
              setType: "work" as const,
              timestamp: new Date("2026-07-01T10:05:00"),
              setSlotIndex: 0,
              completed: true,
              supersetRoundIndex: null,
            },
          ],
        },
      ],
      supersetGroups: [],
    };
    store.hydrate({ catalog: [BENCH, DUMBBELL], history: [lastSession], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });

    // Pas de séance active (bilan traité après coup, typiquement) -> reste en attente.
    store.acceptVariantSwitch("sess-last", BENCH.id, DUMBBELL.id);
    expect(useWorkoutStore.getState().pendingVariantSwitches[BENCH.id]).toBe(DUMBBELL.id);
    expect(useWorkoutStore.getState().active).toBeNull();

    // La PROCHAINE séance (repeatLast, base = lastSession) reçoit la variante, pas l'original.
    store.repeatLast("normal");
    const active = useWorkoutStore.getState().active!;
    expect(active.exercises).toHaveLength(1);
    expect(active.exercises[0].exerciseId).toBe(DUMBBELL.id);
    expect(active.exercises[0].exerciseName).toBe("Développé haltères");
    // Consommé : ne doit plus traîner en attente pour une séance encore après.
    expect(useWorkoutStore.getState().pendingVariantSwitches[BENCH.id]).toBeUndefined();
  });

  it("acceptVariantSwitch() avec une séance active contenant déjà l'exercice (0 set) -> bascule immédiate, pas de pending", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DUMBBELL], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;

    store.acceptVariantSwitch("sess-x", BENCH.id, DUMBBELL.id);

    const active = useWorkoutStore.getState().active!;
    expect(active.exercises.find((e) => e.id === loggedExerciseId)?.exerciseId).toBe(DUMBBELL.id);
    expect(useWorkoutStore.getState().pendingVariantSwitches[BENCH.id]).toBeUndefined();
  });

  it("dismissVariantSwitch() masque la carte de suggestion (plateau.suggestedVariant) au prochain sessionReview() de CETTE séance", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();

    function pastSession(id: string, daysAgo: number, weight: number, reps: number) {
      const date = new Date(Date.now() - daysAgo * 86_400_000);
      return {
        id,
        date,
        startTime: date,
        endTime: date,
        notes: "",
        isActive: false,
        templateName: null,
        exercises: [
          {
            id: `logged-${id}`,
            orderIndex: 0,
            notes: "",
            exerciseId: BENCH.id,
            exerciseName: BENCH.name,
            supersetGroupId: null,
            plateauWeakPoint: null,
            sets: [
              {
                id: `set-${id}`,
                weight,
                reps,
                setType: "work" as const,
                timestamp: date,
                setSlotIndex: 0,
                completed: true,
                supersetRoundIndex: null,
              },
            ],
          },
        ],
        supersetGroups: [],
      };
    }

    const history = [pastSession("h1", 3, 60, 8), pastSession("h2", 10, 60, 8), pastSession("h3", 17, 60, 8), pastSession("h4", 24, 60, 8)];
    const todaySession = pastSession("today", 0, 60, 8);

    store.hydrate({ catalog: [BENCH, DUMBBELL], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });

    const before = useWorkoutStore.getState().sessionReview(todaySession);
    expect(before.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(before.exercises[0].plateau.suggestedVariant).not.toBeNull();

    store.dismissVariantSwitch(todaySession.id, BENCH.id);

    const after = useWorkoutStore.getState().sessionReview(todaySession);
    expect(after.exercises[0].plateau.suggestedVariant).toBeNull();
    // Rien planifié : refuser n'est pas accepter.
    expect(useWorkoutStore.getState().pendingVariantSwitches[BENCH.id]).toBeUndefined();
  });

  it("setPlateauWeakPoint() capture le point faible sur la séance du jour (déjà dans history, comme après finish()) — reflété immédiatement par sessionReview()", () => {
    const DUMBBELL_LOCKOUT: ExerciseType = {
      ...BENCH,
      id: "ex-dumbbell-lockout",
      name: "Développé haltères",
      resistanceProfile: "lockout",
    };
    const store = useWorkoutStore.getState();

    function pastSession(id: string, daysAgo: number, weight: number, reps: number) {
      const date = new Date(Date.now() - daysAgo * 86_400_000);
      return {
        id,
        date,
        startTime: date,
        endTime: date,
        notes: "",
        isActive: false,
        templateName: null,
        exercises: [
          {
            id: `logged-${id}`,
            orderIndex: 0,
            notes: "",
            exerciseId: BENCH.id,
            exerciseName: BENCH.name,
            supersetGroupId: null,
            plateauWeakPoint: null,
            sets: [
              {
                id: `set-${id}`,
                weight,
                reps,
                setType: "work" as const,
                timestamp: date,
                setSlotIndex: 0,
                completed: true,
                supersetRoundIndex: null,
              },
            ],
          },
        ],
        supersetGroups: [],
      };
    }

    const olderHistory = [pastSession("h1", 3, 60, 8), pastSession("h2", 10, 60, 8), pastSession("h3", 17, 60, 8), pastSession("h4", 24, 60, 8)];
    const todaySession = pastSession("today", 0, 60, 8);
    // Simule l'état réel post-`finish()` : la séance en cours de revue vit DÉJÀ dans `history`
    // (voir `finish()` : `history: [finishedSession, ...state.history]`) — c'est là que
    // `setPlateauWeakPoint` doit muter, pas sur une séance active inexistante.
    store.hydrate({
      catalog: [BENCH, DUMBBELL_LOCKOUT],
      history: [todaySession, ...olderHistory],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
      bodyWeights: [],
    });

    const before = useWorkoutStore.getState().sessionReview(todaySession);
    expect(before.exercises[0].plateau.wasInPlateau).toBe(true);
    expect(before.exercises[0].plateau.weakPoint).toBeNull();
    expect(before.exercises[0].plateau.needsWeakPointCapture).toBe(true);

    store.setPlateauWeakPoint(todaySession.id, "logged-today", "lockout");

    // Persisté dans le store (pas seulement dérivé) : relecture directe de `history`.
    const stored = useWorkoutStore.getState().history.find((s) => s.id === todaySession.id);
    expect(stored?.exercises[0].plateauWeakPoint).toBe("lockout");

    // `sessionReview(todaySession)` est appelé avec la référence FIGÉE d'avant la capture (comme
    // le ferait un composant qui a reçu `session` en prop) — doit malgré tout refléter la capture
    // fraîche (fix P2.1 : `sessionReview` relit toujours `history` par id, jamais le paramètre brut).
    const after = useWorkoutStore.getState().sessionReview(todaySession);
    expect(after.exercises[0].plateau.weakPoint).toBe("lockout");
    expect(after.exercises[0].plateau.needsWeakPointCapture).toBe(false);
    // weakPointFit désormais actif (candidat resistanceProfile="lockout" matche) -> annoncé dans l'explication (§6).
    expect(after.exercises[0].plateau.suggestedVariant).not.toBeNull();
    expect(after.exercises[0].plateau.suggestedVariant!.explanationFR).toContain("point faible");
  });

  // -------------------------------------------------------------------------
  // Anti-thrash — cooldown après rotation acceptée (VARIATION_CYCLING_SPEC §8, P2.3)
  // -------------------------------------------------------------------------

  function pastSessionFor(exerciseId: string, exerciseName: string, id: string, daysAgo: number, weight: number, reps: number) {
    const date = new Date(Date.now() - daysAgo * 86_400_000);
    return {
      id,
      date,
      startTime: date,
      endTime: date,
      notes: "",
      isActive: false,
      templateName: null,
      exercises: [
        {
          id: `logged-${id}`,
          orderIndex: 0,
          notes: "",
          exerciseId,
          exerciseName,
          supersetGroupId: null,
          plateauWeakPoint: null,
          sets: [
            {
              id: `set-${id}`,
              weight,
              reps,
              setType: "work" as const,
              timestamp: date,
              setSlotIndex: 0,
              completed: true,
              supersetRoundIndex: null,
            },
          ],
        },
      ],
      supersetGroups: [],
    };
  }

  it("acceptVariantSwitch() horodate rotationAcceptedAt[newExerciseId] (P2.3)", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH, DUMBBELL], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });

    expect(useWorkoutStore.getState().rotationAcceptedAt[DUMBBELL.id]).toBeUndefined();
    store.acceptVariantSwitch("sess-x", BENCH.id, DUMBBELL.id);

    const iso = useWorkoutStore.getState().rotationAcceptedAt[DUMBBELL.id];
    expect(iso).toBeDefined();
    expect(Date.now() - new Date(iso).getTime()).toBeLessThan(5_000);
    // La cible est bien la variante ADOPTÉE (newExerciseId), pas celle quittée.
    expect(useWorkoutStore.getState().rotationAcceptedAt[BENCH.id]).toBeUndefined();
  });

  it("cooldown ACTIF (rotation acceptée il y a 2j < ROTATION_COOLDOWN_DAYS=14) -> sessionReview() gèle suggestedVariant/needsWeakPointCapture MÊME si l'exo est de nouveau en plateau", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();
    const olderHistory = [
      pastSessionFor(BENCH.id, BENCH.name, "h1", 3, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h2", 10, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h3", 17, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h4", 24, 60, 8),
    ];
    const todaySession = pastSessionFor(BENCH.id, BENCH.name, "today", 0, 60, 8);
    store.hydrate({
      catalog: [BENCH, DUMBBELL],
      history: [todaySession, ...olderHistory],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
      bodyWeights: [],
    });

    // Sans cooldown : la carte apparaît normalement (comportement P1.6/P2.1 déjà couvert ailleurs).
    const before = useWorkoutStore.getState().sessionReview(todaySession);
    expect(before.exercises[0].plateau.suggestedVariant).not.toBeNull();

    // Simule une rotation ACCEPTÉE vers BENCH il y a 2 jours (P2.3 : `acceptVariantSwitch` l'aurait
    // fait naturellement ; on force directement l'état pour isoler le comportement du cooldown).
    useWorkoutStore.setState({
      rotationAcceptedAt: { [BENCH.id]: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    });

    const after = useWorkoutStore.getState().sessionReview(todaySession);
    expect(after.exercises[0].plateau.wasInPlateau).toBe(true); // le plateau lui-même reste vrai...
    expect(after.exercises[0].plateau.suggestedVariant).toBeNull(); // ...mais la carte est gelée.
    expect(after.exercises[0].plateau.needsWeakPointCapture).toBe(false);
  });

  it("cooldown EXPIRÉ (rotation acceptée il y a 20j >= ROTATION_COOLDOWN_DAYS=14) -> la carte réapparaît normalement", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();
    const olderHistory = [
      pastSessionFor(BENCH.id, BENCH.name, "h1", 3, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h2", 10, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h3", 17, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h4", 24, 60, 8),
    ];
    const todaySession = pastSessionFor(BENCH.id, BENCH.name, "today", 0, 60, 8);
    store.hydrate({
      catalog: [BENCH, DUMBBELL],
      history: [todaySession, ...olderHistory],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
      bodyWeights: [],
    });
    useWorkoutStore.setState({
      rotationAcceptedAt: { [BENCH.id]: new Date(Date.now() - 20 * 86_400_000).toISOString() },
    });

    const review = useWorkoutStore.getState().sessionReview(todaySession);
    expect(review.exercises[0].plateau.suggestedVariant).not.toBeNull();
  });

  it("la suggestion LIVE (suggestion()) masque aussi switchToVariantId/reasonCodes pendant le cooldown anti-thrash", () => {
    const DUMBBELL: ExerciseType = { ...BENCH, id: "ex-dumbbell", name: "Développé haltères" };
    const store = useWorkoutStore.getState();
    const history = [
      pastSessionFor(BENCH.id, BENCH.name, "h1", 3, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h2", 10, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h3", 17, 60, 8),
      pastSessionFor(BENCH.id, BENCH.name, "h4", 24, 60, 8),
    ];
    store.hydrate({ catalog: [BENCH, DUMBBELL], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const loggedExerciseId = useWorkoutStore.getState().active!.exercises[0].id;
    store.logSet(loggedExerciseId, { weight: 60, reps: 8 });

    const withoutCooldown = useWorkoutStore.getState().suggestion(loggedExerciseId);
    expect(withoutCooldown.switchToVariantId).toBe(DUMBBELL.id);
    expect(withoutCooldown.reasonCodes).toContain("variation");

    useWorkoutStore.setState({
      rotationAcceptedAt: { [BENCH.id]: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    });

    const withCooldown = useWorkoutStore.getState().suggestion(loggedExerciseId);
    expect(withCooldown.switchToVariantId).toBeNull();
    expect(withCooldown.reasonCodes).not.toContain("variation");
  });
});

describe("records — un seul par type et par exercice dans la séance", () => {
  it("une montée en charge ne laisse qu'une étoile de poids max, sur la meilleure série", () => {
    const store = useWorkoutStore.getState();
    const history = [baselineHistory(BENCH, "ref", 7, 50, 8)];
    store.hydrate({ catalog: [BENCH], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const le = useWorkoutStore.getState().active!.exercises[0];

    // Montée progressive : chaque série bat la précédente en poids max.
    store.logSet(le.id, { weight: 60, reps: 8 });
    store.logSet(le.id, { weight: 70, reps: 8 });
    store.logSet(le.id, { weight: 80, reps: 8 });

    const sets = useWorkoutStore.getState().active!.exercises[0].sets;
    const marks = useWorkoutStore.getState().justHitRecord;
    const heaviest = sets.filter((s) => marks[s.id] === "heaviestWeight");

    expect(heaviest).toHaveLength(1);
    expect(heaviest[0].weight).toBe(80);
  });

  it("ne crée pas de faux record sur une charge dominée par l'historique", () => {
    const store = useWorkoutStore.getState();
    const history = [
      singleExerciseHistory(BENCH, "curl-20", 3, 20, 7),
      singleExerciseHistory(BENCH, "curl-18", 6, 18, 9),
    ];
    store.hydrate({ catalog: [BENCH], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const logged = useWorkoutStore.getState().active!.exercises[0];

    store.logSet(logged.id, { weight: 16, reps: 8 });

    const newSet = useWorkoutStore.getState().active!.exercises[0].sets[0];
    expect(useWorkoutStore.getState().justHitRecord[newSet.id]).toBeUndefined();
  });

  it("aucune étoile pendant la première séance d'un exercice, même en montant nettement", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const le = useWorkoutStore.getState().active!.exercises[0];

    store.logSet(le.id, { weight: 60, reps: 8 });
    store.logSet(le.id, { weight: 70, reps: 8 });
    store.logSet(le.id, { weight: 80, reps: 8 });

    expect(useWorkoutStore.getState().justHitRecord).toEqual({});
    expect(useWorkoutStore.getState().levelUp).toBeNull();
  });

  it("un palier franchi prend la place de l'annonce de record de la même série, l'étoile reste", () => {
    const PEC = { ...BENCH, id: "ex-pec", name: "Pec deck", strengthStandardKey: "Pec deck" };
    const EVAN = { ...SETTINGS, gender: "male" as const, ageYears: 26, bodyWeightKg: 73.7 };
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [PEC], history: [baselineHistory(PEC, "ref", 7, 50, 8)], goals: [], settings: EVAN, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(PEC.id);
    const le = useWorkoutStore.getState().active!.exercises[0];

    store.logSet(le.id, { weight: 80, reps: 8 });

    const state = useWorkoutStore.getState();
    const newSet = state.active!.exercises[0].sets[0];
    expect(state.levelUp).not.toBeNull();
    expect(state.achievement?.setId).not.toBe(newSet.id);
    expect(state.justHitRecord[newSet.id]).toBeDefined();
  });

  it("compare aussi avec une autre occurrence du même exercice dans la séance active", () => {
    const store = useWorkoutStore.getState();
    const history = [baselineHistory(BENCH, "ref", 7, 10, 8)];
    store.hydrate({ catalog: [BENCH], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    store.addExercise(BENCH.id);
    const occurrences = useWorkoutStore.getState().active!.exercises;

    store.logSet(occurrences[0].id, { weight: 18, reps: 9 });
    store.logSet(occurrences[1].id, { weight: 16, reps: 8 });

    const firstSet = useWorkoutStore
      .getState()
      .active!.exercises.find((exercise) => exercise.id === occurrences[0].id)!.sets[0];
    const secondSet = useWorkoutStore
      .getState()
      .active!.exercises.find((exercise) => exercise.id === occurrences[1].id)!.sets[0];
    expect(useWorkoutStore.getState().justHitRecord[firstSet.id]).toBe("heaviestWeight");
    expect(useWorkoutStore.getState().justHitRecord[secondSet.id]).toBeUndefined();
  });

  it("nettoie au rechargement une ancienne étoile devenue incohérente", () => {
    const store = useWorkoutStore.getState();
    const history = [singleExerciseHistory(BENCH, "stronger", 3, 18, 9)];
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const logged = useWorkoutStore.getState().active!.exercises[0];
    store.logSet(logged.id, { weight: 16, reps: 8 });
    const setId = useWorkoutStore.getState().active!.exercises[0].sets[0].id;
    useWorkoutStore.setState({ justHitRecord: { [setId]: "repsAtWeight" } });

    store.hydrate({ catalog: [BENCH], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });

    expect(useWorkoutStore.getState().justHitRecord[setId]).toBeUndefined();
  });
});

describe("séries complémentaires au log — le cas Pec deck du 18/08", () => {
  it("rattache une série courte, mais pas une vraie série qui suit", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [BENCH], history: [], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(BENCH.id);
    const le = useWorkoutStore.getState().active!.exercises[0];

    // 85×7 puis 65×2 : deux reps ne sont pas une série de travail, elles complètent (→ 9 reps).
    store.logSet(le.id, { weight: 85, reps: 7 });
    store.logSet(le.id, { weight: 65, reps: 2 });
    // 72,5×7 est une vraie série : elle ouvre son propre bloc même enchaînée.
    store.logSet(le.id, { weight: 72.5, reps: 7 });

    const sets = useWorkoutStore.getState().active!.exercises[0].sets;
    expect(sets).toHaveLength(3);
    expect(sets[1].logicalSetId).toBe(sets[0].logicalSetId);
    expect(sets[2].logicalSetId).not.toBe(sets[0].logicalSetId);
    expect(useWorkoutStore.getState().finish()!.snapshot.setCount).toBe(2);
  });
});

describe("machines équivalentes — la dernière utilisée devient la machine par défaut", () => {
  const OLD_PRESS: ExerciseType = { ...BENCH, id: "ex-cp-old", name: "Chest Press" };
  const NEW_PRESS: ExerciseType = { ...BENCH, id: "ex-cp-lf", name: "Chest Press LifeFitness" };

  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it("un modèle écrit avec l'ancienne machine ouvre la dernière utilisée", () => {
    const store = useWorkoutStore.getState();
    const history = [
      baselineHistory(OLD_PRESS, "old-1", 21, 100, 10),
      baselineHistory(NEW_PRESS, "new-1", 7, 72.5, 10),
    ];
    const template = {
      id: "tpl-push",
      name: "Push",
      createdAt: new Date(),
      sortOrder: 0,
      exercises: [{ exerciseName: "Chest Press", orderIndex: 0, targetSets: 3 }],
    };
    store.hydrate({ catalog: [OLD_PRESS, NEW_PRESS], history, goals: [], settings: SETTINGS, templates: [template], recoveryCheckins: [], bodyWeights: [] });
    store.startFromTemplate("tpl-push", "normal");

    const exercises = useWorkoutStore.getState().active!.exercises;
    expect(exercises.map((e) => e.exerciseName)).toEqual(["Chest Press LifeFitness"]);
  });

  it("la suggestion reprend la dernière séance faite sur l'autre machine, convertie", () => {
    const store = useWorkoutStore.getState();
    const history = [
      baselineHistory(OLD_PRESS, "old-1", 21, 100, 10),
      baselineHistory(NEW_PRESS, "new-1", 14, 72.5, 10),
      baselineHistory(OLD_PRESS, "old-2", 3, 105, 10),
    ];
    store.hydrate({ catalog: [OLD_PRESS, NEW_PRESS], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(NEW_PRESS.id);
    const logged = useWorkoutStore.getState().active!.exercises[0];

    const suggestion = useWorkoutStore.getState().suggestion(logged.id);
    expect(suggestion.explanation).toContain("D'après Chest Press");
    expect(suggestion.reasonCodes).toContain("equivalent_conversion");
    // Dans les charges de la LifeFitness (≈ 0,72 × l'ancienne), pas dans celles de l'ancienne.
    expect(suggestion.weight).toBeGreaterThanOrEqual(65);
    expect(suggestion.weight).toBeLessThanOrEqual(85);
  });

  it("les records restent propres à chaque machine", () => {
    const store = useWorkoutStore.getState();
    const history = [
      baselineHistory(OLD_PRESS, "old-1", 21, 100, 10),
      baselineHistory(NEW_PRESS, "new-1", 14, 72.5, 10),
    ];
    store.hydrate({ catalog: [OLD_PRESS, NEW_PRESS], history, goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    expect(useWorkoutStore.getState().records(NEW_PRESS.id).heaviestEver).toBe(72.5);
    expect(useWorkoutStore.getState().records(OLD_PRESS.id).heaviestEver).toBe(100);
  });
});

describe("échauffement et fatigue : seulement quand c'est justifié", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it("pas d'échauffement proposé sur une machine d'isolation, même lourde", () => {
    const ABS: ExerciseType = { ...BENCH, id: "ex-abs", name: "Abdominal LifeFitness", movementPattern: "isolation", fatigueClass: "medium" };
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [ABS], history: [baselineHistory(ABS, "abs-1", 3, 85, 12)], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(ABS.id);
    const logged = useWorkoutStore.getState().active!.exercises[0];
    expect(useWorkoutStore.getState().warmupSuggestion(logged.id)).toBeNull();
  });

  it("un exercice jamais fait n'est pas déclaré « fatigué » pour une fatigue habituelle", () => {
    // Evan fait toujours 4 séries de pec deck avant son développé : c'est son habitude, pas un excès.
    const PEC: ExerciseType = { ...BENCH, id: "ex-pec", name: "Pec deck", fatigueClass: "light", movementPattern: "isolation" };
    const OLD_PRESS: ExerciseType = { ...BENCH, id: "ex-press-old", name: "Chest Press", movementPattern: "horizontal_press" };
    const NEW_PRESS: ExerciseType = { ...BENCH, id: "ex-press-new", name: "Isolateral incline press", movementPattern: "horizontal_press" };
    const day = (d: number) => new Date(Date.now() - d * 86_400_000);
    const pastSession = (d: number) => {
      const start = day(d);
      const at = (m: number) => new Date(start.getTime() + m * 60_000);
      return {
        id: `past-${d}`, date: start, startTime: start, endTime: at(60), notes: "", isActive: false, templateName: null,
        supersetGroups: [], cardioEntries: [],
        exercises: [
          { id: `pec-${d}`, orderIndex: 0, notes: "", exerciseId: PEC.id, exerciseName: PEC.name, supersetGroupId: null, plateauWeakPoint: null,
            sets: [0, 1, 2, 3].map((k) => ({ id: `pec-${d}-${k}`, weight: 60, reps: 10, setType: "work" as const, timestamp: at(k * 3), setSlotIndex: k, completed: true, supersetRoundIndex: null })) },
          { id: `press-${d}`, orderIndex: 1, notes: "", exerciseId: OLD_PRESS.id, exerciseName: OLD_PRESS.name, supersetGroupId: null, plateauWeakPoint: null,
            sets: [0, 1, 2].map((k) => ({ id: `press-${d}-${k}`, weight: 80, reps: 10, setType: "work" as const, timestamp: at(20 + k * 3), setSlotIndex: k, completed: true, supersetRoundIndex: null })) },
        ],
      };
    };
    const store = useWorkoutStore.getState();
    store.hydrate({ catalog: [PEC, OLD_PRESS, NEW_PRESS], history: [pastSession(2), pastSession(4), pastSession(6)], goals: [], settings: SETTINGS, templates: [], recoveryCheckins: [], bodyWeights: [] });
    store.startEmpty("normal");
    store.addExercise(PEC.id);
    store.addExercise(NEW_PRESS.id);
    const exercises = useWorkoutStore.getState().active!.exercises;
    const pec = exercises.find((logged) => logged.exerciseId === PEC.id)!;
    const press = exercises.find((logged) => logged.exerciseId === NEW_PRESS.id)!;
    for (let k = 0; k < 4; k += 1) store.logSet(pec.id, { weight: 60, reps: 10 });
    expect(useWorkoutStore.getState().suggestion(press.id).sessionFatigueWarning).toBeNull();
  });
});

describe("startHabitual (séance du jour)", () => {
  it("démarre sur ses exercices récents, dans son ordre, avec le superset qu'il enchaîne d'habitude", () => {
    const past = (daysAgo: number, index: number) => {
      const start = new Date(Date.now() - daysAgo * 86_400_000);
      const at = (minute: number) => new Date(start.getTime() + minute * 60_000);
      const mk = (id: string, exercise: ExerciseType, orderIndex: number, minutes: number[]) => ({
        id: `${id}-${index}`,
        orderIndex,
        notes: "",
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        supersetGroupId: null,
        plateauWeakPoint: null,
        sets: minutes.map((minute, slot) => ({
          id: `${id}-${index}-${slot}`,
          weight: exercise.id === DIPS.id ? 0 : 40,
          reps: 10,
          setType: "work" as const,
          timestamp: at(minute),
          setSlotIndex: slot,
          completed: true,
          supersetRoundIndex: null,
        })),
      });
      return {
        id: `habit-${index}`,
        date: start,
        startTime: start,
        endTime: at(40),
        notes: "",
        isActive: false,
        templateName: null,
        // Dips d'abord, puis développé et curl en alternance (A, B, A, B, A, B).
        exercises: [mk("dips", DIPS, 0, [0, 3]), mk("bench", BENCH, 1, [6, 10, 14]), mk("curl", CURL, 2, [8, 12, 16])],
        supersetGroups: [],
        cardioEntries: [],
      };
    };
    const store = useWorkoutStore.getState();
    store.hydrate({
      catalog: [BENCH, CURL, DIPS],
      history: [past(1, 1), past(3, 2), past(5, 3)],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
      bodyWeights: [],
    });
    useWorkoutStore.getState().startHabitual("normal");
    const active = useWorkoutStore.getState().active!;
    const ordered = [...active.exercises].sort((a, b) => a.orderIndex - b.orderIndex).map((logged) => logged.exerciseId);
    expect(ordered).toEqual([DIPS.id, BENCH.id, CURL.id]);
    expect(active.supersetGroups).toHaveLength(1);
    const members = active.supersetGroups[0].memberOrder.map((id) => active.exercises.find((logged) => logged.id === id)!.exerciseId);
    expect(members).toEqual([BENCH.id, CURL.id]);
    useWorkoutStore.getState().discard();
  });
});
