import { describe, expect, it } from "vitest";
import { sessionFocus, SESSION_FOCUS } from "@/lib/engines/session-focus";
import { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";

const NOW = new Date("2026-08-20T18:00:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function exercise(id: string, muscle: MuscleGroup): Exercise {
  return {
    id, name: id, category: "", setPatternMode: "straight", repTargetMin: 6, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0,
    suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: muscle, coefficient: 1 }], lastUsed: null,
    movementPattern: null, resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  };
}

const DELT = exercise("ex-delt", MuscleGroup.deltAnt);
const TRI = exercise("ex-tri", MuscleGroup.tricepsLong);
const QUAD = exercise("ex-quad", MuscleGroup.vasteLat);
const CATALOG = [DELT, TRI, QUAD];

function session(date: Date, entries: [Exercise, number][], isActive = false): WorkoutSession {
  return {
    id: `s-${date.getTime()}-${Math.random()}`, date, startTime: date, endTime: isActive ? null : date,
    notes: "", isActive, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: entries.map(([ex, count], i) => ({
      id: `le-${ex.id}-${i}`, orderIndex: i, notes: "", exerciseId: ex.id, exerciseName: ex.name,
      supersetGroupId: null, plateauWeakPoint: null,
      sets: Array.from({ length: count }, (_, k) => ({
        id: `set-${ex.id}-${i}-${k}`, weight: 40, reps: 10, setType: "work" as const,
        timestamp: new Date(date.getTime() + k * 120_000), setSlotIndex: k, completed: true,
        supersetRoundIndex: null,
      })),
    })),
  };
}

const GOALS: MuscleGoal[] = [
  { parent: MuscleParent.deltoides, weeklyGoalSets: 12 },
  { parent: MuscleParent.triceps, weeklyGoalSets: 12 },
  { parent: MuscleParent.quads, weeklyGoalSets: 12 },
];

describe("filtre de pertinence, le point qui rend le panneau utilisable", () => {
  it("écarte un muscle sans aucune série depuis 28 jours au lieu de le proposer en boucle", () => {
    // Evan ne fait plus de jambes : les quadriceps sont en déficit maximal, donc ils
    // domineraient le classement, séance après séance, sans jamais lui être utiles.
    const history = [session(daysAgo(2), [[DELT, 2]]), session(daysAgo(40), [[QUAD, 6]])];
    const focus = sessionFocus(history, CATALOG, GOALS, null, NOW);

    expect(focus.priorities.map((p) => p.parent)).not.toContain(MuscleParent.quads);
    expect(focus.dormantCount).toBeGreaterThan(0);
  });

  it("le fait revenir dès qu'il reprend cet entraînement", () => {
    const history = [session(daysAgo(2), [[DELT, 2]]), session(daysAgo(10), [[QUAD, 2]])];
    const focus = sessionFocus(history, CATALOG, GOALS, null, NOW);
    expect(focus.priorities.map((p) => p.parent)).toContain(MuscleParent.quads);
  });

  it("ne compte comme récent que ce qui est dans la fenêtre, bornes comprises", () => {
    const juste = [session(daysAgo(SESSION_FOCUS.RELEVANCE_WINDOW_DAYS - 1), [[QUAD, 1]])];
    expect(sessionFocus(juste, CATALOG, GOALS, null, NOW).priorities.map((p) => p.parent)).toContain(
      MuscleParent.quads
    );
    const trop = [session(daysAgo(SESSION_FOCUS.RELEVANCE_WINDOW_DAYS + 2), [[QUAD, 1]])];
    expect(sessionFocus(trop, CATALOG, GOALS, null, NOW).priorities.map((p) => p.parent)).not.toContain(
      MuscleParent.quads
    );
  });
});

describe("mise à jour en direct pendant la séance", () => {
  it("compte les séries de la séance en cours et fait reculer la priorité", () => {
    const history = [session(daysAgo(3), [[DELT, 1], [TRI, 1]])];
    const live = session(NOW, [[DELT, 6]], true);

    const avant = sessionFocus(history, CATALOG, GOALS, null, NOW);
    const pendant = sessionFocus(history, CATALOG, GOALS, live, NOW);

    const deltAvant = avant.priorities.find((p) => p.parent === MuscleParent.deltoides)!;
    const deltPendant = pendant.priorities.find((p) => p.parent === MuscleParent.deltoides)!;
    expect(deltPendant.remaining).toBeLessThan(deltAvant.remaining);
    expect(deltPendant.doneThisSession).toBe(6);
  });

  it("liste ce qui est déjà couvert aujourd'hui, du plus travaillé au moins", () => {
    const live = session(NOW, [[DELT, 5], [TRI, 2]], true);
    const focus = sessionFocus([session(daysAgo(3), [[DELT, 1], [TRI, 1]])], CATALOG, GOALS, live, NOW);
    expect(focus.workedToday.map((p) => p.parent)).toEqual([MuscleParent.deltoides, MuscleParent.triceps]);
    expect(focus.workedToday[0].doneThisSession).toBe(5);
  });

  it("répond exactement au cas d'Evan : six séries d'épaules, zéro triceps", () => {
    const history = [session(daysAgo(3), [[DELT, 1], [TRI, 1]])];
    const live = session(NOW, [[DELT, 6]], true);
    const focus = sessionFocus(history, CATALOG, GOALS, live, NOW);
    // Le triceps, intouché, passe devant les deltoïdes déjà bien servis.
    expect(focus.priorities[0].parent).toBe(MuscleParent.triceps);
    expect(focus.priorities[0].doneThisSession).toBe(0);
  });
});

describe("garde-fous", () => {
  it("ne propose rien sans objectif ni historique", () => {
    const focus = sessionFocus([], CATALOG, [], null, NOW);
    expect(focus.priorities).toEqual([]);
    expect(focus.dormantCount).toBe(0);
  });

  it("borne la liste pour rester lisible entre deux séries", () => {
    expect(SESSION_FOCUS.MAX_ROWS).toBeLessThanOrEqual(6);
  });
});
