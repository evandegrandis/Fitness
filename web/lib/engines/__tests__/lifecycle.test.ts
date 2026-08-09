import { describe, expect, it } from "vitest";
import { allLifeCycles, bestPastCycle, buildRoster, computeLifeCycle } from "@/lib/engines/lifecycle";
import { SetType } from "@/lib/models/enums";
import type { LoggedExercise, LoggedSet, WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Fixtures (mêmes conventions que variation-select.test.ts)
// ---------------------------------------------------------------------------

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-01T10:00:00Z"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function loggedExercise(exerciseId: string, sets: LoggedSet[]): LoggedExercise {
  return {
    id: `le-${Math.random().toString(36).slice(2)}`,
    orderIndex: 0,
    notes: "",
    exerciseId,
    exerciseName: exerciseId,
    sets: sets.map((s, i) => ({ ...s, setSlotIndex: i })),
    supersetGroupId: null,
    plateauWeakPoint: null,
  };
}

function session(date: Date, exercises: LoggedExercise[]): WorkoutSession {
  return {
    id: `session-${date.getTime()}-${Math.random().toString(36).slice(2)}`,
    date,
    startTime: date,
    endTime: date,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
  };
}

/** Séance unique pour `exerciseId`, à `date`, avec un seul set de travail weight×reps. */
function sessionAt(exerciseId: string, date: Date, weight: number, reps: number): WorkoutSession {
  return session(date, [loggedExercise(exerciseId, [set({ weight, reps, timestamp: date })])]);
}

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// computeLifeCycle — run courant
// ---------------------------------------------------------------------------

describe("computeLifeCycle", () => {
  it("exercice jamais fait -> weeks=0, e1rmGain=0, ended=true (jamais null, cf. signature §7)", () => {
    const result = computeLifeCycle("never-done", []);
    expect(result.weeks).toBe(0);
    expect(result.e1rmGain).toBe(0);
    expect(result.ended).toBe(true);
  });

  it("une seule séance qualifiante -> weeks=0 (pas de cycle mesurable), e1rmGain=0 (comparé à lui-même)", () => {
    const date = new Date("2026-07-01T10:00:00Z");
    const history = [sessionAt("ex-1", date, 60, 8)];
    const result = computeLifeCycle("ex-1", history, new Date("2026-07-02T10:00:00Z"));
    expect(result.weeks).toBe(0);
    expect(result.e1rmGain).toBe(0);
  });

  it("deux séances rapprochées (<= LIFECYCLE_RUN_GAP_DAYS) avec progrès -> même run, weeks/e1rmGain calculés sur tout le run", () => {
    const oldDate = new Date("2026-06-01T10:00:00Z");
    const recentDate = new Date("2026-06-15T10:00:00Z"); // +14 jours = 2 semaines
    const history = [sessionAt("ex-1", recentDate, 65, 8), sessionAt("ex-1", oldDate, 60, 8)];
    const result = computeLifeCycle("ex-1", history, recentDate);

    expect(result.weeks).toBeCloseTo(2, 5);
    // e1RM Epley : 65*(1+8/30) - 60*(1+8/30) = 5*(1+8/30)
    expect(result.e1rmGain).toBeCloseTo(5 * (1 + 8 / 30), 5);
  });

  it("gap > LIFECYCLE_RUN_GAP_DAYS entre deux blocs -> deux runs distincts, computeLifeCycle renvoie SEULEMENT le plus récent", () => {
    const veryOldDate = new Date("2026-01-01T10:00:00Z");
    const oldDate = new Date("2026-06-01T10:00:00Z"); // >> 21j après veryOldDate -> run séparé
    const recentDate = new Date("2026-06-10T10:00:00Z"); // 9j après oldDate -> même run que oldDate
    const history = [
      sessionAt("ex-1", recentDate, 70, 8),
      sessionAt("ex-1", oldDate, 60, 8),
      sessionAt("ex-1", veryOldDate, 40, 8),
    ];
    const result = computeLifeCycle("ex-1", history, recentDate);

    // Le run courant ne remonte qu'à `oldDate` (60kg), pas `veryOldDate` (40kg) : gain sur CE run
    // seulement = 70 vs 60, pas 70 vs 40.
    expect(result.startDate.getTime()).toBe(oldDate.getTime());
    expect(result.e1rmGain).toBeCloseTo((70 - 60) * (1 + 8 / 30), 5);
  });

  it("ended=true si plus de LIFECYCLE_RUN_GAP_DAYS jours se sont écoulés depuis la dernière ancre (référence `now`)", () => {
    const lastDate = new Date("2026-06-01T10:00:00Z");
    const history = [sessionAt("ex-1", lastDate, 60, 8)];

    const stillActive = computeLifeCycle("ex-1", history, new Date(lastDate.getTime() + 5 * DAY));
    const lapsed = computeLifeCycle("ex-1", history, new Date(lastDate.getTime() + 30 * DAY));

    expect(stillActive.ended).toBe(false);
    expect(lapsed.ended).toBe(true);
  });

  it("ignore les warmups et sets incomplets (spec §1, réutilise workingSetsOf)", () => {
    const date = new Date("2026-07-01T10:00:00Z");
    const history = [
      session(date, [
        loggedExercise("ex-1", [
          set({ weight: 200, reps: 20, setType: SetType.warmup, timestamp: date }),
          set({ weight: 999, reps: 1, completed: false, timestamp: date }),
          set({ weight: 60, reps: 8, setType: SetType.work, timestamp: date }),
        ]),
      ]),
    ];
    const result = computeLifeCycle("ex-1", history, date);
    // Un seul set qualifiant -> une seule séance qualifiante -> weeks=0/e1rmGain=0, PAS de crash ni
    // de valeur faussée par le warmup 200kg/20 ou le set raté 999kg.
    expect(result.weeks).toBe(0);
    expect(result.e1rmGain).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// allLifeCycles / bestPastCycle
// ---------------------------------------------------------------------------

describe("allLifeCycles / bestPastCycle", () => {
  it("allLifeCycles segmente en runs contigus, du plus récent au plus ancien", () => {
    const veryOldDate = new Date("2026-01-01T10:00:00Z");
    const oldDate = new Date("2026-06-01T10:00:00Z");
    const recentDate = new Date("2026-06-10T10:00:00Z");
    const history = [
      sessionAt("ex-1", recentDate, 70, 8),
      sessionAt("ex-1", oldDate, 60, 8),
      sessionAt("ex-1", veryOldDate, 40, 8),
    ];
    const runs = allLifeCycles("ex-1", history);
    expect(runs).toHaveLength(2);
    expect(runs[0].startDate.getTime()).toBe(oldDate.getTime());
    expect(runs[1].startDate.getTime()).toBe(veryOldDate.getTime());
  });

  it("bestPastCycle choisit le run le plus fort (weeks x gain), PAS forcément le run courant", () => {
    // Run ancien : 8 semaines, séances toutes les 14j (<= LIFECYCLE_RUN_GAP_DAYS, donc un seul run
    // continu malgré sa durée totale > 21j — c'est l'écart ENTRE séances CONSÉCUTIVES qui compte,
    // pas l'écart entre le début et la fin du run). +15kg sur ce run -> run fort.
    const strongRunDates = [0, 14, 28, 42, 56].map((d) => new Date(new Date("2026-01-01T10:00:00Z").getTime() + d * DAY));
    const strongRunWeights = [30, 34, 38, 42, 45]; // même index -> même séance (progression monotone)
    const strongRunStart = strongRunDates[0];
    // Run récent : plateau/régression légère (gain nul), démarre > 21j après la fin du run fort.
    const weakRunStart = new Date("2026-04-05T10:00:00Z");
    const weakRunEnd = new Date("2026-04-10T10:00:00Z");

    const history = [
      sessionAt("ex-1", weakRunEnd, 60, 8),
      sessionAt("ex-1", weakRunStart, 60, 8), // même charge -> gain nul sur le run récent
      ...strongRunDates.map((date, i) => sessionAt("ex-1", date, strongRunWeights[i], 8)).reverse(),
    ];

    const best = bestPastCycle("ex-1", history);
    expect(best).not.toBeNull();
    expect(best!.startDate.getTime()).toBe(strongRunStart.getTime());
    expect(best!.e1rmGain).toBeCloseTo((45 - 30) * (1 + 8 / 30), 5);
  });

  it("bestPastCycle renvoie null si l'exercice n'a jamais été fait", () => {
    expect(bestPastCycle("never-done", [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRoster — classement dérivé à la volée, normalisation data-driven (§7)
// ---------------------------------------------------------------------------

describe("buildRoster", () => {
  it("normalise lifecycleQuality dans [0,1] relativement au meilleur cycle DU ROSTER (pas une constante arbitraire)", () => {
    // Séances toutes les 14j (<= LIFECYCLE_RUN_GAP_DAYS) pour former un seul run continu de 8
    // semaines (56j) — un simple aller-retour à 56j d'écart splitterait en 2 runs (cf. bug de
    // fixture trouvé et corrigé sur le test précédent).
    const dates = [0, 14, 28, 42, 56].map((d) => new Date(new Date("2026-01-01T10:00:00Z").getTime() + d * DAY));
    const history = [
      // ex-strong : +15kg sur 8 semaines -> le meilleur du roster -> quality = 1. `.reverse()` car
      // `dates` est croissant (plus ancien en premier) alors que `history` suit la convention
      // "plus récent en premier" (comme `state.history` partout ailleurs).
      ...dates.map((date, i) => sessionAt("ex-strong", date, [30, 34, 38, 42, 45][i], 8)).reverse(),
      // ex-half : même durée, moitié du gain (+7.5kg) -> quality proche de 0.5.
      ...dates.map((date, i) => sessionAt("ex-half", date, [30, 31.9, 33.8, 35.6, 37.5][i], 8)).reverse(),
    ];

    const roster = buildRoster(["ex-strong", "ex-half", "ex-never-done"], history);
    const strong = roster.find((r) => r.exerciseId === "ex-strong")!;
    const half = roster.find((r) => r.exerciseId === "ex-half")!;
    const neverDone = roster.find((r) => r.exerciseId === "ex-never-done")!;

    expect(strong.lifecycleQuality).toBeCloseTo(1, 5);
    expect(half.lifecycleQuality).toBeCloseTo(0.5, 2);
    expect(half.lifecycleQuality!).toBeLessThan(strong.lifecycleQuality!);
    expect(neverDone.bestCycle).toBeNull();
    expect(neverDone.lifecycleQuality).toBeNull();
  });

  it("roster entièrement plat (aucun gain positif nulle part) -> lifecycleQuality=0 pour tous les exercices déjà faits (pas de division par zéro)", () => {
    const date1 = new Date("2026-06-01T10:00:00Z");
    const date2 = new Date("2026-06-08T10:00:00Z");
    const history = [sessionAt("ex-flat", date2, 60, 8), sessionAt("ex-flat", date1, 60, 8)];

    const roster = buildRoster(["ex-flat"], history);
    expect(roster[0].bestCycle).not.toBeNull();
    expect(roster[0].lifecycleQuality).toBe(0);
  });

  it("roster vide -> tableau vide, pas de crash", () => {
    expect(buildRoster([], [])).toEqual([]);
  });
});
