import { describe, expect, it } from "vitest";
import { habitualSessionPlan, habitualSessionSummary } from "@/lib/engines/habitual-session";
import { defaultStartChoice } from "@/lib/engines/template-recommendation";
import { MuscleGroup } from "@/lib/models/muscles";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedExercise, MuscleGoal, WorkoutSession, WorkoutTemplate } from "@/lib/models/types";

const BASE: Exercise = {
  id: "ex-press",
  name: "Wide Chest Press",
  category: "push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 12,
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
  muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};
const ex = (id: string, name: string, muscle: MuscleGroup): Exercise => ({ ...BASE, id, name, muscleMappings: [{ muscleGroup: muscle, coefficient: 1 }] });
const PRESS = ex("press", "Wide Chest Press", MuscleGroup.pectStern);
const RAISE = ex("raise", "Lateral raises", MuscleGroup.deltLat);
const CURL = ex("curl", "Curl debout", MuscleGroup.bicepsLong);
const ABS = ex("abs", "Total Abdominal", MuscleGroup.absHaut);
const PULL = ex("pull", "Tirage vertical", MuscleGroup.latSup);
const OLD = ex("old", "Leg extension", MuscleGroup.vasteLat);
const CATALOG = [PRESS, RAISE, CURL, ABS, PULL, OLD];

let n = 0;
/** Séance : exercices dans l'ordre, 3 séries chacun, 3 min entre séries ; `alternate` = A,B,A,B. */
function session(day: string, exercises: Exercise[], options: { alternate?: [Exercise, Exercise]; template?: string } = {}): WorkoutSession {
  const start = new Date(`${day}T18:00:00`);
  let minute = 0;
  const logged: LoggedExercise[] = exercises.map((exercise, orderIndex) => ({
    id: `le-${(n += 1)}`,
    orderIndex,
    notes: "",
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    supersetGroupId: null,
    plateauWeakPoint: null,
    sets: [],
  }));
  const push = (exercise: Exercise) => {
    const target = logged.find((entry) => entry.exerciseId === exercise.id)!;
    target.sets.push({ id: `s-${(n += 1)}`, weight: 50, reps: 10, setType: SetType.work, timestamp: new Date(start.getTime() + minute * 60_000), setSlotIndex: target.sets.length, completed: true, supersetRoundIndex: null });
    minute += 3;
  };
  for (const exercise of exercises) {
    if (options.alternate && options.alternate[1].id === exercise.id) continue;
    if (options.alternate && options.alternate[0].id === exercise.id) {
      for (let round = 0; round < 3; round += 1) {
        push(options.alternate[0]);
        push(options.alternate[1]);
      }
      continue;
    }
    for (let i = 0; i < 3; i += 1) push(exercise);
  }
  return { id: `session-${day}`, date: start, startTime: start, endTime: start, notes: "", isActive: false, templateName: options.template ?? null, exercises: logged, supersetGroups: [], cardioEntries: [] } as WorkoutSession;
}

const goals: MuscleGoal[] = [
  { parent: "pectoraux", weeklyGoalSets: 12 },
  { parent: "grand_dorsal", weeklyGoalSets: 12 },
  { parent: "biceps", weeklyGoalSets: 9 },
  { parent: "delt_lateral", weeklyGoalSets: 9 },
  { parent: "abs", weeklyGoalSets: 9 },
];

describe("habitualSessionPlan", () => {
  const history = [
    session("2026-09-10", [OLD, PRESS], { template: "Full Body" }),
    session("2026-09-29", [PRESS, RAISE, CURL, ABS], { alternate: [PRESS, RAISE] }),
    session("2026-10-01", [PRESS, RAISE, CURL, PULL], { alternate: [PRESS, RAISE] }),
    session("2026-10-03", [PRESS, RAISE, CURL, ABS]),
    session("2026-10-05", [RAISE, PRESS, CURL]),
  ];
  const now = new Date("2026-10-07T17:00:00");

  it("reprend ses exercices habituels quand la semaine en a besoin, dans son ordre, et laisse le vieux modèle de côté", () => {
    const plan = habitualSessionPlan(history, CATALOG, goals, now)!;
    const names = plan.exercises.map((exercise) => exercise.exerciseName);
    expect(names.slice(0, 2).sort()).toEqual(["Lateral raises", "Wide Chest Press"]);
    expect(names).toContain("Curl debout");
    expect(names).not.toContain("Leg extension");
    expect(plan.exercises.every((exercise) => exercise.targetSets >= 2 && exercise.targetSets <= 4)).toBe(true);
  });

  it("ajoute l'exercice qui comble un muscle en retard que le socle ne couvre pas", () => {
    const plan = habitualSessionPlan(history, CATALOG, goals.filter((goal) => ["pectoraux", "grand_dorsal", "biceps"].includes(goal.parent)), now)!;
    const pull = plan.exercises.find((exercise) => exercise.exerciseId === PULL.id);
    expect(pull).toMatchObject({ reason: "deficit", forParent: "grand_dorsal" });
    // La carte dit ce que la séance rapporte : le palier visé, sinon les muscles en retard ajoutés.
    expect(habitualSessionSummary(plan)).toMatch(/de quoi passer la semaine en (bronze|argent|or)|\+ Dorsaux en retard/);
  });

  it("garde liées les paires enchaînées en superset dans au moins deux séances", () => {
    const plan = habitualSessionPlan(history, CATALOG, goals, now)!;
    expect(plan.supersetPairs).toHaveLength(1);
    expect([...plan.supersetPairs[0]].sort()).toEqual([PRESS.id, RAISE.id].sort());
    const ids = plan.exercises.map((exercise) => exercise.exerciseId);
    expect(Math.abs(ids.indexOf(PRESS.id) - ids.indexOf(RAISE.id))).toBe(1);
  });

  it("les jambes mises de côté cette semaine ne sont plus prévues", () => {
    const LEG = ex("leg", "Leg Press", MuscleGroup.vasteLat);
    const withLegs = [
      session("2026-09-29", [PRESS, LEG, CURL]),
      session("2026-10-01", [PRESS, LEG, CURL]),
      session("2026-10-03", [PRESS, LEG, CURL]),
    ];
    const legGoals: MuscleGoal[] = [...goals, { parent: "quads", weeklyGoalSets: 9 }];
    const catalog = [...CATALOG, LEG];
    const ids = (lowerBodyOff: boolean) =>
      habitualSessionPlan(withLegs, catalog, legGoals, new Date("2026-10-07T17:00:00"), { lowerBodyOff })!.exercises.map((exercise) => exercise.exerciseId);
    expect(ids(false)).toContain(LEG.id);
    expect(ids(true)).not.toContain(LEG.id);
  });

  it("rien sans au moins 3 séances récentes", () => {
    expect(habitualSessionPlan(history.slice(0, 3), CATALOG, goals, new Date("2026-11-20T17:00:00"))).toBeNull();
  });
});

/**
 * 11/10/2026, en miniature : dernière séance habituelle de la semaine, biceps déjà presque servis
 * (3 à faire), abdos sautés (12 à faire). L'ancienne version reprenait ses deux curls habituels avec
 * leurs 3 séries (6 de biceps pour 3 à faire) et 3 séries d'abdos.
 */
describe("habitualSessionPlan : les séries suivent le besoin du jour", () => {
  const PREACHER = ex("preacher", "Preacher Curl", MuscleGroup.bicepsCourt);
  const catalog = [...CATALOG, PREACHER];
  const full = [PRESS, PREACHER, CURL, RAISE, ABS];
  const history = [
    // Trois séances par semaine d'habitude (deux semaines pleines).
    session("2026-09-22", full),
    session("2026-09-24", full),
    session("2026-09-26", full),
    session("2026-09-29", full),
    session("2026-10-01", full),
    session("2026-10-03", full),
    // Cette semaine : deux séances, sans abdos, un seul curl.
    session("2026-10-06", [PRESS, CURL, RAISE]),
    session("2026-10-09", [PRESS, CURL, RAISE]),
  ];
  const weekGoals: MuscleGoal[] = [
    { parent: "pectoraux", weeklyGoalSets: 12 },
    { parent: "biceps", weeklyGoalSets: 9 },
    { parent: "delt_lateral", weeklyGoalSets: 9 },
    { parent: "abs", weeklyGoalSets: 12 },
  ];
  const now = new Date("2026-10-11T15:00:00");
  const plan = habitualSessionPlan(history, catalog, weekGoals, now)!;
  const setsFor = (muscle: (typeof CATALOG)[number][]) =>
    plan.exercises.filter((entry) => muscle.some((exercise) => exercise.id === entry.exerciseId)).reduce((sum, entry) => sum + entry.targetSets, 0);

  it("un muscle presque servi ne reçoit plus deux exercices habituels", () => {
    expect(setsFor([CURL, PREACHER])).toBeLessThanOrEqual(4);
    expect(plan.exercises.filter((entry) => entry.exerciseId === CURL.id || entry.exerciseId === PREACHER.id)).toHaveLength(1);
  });

  it("le muscle le plus en retard reçoit le plus de séries", () => {
    expect(setsFor([ABS])).toBe(4);
  });

  it("dit le palier que la séance fait atteindre", () => {
    expect(plan.projected.scoreAfter).toBeGreaterThan(plan.projected.scoreBefore);
    expect(plan.projected.tierAfter).not.toBeNull();
  });
});

describe("defaultStartChoice", () => {
  const fullBody: WorkoutTemplate = { id: "t-full", name: "Full Body", createdAt: new Date("2026-06-01"), sortOrder: 0, exercises: [] } as unknown as WorkoutTemplate;
  const recent = [
    session("2026-10-03", [PRESS]),
    session("2026-10-05", [PRESS]),
    session("2026-10-06", [PRESS]),
  ];

  it("un modèle qui ne sert plus ne passe pas devant la séance du jour", () => {
    expect(defaultStartChoice([fullBody], fullBody.id, true, recent)).toEqual({ kind: "habitual" });
  });

  it("un modèle utilisé en ce moment reste la proposition", () => {
    const inUse = [session("2026-10-04", [PRESS], { template: "Full Body" }), session("2026-10-06", [PRESS], { template: "Full Body" }), ...recent];
    expect(defaultStartChoice([fullBody], fullBody.id, true, inUse)).toEqual({ kind: "template", templateId: fullBody.id });
  });

  it("sans habitude lisible, le modèle recommandé reste proposé comme avant", () => {
    expect(defaultStartChoice([fullBody], fullBody.id, false, recent)).toEqual({ kind: "template", templateId: fullBody.id });
  });
});
