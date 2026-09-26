import { describe, expect, it } from "vitest";
import localBackup from "@/data/jeera_backup.json";
import {
  benchmarkLevel,
  benchmarkPrimaryAxisFor,
  benchmarkPosition,
  bestBenchmarkSet,
  bestBenchmarkSets,
  exerciseBenchmark,
  exerciseBenchmarkForSets,
  normalizedDistanceToNext,
  personalProgress,
  resolveStandard,
  loadScaleFor,
  strengthLevelEstimated1RM,
  strengthLevelRank,
  supportsStrengthLevelBenchmark,
  type StrengthThresholds,
} from "@/lib/engines/benchmark";
import { estimated1RM } from "@/lib/engines/e1rm";
import { SetType } from "@/lib/models/enums";
import { completedBenchmarkSets, type Exercise, type LoggedExercise, type LoggedSet } from "@/lib/models/types";

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

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: overrides.id ?? "ex-1",
    name: overrides.name ?? "Test",
    category: "Push",
    setPatternMode: "straight",
    repTargetMin: 8,
    repTargetMax: 20,
    smallestIncrement: 1.25,
    isFavorite: false,
    createdByUser: false,
    sortOrder: 0,
    suggestedRestSeconds: 75,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: 999,
    benchmarkHigh: 1_000,
    fatigueClass: "light",
    progressionPolicy: null,
    voluntaryRepCap: 0,
    muscleMappings: [],
    lastUsed: null,
    movementPattern: null,
    resistanceProfile: null,
    strengthStandardKey: null,
    benchmarkUnit: null,
    ...overrides,
  };
}

function loggedExercise(exerciseId: string, sets: LoggedSet[]): LoggedExercise {
  return {
    id: `le-${Math.random().toString(36).slice(2)}`,
    orderIndex: 0,
    notes: "",
    exerciseId,
    exerciseName: "Test",
    sets,
    supersetGroupId: null,
    plateauWeakPoint: null,
  };
}

const PROFILE = { bodyWeightKg: 80, gender: "male" as const, ageYears: 26 };
const THRESHOLDS: StrengthThresholds = { beginner: 5, novice: 10, intermediate: 20, advanced: 30, elite: 40 };

describe("strengthLevelEstimated1RM", () => {
  it("utilise Brzycki sous 8 reps", () => {
    expect(strengthLevelEstimated1RM(100, 7)).toBeCloseTo(120, 6);
  });

  it("mélange Brzycki et Epley à 9 reps comme documenté", () => {
    const brzycki = 12.5 * (36 / 28);
    const epley = 12.5 * (1 + 9 / 30);
    expect(strengthLevelEstimated1RM(12.5, 9)).toBeCloseTo((brzycki + epley) / 2, 6);
  });

  it("utilise Epley au-dessus de 10 reps", () => {
    expect(strengthLevelEstimated1RM(12, 12)).toBeCloseTo(16.8, 6);
  });

  it("refuse les séries sans charge/reps valides", () => {
    expect(strengthLevelEstimated1RM(0, 10)).toBe(0);
    expect(strengthLevelEstimated1RM(10, 0)).toBe(0);
  });
});

describe("jauge générique (paliers)", () => {
  it("situe les cinq paliers sur une jauge continue", () => {
    expect(benchmarkPosition(5, THRESHOLDS)).toBe(0);
    expect(benchmarkPosition(20, THRESHOLDS)).toBe(0.5);
    expect(benchmarkPosition(40, THRESHOLDS)).toBe(1);
    expect(benchmarkPosition(45, THRESHOLDS)).toBeGreaterThan(1);
  });

  it("attribue le dernier palier réellement franchi", () => {
    expect(benchmarkLevel(4, THRESHOLDS).key).toBe("below_beginner");
    expect(benchmarkLevel(10, THRESHOLDS).key).toBe("novice");
    expect(benchmarkLevel(41, THRESHOLDS).key).toBe("elite");
  });

  it("strengthLevelRank ordonne below_beginner < beginner < ... < elite", () => {
    expect(strengthLevelRank("below_beginner")).toBe(0);
    expect(strengthLevelRank("beginner")).toBe(1);
    expect(strengthLevelRank("novice")).toBe(2);
    expect(strengthLevelRank("intermediate")).toBe(3);
    expect(strengthLevelRank("advanced")).toBe(4);
    expect(strengthLevelRank("elite")).toBe(5);
  });

  it("compare les écarts entre axes via la position normalisée, jamais via les unités brutes", () => {
    // 9 kg bruts peuvent être plus proches du palier que 1 rep brute : seule la position compte.
    expect(normalizedDistanceToNext({ position: 0.49, nextLevel: "intermediate" })).toBeCloseTo(0.01, 8);
    expect(normalizedDistanceToNext({ position: 0.2, nextLevel: "novice" })).toBeCloseTo(0.05, 8);
    expect(normalizedDistanceToNext({ position: 1.1, nextLevel: null })).toBeNull();
  });
});

describe("exerciseBenchmark — chargé depuis le JSON (unit=load)", () => {
  it("résout la table machine (Plate loaded lat raise) via strengthStandardKey, jauge indicative", () => {
    const ex = exercise({ name: "Plate loaded lat raise", strengthStandardKey: "Plate loaded lat raise" });
    const result = exerciseBenchmark(ex, { weight: 12.5, reps: 9 }, PROFILE);
    expect(result.hasBenchmark).toBe(true);
    expect(result.thresholds).toEqual({ beginner: 25, novice: 41, intermediate: 61, advanced: 84, elite: 111 });
    expect(result.currentE1RM).toBeCloseTo(strengthLevelEstimated1RM(25, 9), 6);
    expect(result.isMachine).toBe(true);
    expect(result.source?.loadConvention).toContain("×2");
    expect(result.source?.loadConvention).toContain("charge totale");
    expect(result.caveat).toContain("convertie explicitement ×2");
    expect(result.primaryAxis).toBe("load");
    expect(result.secondary).toBeNull();
  });

  it("ne double pas le poids d'un haltère (Lateral raises)", () => {
    const ex = exercise({ name: "Lateral raises", strengthStandardKey: "Lateral raises" });
    const result = exerciseBenchmark(ex, { weight: 12, reps: 10 }, PROFILE);
    expect(result.currentE1RM).toBeCloseTo(16, 6);
    expect(result.level?.key).toBe("intermediate");
    expect(result.nextLevel).toBe("advanced");
    expect(result.source?.url).toContain("dumbbell-lateral-raise");
  });

  it("ignore un exercice sans strengthStandardKey (pas encore sourcé) — dégradation gracieuse, jamais de crash", () => {
    const unsupported = exercise({ name: "Chest Press", strengthStandardKey: null });
    expect(supportsStrengthLevelBenchmark(unsupported)).toBe(false);
    expect(exerciseBenchmark(unsupported, { weight: 100, reps: 8 }, PROFILE).hasBenchmark).toBe(false);
  });

  it("ignore une strengthStandardKey inconnue du JSON (jamais de crash, §9)", () => {
    const badKey = exercise({ strengthStandardKey: "Exercice qui n'existe pas" });
    expect(exerciseBenchmark(badKey, { weight: 100, reps: 8 }, PROFILE).hasBenchmark).toBe(false);
  });

  it("masque le niveau si le profil requis manque ou sort de la plage adulte documentée", () => {
    const lateral = exercise({ name: "Lateral raises", strengthStandardKey: "Lateral raises" });
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, gender: null }).hasBenchmark).toBe(false);
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, ageYears: 24 }).hasBenchmark).toBe(false);
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, bodyWeightKg: null }).hasBenchmark).toBe(false);
    // Hors de la plage d'ajustement, l'approximation n'est plus défendable : repère masqué.
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, bodyWeightKg: 59.9 }).hasBenchmark).toBe(false);
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, bodyWeightKg: 100.1 }).hasBenchmark).toBe(false);
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, bodyWeightKg: 73.7 }).hasBenchmark).toBe(true);
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, bodyWeightKg: 80 }).hasBenchmark).toBe(true);
  });

  it("affiche la référence H80 telle quelle au poids de la référence", () => {
    const lateral = exercise({ name: "Lateral raises", strengthStandardKey: "Lateral raises" });
    const result = exerciseBenchmark(lateral, { weight: 12, reps: 10 }, PROFILE);
    expect(result.profileLabel).toBe("Référence Homme · 80 kg · 25–40 ans · profil 26 ans");
  });

  it("ramène les seuils de charge au poids réel (force ∝ poids^2/3) et le dit (Evan, 26/09/2026)", () => {
    const resolved = resolveStandard(exercise({ strengthStandardKey: "Leg extension" }), { ...PROFILE, bodyWeightKg: 73.7 });
    const scale = Math.pow(73.7 / 80, 2 / 3);
    expect(loadScaleFor(73.7)).toBeCloseTo(scale, 10);
    const round = (value: number) => Math.round(value * scale * 10) / 10;
    expect(resolved?.primaryThresholds).toEqual({ beginner: round(45), novice: round(69), intermediate: round(99), advanced: round(135), elite: round(175) });
    expect(resolved?.profileLabel).toBe("Référence Homme 80 kg ajustée à 73,7 kg · 25–40 ans · profil 26 ans");
  });

  it("les seuils en répétitions au poids du corps restent ceux de la référence", () => {
    const resolved = resolveStandard(exercise({ strengthStandardKey: "Tractions SN" }), { ...PROFILE, bodyWeightKg: 73.7 });
    expect(resolved?.primaryAxis).toBe("reps");
    expect(resolved?.primaryThresholds).toEqual({ beginner: 1, novice: 8, intermediate: 14, advanced: 22, elite: 30 });
  });

  it("le JSON n'étant sourcé que pour le profil homme, une utilisatrice reste sans jauge (disclosed, pas fabriqué)", () => {
    const lateral = exercise({ name: "Lateral raises", strengthStandardKey: "Lateral raises" });
    expect(exerciseBenchmark(lateral, { weight: 12, reps: 10 }, { ...PROFILE, gender: "female" }).hasBenchmark).toBe(false);
  });
});

describe("exerciseBenchmark — Tractions SN, standard reps H80 uniquement", () => {
  const tractions = exercise({ name: "Tractions SN", strengthStandardKey: "Tractions SN" });

  it("n'alimente jamais la ligne reps PDC avec un set lesté", () => {
    const result = exerciseBenchmark(tractions, { weight: 20, reps: 5 }, PROFILE);
    expect(result.hasBenchmark).toBe(false);
  });

  it("bodyweight pur utilise la ligne reps homme 80 kg corrigée", () => {
    const result = exerciseBenchmark(tractions, { weight: 0, reps: 12 }, PROFILE);
    expect(result.hasBenchmark).toBe(true);
    expect(result.primaryAxis).toBe("reps");
    expect(result.currentE1RM).toBe(12);
    expect(result.thresholds).toEqual({ beginner: 1, novice: 8, intermediate: 14, advanced: 22, elite: 30 });
    expect(result.secondary).toBeNull();
  });

  it("expose l'axe reps au sélecteur de meilleur set", () => {
    expect(benchmarkPrimaryAxisFor(tractions)).toBe("reps");
  });
});

describe("resolveStandard", () => {
  it("renvoie les seuils sans nécessiter de set mesuré", () => {
    const resolved = resolveStandard(exercise({ strengthStandardKey: "Leg extension" }), PROFILE);
    expect(resolved).not.toBeNull();
    expect(resolved?.isMachine).toBe(true);
    expect(resolved?.primaryAxis).toBe("load");
    expect(resolved?.primaryThresholds).toEqual({ beginner: 45, novice: 69, intermediate: 99, advanced: 135, elite: 175 });
  });

  it("null si strengthStandardKey absent", () => {
    expect(resolveStandard(exercise({ strengthStandardKey: null }), PROFILE)).toBeNull();
  });

  it("HSPU utilise le slug StrengthLevel pluriel valide", () => {
    const result = exerciseBenchmark(
      exercise({ name: "HSPU", strengthStandardKey: "HSPU" }),
      { weight: 0, reps: 11 },
      PROFILE
    );
    expect(result.primaryAxis).toBe("reps");
    expect(result.source?.url).toContain("/handstand-push-ups/kg");
  });

  it("prépare aussi le mapping HSPU dans la source locale de seed", () => {
    const localExercises = (
      localBackup as unknown as {
        exercises: { name: string; strengthStandardKey?: string; benchmarkUnit?: string }[];
      }
    ).exercises;
    expect(localExercises.find((candidate) => candidate.name === "HSPU")).toMatchObject({
      strengthStandardKey: "HSPU",
      benchmarkUnit: "reps",
    });
  });

  it("un seul set lesté n'est pas recyclé comme jauge secondaire reps", () => {
    const result = exerciseBenchmark(
      exercise({ name: "Traction pronation large", strengthStandardKey: "Traction pronation large" }),
      { weight: 20, reps: 5 },
      PROFILE
    );
    expect(result.primaryAxis).toBe("load");
    expect(result.secondary).toBeNull();
  });

  it("sélectionne indépendamment le meilleur PDC et le meilleur lest sur un pull-up mixte", () => {
    const pullUps = exercise({
      name: "Traction pronation large",
      strengthStandardKey: "Traction pronation large",
      setPatternMode: "weighted_bodyweight",
    });
    const sets = [
      set({ weight: 0, reps: 13, setSlotIndex: 0 }),
      set({ weight: 20, reps: 8, setSlotIndex: 1 }),
      set({ weight: 10, reps: 16, setSlotIndex: 2 }),
    ];

    const best = bestBenchmarkSets(pullUps, sets);
    expect(best.reps).toMatchObject({ weight: 0, reps: 13 });
    expect(best.load).toMatchObject({ weight: 20, reps: 8 });

    const result = exerciseBenchmarkForSets(pullUps, sets, PROFILE);
    expect(result.primaryAxis).toBe("load");
    expect(result.currentE1RM).toBeCloseTo(strengthLevelEstimated1RM(20, 8), 6);
    expect(result.secondary).toMatchObject({ axis: "reps", currentValue: 13 });
  });

  it("sépare pareillement les axes Dips et ignore les finishers", () => {
    const dips = exercise({ name: "Dips", strengthStandardKey: "Dips", setPatternMode: "weighted_bodyweight" });
    const sets = [
      set({ weight: 0, reps: 14, setSlotIndex: 0 }),
      set({ weight: 25, reps: 7, setSlotIndex: 1 }),
      set({ weight: 0, reps: 22, setType: SetType.finisher, setSlotIndex: 2 }),
    ];
    const result = exerciseBenchmarkForSets(dips, sets, PROFILE);
    expect(result.primaryAxis).toBe("load");
    expect(result.currentE1RM).toBeCloseTo(strengthLevelEstimated1RM(25, 7), 6);
    expect(result.secondary).toMatchObject({ axis: "reps", currentValue: 14 });
  });
});

describe("personalProgress (P3.2 — marqueur perso, indépendant de StrengthLevel)", () => {
  const machine = exercise({ name: "Leg extension", strengthStandardKey: "Leg extension", resistanceProfile: null });

  it("aucune donnée -> hasData:false, percentile neutre (0.5)", () => {
    const result = personalProgress(machine, []);
    expect(result.hasData).toBe(false);
    expect(result.percentile).toBe(0.5);
  });

  it("un seul point -> percentile neutre (pas de division par zéro)", () => {
    const only = [set({ weight: 80, reps: 8, timestamp: new Date("2026-07-01T10:00:00Z") })];
    const result = personalProgress(machine, only);
    expect(result.hasData).toBe(true);
    expect(result.currentE1RM).toBeCloseTo(estimated1RM(80, 8), 6);
    expect(result.minE1RM).toBe(result.maxE1RM);
    expect(result.percentile).toBe(0.5);
  });

  it("positionne l'e1RM le plus RÉCENT (pas le plus haut) dans [min,max] observé, indépendamment de l'ordre d'entrée", () => {
    const history = [
      // Le set le plus lourd est au milieu, PAS le plus récent : la percentile doit suivre la
      // date, pas juste le max(e1RM).
      set({ weight: 60, reps: 8, timestamp: new Date("2026-06-01T10:00:00Z") }),
      set({ weight: 100, reps: 8, timestamp: new Date("2026-06-15T10:00:00Z") }),
      set({ weight: 80, reps: 8, timestamp: new Date("2026-07-01T10:00:00Z") }), // le plus récent
    ].reverse(); // ordre d'entrée délibérément non chronologique

    const result = personalProgress(machine, history);
    const e60 = estimated1RM(60, 8);
    const e100 = estimated1RM(100, 8);
    const e80 = estimated1RM(80, 8);
    expect(result.currentE1RM).toBeCloseTo(e80, 6);
    expect(result.minE1RM).toBeCloseTo(e60, 6);
    expect(result.maxE1RM).toBeCloseTo(e100, 6);
    expect(result.percentile).toBeCloseTo((e80 - e60) / (e100 - e60), 6);
  });

  it("un nouveau record absolu (le plus récent = le plus haut jamais fait) -> percentile 1", () => {
    const history = [
      set({ weight: 60, reps: 8, timestamp: new Date("2026-06-01T10:00:00Z") }),
      set({ weight: 90, reps: 8, timestamp: new Date("2026-07-01T10:00:00Z") }),
    ];
    expect(personalProgress(machine, history).percentile).toBe(1);
  });

  it("ignore les warmups et les sets bodyweight (weight<=0) — seuls les work/top_set chargés comptent", () => {
    const history = [
      set({ weight: 40, reps: 15, setType: SetType.warmup, timestamp: new Date("2026-06-01T09:00:00Z") }),
      set({ weight: 0, reps: 20, setType: SetType.work, timestamp: new Date("2026-06-01T09:30:00Z") }),
      set({ weight: 70, reps: 8, setType: SetType.work, timestamp: new Date("2026-07-01T10:00:00Z") }),
    ];
    const result = personalProgress(machine, history);
    expect(result.hasData).toBe(true);
    expect(result.minE1RM).toBe(result.maxE1RM); // un seul set retenu
    expect(result.currentE1RM).toBeCloseTo(estimated1RM(70, 8), 6);
  });

  it("ignore les sets non complétés", () => {
    const history = [set({ weight: 80, reps: 8, completed: false })];
    expect(personalProgress(machine, history).hasData).toBe(false);
  });
});

describe("bestBenchmarkSet — finishers totalement exclus du chemin StrengthLevel", () => {
  it("completedBenchmarkSets ne laisse pas un finisher bodyweight gonfler le repère reps", () => {
    const dips = loggedExercise("ex-dips", [
      set({ weight: 0, reps: 12, setType: SetType.work, setSlotIndex: 0 }),
      set({ weight: 0, reps: 14, setType: SetType.work, setSlotIndex: 1 }),
      set({ weight: 0, reps: 20, setType: SetType.finisher, setSlotIndex: 2 }),
    ]);
    const eligible = completedBenchmarkSets(dips);
    expect(eligible.some((candidate) => candidate.setType === SetType.finisher)).toBe(false);
    expect(bestBenchmarkSet(eligible, "reps")?.reps).toBe(14);
  });

  it("bestBenchmarkSet garde lui-même l'invariant si un appelant lui passe des sets bruts", () => {
    const dips = loggedExercise("ex-dips", [
      set({ weight: 0, reps: 25, setType: SetType.warmup, setSlotIndex: 0 }),
      set({ weight: 0, reps: 15, setType: SetType.work, setSlotIndex: 1 }),
      set({ weight: 0, reps: 20, setType: SetType.finisher, setSlotIndex: 2 }),
    ]);
    expect(bestBenchmarkSet(dips.sets, "reps")?.reps).toBe(15);
  });

  it("un finisher chargé est également ignoré sur l'axe charge", () => {
    const bench = loggedExercise("ex-bench", [
      set({ weight: 80, reps: 5, setType: SetType.topSet, setSlotIndex: 0 }),
      set({ weight: 100, reps: 20, setType: SetType.finisher, setSlotIndex: 1 }),
    ]);
    const best = bestBenchmarkSet(bench.sets);
    expect(best?.weight).toBe(80);
  });

  it("ignore les sets non complétés", () => {
    const dips = loggedExercise("ex-dips", [
      set({ weight: 0, reps: 30, setType: SetType.finisher, completed: false, setSlotIndex: 0 }),
      set({ weight: 0, reps: 10, setType: SetType.work, setSlotIndex: 1 }),
    ]);
    expect(bestBenchmarkSet(completedBenchmarkSets(dips), "reps")?.reps).toBe(10);
  });

  it("aucun set éligible -> null", () => {
    expect(bestBenchmarkSet([])).toBeNull();
  });
});

describe("chemin complet benchmark sans finisher — Dips bodyweight", () => {
  const dipsExercise = exercise({ name: "Dips", strengthStandardKey: "Dips" });

  it("le finisher 20 reps ne remplace jamais le meilleur work set à 14 reps", () => {
    const session = loggedExercise(dipsExercise.id, [
      set({ weight: 0, reps: 10, setType: SetType.work, setSlotIndex: 0 }),
      set({ weight: 0, reps: 14, setType: SetType.work, setSlotIndex: 1 }),
      set({ weight: 0, reps: 20, setType: SetType.finisher, setSlotIndex: 2 }),
    ]);

    const best = bestBenchmarkSet(completedBenchmarkSets(session), "reps");
    expect(best?.reps).toBe(14);

    const result = exerciseBenchmark(dipsExercise, best!, PROFILE);
    expect(result.hasBenchmark).toBe(true);
    expect(result.primaryAxis).toBe("reps");
    expect(result.currentE1RM).toBe(14);
    expect(result.level?.key).toBe("novice");
    expect(result.nextLevel).toBe("intermediate");
  });
});
