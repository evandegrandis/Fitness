/**
 * Invariants de cohérence de la cible (`target-invariants.ts`, `web/SUGGESTIONS.md` §7) : le vérificateur reconnaît les
 * incohérences du 13/10/2026, et des séances tirées au hasard, jouées dans le store comme dans l'app, n'en produisent
 * aucune (tests de propriété, générateur à graine fixe). Le rejeu de tout l'historique réel fait la même vérification
 * (`scripts/suggestions-audit/criteres.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}
globalThis.localStorage = new MemoryStorage();

const { useWorkoutStore } = await import("@/lib/store/workout");
const { MuscleGroup } = await import("@/lib/models/muscles");
const { orderedSets } = await import("@/lib/models/types");
const { targetInvariantViolations, isNearMaxAttempt } = await import("@/lib/engines/target-invariants");
type Exercise = import("@/lib/models/types").Exercise;
type UserSettings = import("@/lib/models/types").UserSettings;
type WorkoutSession = import("@/lib/models/types").WorkoutSession;
type InvariantSet = import("@/lib/engines/target-invariants").InvariantSet;
type Violation = import("@/lib/engines/target-invariants").Violation;

const SETTINGS: UserSettings = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "Evan",
  supersetRestSeconds: 180,
  bodyWeightKg: null,
  gender: null,
  ageYears: null,
  trainingPhase: null,
  trainingPhaseStartedAt: null,
  weeklyCardioMinutesGoal: null,
};

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex", name: "Exercice", category: "push", setPatternMode: "straight", repTargetMin: 8, repTargetMax: 12,
    smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0, suggestedRestSeconds: 120,
    machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "medium",
    progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
    lastUsed: null, movementPattern: null, resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
    maxLoad: null, ...overrides,
  };
}

const press = exercise({ name: "Wide Chest Press" });
const today = (...sets: [number, number, number | null, boolean?][]): InvariantSet[] =>
  sets.map(([weight, reps, rir, continuation]) => ({ weight, reps, rir, continuation: continuation ?? false }));
const codes = (v: Violation[]) => v.map((x) => x.code);

describe("le vérificateur reconnaît les incohérences du 13/10/2026", () => {
  it("127,5 × 1 après 100 × 8 au RIR 0 : remontée de charge après une série dure (et hors fourchette)", () => {
    const v = targetInvariantViolations({
      exercise: press, usualLoad: 130,
      today: today([140, 8, 0], [160, 1, 0], [120, 7, 0], [100, 8, 0]),
      target: { weight: 127.5, reps: 1, mode: "fallback_hypertrophy", reasonCodes: ["backoff_max_sets_reached"] },
    });
    expect(codes(v)).toContain("I3_remontee_apres_serie_dure");
    expect(codes(v)).toContain("I1_hors_fourchette");
  });

  it("157,5 × 7 à finir juste après 160 × 1 au RIR 0 : complément après un essai", () => {
    const v = targetInvariantViolations({
      exercise: press, usualLoad: 130,
      today: today([140, 8, 0], [160, 1, 0]),
      target: { weight: 157.5, reps: 7, mode: "fallback_hypertrophy", reasonCodes: ["logical_set_completion"] },
    });
    expect(codes(v)).toEqual(["I9_plus_que_la_serie_juste_faite", "I6_complement_hors_de_portee"]);
  });

  it("14 × 5 après 16 × 7 au RIR 0 (élévations latérales 8-12) : sous la fourchette, plus léger avec moins de reps", () => {
    const lateral = exercise({ smallestIncrement: 2 });
    const v = targetInvariantViolations({
      exercise: lateral, usualLoad: 16, today: today([16, 7, 0]),
      target: { weight: 14, reps: 5, mode: "fallback_hypertrophy", reasonCodes: ["fallback_down_one_step"] },
    });
    expect(codes(v)).toEqual(["I1_hors_fourchette", "I2_plus_leger_moins_de_reps"]);
  });

  it("140 × 9 après 140 × 8 au RIR 0 : demande plus que ce qu'il vient de montrer", () => {
    const v = targetInvariantViolations({
      exercise: press, usualLoad: 130, today: today([140, 8, 0]),
      target: { weight: 140, reps: 9, mode: "record_attempt", reasonCodes: [] },
    });
    expect(codes(v)).toEqual(["I9_plus_que_la_serie_juste_faite", "I4_au_dessus_du_1rm_montre"]);
  });

  it("120 × 8 après 120 × 7 au RIR 0 : plus que ce qu'il vient de prouver, même sous le 1RM de la 1re série", () => {
    const v = targetInvariantViolations({
      exercise: press, usualLoad: 130,
      today: today([140, 8, 0], [160, 1, 0], [120, 7, 0]),
      target: { weight: 120, reps: 8, mode: "fallback_hypertrophy", reasonCodes: ["backoff_v2"] },
    });
    expect(codes(v)).toEqual(["I9_plus_que_la_serie_juste_faite"]);
  });

  it("115 × 8 après 120 × 7 au RIR 0 : 5 kg de moins ne rendent pas une rep entière ; 110 × 8 est cohérent", () => {
    const after = (weight: number, reps: number) =>
      codes(targetInvariantViolations({
        exercise: press, usualLoad: 130, today: today([140, 8, 0], [120, 7, 0]),
        target: { weight, reps, mode: "fallback_hypertrophy", reasonCodes: [] },
      }));
    expect(after(117.5, 8)).toEqual(["I9_plus_que_la_serie_juste_faite"]);
    expect(after(115, 8)).toEqual(["I9_plus_que_la_serie_juste_faite"]);
    expect(after(110, 8)).toEqual([]);
  });

  it("poids du corps : 0 × 11 après 0 × 8 au RIR 0, même après 0 × 11 au RIR 2 en 1re série", () => {
    const pullups = exercise({ setPatternMode: "weighted_bodyweight", repTargetMin: 6, repTargetMax: 10, smallestIncrement: 1.25 });
    const v = targetInvariantViolations({
      exercise: pullups, usualLoad: 0, today: today([0, 11, 2], [0, 8, 0]),
      target: { weight: 0, reps: 11, mode: "record_attempt", reasonCodes: ["bw_rep_v2_first_set"] },
    });
    expect(codes(v)).toContain("I9_plus_que_la_serie_juste_faite");
  });

  it("22/09 : 35 × 7 au RIR 0 puis 30 × 4 enchaînées : la série de référence est 35 × 7, la cible ne peut pas être 35 × 8", () => {
    const triceps = exercise({ repTargetMin: 8, repTargetMax: 15 });
    const v = targetInvariantViolations({
      exercise: triceps, usualLoad: 35,
      today: today([40, 6, 0], [35, 5, 1, true], [35, 10, 2], [35, 7, 0], [30, 4, 1, true]),
      target: { weight: 35, reps: 8, mode: "fallback_hypertrophy", reasonCodes: ["backoff_v2"] },
    });
    expect(codes(v)).toEqual(["I9_plus_que_la_serie_juste_faite"]);
  });

  it("un essai quasi maximal : RIR ≤ 1, 4 reps au plus jusqu'à l'échec, plus lourd que les séries du jour", () => {
    expect(isNearMaxAttempt({ weight: 160, reps: 1, rir: 0, continuation: false }, today([140, 8, 0]), press, 130)).toBe(true);
    // Une série ratée à la charge de travail, par fatigue, n'est pas un essai.
    expect(isNearMaxAttempt({ weight: 100, reps: 3, rir: 0, continuation: false }, today([120, 7, 0]), press, 130)).toBe(false);
    expect(isNearMaxAttempt({ weight: 150, reps: 6, rir: 0, continuation: false }, today([140, 8, 0]), press, 130)).toBe(false);
  });
});

/** Générateur à graine fixe (mulberry32) : les tests restent reproductibles. */
function rng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)],
  };
}

const PATTERNS = ["straight", "straight", "top_set_backoff", "weighted_bodyweight", "assisted_bodyweight", "bodyweight"] as const;
const DAY = 86_400_000;

function randomScenario(seed: number) {
  const r = rng(seed);
  const pattern = r.pick(PATTERNS);
  const repTargetMin = r.pick([5, 6, 8, 8, 10]);
  const increment = pattern === "bodyweight" ? r.pick([0, 1]) : r.pick([1, 1.25, 2, 2.5, 2.5, 5]);
  const ex = exercise({
    setPatternMode: pattern,
    repTargetMin,
    repTargetMax: repTargetMin + r.pick([2, 4, 5, 7]),
    smallestIncrement: increment,
    fatigueClass: r.pick(["light", "medium", "heavy"] as const),
    maxLoad: pattern === "straight" && r.next() < 0.3 ? r.pick([40, 60, 85, 100]) : null,
  });
  const step = increment > 0 ? increment : 1;
  const baseLoad =
    pattern === "bodyweight" ? 0 : pattern === "weighted_bodyweight" ? step * r.int(0, 12) : pattern === "assisted_bodyweight" ? step * r.int(4, 20) : step * r.int(4, 50);
  const start = new Date("2026-10-13T16:00:00Z").getTime();
  const sessions: WorkoutSession[] = [];
  const count = r.int(0, 6);
  for (let s = 0; s < count; s++) {
    const date = new Date(start - (count - s) * r.int(2, 6) * DAY);
    const load = Math.max(0, baseLoad + step * r.int(-2, 2));
    const sets = Array.from({ length: r.int(1, 4) }, (_, i) => ({
      id: `h${seed}-${s}-${i}`, weight: load, reps: Math.max(1, ex.repTargetMin + r.int(-3, 4) - i),
      setType: "work" as const, timestamp: new Date(date.getTime() + i * 150_000), setSlotIndex: i, completed: true,
      supersetRoundIndex: null, reportedRir: r.next() < 0.2 ? null : r.int(0, 4),
    }));
    sessions.push({
      id: `s${seed}-${s}`, date, startTime: date, endTime: date, notes: "", isActive: false, templateName: null,
      supersetGroups: [], cardioEntries: [],
      exercises: [{ id: `le${seed}-${s}`, orderIndex: 0, notes: "", exerciseId: ex.id, exerciseName: ex.name, supersetGroupId: null, plateauWeakPoint: null, sets }],
    });
  }
  return { r, ex, sessions: sessions.reverse(), start, step, bodyWeightKg: r.next() < 0.5 ? null : r.int(65, 85) };
}

describe("propriété : aucune cible incohérente, quelle que soit la séance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // `SEEDS=10000 npx vitest run lib/engines/__tests__/target-invariants.test.ts` pour un tirage plus large (fait le
  // 15/10/2026 : 10 000 séances, zéro violation).
  it("400 séances tirées au hasard, jouées dans le store : zéro violation", () => {
    const failures: string[] = [];
    let checked = 0;
    for (let seed = Number(process.env.FROM ?? 1); seed <= Number(process.env.SEEDS ?? 400); seed++) {
      const { r, ex, sessions, start, step, bodyWeightKg } = randomScenario(seed);
      vi.setSystemTime(start);
      const store = useWorkoutStore.getState();
      useWorkoutStore.setState({ active: null, activeMode: "normal", justHitRecord: {}, recordsCache: {} });
      store.hydrate({ catalog: [ex], history: sessions, goals: [], settings: { ...SETTINGS, bodyWeightKg }, templates: [], recoveryCheckins: [], bodyWeights: [] });
      store.startEmpty("normal");
      store.addExercise(ex.id);
      const leId = useWorkoutStore.getState().active!.exercises[0].id;
      const sets = r.int(1, 6);
      for (let k = 0; k <= sets; k++) {
        const target = useWorkoutStore.getState().suggestion(leId);
        const logged = orderedSets(useWorkoutStore.getState().active!.exercises[0]).filter(
          (s) => s.completed && (s.setType === "work" || s.setType === "top_set" || s.setType === "backoff")
        );
        const done = logged.map((s) => ({
          weight: s.weight, reps: s.reps, rir: s.reportedRir ?? null,
          continuation: s.setTechnique != null || (s.logicalSetId != null && s.logicalSetId !== s.id),
        }));
        const violations = targetInvariantViolations({
          exercise: ex, today: done, usualLoad: target.usualLoad ?? null, bodyweightKg: bodyWeightKg ?? undefined,
          target: { weight: target.weight, reps: target.reps, mode: target.mode, reasonCodes: target.reasonCodes, setType: target.setType },
        });
        checked += 1;
        if (violations.length > 0) {
          failures.push(`graine ${seed} (${ex.setPatternMode} ${ex.repTargetMin}-${ex.repTargetMax}, cran ${ex.smallestIncrement}) après [${done.map((d) => `${d.weight}x${d.reps}@${d.rir}${d.continuation ? "c" : ""}`).join(" ")}] : cible ${target.weight} × ${target.reps} → ${violations.map((v) => v.code).join(", ")}`);
        }
        if (k === sets) break;
        // Ce qu'il fait : la cible, à peu près ; parfois un essai lourd, parfois un enchaînement rapide.
        const attempt = ex.setPatternMode !== "bodyweight" && r.next() < 0.12;
        const weight =
          ex.setPatternMode === "bodyweight" ? 0 : attempt ? target.weight + step * r.int(2, 6) : Math.max(0, target.weight + step * r.int(-2, 1));
        const reps = attempt ? r.int(1, 3) : Math.max(1, target.reps + r.int(-4, 2));
        const rir = r.next() < 0.15 ? null : attempt ? 0 : r.int(0, 4);
        vi.setSystemTime(Date.now() + (r.next() < 0.25 ? r.int(10, 80) : r.int(100, 300)) * 1000);
        useWorkoutStore.getState().logSet(leId, { weight, reps, reportedRir: rir });
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
