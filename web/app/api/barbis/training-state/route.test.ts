import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSession } from "@/lib/models/types";

const recent = new Date(Date.now() - 2 * 86_400_000);
const old = new Date(Date.now() - 200 * 86_400_000);

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
  getGoals: async () => [],
  getSettings: async () => ({ bodyWeightKg: null, trainingPhase: null, trainingPhaseStartedAt: null }),
  getRecoveryCheckins: async () => [],
  getBodyWeights: async () => [],
}));

const { GET } = await import("./route");

describe("GET /api/barbis/training-state", () => {
  beforeEach(() => vi.stubEnv("JEERA_BARBIS_TOKEN", "secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuse sans jeton ou avec un mauvais jeton", async () => {
    expect((await GET(new Request("https://jeera.test/api/barbis/training-state"))).status).toBe(401);
    const wrong = { headers: { authorization: "Bearer autre" } };
    expect((await GET(new Request("https://jeera.test/api/barbis/training-state", wrong))).status).toBe(401);
  });

  it("sert l'état, borné à la fenêtre demandée", async () => {
    const auth = { headers: { authorization: "Bearer secret" } };
    const body = await (await GET(new Request("https://jeera.test/api/barbis/training-state", auth))).json();
    expect(body.timezone).toBe("Europe/Paris");
    expect(body.days).toBe(120);
    expect(body.sessions.map((row: { id: string }) => row.id)).toEqual(["recent"]);
    expect(body).toHaveProperty("currentWeek.muscles");
    expect(body).toHaveProperty("lastWeek.scorePct");
    expect(body.definitions.sets).toMatch(/Historique/);

    const wide = await (await GET(new Request("https://jeera.test/api/barbis/training-state?days=365", auth))).json();
    expect(wide.sessions).toHaveLength(2);
  });
});
