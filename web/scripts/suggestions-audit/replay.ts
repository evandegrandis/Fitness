/**
 * Rejeu du moteur de suggestion sur un export de données (LECTURE SEULE, voir `web/SUGGESTIONS.md`).
 *
 * Chaque séance est rejouée dans le store, horloge figée, série par série : juste avant chaque série réelle,
 * on lit la suggestion du moteur (qui ne voit que les séances d'avant et les séries déjà faites ce jour-là),
 * puis on enregistre la série réelle. Une ligne JSON par série, avec le contexte.
 *
 * Usage (depuis `web/`) :
 *   TZ=Europe/Paris npx tsx scripts/suggestions-audit/replay.ts <export.json> <sortie.jsonl>
 * Pour rejouer un AUTRE moteur (par exemple la branche principale dans un autre worktree) avec ce script :
 *   cd <autre worktree>/web && TZ=Europe/Paris npx tsx --tsconfig ./tsconfig.json <ce fichier> <export.json> <sortie.jsonl>
 * Réglage : `--set SHRINK_K=4 --set HALF_LIFE_DAYS=60` modifie `REP_DROP` le temps du rejeu (si le moteur l'a).
 *
 * Le script n'écrit rien en base et refuse d'écrire sa sortie dans le dépôt.
 */
import { existsSync, readFileSync, unlinkSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

// --- Horloge figée et stockage en mémoire, installés AVANT de charger le store ------------------------
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
const RealDate = Date;
let frozen = RealDate.now();
class FrozenDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date> | []) {
    if (args.length === 0) super(frozen);
    else super(...(args as ConstructorParameters<typeof Date>));
  }
  static now() {
    return frozen;
  }
}
(globalThis as unknown as { Date: DateConstructor }).Date = FrozenDate as unknown as DateConstructor;
function setNow(at: Date | number) {
  frozen = typeof at === "number" ? at : at.getTime();
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function insideRepo(path: string): boolean {
  let dir = dirname(resolve(path));
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, ".git"))) return true;
    dir = dirname(dir);
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const sets: [string, number][] = [];
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--set") {
      const [key, value] = args[++i].split("=");
      sets.push([key, Number(value)]);
    } else positional.push(args[i]);
  }
  const [dataPath, outPath] = positional;
  if (!dataPath || !outPath) {
    console.error("usage : replay.ts <export.json> <sortie.jsonl> [--set CLE=valeur]");
    process.exit(1);
  }
  if (insideRepo(outPath)) {
    console.error("replay.ts : la sortie contient des données personnelles, elle doit être écrite hors du dépôt.");
    process.exit(1);
  }

  const { useWorkoutStore } = await import("@/lib/store/workout");
  const { orderedSets, primaryParent, aggregateCoefficient } = await import("@/lib/models/types");
  const { reprojectSuggestionAtWeight } = await import("@/lib/engines/progression");
  const { effTotal } = await import("@/lib/engines/predict");
  const { ALGO_V2 } = await import("@/lib/engines/constants");
  const { physiologicalSetUnits } = await import("@/lib/engines/set-structure");
  const { collectExerciseHistory } = await import("@/lib/engines/patterns");
  const { recordCalibration, isCalibrating } = await import("@/lib/engines/records");
  type AllData = import("@/lib/db/queries").AllData;
  type LoggedSet = import("@/lib/models/types").LoggedSet;

  if (sets.length > 0) {
    // Le module n'existe que dans les moteurs qui apprennent la perte de reps.
    const mod = (await import("@/lib/engines/rep-drop" as string).catch(() => null)) as { REP_DROP?: Record<string, number> } | null;
    if (!mod?.REP_DROP) throw new Error("--set : ce moteur n'a pas de REP_DROP");
    for (const [key, value] of sets) {
      if (!(key in mod.REP_DROP)) throw new Error(`--set : clé inconnue ${key}`);
      mod.REP_DROP[key] = value;
    }
  }

  const data = JSON.parse(readFileSync(dataPath, "utf8"), (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as AllData;
  const bodyweight = data.settings.bodyWeightKg && data.settings.bodyWeightKg > 0 ? data.settings.bodyWeightKg : undefined;
  const sessions = [...data.sessions].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (existsSync(outPath)) unlinkSync(outPath);
  const store = useWorkoutStore;

  for (const target of sessions) {
    const history = data.sessions.filter((s) => s.date < target.date);
    store.getState().hydrate({
      catalog: data.exercises, history, goals: data.goals, settings: data.settings, templates: data.templates,
      recoveryCheckins: data.recoveryCheckins, bodyWeights: data.bodyWeights,
    });
    const all = target.exercises
      .flatMap((le) => orderedSets(le).map((s) => ({ le, s })))
      .sort((a, b) => a.s.timestamp.getTime() - b.s.timestamp.getTime() || a.le.orderIndex - b.le.orderIndex || a.s.setSlotIndex - b.s.setSlotIndex);
    if (all.length === 0) continue;
    const gaps = all.slice(1).map((x, i) => x.s.timestamp.getTime() - all[i].s.timestamp.getTime());
    // Séances importées sans horaires (toutes les séries à la même seconde) : horaires synthétiques espacés.
    const synthetic = gaps.length > 0 && gaps.filter((g) => g < 1000).length > gaps.length / 2;
    const active = { ...target, isActive: true, endTime: null, exercises: target.exercises.map((le) => ({ ...le, sets: [] as LoggedSet[] })) };
    setNow(target.date);
    store.setState({ active, justHitRecord: {}, recordsCache: {}, activeMode: "normal", freshOverrides: new Set<string>() });
    const start = synthetic ? target.date.getTime() : all[0].s.timestamp.getTime();
    const lines: string[] = [];
    let rank = 0;
    let previousLe: string | null = null;
    let previousAt: number | null = null;

    all.forEach(({ le, s }, idx) => {
      const at = synthetic ? new Date(target.date.getTime() + idx * 150_000) : s.timestamp;
      setNow(at.getTime() - 1000);
      const state = store.getState();
      const liveLe = state.active!.exercises.find((x) => x.id === le.id)!;
      const exercise = state.catalog.find((e) => e.id === le.exerciseId)!;
      const parent = primaryParent(exercise);
      const suggestion = state.suggestion(le.id);
      const prior = orderedSets(liveLe).filter((x) => x.completed && x.setType !== "warmup");
      const prev = prior[prior.length - 1];
      // Séries déjà faites sur le muscle principal par les AUTRES exercices, pondérées comme l'app.
      let muscleOther = 0;
      for (const other of state.active!.exercises) {
        if (other.id === le.id) continue;
        const oex = state.catalog.find((e) => e.id === other.exerciseId);
        if (!oex || !parent) continue;
        const units = physiologicalSetUnits(other.sets, { increment: oex.smallestIncrement });
        muscleOther += units * aggregateCoefficient(oex, parent);
      }
      const known = [
        ...collectExerciseHistory(state.history, exercise.id).sets.flat(),
        ...state.active!.exercises.filter((x) => x.exerciseId === exercise.id).flatMap((x) => x.sets),
      ];
      const calibrating = isCalibrating(recordCalibration([...known, { ...s, timestamp: at, completed: true }], exercise), at);
      const mode = exercise.setPatternMode === "weighted_bodyweight" ? "weighted_bodyweight" : exercise.setPatternMode === "assisted_bodyweight" ? "assisted_bodyweight" : "external";
      const fromEff = effTotal(suggestion.weight, mode, bodyweight);
      const toEff = effTotal(s.weight, mode, bodyweight);
      const kgPerRep = Math.max(exercise.smallestIncrement, ALGO_V2.REP_SLOPE_PCT * Math.max(1, fromEff));
      const isWarmup = s.setType === "warmup";
      if (!isWarmup) rank += 1;
      const repDrop = (suggestion as { repDrop?: { drop: number; source: string; exercisePairs: number } }).repDrop;
      lines.push(JSON.stringify({
        session_id: target.id, session_date: target.date.toISOString(), ts: at.toISOString(), synthetic_time: synthetic, idx,
        exercise_id: exercise.id, exercise: exercise.name, le_id: le.id, pattern_mode: exercise.setPatternMode,
        fatigue_class: exercise.fatigueClass, rep_min: exercise.repTargetMin, rep_max: exercise.repTargetMax, increment: exercise.smallestIncrement,
        set_id: s.id, set_type: s.setType, weight: s.weight, reps: s.reps, rir: s.reportedRir ?? null, stop_reason: s.stopReason ?? null,
        continuation: s.setTechnique != null || (s.logicalSetId != null && s.logicalSetId !== s.id),
        stored: s.suggestedWeight == null ? null : { weight: s.suggestedWeight, reps: s.suggestedReps ?? null, mode: s.suggestionMode ?? null, version: s.suggestionEngineVersion ?? null },
        engine: {
          weight: suggestion.weight, reps: suggestion.reps, mode: suggestion.mode, role: suggestion.role ?? null, reasons: suggestion.reasonCodes,
          rep_drop: repDrop ? { drop: repDrop.drop, source: repDrop.source, pairs: repDrop.exercisePairs } : null,
          pred_at_actual: suggestion.reps - (toEff - fromEff) / kgPerRep,
          pred_at_actual_displayed: reprojectSuggestionAtWeight(suggestion, exercise, s.weight, bodyweight).reps,
          eff_suggested: fromEff, eff_actual: toEff,
        },
        ctx: {
          position: prior.filter((x) => x.setType !== "finisher").length + 1,
          rank, minutes: synthetic ? null : (at.getTime() - start) / 60_000,
          interval_same_s: synthetic || !prev ? null : (at.getTime() - prev.timestamp.getTime()) / 1000,
          interleaved: prior.length > 0 && previousLe !== null && previousLe !== le.id,
          superset_group: le.supersetGroupId != null, calibrating, muscle_sets_other: muscleOther,
          prev: prev ? { weight: prev.weight, reps: prev.reps, rir: prev.reportedRir ?? null,
            continuation: prev.setTechnique != null || (prev.logicalSetId != null && prev.logicalSetId !== prev.id) } : null,
          since_previous_any_s: synthetic || previousAt === null ? null : (at.getTime() - previousAt) / 1000,
        },
      }));
      setNow(at);
      store.getState().logSet(le.id, {
        weight: s.weight, reps: s.reps, setType: s.setType, suggestedWeight: s.suggestedWeight, suggestedReps: s.suggestedReps,
        suggestedSetType: s.suggestedSetType, predictedRepsAtActualWeight: s.predictedRepsAtActualWeight, suggestionMode: s.suggestionMode,
        suggestionReasonCodes: s.suggestionReasonCodes, suggestionEngineVersion: s.suggestionEngineVersion, reportedRir: s.reportedRir, stopReason: s.stopReason,
      });
      previousLe = le.id;
      previousAt = at.getTime();
    });
    appendFileSync(outPath, lines.join("\n") + "\n");
  }
  console.log(`rejeu écrit : ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
