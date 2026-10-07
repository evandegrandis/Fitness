import { describe, expect, it } from "vitest";

import { bossDefeated, ghostDelta, ghostFor, pickBoss, sessionGame, tiredToday } from "@/lib/engines/session-game";
import type { SetSuggestion } from "@/lib/engines/progression";
import { SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, RecoveryCheckin, WorkoutSession } from "@/lib/models/types";

const NOW = new Date("2026-09-26T17:00:00Z");
const DAY = 86_400_000;

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "pec", name: "Pec deck", category: "Push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
    lastUsed: null, movementPattern: "isolation", resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: null, ...overrides,
  };
}

let counter = 0;
function set(weight: number, reps: number, minutes: number, suggested?: [number, number], setType: string = SetType.work, base = NOW): LoggedSet {
  counter += 1;
  return {
    id: `s${counter}`, weight, reps, setType: setType as LoggedSet["setType"], timestamp: new Date(base.getTime() + minutes * 60_000),
    setSlotIndex: 0, completed: true, supersetRoundIndex: null,
    suggestedWeight: suggested?.[0] ?? null, suggestedReps: suggested?.[1] ?? null,
  };
}

function session(id: string, date: Date, entries: { ex: Exercise; sets: LoggedSet[]; loggedId?: string }[], isActive = false): WorkoutSession {
  return {
    id, date, startTime: date, endTime: isActive ? null : date, notes: "", isActive, templateName: null, supersetGroups: [], cardioEntries: [],
    exercises: entries.map(({ ex, sets, loggedId }, index) => ({
      id: loggedId ?? `${id}-le-${index}`, orderIndex: index, notes: "", exerciseId: ex.id, exerciseName: ex.name, sets, supersetGroupId: null, plateauWeakPoint: null,
    })),
  };
}

const PEC = exercise();
const CURL = exercise({ id: "curl", name: "Curl debout" });
const past = session("past", new Date(NOW.getTime() - 3 * DAY), [{ ex: PEC, sets: [set(80, 10, 0)] }, { ex: CURL, sets: [set(18, 8, 5)] }]);

describe("suggestions battues et combo", () => {
  it("compte les suggestions battues, garde le combo sur une série tenue, le casse sur une série en dessous", () => {
    const today = session("today", NOW, [
      { ex: PEC, sets: [set(80, 11, 0, [80, 10]), set(80, 10, 3, [80, 10]), set(85, 10, 6, [82.5, 10]), set(80, 7, 9, [80, 9])] },
      { ex: CURL, sets: [set(18, 10, 12, [18, 9])] },
    ], true);
    const game = sessionGame(today, [PEC, CURL], [past]);
    // battue (+1 rep), tenue, battue (plus lourd), en dessous, battue
    expect(game).toEqual({ rated: 5, beaten: 3, held: 1, below: 1, combo: 1, bestCombo: 2 });
  });

  it("ne juge ni l'échauffement, ni un exercice découvert aujourd'hui, ni une série sans suggestion", () => {
    const NEW = exercise({ id: "new", name: "Machine inconnue" });
    const today = session("today", NOW, [
      { ex: PEC, sets: [set(40, 10, 0, [40, 10], SetType.warmup), set(80, 12, 3)] },
      { ex: NEW, sets: [set(50, 12, 6, [45, 10])] },
    ], true);
    expect(sessionGame(today, [PEC, NEW], [past])).toEqual({ rated: 0, beaten: 0, held: 0, below: 0, combo: 0, bestCombo: 0 });
  });
});

describe("boss du jour (maître du jeu)", () => {
  const suggestionFor = (map: Record<string, Partial<SetSuggestion>>) => (id: string) =>
    ({ weight: 0, reps: 0, ...map[id] }) as SetSuggestion;
  const today = session("today", NOW, [
    { ex: PEC, sets: [], loggedId: "le-pec" },
    { ex: CURL, sets: [], loggedId: "le-curl" },
  ], true);

  it("choisit le record le plus ambitieux que le moteur juge atteignable", () => {
    const boss = pickBoss(today, [PEC, CURL], [past], suggestionFor({
      "le-pec": { weight: 80, reps: 11, readyForPR: true },
      "le-curl": { weight: 20, reps: 8, readyForPR: true },
    }), [], NOW);
    expect(boss?.exerciseName).toBe("Curl debout");
    expect(boss).toMatchObject({ weight: 20, reps: 8, levelName: null });
  });

  it("un passage de palier passe avant un record", () => {
    const boss = pickBoss(today, [PEC, CURL], [past], suggestionFor({
      "le-pec": { weight: 82.5, reps: 10, readyForPR: true, readyForLevelUp: true, nextLevelName: "Avancé" },
      "le-curl": { weight: 22, reps: 8, readyForPR: true },
    }), [], NOW);
    expect(boss).toMatchObject({ exerciseName: "Pec deck", levelName: "Avancé" });
  });

  it("pas de boss si le moteur ne propose aucun record", () => {
    expect(pickBoss(today, [PEC, CURL], [past], suggestionFor({ "le-pec": { weight: 80, reps: 10 } }), [], NOW)).toBeNull();
  });

  it("se décide avant la première série : une séance entamée n'a pas de boss", () => {
    const started = session("today", NOW, [
      { ex: PEC, sets: [set(80, 10, 0, [80, 10])], loggedId: "le-pec" },
      { ex: CURL, sets: [], loggedId: "le-curl" },
    ], true);
    expect(pickBoss(started, [PEC, CURL], [past], suggestionFor({ "le-curl": { weight: 20, reps: 8, readyForPR: true } }), [], NOW)).toBeNull();
  });

  it("pas de boss après une nuit courte ou de l'alcool, la veille comptée", () => {
    const checkin = (hours: number | null, alcohol: boolean | null, daysAgo: number): RecoveryCheckin => ({
      id: "c", date: new Date(NOW.getTime() - daysAgo * DAY), tookCreatine: null, proteinTargetMet: null, sleepHours: hours, hadAlcohol: alcohol,
    });
    expect(tiredToday([checkin(5.5, null, 1)], NOW)).toBe(true);
    expect(tiredToday([checkin(8, true, 1)], NOW)).toBe(true);
    expect(tiredToday([checkin(7.5, false, 1)], NOW)).toBe(false);
    expect(tiredToday([checkin(4, true, 3)], NOW)).toBe(false);
    const boss = pickBoss(today, [PEC, CURL], [past], suggestionFor({ "le-pec": { weight: 80, reps: 11, readyForPR: true } }), [checkin(5, null, 1)], NOW);
    expect(boss).toBeNull();
  });

  it("vaincu dès qu'une série de l'exercice décroche une étoile", () => {
    const boss = { loggedExerciseId: "le-pec", exerciseId: "pec", exerciseName: "Pec deck", weight: 80, reps: 11, levelName: null };
    const done = set(80, 11, 0, [80, 11]);
    const played = session("today", NOW, [{ ex: PEC, sets: [done], loggedId: "le-pec" }], true);
    expect(bossDefeated(boss, played, {})).toBe(false);
    expect(bossDefeated(boss, played, { [done.id]: "repsAtWeight" })).toBe(true);
  });
});

describe("fantôme : toi il y a 4 semaines", () => {
  const at = (days: number) => new Date(NOW.getTime() - days * DAY);

  it("prend la séance la plus proche de 28 jours, entre 21 et 35", () => {
    const history = [
      session("d20", at(20), [{ ex: PEC, sets: [set(90, 10, 0, undefined, SetType.work, at(20))] }]),
      session("d26", at(26), [{ ex: PEC, sets: [set(75, 10, 0, undefined, SetType.work, at(26)), set(77.5, 9, 3, undefined, SetType.work, at(26))] }]),
      session("d33", at(33), [{ ex: PEC, sets: [set(70, 10, 0, undefined, SetType.work, at(33))] }]),
    ];
    const ghost = ghostFor(PEC, history, NOW);
    expect(ghost?.date).toEqual(at(26));
    expect(ghost).toMatchObject({ weight: 77.5, reps: 9, byReps: false });
  });

  it("aucun fantôme sans séance dans la fenêtre, ni pour un exercice assisté", () => {
    expect(ghostFor(PEC, [session("d10", at(10), [{ ex: PEC, sets: [set(80, 10, 0)] }])], NOW)).toBeNull();
    const assisted = exercise({ id: "dips-a", setPatternMode: "assisted_bodyweight" });
    expect(ghostFor(assisted, [session("d28", at(28), [{ ex: assisted, sets: [set(20, 8, 0, undefined, SetType.work, at(28))] }])], NOW)).toBeNull();
  });

  it("donne l'écart en direct sur le meilleur 1RM estimé, en reps au poids du corps", () => {
    const ghost = { date: at(28), weight: 80, reps: 10, value: 80 * (1 + 10 / 30), byReps: false };
    expect(ghostDelta(ghost, [])).toBeNull();
    expect(ghostDelta(ghost, [set(80, 12, 0)])).toBeCloseTo((80 * (1 + 12 / 30)) / (80 * (1 + 10 / 30)) - 1, 6);
    const bodyweight = { date: at(28), weight: 0, reps: 10, value: 10, byReps: true };
    expect(ghostDelta(bodyweight, [set(0, 11, 0)])).toBeCloseTo(0.1, 6);
  });
});
