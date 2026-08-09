import { describe, expect, it } from "vitest";

import { sessionsNewestFirst, type WorkoutSession } from "@/lib/models/types";

function session(id: string, date: string, startTime = date): WorkoutSession {
  return {
    id,
    date: new Date(date),
    startTime: new Date(startTime),
    endTime: null,
    notes: "",
    isActive: false,
    templateName: null,
    exercises: [],
    supersetGroups: [],
    cardioEntries: [],
  };
}

describe("sessionsNewestFirst", () => {
  it("réinsère une ancienne séance sans casser l'ordre DESC consommé par les moteurs", () => {
    const newest = session("newest", "2026-08-08T10:00:00.000Z");
    const restored = session("restored", "2026-07-24T10:00:00.000Z");
    const oldest = session("oldest", "2026-07-01T10:00:00.000Z");

    expect(sessionsNewestFirst([restored, newest, oldest]).map((item) => item.id)).toEqual([
      "newest",
      "restored",
      "oldest",
    ]);
  });

  it("départage deux dates égales par l'heure réelle de début", () => {
    const morning = session("morning", "2026-08-08T00:00:00.000Z", "2026-08-08T08:00:00.000Z");
    const evening = session("evening", "2026-08-08T00:00:00.000Z", "2026-08-08T18:00:00.000Z");

    expect(sessionsNewestFirst([morning, evening]).map((item) => item.id)).toEqual(["evening", "morning"]);
  });
});
