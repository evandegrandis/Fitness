import { describe, expect, it } from "vitest";

import { createBackupJson, parseBackup } from "../backup";

function v3Backup() {
  return {
    version: 3,
    exportDate: "2026-08-04T10:00:00.000Z",
    lastWorkoutLoggedAt: "2026-08-03T15:47:00.000Z",
    deviceId: "web",
    exercises: [
      {
        id: "exercise-1",
        name: "Test",
        category: "Push",
        setPatternMode: "straight",
        repTargetMin: 8,
        repTargetMax: 12,
        smallestIncrement: 1.25,
        isFavorite: false,
        createdByUser: true,
        sortOrder: 0,
        suggestedRestSeconds: 90,
        lastUsed: "2026-08-03T15:40:00.000Z",
        machineSetting: "",
        setupNotes: "",
        benchmarkLow: null,
        benchmarkHigh: null,
        fatigueClass: "light",
        progressionPolicy: null,
        voluntaryRepCap: 0,
        muscleMappings: [{ muscleGroup: "delt_lat", coefficient: 1 }],
      },
    ],
    goals: [],
    settings: {
      usesKilograms: true,
      defaultSmallestIncrement: 2.5,
      defaultRestTimerSeconds: 120,
      defaultRepTargetMin: 8,
      defaultRepTargetMax: 12,
      userName: "Evan",
      supersetRestSeconds: 180,
      bodyWeightKg: 75.5,
      gender: "male",
      ageYears: 26,
    },
    sessions: [
      {
        id: "session-1",
        date: "2026-08-03T14:46:00.000Z",
        startTime: "2026-08-03T14:46:00.000Z",
        endTime: "2026-08-03T15:47:00.000Z",
        notes: "",
        isActive: false,
        templateName: null,
        exercises: [
          {
            id: "logged-1",
            exerciseId: "exercise-1",
            exerciseName: "Test",
            orderIndex: 0,
            notes: "",
            sets: [
              {
                id: "set-1",
                weight: 12.5,
                reps: 9,
                setType: "work",
                timestamp: "2026-08-03T15:40:00.000Z",
                setSlotIndex: 0,
                completed: true,
                supersetRoundIndex: null,
              },
            ],
          },
        ],
        supersetGroups: [],
        cardioEntries: [
          {
            id: "cardio-1",
            activityType: "rowing",
            activityName: "Rameur",
            machineName: "Concept2",
            machineModel: "RowErg",
            durationSeconds: 600,
            level: null,
            resistance: 5,
            distanceKm: 2.3,
            averageWatts: 190,
            averageHeartRateBpm: 145,
            inclinePercent: null,
            orderIndex: 0,
          },
        ],
      },
    ],
    templates: [
      {
        id: "template-1",
        name: "Full Body",
        createdAt: "2026-07-01T10:00:00.000Z",
        sortOrder: 0,
        exercises: [{ exerciseName: "Test", orderIndex: 0, targetSets: 3 }],
      },
    ],
    recoveryCheckins: [
      {
        id: "recovery-1",
        date: "2026-08-02T22:00:00.000Z",
        tookCreatine: true,
        proteinTargetMet: null,
        sleepHours: 7.5,
        hadAlcohol: false,
      },
    ],
  };
}

describe("backup v3 lossless fields", () => {
  it("preserves stable IDs, profile, structured cardio and tri-state recovery", () => {
    const parsed = parseBackup(v3Backup());

    expect(parsed.settings).toMatchObject({ bodyWeightKg: 75.5, gender: "male", ageYears: 26 });
    expect(parsed.sessions[0].exercises[0].sets[0].id).toBe("set-1");
    expect(parsed.templates[0]).toMatchObject({ id: "template-1" });
    expect(parsed.templates[0].createdAt.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(parsed.sessions[0].cardioEntries?.[0]).toMatchObject({
      activityType: "rowing",
      machineName: "Concept2",
      resistance: 5,
      averageWatts: 190,
    });
    expect(parsed.recoveryCheckins[0]).toMatchObject({
      id: "recovery-1",
      proteinTargetMet: null,
      hadAlcohol: false,
    });
  });

  it("rejects invalid dates before a destructive import can start", () => {
    const backup = v3Backup();
    backup.sessions[0].date = "not-a-date";
    expect(() => parseBackup(backup)).toThrow();
  });

  it("rejects unknown v3 muscle values instead of dropping them", () => {
    const backup = v3Backup();
    backup.exercises[0].muscleMappings[0].muscleGroup = "invented_muscle";
    expect(() => parseBackup(backup)).toThrow("Muscle inconnu");
  });

  it("rejects multiple active sessions before touching the database", () => {
    const backup = v3Backup();
    Object.assign(backup.sessions[0], { isActive: true, endTime: null });
    backup.sessions.push({
      ...structuredClone(backup.sessions[0]),
      id: "session-2",
      exercises: [],
      cardioEntries: [],
    });
    expect(() => parseBackup(backup)).toThrow("plusieurs séances actives");
  });

  it("rejects duplicate stable IDs before a destructive import", () => {
    const backup = v3Backup();
    backup.sessions.push({
      ...structuredClone(backup.sessions[0]),
      id: "session-2",
      exercises: [{ ...structuredClone(backup.sessions[0].exercises[0]), id: "logged-2" }],
    });
    expect(() => parseBackup(backup)).toThrow("ID de série dupliqué");
  });

  it("refuse une version future avant tout import destructif", () => {
    const backup = v3Backup();
    backup.version = 4;
    expect(() => parseBackup(backup)).toThrow();
  });

  it("exige l'ID de chaque exercice loggué en v3", () => {
    const backup = v3Backup();
    delete (backup.sessions[0].exercises[0] as { id?: string }).id;
    expect(() => parseBackup(backup)).toThrow("IDs des exercices loggués");
  });

  it("round-trip export/import préserve l'active, son mode et tout le bookkeeping persistant", () => {
    const parsed = parseBackup(v3Backup());
    const base = parsed.sessions[0];
    const active = {
      ...base,
      id: "session-active",
      date: new Date("2026-08-09T17:00:00.000Z"),
      startTime: new Date("2026-08-09T17:00:00.000Z"),
      endTime: null,
      isActive: true,
      exercises: base.exercises.map((exercise) => ({
        ...exercise,
        id: "logged-active",
        sets: exercise.sets.map((set) => ({ ...set, id: "set-active" })),
      })),
      cardioEntries: (base.cardioEntries ?? []).map((entry) => ({ ...entry, id: "cardio-active" })),
    };

    const json = createBackupJson({
      catalog: parsed.exercises,
      history: [base],
      active,
      goals: parsed.goals,
      settings: parsed.settings,
      templates: parsed.templates,
      recoveryCheckins: parsed.recoveryCheckins,
      activeMode: "beast",
      selectedStartMode: "monk",
      pendingVariantSwitches: { "exercise-1": "exercise-2" },
      treatedVariantSuggestions: { "session-1:exercise-1": true },
      rotationAcceptedAt: { "exercise-2": "2026-08-08T12:00:00.000Z" },
    }, new Date("2026-08-09T18:00:00.000Z"));
    const restored = parseBackup(json);

    expect(restored.sessions.find((session) => session.isActive)).toMatchObject({
      id: "session-active",
      endTime: null,
    });
    expect(restored.activeMode).toBe("beast");
    expect(restored.selectedStartMode).toBe("monk");
    expect(restored.pendingVariantSwitches).toEqual({ "exercise-1": "exercise-2" });
    expect(restored.treatedVariantSuggestions).toEqual({ "session-1:exercise-1": true });
    expect(restored.rotationAcceptedAt).toEqual({ "exercise-2": "2026-08-08T12:00:00.000Z" });
    expect(restored.sessions.find((session) => session.isActive)?.exercises[0].sets[0].id).toBe("set-active");
  });
});

// ---------------------------------------------------------------------------
// movementPattern (VARIATION_CYCLING_SPEC §5) — champ web-only, absent des exports Swift.
// ---------------------------------------------------------------------------

describe("backup movementPattern", () => {
  it("hydrates a tagged movementPattern", () => {
    const backup = v3Backup();
    (backup.exercises[0] as Record<string, unknown>).movementPattern = "horizontal_press";
    const parsed = parseBackup(backup);
    expect(parsed.exercises[0].movementPattern).toBe("horizontal_press");
  });

  it("defaults to null when absent (old exports never had this field, §9 dégradation gracieuse)", () => {
    const parsed = parseBackup(v3Backup());
    expect(parsed.exercises[0].movementPattern).toBeNull();
  });

  it("defaults to null for an unknown value instead of crashing (§9)", () => {
    const backup = v3Backup();
    (backup.exercises[0] as Record<string, unknown>).movementPattern = "not_a_real_pattern";
    const parsed = parseBackup(backup);
    expect(parsed.exercises[0].movementPattern).toBeNull();
  });
});
