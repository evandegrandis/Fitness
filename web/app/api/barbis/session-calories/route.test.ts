import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSession } from "@/lib/models/types";

const recent = new Date(Date.now() - 2 * 86_400_000);
const old = new Date(Date.now() - 90 * 86_400_000);

function session(id: string, date: Date): WorkoutSession {
  return {
    id, date, startTime: date, endTime: new Date(date.getTime() + 3_600_000), notes: "", isActive: false,
    templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: [{
      id: `l-${id}`, orderIndex: 0, notes: "", exerciseId: "x", exerciseName: "Presse", supersetGroupId: null,
      plateauWeakPoint: null,
      sets: [{ id: `s-${id}`, weight: 100, reps: 10, setType: "work", timestamp: date, setSlotIndex: 0, completed: true, supersetRoundIndex: null }],
    }],
  };
}

vi.mock("@/lib/db/queries", () => ({
  getExercises: async () => [],
  getSessions: async () => [session("old", old), session("recent", recent)],
  getBodyWeights: async () => [{ id: "w", measuredOn: old, weightKg: 80 }],
  getSettings: async () => ({ bodyWeightKg: null }),
}));

const { GET } = await import("./route");

describe("GET /api/barbis/session-calories", () => {
  beforeEach(() => vi.stubEnv("JEERA_BARBIS_TOKEN", "secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuse sans jeton", async () => {
    const response = await GET(new Request("https://jeera.test/api/barbis/session-calories"));
    expect(response.status).toBe(401);
  });

  it("renvoie l'estimation des séances de la fenêtre demandée", async () => {
    const auth = { headers: { authorization: "Bearer secret" } };
    const body = await (await GET(new Request("https://jeera.test/api/barbis/session-calories", auth))).json();
    expect(body.sessions.map((s: { sessionId: string }) => s.sessionId)).toEqual(["recent"]);
    expect(body.sessions[0]).toMatchObject({ bodyWeightKg: 80, bodyWeightSource: "weigh_in" });
    expect(body.sessions[0].kcal).toBeGreaterThan(0);

    const wide = await (await GET(new Request("https://jeera.test/api/barbis/session-calories?days=365", auth))).json();
    expect(wide.sessions).toHaveLength(2);
  });
});
