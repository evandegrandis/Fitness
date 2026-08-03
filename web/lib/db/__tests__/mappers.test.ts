import { describe, expect, it } from "vitest";

import {
  mapRecoveryCheckinRow,
  mapSessionRow,
  recoveryCheckinToRow,
  sessionToCardioEntryRows,
} from "../mappers";
import type {
  CardioEntryRow,
  RecoveryCheckinRow,
  WorkoutSessionRow,
} from "../schema";
import type { WorkoutSession } from "@/lib/models/types";

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
        activityName: "Vélo",
        durationSeconds: 900,
        level: 8,
        distanceKm: 5.2,
        orderIndex: 1,
      },
      {
        id: "other-session",
        sessionId: "session-2",
        activityName: "Course",
        durationSeconds: 600,
        level: null,
        distanceKm: 2,
        orderIndex: 0,
      },
      {
        id: "rower",
        sessionId: "session-1",
        activityName: "Rameur",
        durationSeconds: 300,
        level: null,
        distanceKm: null,
        orderIndex: 0,
      },
    ];

    const session = mapSessionRow(sessionRow, [], [], [], cardioRows);

    expect(session.cardioEntries).toEqual([
      {
        id: "rower",
        activityName: "Rameur",
        durationSeconds: 300,
        level: null,
        distanceKm: null,
        orderIndex: 0,
      },
      {
        id: "bike",
        activityName: "Vélo",
        durationSeconds: 900,
        level: 8,
        distanceKm: 5.2,
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
          activityName: "Elliptique",
          durationSeconds: 1200,
          level: 6,
          distanceKm: null,
          orderIndex: 0,
        },
      ],
    };

    expect(sessionToCardioEntryRows(session)).toEqual([
      {
        id: "elliptical",
        sessionId: "session-1",
        activityName: "Elliptique",
        durationSeconds: 1200,
        level: 6,
        distanceKm: null,
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

  it("defaults legacy writes without hadAlcohol to false", () => {
    const row = recoveryCheckinToRow({
      id: "checkin-legacy",
      date: new Date("2026-08-01T00:00:00.000Z"),
      tookCreatine: false,
      proteinTargetMet: true,
      sleepHours: 8,
    });

    expect(row.hadAlcohol).toBe(false);
  });
});
