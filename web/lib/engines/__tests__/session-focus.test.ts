import { describe, expect, it } from "vitest";
import { weekSessionPlan, sessionFocus, SESSION_FOCUS } from "@/lib/engines/session-focus";
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

const DELT = exercise("ex-delt", MuscleGroup.deltLat);
const TRI = exercise("ex-tri", MuscleGroup.tricepsLong);
const QUAD = exercise("ex-quad", MuscleGroup.vasteLat);
const OLD_QUAD = exercise("ex-old-quad", MuscleGroup.vasteMed);
const CATALOG = [DELT, TRI, QUAD, OLD_QUAD];

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
  { parent: MuscleParent.deltLateral, weeklyGoalSets: 12 },
  { parent: MuscleParent.triceps, weeklyGoalSets: 12 },
  { parent: MuscleParent.quads, weeklyGoalSets: 12 },
];

describe("récence réelle et groupes hors routine", () => {
  it("garde un muscle dormant visible mais le place après toute la routine récente", () => {
    const history = [session(daysAgo(2), [[DELT, 2]]), session(daysAgo(40), [[QUAD, 6]])];
    const focus = sessionFocus(history, CATALOG, GOALS, null, NOW);

    expect(focus.priorities.map((p) => p.parent)).toContain(MuscleParent.quads);
    expect(focus.priorities.slice(-2).map((row) => row.parent)).toEqual(
      expect.arrayContaining([MuscleParent.quads, MuscleParent.triceps])
    );
    expect(focus.priorities.slice(-2).every((row) => row.isDormant)).toBe(true);
    expect(focus.dormantCount).toBe(2); // quadriceps + triceps jamais vus
  });

  it("replace le groupe dans la routine active dès qu'il reprend cet entraînement", () => {
    const history = [session(daysAgo(2), [[DELT, 2]]), session(daysAgo(10), [[QUAD, 2]])];
    const focus = sessionFocus(history, CATALOG, GOALS, null, NOW);
    expect(focus.priorities.find((p) => p.parent === MuscleParent.quads)?.isDormant).toBe(false);
  });

  it("classe la récence en ordre croissant et relègue les valeurs hors fenêtre", () => {
    const juste = [session(daysAgo(SESSION_FOCUS.RELEVANCE_WINDOW_DAYS - 1), [[QUAD, 1]])];
    expect(sessionFocus(juste, CATALOG, GOALS, null, NOW).priorities.find((p) => p.parent === MuscleParent.quads)?.isDormant).toBe(false);
    const trop = [session(daysAgo(SESSION_FOCUS.RELEVANCE_WINDOW_DAYS + 2), [[QUAD, 1]])];
    expect(sessionFocus(trop, CATALOG, GOALS, null, NOW).priorities.find((p) => p.parent === MuscleParent.quads)?.isDormant).toBe(true);
  });

  it("propose les exercices réellement utilisés récemment, jamais celui d'il y a deux mois", () => {
    const history = [
      session(daysAgo(4), [[QUAD, 2]]),
      session(daysAgo(65), [[OLD_QUAD, 4]]),
    ];
    const quadRow = sessionFocus(history, CATALOG, GOALS, null, NOW).priorities.find(
      (row) => row.parent === MuscleParent.quads
    )!;

    expect(quadRow.suggestedExercises.map((suggestion) => suggestion.exerciseId)).toContain(QUAD.id);
    expect(quadRow.suggestedExercises.map((suggestion) => suggestion.exerciseId)).not.toContain(OLD_QUAD.id);
    expect(quadRow.suggestedExercises[0].daysSinceLastUsed).toBe(3);
  });

  it("remonte un exercice déjà prévu aujourd'hui même sans historique récent", () => {
    const live = session(NOW, [[OLD_QUAD, 0]], true);
    const quadRow = sessionFocus([], CATALOG, GOALS, live, NOW).priorities.find(
      (row) => row.parent === MuscleParent.quads
    )!;

    expect(quadRow.isDormant).toBe(false);
    expect(quadRow.suggestedExercises[0]).toMatchObject({
      exerciseId: OLD_QUAD.id,
      inCurrentSession: true,
    });
  });
});

describe("mise à jour en direct pendant la séance", () => {
  it("compte les séries de la séance en cours et fait reculer la priorité", () => {
    const history = [session(daysAgo(3), [[DELT, 1], [TRI, 1]])];
    const live = session(NOW, [[DELT, 6]], true);

    const avant = sessionFocus(history, CATALOG, GOALS, null, NOW);
    const pendant = sessionFocus(history, CATALOG, GOALS, live, NOW);

    const deltAvant = avant.priorities.find((p) => p.parent === MuscleParent.deltLateral)!;
    const deltPendant = pendant.priorities.find((p) => p.parent === MuscleParent.deltLateral)!;
    expect(deltPendant.remaining).toBeLessThan(deltAvant.remaining);
    expect(deltPendant.doneThisSession).toBe(6);
  });

  it("liste ce qui est déjà couvert aujourd'hui, du plus travaillé au moins", () => {
    const live = session(NOW, [[DELT, 5], [TRI, 2]], true);
    const focus = sessionFocus([session(daysAgo(3), [[DELT, 1], [TRI, 1]])], CATALOG, GOALS, live, NOW);
    expect(focus.workedToday.map((p) => p.parent)).toEqual([MuscleParent.deltLateral, MuscleParent.triceps]);
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
    expect(SESSION_FOCUS.MAX_ROWS).toBeLessThanOrEqual(14);
  });
});

describe("groupes suivis sans objectif", () => {
  const CURL = exercise("ex-curl", MuscleGroup.flechisseurs);
  const CATALOG_PLUS = [DELT, TRI, QUAD, CURL];

  it("remonte le volume d'avant-bras sans jamais en faire une priorité", () => {
    // Evan veut voir combien il en a fait, pas se voir réclamer un quota.
    const live = session(NOW, [[CURL, 4]], true);
    const focus = sessionFocus([session(daysAgo(2), [[DELT, 2]])], CATALOG_PLUS, GOALS, live, NOW);

    const forearms = focus.tracked.find((t) => t.parent === MuscleParent.forearms);
    expect(forearms?.effectiveSets).toBeGreaterThan(0);
    expect(focus.priorities.map((p) => p.parent)).not.toContain(MuscleParent.forearms);
  });

  it("reste vide tant qu'aucune série ne les a sollicités", () => {
    const focus = sessionFocus([session(daysAgo(2), [[DELT, 2]])], CATALOG_PLUS, GOALS, null, NOW);
    expect(focus.tracked).toEqual([]);
  });

  it("ne compte que la semaine en cours", () => {
    // Une séance de la semaine passée ne doit plus apparaître : la semaine se construit.
    const vieux = session(daysAgo(10), [[CURL, 5]]);
    expect(sessionFocus([vieux], CATALOG_PLUS, GOALS, null, NOW).tracked).toEqual([]);
  });
});

describe("suggestions d'exercices : seulement ce qui travaille vraiment le muscle", () => {
  it("ne propose pas un exercice de la séance qui ne fait qu'effleurer le muscle", () => {
    // Lateral raises en séance : deltoïde latéral à 1, mais trapèzes à 0,3 et gainage à 0,1.
    const raise: Exercise = {
      ...exercise("ex-raise", MuscleGroup.deltLat),
      muscleMappings: [
        { muscleGroup: MuscleGroup.deltLat, coefficient: 1 },
        { muscleGroup: MuscleGroup.tricepsLong, coefficient: 0.1 },
      ],
    };
    const catalog = [...CATALOG, raise];
    const live = session(new Date(NOW.getTime() - 20 * 60_000), [[raise, 0]], true);
    const history = [session(new Date(NOW.getTime() - 2 * 86_400_000), [[TRI, 3], [raise, 3]])];
    const focus = sessionFocus(history, catalog, GOALS, live, NOW);
    const triceps = focus.priorities.find((p) => p.parent === MuscleParent.triceps)!;
    expect(triceps.suggestedExercises.map((s) => s.exerciseId)).not.toContain("ex-raise");
    expect(triceps.suggestedExercises.map((s) => s.exerciseId)).toContain("ex-tri");
  });
});

describe("plan de séances de la semaine", () => {
  // NOW = jeudi 20/08/2026 : la semaine a commencé le lundi 17.
  const at = (iso: string) => session(new Date(iso), [[QUAD, 3]]);
  const fourPerWeek = [
    // 4 séances par semaine sur les 4 semaines complètes précédentes
    ...["2026-08-10", "2026-08-11", "2026-08-13", "2026-08-15"],
    ...["2026-08-03", "2026-08-04", "2026-08-06", "2026-08-08"],
    ...["2026-07-27", "2026-07-28", "2026-07-30", "2026-08-01"],
    ...["2026-07-20", "2026-07-21", "2026-07-23", "2026-07-25"],
  ].map((d) => at(`${d}T17:00:00`));

  it("déduit le rythme habituel des 4 dernières semaines complètes", () => {
    const plan = weekSessionPlan(fourPerWeek, NOW);
    expect(plan.habitualSessionsPerWeek).toBe(4);
    expect(plan.sessionsDoneThisWeek).toBe(0);
    expect(plan.sessionsLeftIncludingToday).toBe(4);
  });

  it("à la 3e séance de la semaine, il reste 2 séances en comptant celle du jour", () => {
    const history = [...fourPerWeek, at("2026-08-17T17:00:00"), at("2026-08-18T17:00:00")];
    expect(weekSessionPlan(history, NOW).sessionsLeftIncludingToday).toBe(2);
  });

  it("ignore les semaines sans séance (vacances) pour le rythme", () => {
    const withBreak = fourPerWeek.filter((s) => s.date < new Date("2026-08-01T00:00:00") || s.date >= new Date("2026-08-10T00:00:00"));
    expect(weekSessionPlan(withBreak, NOW).habitualSessionsPerWeek).toBe(4);
  });

  it("au-delà du rythme habituel, la séance du jour porte tout le reste", () => {
    const history = [...fourPerWeek, ...["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-19"].map((d, i) => at(`${d}T1${i}:00:00`))];
    expect(weekSessionPlan(history, NOW).sessionsLeftIncludingToday).toBe(1);
  });

  it("la part du jour divise ce qui restait au début de la séance", () => {
    const live = session(new Date(NOW.getTime() - 30 * 60_000), [[QUAD, 2]], true);
    const focus = sessionFocus(fourPerWeek, CATALOG, GOALS, live, NOW);
    const quads = [...focus.priorities, ...focus.workedToday].find((p) => p.parent === MuscleParent.quads)!;
    expect(quads.doneBeforeSession).toBe(0);
    expect(quads.todayShare).toBeCloseTo(12 / 4, 5);
    expect(quads.doneThisSession).toBe(2);
  });
});
