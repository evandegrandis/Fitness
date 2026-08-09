import { describe, expect, it } from "vitest";

import {
  recoverySessionsChronological,
  sleepHoursWithoutAlcohol,
} from "@/components/progress/recovery-analytics";
import type { RecoveryCheckin, WorkoutSession } from "@/lib/models/types";

function checkin(hadAlcohol: boolean | null, sleepHours: number | null): RecoveryCheckin {
  return {
    id: crypto.randomUUID(),
    date: new Date("2026-08-08T00:00:00.000Z"),
    tookCreatine: null,
    proteinTargetMet: null,
    sleepHours,
    hadAlcohol,
  };
}

describe("sleepHoursWithoutAlcohol", () => {
  it("garde seulement une nuit explicitement confirmée sans alcool", () => {
    expect(sleepHoursWithoutAlcohol(checkin(false, 7.5))).toBe(7.5);
    expect(sleepHoursWithoutAlcohol(checkin(true, 9))).toBeNull();
    expect(sleepHoursWithoutAlcohol(checkin(null, 8))).toBeNull();
  });

  it("garde une durée de sommeil inconnue hors du calcul", () => {
    expect(sleepHoursWithoutAlcohol(checkin(false, null))).toBeNull();
  });
});

function session(id: string, startHour: number): WorkoutSession {
  return {
    id,
    date: new Date("2026-08-08T00:00:00.000Z"),
    startTime: new Date(`2026-08-08T${String(startHour).padStart(2, "0")}:00:00.000Z`),
    endTime: null,
    notes: "",
    isActive: false,
    templateName: null,
    exercises: [],
    supersetGroups: [],
    cardioEntries: [],
  };
}

describe("recoverySessionsChronological", () => {
  it("départage deux séances du même jour par leur heure de début", () => {
    const morning = session("morning", 9);
    const evening = session("evening", 18);

    expect(recoverySessionsChronological([evening, morning]).map((item) => item.id)).toEqual([
      "morning",
      "evening",
    ]);
  });
});
