import { describe, expect, it } from "vitest";
import { recentAchievements } from "@/lib/engines/achievements";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

const BENCH: Exercise = {
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

function set(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-10T10:00:00"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function loggedExercise(exerciseId: string, sets: LoggedSet[]): LoggedExercise {
  return {
    id: `le-${Math.random().toString(36).slice(2)}`,
    orderIndex: 0,
    notes: "",
    exerciseId,
    exerciseName: BENCH.name,
    sets,
    supersetGroupId: null,
    plateauWeakPoint: null,
  };
}

function session(date: Date, exercises: LoggedExercise[]): WorkoutSession {
  return {
    id: `session-${date.getTime()}`,
    date,
    startTime: date,
    endTime: date,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
  };
}

describe("recentAchievements — parcours chronologique et fenêtre maxSessions", () => {
  it("détecte un PR de poids sur la 2e séance par rapport à la 1ère (ordre newest-first en entrée)", () => {
    const day1 = session(new Date("2026-07-01T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 80, reps: 8 })])]);
    const day2 = session(new Date("2026-07-08T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 85, reps: 6 })])]);

    // sessions passées newest-first, comme le @Query Swift par défaut.
    // day1 est aussi un achievement (premier set jamais loggé = record absolu), donc on en attend 2.
    const achievements = recentAchievements([day2, day1], [BENCH], 10);

    expect(achievements).toHaveLength(2);
    expect(achievements[0].kind).toBe("heaviestWeight");
    expect(achievements[0].weight).toBe(85);
    expect(achievements[0].date.getTime()).toBe(day2.date.getTime());
    expect(achievements[1].date.getTime()).toBe(day1.date.getTime());
  });

  it("donne le même résultat après un import dont les séances sont permutées", () => {
    const day1 = session(new Date("2026-07-01T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 80, reps: 8 })])]);
    const day2 = session(new Date("2026-07-08T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 85, reps: 6 })])]);
    const day3 = session(new Date("2026-07-15T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 70, reps: 6 })])]);

    const canonical = recentAchievements([day3, day2, day1], [BENCH], 2).map(
      ({ exerciseName, date, kind, weight, reps }) => ({ exerciseName, date: date.getTime(), kind, weight, reps })
    );
    const imported = recentAchievements([day1, day3, day2], [BENCH], 2).map(
      ({ exerciseName, date, kind, weight, reps }) => ({ exerciseName, date: date.getTime(), kind, weight, reps })
    );

    expect(imported).toEqual(canonical);
  });

  it("la toute première séance produit un achievement (aucun historique préalable à battre = heaviestWeight)", () => {
    // Premier set jamais loggé sur cet exercice : buildRecords(prior=[]) -> EMPTY_RECORDS
    // (heaviestEver=0), donc tout set avec weight>0 déclenche heaviestWeight.
    const day1 = session(new Date("2026-07-01T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 80, reps: 8 })])]);
    const achievements = recentAchievements([day1], [BENCH], 10);
    expect(achievements).toHaveLength(1);
    expect(achievements[0].kind).toBe("heaviestWeight");
  });

  it("respecte maxSessions : une séance plus ancienne que la fenêtre ne génère pas d'achievement affiché", () => {
    const day1 = session(new Date("2026-07-01T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 80, reps: 8 })])]);
    const day2 = session(new Date("2026-07-08T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 85, reps: 6 })])]);
    const day3 = session(new Date("2026-07-15T10:00:00"), [loggedExercise(BENCH.id, [set({ weight: 70, reps: 6 })])]);

    // maxSessions = 1 : seule day3 (la plus récente) est "recent" -> son set (70kg) n'est
    // pas un record (< heaviestEver 85), donc aucun achievement.
    const achievements = recentAchievements([day3, day2, day1], [BENCH], 1);
    expect(achievements).toHaveLength(0);
  });

  it("déduplique par (exercice, jour) en gardant le rang le plus élevé, puis reps, puis poids", () => {
    const dayDate = new Date("2026-07-08T10:00:00");
    // Deux sets dans la même séance/jour : un repsAtWeight (rang 2) et un heaviestWeight (rang 4).
    const priorDay = session(new Date("2026-07-01T10:00:00"), [
      loggedExercise(BENCH.id, [set({ weight: 80, reps: 8 })]),
    ]);
    const sameDay = session(dayDate, [
      loggedExercise(BENCH.id, [
        set({ weight: 80, reps: 9 }), // repsAtWeight (rang 2) par rapport à 80x8
        set({ weight: 90, reps: 3 }), // heaviestWeight (rang 4), sous repTargetMin mais weight-only gate
      ]),
    ]);

    const achievements = recentAchievements([sameDay, priorDay], [BENCH], 10);
    // Un seul achievement retenu pour ce jour : le rang le plus élevé (heaviestWeight).
    const sameDayAchievements = achievements.filter((a) => a.date.getTime() === dayDate.getTime());
    expect(sameDayAchievements).toHaveLength(1);
    expect(sameDayAchievements[0].kind).toBe("heaviestWeight");
    expect(sameDayAchievements[0].weight).toBe(90);
  });

  it("tri final: date desc puis rang desc pour les exercices distincts le même jour", () => {
    const PULLUPS: Exercise = { ...BENCH, id: "ex-pullups", name: "Tractions" };
    const day1 = new Date("2026-07-01T10:00:00");
    const day2 = new Date("2026-07-08T10:00:00");

    const s1 = session(day1, [
      loggedExercise(BENCH.id, [set({ weight: 80, reps: 8 })]),
      loggedExercise(PULLUPS.id, [set({ weight: 0, reps: 10 })]),
    ]);
    const s2 = session(day2, [loggedExercise(BENCH.id, [set({ weight: 85, reps: 6 })])]);

    const achievements = recentAchievements([s2, s1], [BENCH, PULLUPS], 10);
    // day2 (heaviestWeight) doit être trié avant day1 (2 records: heaviestWeight bench + bodyweightReps pullups)
    expect(achievements[0].date.getTime()).toBe(day2.getTime());
    // Sur day1, les deux records distincts (exercices différents) sont conservés
    const day1Achievements = achievements.filter((a) => a.date.getTime() === day1.getTime());
    expect(day1Achievements).toHaveLength(2);
    // Triés par rang desc : heaviestWeight (4) avant bodyweightReps (1)
    expect(day1Achievements[0].kind).toBe("heaviestWeight");
    expect(day1Achievements[1].kind).toBe("bodyweightReps");
  });

  it("ignore les exercices sans sets complétés dans une séance", () => {
    const s = session(new Date("2026-07-01T10:00:00"), [loggedExercise(BENCH.id, [set({ completed: false })])]);
    const achievements = recentAchievements([s], [BENCH], 10);
    expect(achievements).toHaveLength(0);
  });

  it("suit les records finishers séparément des records normaux", () => {
    const day1 = session(new Date("2026-07-01T10:00:00"), [
      loggedExercise(BENCH.id, [set({ weight: 0, reps: 16, setType: SetType.finisher })]),
    ]);
    const day2 = session(new Date("2026-07-08T10:00:00"), [
      loggedExercise(BENCH.id, [set({ weight: 0, reps: 18, setType: SetType.finisher })]),
    ]);

    const achievements = recentAchievements([day2, day1], [BENCH], 10);
    expect(achievements.map((achievement) => achievement.kind)).toEqual([
      "finisherReps",
      "finisherReps",
    ]);
    expect(achievements[0].reps).toBe(18);
  });
});
