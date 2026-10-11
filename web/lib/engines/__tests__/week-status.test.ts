import { describe, expect, it } from "vitest";
import { weekKey, weekStatusFromRows, weekStatusText } from "@/lib/engines/week-status";
import { focusGroups, sessionFocus } from "@/lib/engines/session-focus";
import { MuscleGroup, MuscleParent, parentShortName, type MuscleParent as Parent } from "@/lib/models/muscles";
import type { ParentMuscleProgress } from "@/lib/engines/effective-sets";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";

const row = (parent: Parent, effectiveSets: number, goalSets: number): ParentMuscleProgress => ({
  parent,
  effectiveSets,
  goalSets,
  coverage: goalSets > 0 ? Math.min(1, effectiveSets / goalSets) : 0,
  percentDisplay: 0,
  remaining: Math.max(0, goalSets - effectiveSets),
  status: "covered",
});

/**
 * La semaine d'Evan à la fin de sa séance du 11/10/2026 (copie de la base en lecture seule) :
 * 68,3 % pour 150 séries d'objectifs, l'or à 70 % = 3 séries, qui ne pouvaient compter que sur les
 * abdos (5,4 restantes), les deltoïdes postérieurs (0,5) ou les jambes (41,3).
 */
const END_OF_1110 = [
  row(MuscleParent.pectoraux, 20.4, 20),
  row(MuscleParent.grandDorsal, 13.6, 14),
  row(MuscleParent.deltLateral, 17.3, 16),
  row(MuscleParent.deltPosterieur, 9.5, 10),
  row(MuscleParent.biceps, 18.1, 16),
  row(MuscleParent.triceps, 17.3, 16),
  row(MuscleParent.abs, 10.6, 16),
  row(MuscleParent.quads, 0.7, 9),
  row(MuscleParent.hamstrings, 0, 9),
  row(MuscleParent.glutes, 0, 9),
  row(MuscleParent.adductors, 0, 6),
  row(MuscleParent.calves, 0, 9),
];

describe("weekStatus : le palier pendant la séance", () => {
  const status = weekStatusFromRows(END_OF_1110);

  it("retrouve l'or à 3 séries, comme le bilan", () => {
    expect(status.goalTotal).toBe(150);
    expect(Math.round(status.score * 1000) / 10).toBe(68.3);
    expect(status.tier).toBe("argent");
    expect(status.next?.tier).toBe("or");
    expect(status.setsToNext).toBe(3);
  });

  it("dit où ces séries comptent : le haut du corps d'abord, pas les jambes", () => {
    expect(status.where.slice(0, 2).map((entry) => entry.parent)).toEqual([MuscleParent.abs, MuscleParent.deltPosterieur]);
    expect(status.where.map((entry) => entry.parent)).not.toContain(MuscleParent.pectoraux);
    const text = weekStatusText(status, (parent) => parentShortName[parent].toLowerCase());
    expect(text.title).toBe("Semaine argent");
    expect(text.next).toBe("or dans 3 séries");
    expect(text.where).toBe("Restent : abdos 5 · delt. post. 1 · ischios 9");
    expect(text.near).toBe(true);
  });

  it("jambes mises de côté : elles sortent des pistes, le score et les paliers ne bougent pas", () => {
    const off = weekStatusFromRows(END_OF_1110, { lowerBodyOff: true });
    expect(off.score).toBe(status.score);
    expect(off.setsToNext).toBe(3);
    expect(off.where.map((entry) => entry.parent)).toEqual([MuscleParent.abs, MuscleParent.deltPosterieur]);
    expect(off.nextReachable).toBe(true);
    expect(off.lowerBodyRemaining).toBeCloseTo(41.3, 5);
  });

  it("sans les jambes, un palier qui ne tient plus dans le haut du corps est dit hors de portée", () => {
    // Semaine argent (56 %) : l'or demande 7 séries, le haut du corps n'en offre plus que 2.
    const tight = weekStatusFromRows([row(MuscleParent.pectoraux, 28, 30), row(MuscleParent.quads, 0, 20)], { lowerBodyOff: true });
    expect(tight.next?.tier).toBe("or");
    expect(tight.setsToNext).toBeGreaterThan(tight.countable);
    expect(tight.nextReachable).toBe(false);
    const text = weekStatusText(tight, (parent) => parentShortName[parent], { lowerBodyOff: true });
    expect(text.where).toMatch(/hors de portée sans les jambes/);
    expect(text.near).toBe(false);
  });

  it("aucun tiret cadratin dans les libellés", () => {
    const text = weekStatusText(status, (parent) => parentShortName[parent]);
    expect(Object.values(text).join(" ")).not.toContain("—");
  });
});

describe("weekKey", () => {
  it("rattache chaque jour à son lundi (heure locale)", () => {
    expect(weekKey(new Date(2026, 9, 11, 16, 13))).toBe("2026-10-05"); // dimanche
    expect(weekKey(new Date(2026, 9, 5, 0, 5))).toBe("2026-10-05"); // lundi
    expect(weekKey(new Date(2026, 9, 12, 7, 0))).toBe("2026-10-12"); // lundi suivant : autre semaine
  });
});

describe("focusGroups : haut du corps, puis jambes", () => {
  const NOW = new Date("2026-10-11T16:00:00");
  const exercise = (id: string, muscle: MuscleGroup): Exercise => ({
    id, name: id, category: "", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0,
    suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null,
    benchmarkHigh: null, fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: muscle, coefficient: 1 }], lastUsed: null,
    movementPattern: null, resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
  });
  const PRESS = exercise("press", MuscleGroup.pectStern);
  const LEG = exercise("leg", MuscleGroup.vasteLat);
  const CALF = exercise("calf", MuscleGroup.gastrocnemien);
  const session = (date: Date, entries: [Exercise, number][]): WorkoutSession => ({
    id: `s-${date.getTime()}`, date, startTime: date, endTime: date, notes: "", isActive: false, templateName: null,
    supersetGroups: [], cardioEntries: [],
    exercises: entries.map(([ex, count], i) => ({
      id: `le-${ex.id}-${date.getTime()}`, orderIndex: i, notes: "", exerciseId: ex.id, exerciseName: ex.name,
      supersetGroupId: null, plateauWeakPoint: null,
      sets: Array.from({ length: count }, (_, k) => ({
        id: `set-${ex.id}-${date.getTime()}-${k}`, weight: 40, reps: 10, setType: "work" as const,
        timestamp: new Date(date.getTime() + k * 120_000), setSlotIndex: k, completed: true, supersetRoundIndex: null,
      })),
    })),
  });
  const goals: MuscleGoal[] = [
    { parent: MuscleParent.pectoraux, weeklyGoalSets: 6 },
    { parent: MuscleParent.quads, weeklyGoalSets: 9 },
    { parent: MuscleParent.calves, weeklyGoalSets: 9 },
  ];
  const history = [session(new Date("2026-09-28T18:00:00"), [[PRESS, 4], [LEG, 3], [CALF, 3]]), session(new Date("2026-10-06T18:00:00"), [[PRESS, 4]])];

  it("les jambes, même plus en retard, passent après le haut du corps", () => {
    const focus = sessionFocus(history, [PRESS, LEG, CALF], goals, null, NOW);
    // Sans séparation, les jambes (9 à faire chacune) arrivaient en tête.
    expect(focus.priorities[0].parent).not.toBe(MuscleParent.pectoraux);
    const groups = focusGroups(focus);
    expect(groups.upper.rows.map((entry) => entry.parent)).toEqual([MuscleParent.pectoraux]);
    expect(groups.lower.rows.map((entry) => entry.parent).sort()).toEqual([MuscleParent.calves, MuscleParent.quads].sort());
    expect(groups.lower.due).toBeGreaterThan(0);
  });
});
