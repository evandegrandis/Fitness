import { describe, expect, it } from "vitest";
import { classify, buildRecords, recordCalibration } from "@/lib/engines/records";
import { storedFirstSuggestions } from "@/lib/engines/bilan";
import { debriefSession, historyBefore, recordTarget } from "@/lib/engines/session-insights";
import { MuscleGroup } from "@/lib/models/muscles";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Fixtures : une séance = des séries horodatées minute par minute.
// ---------------------------------------------------------------------------

const BASE: Exercise = {
  id: "ex-press",
  name: "Chest Press",
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
const PRESS = BASE;
const RAISE: Exercise = {
  ...BASE,
  id: "ex-raise",
  name: "Lateral raises",
  fatigueClass: "light",
  smallestIncrement: 2,
  muscleMappings: [{ muscleGroup: MuscleGroup.deltLat, coefficient: 1.0 }],
};
const ROW: Exercise = {
  ...BASE,
  id: "ex-row",
  name: "Rowing",
  fatigueClass: "heavy",
  muscleMappings: [{ muscleGroup: MuscleGroup.latSup, coefficient: 1.0 }],
};
const CATALOG = [PRESS, RAISE, ROW];

let counter = 0;
const uid = (prefix: string) => `${prefix}-${(counter += 1)}`;

/** Une série à `minute` minutes du début de la séance. */
type Spec = [exercise: Exercise, minute: number, weight: number, reps: number, suggestion?: [number, number]];

function makeSession(day: string, specs: Spec[], options: { superset?: Exercise[] } = {}): WorkoutSession {
  const start = new Date(`${day}T18:00:00`);
  const byExercise = new Map<string, LoggedExercise>();
  specs.forEach(([exercise, minute, weight, reps, suggestion], index) => {
    const logged =
      byExercise.get(exercise.id) ??
      ({
        id: uid("le"),
        orderIndex: byExercise.size,
        notes: "",
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: [],
        supersetGroupId: null,
        plateauWeakPoint: null,
      } as LoggedExercise);
    const set: LoggedSet = {
      id: uid("set"),
      weight,
      reps,
      setType: SetType.work,
      timestamp: new Date(start.getTime() + minute * 60_000),
      setSlotIndex: logged.sets.length,
      completed: true,
      supersetRoundIndex: null,
      suggestedWeight: suggestion?.[0] ?? null,
      suggestedReps: suggestion?.[1] ?? null,
    };
    void index;
    logged.sets.push(set);
    byExercise.set(exercise.id, logged);
  });
  const exercises = [...byExercise.values()];
  const supersetGroups = [];
  if (options.superset) {
    const groupId = uid("group");
    const members = exercises.filter((logged) => options.superset!.some((exercise) => exercise.id === logged.exerciseId));
    members.forEach((logged) => (logged.supersetGroupId = groupId));
    supersetGroups.push({ id: groupId, orderIndex: members[0].orderIndex, memberOrder: members.map((logged) => logged.id) });
  }
  return {
    id: uid("session"),
    date: start,
    startTime: start,
    endTime: new Date(start.getTime() + 60 * 60_000),
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups,
    cardioEntries: [],
  } as WorkoutSession;
}

/** Trois séances de développé seul en tête de séance, 3 min de repos, à 100 kg. */
function pressHistory(): WorkoutSession[] {
  return [
    makeSession("2026-09-21", [[PRESS, 0, 100, 8], [PRESS, 3, 100, 7], [PRESS, 6, 100, 6]]),
    makeSession("2026-09-24", [[PRESS, 0, 100, 9], [PRESS, 3, 100, 8], [PRESS, 6, 100, 7]]),
    makeSession("2026-09-27", [[PRESS, 0, 100, 10], [PRESS, 3, 100, 8], [PRESS, 6, 100, 7]]),
  ];
}

// ---------------------------------------------------------------------------

describe("historyBefore / J5", () => {
  it("ne lit jamais une séance postérieure ni la séance elle-même", () => {
    const history = pressHistory();
    const target = history[1];
    const before = historyBefore(target, history);
    expect(before.map((s) => s.id)).toEqual([history[0].id]);
  });

  it("une séance relue plus tard dit la même chose que le soir même", () => {
    const history = pressHistory();
    const target = history[1];
    const thatEvening = debriefSession(target, history.slice(0, 2), CATALOG);
    const later = debriefSession(target, history, CATALOG);
    expect(later.insights.headline.map((i) => i.title)).toEqual(thatEvening.insights.headline.map((i) => i.title));
    expect(later.review.performanceSignal).toBe(thatEvening.review.performanceSignal);
  });
});

describe("progression", () => {
  it("chiffre le gain à charge égale et la série de séances en hausse", () => {
    const history = pressHistory();
    const today = makeSession("2026-09-30", [[PRESS, 0, 100, 11], [PRESS, 3, 100, 9], [PRESS, 6, 100, 8]]);
    const { insights } = debriefSession(today, history, CATALOG);
    const progress = insights.sections.find((section) => section.kind === "progress")!.items[0];
    expect(progress.title).toBe("Chest Press : +1 rep à 100 kg, 3e séance de suite en hausse");
    expect(progress.detail).toContain("100 kg × 11 contre 100 kg × 10 le 27/09");
    // Même place que d'habitude : le gain n'est pas de la fraîcheur.
    expect(progress.detail).toContain("Même place dans la séance que d'habitude (commencé en premier)");
    expect(insights.celebrations).toContainEqual(
      expect.objectContaining({ kind: "progressStreak", exerciseId: PRESS.id })
    );
  });

  it("une machine découverte est de l'étalonnage : ni progression ni comparaison", () => {
    const today = makeSession("2026-09-30", [[ROW, 0, 50, 10, [40, 10]], [ROW, 3, 55, 9, [50, 10]]]);
    const { insights } = debriefSession(today, [], CATALOG);
    expect(insights.sections.find((section) => section.kind === "progress")).toBeUndefined();
    expect(insights.suggestionTally).toBeNull();
  });
});

describe("baisse : seulement sous ce que Jeera prévoyait, fatigue de séance comprise (12/10/2026)", () => {
  const DIPS: Exercise = { ...BASE, id: "ex-dips", name: "Dips", setPatternMode: "bodyweight", fatigueClass: "medium", muscleMappings: [{ muscleGroup: MuscleGroup.tricepsLat, coefficient: 1 }] };
  const PUSHDOWN: Exercise = { ...BASE, id: "ex-pushdown", name: "Extension triceps poulie", fatigueClass: "medium", muscleMappings: [{ muscleGroup: MuscleGroup.tricepsLat, coefficient: 1 }] };
  const catalog = [...CATALOG, DIPS, PUSHDOWN];
  const fresh = (day: string, reps: number) => makeSession(day, [[DIPS, 0, 0, reps]]);
  // Six séries d'extensions triceps (même muscle) avant les dips.
  const late = (day: string, reps: number) =>
    makeSession(day, [...Array.from({ length: 6 }, (_, i) => [PUSHDOWN, i * 3, 30, 10] as Spec), [DIPS, 20, 0, reps]]);
  const dipsInsight = (session: WorkoutSession, history: WorkoutSession[]) =>
    debriefSession(session, history, catalog)
      .insights.sections.flatMap((section) => section.items)
      .find((insight) => insight.kind === "progress" && insight.exerciseIds.includes(DIPS.id));

  it("exercice fait en fin de séance, même performance attendue : 3 reps de moins que la séance d'avant faite fraîche n'est pas une baisse", () => {
    const history = [fresh("2026-09-18", 20), late("2026-09-21", 17), fresh("2026-09-24", 20), fresh("2026-09-27", 20)];
    expect(dipsInsight(late("2026-09-30", 17), history)).toBeUndefined();
  });

  it("une vraie baisse, au même placement, reste dite, avec l'écart à la prévision", () => {
    const history = [fresh("2026-09-18", 20), fresh("2026-09-21", 20), fresh("2026-09-24", 20)];
    const insight = dipsInsight(fresh("2026-09-27", 12), history)!;
    expect(insight.tone).toBe("warning");
    expect(insight.title).toBe("Dips : 8 reps de moins au poids du corps");
    expect(insight.detail).toContain("40 % sous ce que Jeera prévoyait, fatigue de séance comprise");
  });
});

describe("fatigue de la séance", () => {
  it("est branchée dans le bilan et chiffrée quand l'exercice arrive plus tard que d'habitude", () => {
    const history = pressHistory();
    // Aujourd'hui : 9 séries lourdes de rowing AVANT le développé.
    const rows: Spec[] = Array.from({ length: 9 }, (_, i) => [ROW, i * 3, 80, 8] as Spec);
    const today = makeSession("2026-09-30", [...rows, [PRESS, 30, 100, 8], [PRESS, 33, 100, 7]]);
    const debrief = debriefSession(today, history, CATALOG);
    const pressLogged = today.exercises.find((logged) => logged.exerciseId === PRESS.id)!;
    const context = debrief.fatigueByLoggedExerciseId[pressLogged.id];
    expect(context.priorLoads).toEqual([expect.objectContaining({ exerciseName: "Rowing", workSetsCompleted: 9 })]);
    expect(context.fatiguePenalty(null)).toBeGreaterThanOrEqual(1);
    const fatigue = debrief.insights.sections.find((section) => section.kind === "fatigue")!.items[0];
    expect(fatigue.detail).toContain("Chest Press commencé après 9 séries (d'habitude après 0)");
    expect(fatigue.detail).toMatch(/100 kg × 8 vaut ~100 kg × (9|10|11) à frais/);
  });
});

describe("supersets", () => {
  it("résume un superset lié : tours, repos réel par exercice, rendement contre seul", () => {
    const soloRaises = [
      makeSession("2026-09-24", [[RAISE, 0, 14, 11], [RAISE, 3, 14, 10], [RAISE, 6, 14, 9]]),
      makeSession("2026-09-27", [[RAISE, 0, 14, 11], [RAISE, 3, 14, 10], [RAISE, 6, 14, 10]]),
    ];
    const history = [...pressHistory(), ...soloRaises];
    const today = makeSession(
      "2026-09-30",
      [
        [PRESS, 0, 100, 10], [RAISE, 2, 14, 9],
        [PRESS, 4, 100, 9], [RAISE, 6, 14, 8],
        [PRESS, 8, 100, 8], [RAISE, 10, 14, 7],
      ],
      { superset: [PRESS, RAISE] }
    );
    const { insights } = debriefSession(today, history, CATALOG);
    expect(insights.supersets).toHaveLength(1);
    const summary = insights.supersets[0];
    expect(summary.linked).toBe(true);
    expect(summary.rounds).toBe(3);
    expect(summary.switchSeconds).toBe(120);
    const raise = summary.members.find((member) => member.exerciseId === RAISE.id)!;
    expect(raise.restSeconds).toBe(240);
    expect(raise.soloRestSeconds).toBe(180);
    expect(raise.avgReps).toBe(8);
    expect(raise.soloAvgReps).toBeCloseTo(61 / 6, 5);
    const card = insights.sections.find((section) => section.kind === "superset")!.items[0];
    expect(card.title).toContain("Lateral raises perd 2,2 reps par série");
    expect(card.title).toBe("Chest Press + Lateral raises : 10 min au lieu de ~15 min, mais Lateral raises perd 2,2 reps par série");
    expect(card.detail).toContain("6 séries en 10 min (l'une après l'autre : ~15 min), 2 min pour passer de l'un à l'autre.");
    expect(card.detail).toContain("Lateral raises à 14 kg : 8 reps par série (seul 10,2)");
  });

  it("reconnaît une alternance non liée", () => {
    const today = makeSession("2026-09-30", [
      [PRESS, 0, 100, 10], [RAISE, 2, 14, 9],
      [PRESS, 4, 100, 9], [RAISE, 6, 14, 8],
    ]);
    const { insights } = debriefSession(today, pressHistory(), CATALOG);
    expect(insights.supersets).toHaveLength(1);
    expect(insights.supersets[0].linked).toBe(false);
  });
});

describe("face à la suggestion", () => {
  it("compte les séries au-dessus, à, en dessous, et dit où", () => {
    const today = makeSession("2026-09-30", [
      [PRESS, 0, 100, 11, [100, 10]],
      [PRESS, 3, 100, 8, [100, 8]],
      [PRESS, 6, 95, 7, [100, 7]],
    ]);
    const { insights } = debriefSession(today, pressHistory(), CATALOG);
    expect(insights.suggestionTally).toMatchObject({ beat: 1, met: 1, below: 1 });
    expect(insights.suggestionTally!.belowDetails[0].label).toBe("série 3 : 95 kg au lieu de 100");
  });

  it("utilise la suggestion réellement montrée comme référence du bilan", () => {
    const today = makeSession("2026-09-30", [[PRESS, 0, 100, 11, [102.5, 9]], [PRESS, 3, 100, 9, [100, 9]]]);
    expect(Object.values(storedFirstSuggestions(today))).toEqual([{ weight: 102.5, reps: 9 }]);
    const { review } = debriefSession(today, pressHistory(), CATALOG);
    expect(review.exercises[0]).toMatchObject({ referenceWeight: 102.5, referenceReps: 9 });
  });

  it("une séance sans suggestion enregistrée n'affiche pas de comparaison (pas de trou)", () => {
    const today = makeSession("2026-09-30", [[PRESS, 0, 100, 11], [PRESS, 3, 100, 9]]);
    const { insights } = debriefSession(today, pressHistory(), CATALOG);
    expect(insights.suggestionTally).toBeNull();
    expect(insights.sections.some((section) => section.kind === "suggestion")).toBe(false);
  });
});

describe("face à sa capacité du jour et au tiers attendu (24/10/2026)", () => {
  /** La séance, chaque série portant la cible et la prévision enregistrées par le moteur `version`. */
  const withEngine = (session: WorkoutSession, predicted: number[], version: string) => {
    let i = 0;
    return {
      ...session,
      exercises: session.exercises.map((logged) => ({
        ...logged,
        sets: logged.sets.map((set) => ({ ...set, predictedRepsAtActualWeight: predicted[i++], suggestionEngineVersion: version })),
      })),
    };
  };

  it("« Tirage : 72 × 9, ta capacité du jour était 72 × 7, +2 reps », et l'écart sur toutes ses séries", () => {
    const today = withEngine(makeSession("2026-09-30", [[ROW, 0, 72, 9, [72, 8]], [ROW, 4, 72, 7, [72, 7]]]), [7, 6], "web-v2.6-2026-10-24");
    const history = [makeSession("2026-09-26", [[ROW, 0, 72, 8], [ROW, 4, 72, 7]])];
    const debrief = debriefSession(today, history, CATALOG);
    const capacity = debrief.insights.sections.find((section) => section.kind === "capacity")!.items[0];
    expect(capacity.title).toBe("Rowing : 72 kg × 9, ta capacité du jour était 72 kg × 7, +2 reps");
    expect(capacity.detail).toMatch(/^Sur tes 2 séries : \+3 reps au total\./);
    // Le tiers attendu n'est dit que des cibles du moteur réglé ainsi.
    expect(debrief.insights.sections.find((section) => section.kind === "suggestion")!.items[0].title).toBe(
      "1 cible battue sur 2, le moteur en attend une sur trois"
    );
    const older = withEngine(makeSession("2026-09-30", [[ROW, 0, 72, 9, [72, 8]], [ROW, 4, 72, 7, [72, 7]]]), [7, 6], "web-v2.5-2026-10-15");
    expect(debriefSession(older, history, CATALOG).insights.sections.find((section) => section.kind === "suggestion")!.items[0].title).toBe("1 cible battue sur 2");
  });

  it("sans prévision enregistrée comme telle (moteur d'avant la v2.3), pas de capacité du jour", () => {
    const today = withEngine(makeSession("2026-09-30", [[ROW, 0, 72, 9, [72, 8]]]), [8], "web-v2.2-2026-08-30");
    const history = [makeSession("2026-09-26", [[ROW, 0, 72, 8]])];
    expect(debriefSession(today, history, CATALOG).insights.sections.some((section) => section.kind === "capacity")).toBe(false);
  });
});

describe("prochaine fois et en-tête", () => {
  it("la série cible décroche vraiment une étoile (même règle que l'Historique)", () => {
    const sets = pressHistory().flatMap((session) => session.exercises.flatMap((logged) => logged.sets));
    const at = new Date("2026-10-01T18:00:00");
    const targets = recordTarget(PRESS, sets, 100, at);
    expect(targets[0]).toEqual({ weight: 100, reps: 11 });
    const records = buildRecords(PRESS, sets);
    const calibration = recordCalibration(sets, PRESS);
    const below = { ...sets[0], id: "x", weight: 100, reps: 10, timestamp: at };
    expect(classify(below, PRESS, records, calibration)).toBeNull();
  });

  it("trois enseignements au plus en tête, jamais deux de la même famille", () => {
    const history = pressHistory();
    const today = makeSession("2026-09-30", [[PRESS, 0, 100, 11, [100, 10]], [PRESS, 3, 100, 9, [100, 9]], [PRESS, 6, 100, 8, [100, 8]]]);
    const { insights } = debriefSession(today, history, CATALOG, [{ parent: "pectoraux", weeklyGoalSets: 12 }]);
    expect(insights.headline.length).toBeLessThanOrEqual(3);
    expect(new Set(insights.headline.map((insight) => insight.kind)).size).toBe(insights.headline.length);
    expect(insights.week).not.toBeNull();
    for (const insight of insights.sections.flatMap((section) => section.items)) {
      expect(insight.title + insight.detail).not.toContain("—");
      expect(insight.title).toMatch(/\d/);
    }
  });
});
