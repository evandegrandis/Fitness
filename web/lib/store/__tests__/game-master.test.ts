import { describe, expect, it } from "vitest";

// Même stub que workout.test.ts : le store persiste via `localStorage`, absent sous Vitest (node).
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
const { bossAvailable, pickBoss, sessionGame } = await import("@/lib/engines/session-game");
const { buildCareer } = await import("@/lib/engines/career");
type Exercise = import("@/lib/models/types").Exercise;
type UserSettings = import("@/lib/models/types").UserSettings;
type WorkoutSession = import("@/lib/models/types").WorkoutSession;

const DAY = 86_400_000;

function exercise(id: string, name: string, muscle: (typeof MuscleGroup)[keyof typeof MuscleGroup]): Exercise {
  return {
    id, name, category: "push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12, smallestIncrement: 2.5,
    isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "", setupNotes: "",
    benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: muscle, coefficient: 1 }], lastUsed: null, movementPattern: "isolation",
    resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  };
}

const PEC = exercise("pec", "Pec deck", MuscleGroup.pectStern);
const CURL = exercise("curl", "Curl debout", MuscleGroup.bicepsLong);

const SETTINGS: UserSettings = {
  usesKilograms: true, defaultSmallestIncrement: 2.5, defaultRestTimerSeconds: 90, defaultRepTargetMin: 8,
  defaultRepTargetMax: 12, userName: "Evan", supersetRestSeconds: 180, bodyWeightKg: 73.7, gender: "male",
  ageYears: 26, trainingPhase: null, trainingPhaseStartedAt: null, weeklyCardioMinutesGoal: null,
};

function pastSession(daysAgo: number, pecWeight: number, curlWeight: number): WorkoutSession {
  const date = new Date(Date.now() - daysAgo * DAY);
  const set = (id: string, weight: number, reps: number, minutes: number) => ({
    id, weight, reps, setType: "work" as const, timestamp: new Date(date.getTime() + minutes * 60_000),
    setSlotIndex: 0, completed: true, supersetRoundIndex: null,
  });
  return {
    id: `past-${daysAgo}`, date, startTime: date, endTime: new Date(date.getTime() + 3_600_000), notes: "",
    isActive: false, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: [
      { id: `le-pec-${daysAgo}`, orderIndex: 0, notes: "", exerciseId: PEC.id, exerciseName: PEC.name, supersetGroupId: null, plateauWeakPoint: null,
        sets: [set(`p1-${daysAgo}`, pecWeight, 10, 0), set(`p2-${daysAgo}`, pecWeight, 9, 3), set(`p3-${daysAgo}`, pecWeight, 8, 6)] },
      { id: `le-curl-${daysAgo}`, orderIndex: 1, notes: "", exerciseId: CURL.id, exerciseName: CURL.name, supersetGroupId: null, plateauWeakPoint: null,
        sets: [set(`c1-${daysAgo}`, curlWeight, 10, 10), set(`c2-${daysAgo}`, curlWeight, 9, 13)] },
    ],
  };
}

describe("maître du jeu : les suggestions restent celles du moteur, au chiffre près", () => {
  it("annoncer le boss, compter les suggestions battues et recalculer le parcours ne change aucune suggestion", () => {
    const store = useWorkoutStore.getState();
    store.hydrate({
      catalog: [PEC, CURL],
      history: [pastSession(9, 70, 16), pastSession(6, 72.5, 16), pastSession(3, 75, 17.5)],
      goals: [],
      settings: SETTINGS,
      templates: [],
      recoveryCheckins: [],
      bodyWeights: [],
    });
    store.startEmpty("normal");
    store.addExercise(PEC.id);
    store.addExercise(CURL.id);
    const [pecId, curlId] = useWorkoutStore.getState().active!.exercises.map((logged) => logged.id);
    store.logSet(pecId, { weight: 77.5, reps: 10 });

    const suggestionsOf = () => [pecId, curlId].map((id) => useWorkoutStore.getState().suggestion(id));
    const before = suggestionsOf();

    // Tout ce que le jeu fait pendant et après une séance.
    const state = useWorkoutStore.getState();
    const session = state.active!;
    const boss = bossAvailable(state.bossAnnouncements, session.id, new Date())
      ? pickBoss(session, state.catalog, state.history, (id) => useWorkoutStore.getState().suggestion(id), state.recoveryCheckins, new Date())
      : null;
    state.setSessionBoss({ sessionId: session.id, boss });
    sessionGame(session, state.catalog, state.history);
    buildCareer({ history: state.history, catalog: state.catalog, goals: state.goals, bodyWeights: state.bodyWeights, settings: state.settings, now: new Date() });

    expect(suggestionsOf()).toEqual(before);
    expect(useWorkoutStore.getState().history).toBe(state.history);
    expect(useWorkoutStore.getState().active).toBe(state.active);
  });

  it("deux boss au plus par semaine civile, la séance en cours n'étant pas comptée deux fois", () => {
    const now = new Date("2026-09-26T17:00:00");
    const thisWeek = (sessionId: string, day: number) => ({ sessionId, date: new Date(`2026-09-${day}T18:00:00`).toISOString() });
    expect(bossAvailable([thisWeek("a", 22)], "today", now)).toBe(true);
    expect(bossAvailable([thisWeek("a", 22), thisWeek("b", 24)], "today", now)).toBe(false);
    expect(bossAvailable([thisWeek("a", 22), thisWeek("today", 26)], "today", now)).toBe(true);
    expect(bossAvailable([thisWeek("a", 17), thisWeek("b", 19)], "today", now)).toBe(true);
  });
});
