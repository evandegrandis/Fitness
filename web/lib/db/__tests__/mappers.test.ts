import { describe, expect, it } from "vitest";

import {
  exerciseToRow,
  exerciseToUpsertUpdateRow,
  mapExerciseRow,
  mapRecoveryCheckinRow,
  mapSessionRow,
  recoveryCheckinToRow,
  sessionToCardioEntryRows,
  sessionToLoggedExerciseRows,
  sessionToLoggedSetRows,
} from "../mappers";
import type {
  CardioEntryRow,
  ExerciseRow,
  LoggedSetRow,
  RecoveryCheckinRow,
  WorkoutSessionRow,
} from "../schema";
import type { Exercise, LoggedExercise, WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Exercise mappers — movementPattern (VARIATION_CYCLING_SPEC §5)
// ---------------------------------------------------------------------------

describe("exercise mappers — movementPattern", () => {
  const baseRow: ExerciseRow = {
    id: "ex-1",
    name: "Chest Press",
    category: "Push",
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
    fatigueClass: "medium",
    progressionPolicy: null,
    voluntaryRepCap: 0,
    maxLoad: null,
    profileSource: null,
    equivalenceKey: null,
    lastUsed: null,
    movementPattern: "horizontal_press",
    resistanceProfile: null,
    strengthStandardKey: null,
    benchmarkUnit: null,
  };

  it("hydrates a tagged movementPattern from the database", () => {
    const exercise = mapExerciseRow(baseRow, []);
    expect(exercise.movementPattern).toBe("horizontal_press");
  });

  it("degrades gracefully to null for an untagged (NULL) row", () => {
    const exercise = mapExerciseRow({ ...baseRow, movementPattern: null }, []);
    expect(exercise.movementPattern).toBeNull();
  });

  it("degrades gracefully to null for an unknown/invalid stored value (never crashes, §9)", () => {
    const exercise = mapExerciseRow({ ...baseRow, movementPattern: "not_a_real_pattern" }, []);
    expect(exercise.movementPattern).toBeNull();
  });

  it("round-trips movementPattern through exerciseToRow", () => {
    const exercise: Exercise = {
      ...mapExerciseRow(baseRow, []),
      movementPattern: "vertical_pull",
    };
    expect(exerciseToRow(exercise).movementPattern).toBe("vertical_pull");
  });

  it("round-trips a null movementPattern (non-tagué) through exerciseToRow", () => {
    const exercise: Exercise = {
      ...mapExerciseRow(baseRow, []),
      movementPattern: null,
    };
    expect(exerciseToRow(exercise).movementPattern).toBeNull();
  });

  it("keeps lastUsed on insert but excludes it from an exercise edit", () => {
    const lastUsed = new Date("2026-08-09T18:30:00.000Z");
    const exercise: Exercise = {
      ...mapExerciseRow(baseRow, []),
      lastUsed,
    };

    expect(exerciseToRow(exercise).lastUsed).toBe(lastUsed);
    expect(exerciseToUpsertUpdateRow(exercise)).not.toHaveProperty("lastUsed");
  });
});

// ---------------------------------------------------------------------------
// Exercise mappers — resistanceProfile (VARIATION_CYCLING_SPEC §5.2, P2.1)
// ---------------------------------------------------------------------------

describe("exercise mappers — resistanceProfile", () => {
  const baseRow: ExerciseRow = {
    id: "ex-1",
    name: "Chest Press",
    category: "Push",
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
    fatigueClass: "medium",
    progressionPolicy: null,
    voluntaryRepCap: 0,
    maxLoad: null,
    profileSource: null,
    equivalenceKey: null,
    lastUsed: null,
    movementPattern: null,
    resistanceProfile: "lockout",
    strengthStandardKey: null,
    benchmarkUnit: null,
  };

  it("hydrates a tagged resistanceProfile from the database", () => {
    const exercise = mapExerciseRow(baseRow, []);
    expect(exercise.resistanceProfile).toBe("lockout");
  });

  it("degrades gracefully to null for an untagged (NULL) row — seed default (§9)", () => {
    const exercise = mapExerciseRow({ ...baseRow, resistanceProfile: null }, []);
    expect(exercise.resistanceProfile).toBeNull();
  });

  it("degrades gracefully to null for an unknown/invalid stored value (never crashes, §9)", () => {
    const exercise = mapExerciseRow({ ...baseRow, resistanceProfile: "not_a_real_profile" }, []);
    expect(exercise.resistanceProfile).toBeNull();
  });

  it("round-trips resistanceProfile through exerciseToRow", () => {
    const exercise: Exercise = {
      ...mapExerciseRow(baseRow, []),
      resistanceProfile: "bottom",
    };
    expect(exerciseToRow(exercise).resistanceProfile).toBe("bottom");
  });
});

// ---------------------------------------------------------------------------
// LoggedExercise mappers — plateauWeakPoint (VARIATION_CYCLING_SPEC §5.3/§8, P2.1)
// ---------------------------------------------------------------------------

describe("logged exercise mappers — plateauWeakPoint (capture 1-tap)", () => {
  const loggedExercise: LoggedExercise = {
    id: "le-1",
    orderIndex: 0,
    notes: "",
    exerciseId: "ex-1",
    exerciseName: "Chest Press",
    sets: [],
    supersetGroupId: null,
    plateauWeakPoint: "bottom",
  };

  it("serializes the captured weak point (seule donnée utilisateur persistée par cette feature)", () => {
    const rows = sessionToLoggedExerciseRows({
      id: "session-1",
      date: new Date("2026-08-03T10:00:00.000Z"),
      startTime: new Date("2026-08-03T10:00:00.000Z"),
      endTime: null,
      notes: "",
      isActive: false,
      templateName: null,
      exercises: [loggedExercise],
      supersetGroups: [],
    });
    expect(rows[0].plateauWeakPoint).toBe("bottom");
  });

  it("hydrates a null plateauWeakPoint (pas encore répondu) via mapSessionRow", () => {
    const sessionRow: WorkoutSessionRow = {
      id: "session-1",
      date: new Date("2026-08-03T10:00:00.000Z"),
      startTime: new Date("2026-08-03T10:00:00.000Z"),
      endTime: null,
      notes: "",
      isActive: false,
      templateName: null,
    };
    const session = mapSessionRow(
      sessionRow,
      [
        {
          id: "le-1",
          sessionId: "session-1",
          orderIndex: 0,
          notes: "",
          exerciseId: "ex-1",
          exerciseName: "Chest Press",
          supersetGroupId: null,
          plateauWeakPoint: null,
        },
      ],
      [],
      []
    );
    expect(session.exercises[0].plateauWeakPoint).toBeNull();
  });
});

describe("logged set mappers — suggestion snapshot and logical groups", () => {
  const sessionRow: WorkoutSessionRow = {
    id: "session-1",
    date: new Date("2026-08-13T10:00:00.000Z"),
    startTime: new Date("2026-08-13T10:00:00.000Z"),
    endTime: null,
    notes: "",
    isActive: true,
    templateName: null,
  };

  it("normalizes missing cache-era metadata to null/[] before a DB write", () => {
    const rows = sessionToLoggedSetRows({
      ...sessionRow,
      exercises: [
        {
          id: "logged-1",
          orderIndex: 0,
          notes: "",
          exerciseId: "exercise-1",
          exerciseName: "Pec deck",
          supersetGroupId: null,
          plateauWeakPoint: null,
          sets: [
            {
              id: "set-1",
              weight: 80,
              reps: 9,
              setType: "work",
              timestamp: new Date("2026-08-13T10:05:00.000Z"),
              setSlotIndex: 0,
              completed: true,
              supersetRoundIndex: null,
            },
          ],
        },
      ],
      supersetGroups: [],
    });

    expect(rows[0]).toMatchObject({
      suggestedWeight: null,
      suggestedReps: null,
      predictedRepsAtActualWeight: null,
      suggestedSetType: null,
      suggestionMode: null,
      suggestionReasonCodes: [],
      suggestionEngineVersion: null,
      logicalSetId: null,
      setTechnique: null,
      reportedRir: null,
      stopReason: null,
    });
  });

  it("hydrates every persisted snapshot field", () => {
    const setRow: LoggedSetRow = {
      id: "set-1",
      loggedExerciseId: "logged-1",
      weight: 75,
      reps: 5,
      setType: "backoff",
      timestamp: new Date("2026-08-13T10:06:00.000Z"),
      setSlotIndex: 1,
      completed: true,
      supersetRoundIndex: null,
      suggestedWeight: 80,
      suggestedReps: 8,
      predictedRepsAtActualWeight: 10,
      suggestedSetType: "top_set",
      suggestionMode: "fallback_hypertrophy",
      suggestionReasonCodes: ["lighter_followup"],
      suggestionEngineVersion: "progression-v2",
      logicalSetId: "logical-set-1",
      setTechnique: "completion",
      reportedRir: 1,
      stopReason: "pain",
    };
    const session = mapSessionRow(
      sessionRow,
      [
        {
          id: "logged-1",
          sessionId: "session-1",
          orderIndex: 0,
          notes: "",
          exerciseId: "exercise-1",
          exerciseName: "Pec deck",
          supersetGroupId: null,
          plateauWeakPoint: null,
        },
      ],
      [setRow],
      []
    );

    expect(session.exercises[0].sets[0]).toMatchObject({
      suggestedWeight: 80,
      suggestedReps: 8,
      predictedRepsAtActualWeight: 10,
      suggestedSetType: "top_set",
      suggestionMode: "fallback_hypertrophy",
      suggestionReasonCodes: ["lighter_followup"],
      suggestionEngineVersion: "progression-v2",
      logicalSetId: "logical-set-1",
      setTechnique: "completion",
      reportedRir: 1,
      stopReason: "pain",
    });
  });
});

describe("cardio session mappers", () => {
  const sessionRow: WorkoutSessionRow = {
    id: "session-1",
    date: new Date("2026-08-03T10:00:00.000Z"),
    startTime: new Date("2026-08-03T10:00:00.000Z"),
    endTime: new Date("2026-08-03T11:00:00.000Z"),
    notes: "",
    isActive: false,
    templateName: null,
  };

  it("hydrates only the session cardio entries in display order", () => {
    const cardioRows: CardioEntryRow[] = [
      {
        id: "bike",
        sessionId: "session-1",
        activityType: "cycling",
        activityName: "Vélo",
        machineName: null,
        machineModel: null,
        durationSeconds: 900,
        level: 8,
        resistance: 6,
        distanceKm: 5.2,
        averageWatts: 180,
        averageHeartRateBpm: 142,
        inclinePercent: null,
        orderIndex: 1,
      },
      {
        id: "other-session",
        sessionId: "session-2",
        activityType: "running",
        activityName: "Course",
        machineName: null,
        machineModel: null,
        durationSeconds: 600,
        level: null,
        resistance: null,
        distanceKm: 2,
        averageWatts: null,
        averageHeartRateBpm: null,
        inclinePercent: 1,
        orderIndex: 0,
      },
      {
        id: "rower",
        sessionId: "session-1",
        activityType: "rowing",
        activityName: "Rameur",
        machineName: "Concept2",
        machineModel: "RowErg",
        durationSeconds: 300,
        level: null,
        resistance: 5,
        distanceKm: null,
        averageWatts: 210,
        averageHeartRateBpm: null,
        inclinePercent: null,
        orderIndex: 0,
      },
    ];

    const session = mapSessionRow(sessionRow, [], [], [], cardioRows);

    expect(session.cardioEntries).toEqual([
      {
        id: "rower",
        activityType: "rowing",
        activityName: "Rameur",
        machineName: "Concept2",
        machineModel: "RowErg",
        durationSeconds: 300,
        level: null,
        resistance: 5,
        distanceKm: null,
        averageWatts: 210,
        averageHeartRateBpm: null,
        inclinePercent: null,
        orderIndex: 0,
      },
      {
        id: "bike",
        activityType: "cycling",
        activityName: "Vélo",
        machineName: null,
        machineModel: null,
        durationSeconds: 900,
        level: 8,
        resistance: 6,
        distanceKm: 5.2,
        averageWatts: 180,
        averageHeartRateBpm: 142,
        inclinePercent: null,
        orderIndex: 1,
      },
    ]);
  });

  it("serializes cardio entries with their parent session id", () => {
    const session: WorkoutSession = {
      ...sessionRow,
      exercises: [],
      supersetGroups: [],
      cardioEntries: [
        {
          id: "elliptical",
          activityType: "elliptical",
          activityName: "Elliptique",
          machineName: null,
          machineModel: null,
          durationSeconds: 1200,
          level: 6,
          resistance: null,
          distanceKm: null,
          averageWatts: null,
          averageHeartRateBpm: null,
          inclinePercent: null,
          orderIndex: 0,
        },
      ],
    };

    expect(sessionToCardioEntryRows(session)).toEqual([
      {
        id: "elliptical",
        sessionId: "session-1",
        activityType: "elliptical",
        activityName: "Elliptique",
        machineName: null,
        machineModel: null,
        durationSeconds: 1200,
        level: 6,
        resistance: null,
        distanceKm: null,
        averageWatts: null,
        averageHeartRateBpm: null,
        inclinePercent: null,
        orderIndex: 0,
      },
    ]);
  });
});

describe("recovery checkin alcohol mapper", () => {
  it("hydrates hadAlcohol from the database", () => {
    const row: RecoveryCheckinRow = {
      id: "checkin-1",
      date: new Date("2026-08-02T00:00:00.000Z"),
      tookCreatine: true,
      proteinTargetMet: false,
      sleepHours: 7.5,
      hadAlcohol: true,
    };

    expect(mapRecoveryCheckinRow(row).hadAlcohol).toBe(true);
  });

  it("preserves an explicit unknown alcohol value", () => {
    const row = recoveryCheckinToRow({
      id: "checkin-legacy",
      date: new Date("2026-08-01T00:00:00.000Z"),
      tookCreatine: false,
      proteinTargetMet: true,
      sleepHours: 8,
      hadAlcohol: null,
    });

    expect(row.hadAlcohol).toBeNull();
  });
});
