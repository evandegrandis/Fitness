/**
 * Cohérence de l'écran sur tout l'historique réel (LECTURE SEULE, voir `web/SUGGESTIONS.md` §8) : chaque séance est
 * rejouée dans le store, horloge figée, série par série, corrections de série comprises (une série dont la prévision
 * enregistrée a été effacée a été corrigée après validation : la correction est rejouée). Avant chaque série, la carte
 * de saisie (`targetPanel` : la cible à la charge proposée, puis à la charge qu'il a prise, et la cible que `SetEntry`
 * enregistrerait) ; après chaque série, l'en-tête (rang en direct) contre le bilan de la séance arrêtée là (rang du
 * parcours). Invariants D1 à D4 de `lib/engines/display-invariants.ts`, comptés par invariant, avec les premiers exemples.
 *
 * Usage (depuis `web/`) :
 *   TZ=Europe/Paris npx tsx scripts/suggestions-audit/coherence.ts <export.json> [--depuis AAAA-MM-JJ] [--seance AAAA-MM-JJ]
 * N'écrit rien : un tableau sur la sortie standard.
 */
import { readFileSync } from "node:fs";

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
const setNow = (at: Date | number) => {
  frozen = typeof at === "number" ? at : at.getTime();
};
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) options.set(args[i].slice(2), args[++i]);
    else positional.push(args[i]);
  }
  const [dataPath] = positional;
  if (!dataPath) {
    console.error("usage : coherence.ts <export.json> [--depuis AAAA-MM-JJ] [--seance AAAA-MM-JJ]");
    process.exit(1);
  }
  const { useWorkoutStore } = await import("@/lib/store/workout");
  const { orderedSets } = await import("@/lib/models/types");
  const { buildCareer } = await import("@/lib/engines/career");
  const { sessionRankInput } = await import("@/lib/engines/session-rank");
  const { targetPanel } = await import("@/lib/engines/target-display");
  const { atLoadViolations, rankViolations, recordedTargetViolations, sessionTextViolations } = await import("@/lib/engines/display-invariants");
  type AllData = import("@/lib/db/queries").AllData;
  type DisplayViolation = import("@/lib/engines/display-invariants").DisplayViolation;

  const data = JSON.parse(readFileSync(dataPath, "utf8"), (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as AllData;
  const since = options.get("depuis") ? new RealDate(`${options.get("depuis")}T00:00:00`) : null;
  const only = options.get("seance") ?? null;
  const day = (date: Date) => new RealDate(date.getTime()).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const sessions = [...data.sessions].filter((s) => !s.isActive).sort((a, b) => a.date.getTime() - b.date.getTime());
  const store = useWorkoutStore;
  const counts: Record<string, { checked: number; violations: number; examples: string[] }> = {
    D1: { checked: 0, violations: 0, examples: [] },
    D2: { checked: 0, violations: 0, examples: [] },
    D3: { checked: 0, violations: 0, examples: [] },
    D4: { checked: 0, violations: 0, examples: [] },
  };
  const tally = (code: "D1" | "D2" | "D3" | "D4", where: string, violations: DisplayViolation[]) => {
    counts[code].checked += 1;
    if (violations.length === 0) return;
    counts[code].violations += 1;
    if (counts[code].examples.length < 6) counts[code].examples.push(`${where} : ${violations.map((v) => v.detail).join(" ; ")}`);
  };

  for (const target of sessions) {
    if (since && target.date < since) continue;
    if (only && day(target.date) !== only) continue;
    const history = sessions.filter((s) => s.date < target.date);
    store.getState().hydrate({
      catalog: data.exercises, history, goals: data.goals, settings: data.settings, templates: data.templates,
      recoveryCheckins: data.recoveryCheckins, bodyWeights: data.bodyWeights,
    });
    const all = target.exercises
      .flatMap((le) => orderedSets(le).map((s) => ({ le, s })))
      .sort((a, b) => a.s.timestamp.getTime() - b.s.timestamp.getTime() || a.le.orderIndex - b.le.orderIndex || a.s.setSlotIndex - b.s.setSlotIndex);
    if (all.length === 0) continue;
    const active = { ...target, isActive: true, endTime: null, exercises: target.exercises.map((le) => ({ ...le, sets: [] as typeof le.sets })) };
    setNow(target.date);
    store.setState({ active, justHitRecord: {}, recordsCache: {}, activeMode: "normal", freshOverrides: new Set<string>() });
    for (const { le, s } of all) {
      const where = `${day(target.date)} ${s.timestamp.toISOString().slice(11, 16)} UTC`;
      setNow(s.timestamp.getTime() - 1000);
      const state = store.getState();
      const exercise = state.catalog.find((e) => e.id === le.exerciseId)!;
      const name = exercise.name;
      if (s.setType !== "warmup") {
        const suggestion = state.suggestion(le.id);
        const bw = state.settings.bodyWeightKg ?? undefined;
        const today = orderedSets(state.active!.exercises.find((x) => x.id === le.id)!)
          .filter((x) => x.completed && (x.setType === "work" || x.setType === "top_set" || x.setType === "backoff"))
          .map((x) => ({ weight: x.weight, reps: x.reps, rir: x.reportedRir ?? null, continuation: x.setTechnique != null || (x.logicalSetId != null && x.logicalSetId !== x.id) }));
        // La carte de saisie avant la série : la cible proposée, puis la cible à la charge qu'il a prise.
        const proposed = targetPanel(suggestion, exercise, { weight: suggestion.weight, reps: suggestion.reps }, today, bw);
        const chosen = targetPanel(suggestion, exercise, { weight: s.weight, reps: s.reps }, today, bw);
        tally("D4", `${where} ${name}, ${proposed.headline} · ${proposed.reason ?? ""}`, [...sessionTextViolations(proposed), ...sessionTextViolations(chosen)]);
        if (chosen.weightChanged) tally("D2", `${where} ${name}`, atLoadViolations(exercise, suggestion, chosen, today, bw));
        tally("D3", `${where} ${name}`, recordedTargetViolations(exercise, chosen, { suggestedWeight: chosen.target.weight, suggestedReps: chosen.target.reps }));
      }
      setNow(s.timestamp);
      store.getState().logSet(le.id, {
        weight: s.weight, reps: s.reps, setType: s.setType, suggestedWeight: s.suggestedWeight, suggestedReps: s.suggestedReps,
        suggestedSetType: s.suggestedSetType, predictedRepsAtActualWeight: s.predictedRepsAtActualWeight, suggestionMode: s.suggestionMode,
        suggestionReasonCodes: s.suggestionReasonCodes, suggestionEngineVersion: s.suggestionEngineVersion, reportedRir: s.reportedRir, stopReason: s.stopReason,
      });
      // Corrigée après validation (seul `editSet` efface la prévision d'une série de travail enregistrée par le moteur).
      if (s.setType === "work" && s.suggestionEngineVersion && s.predictedRepsAtActualWeight == null) {
        const replayed = orderedSets(store.getState().active!.exercises.find((x) => x.id === le.id)!).at(-1)!;
        store.getState().editSet(replayed.id, { weight: s.weight, reps: s.reps, reportedRir: s.reportedRir, stopReason: s.stopReason });
      }
      // L'en-tête après la série, contre le bilan de la séance si elle s'arrêtait là.
      const after = store.getState();
      const session = after.active!;
      const live = sessionRankInput({ session, previous: after.history, catalog: after.catalog, bodyWeights: after.bodyWeights, settings: after.settings });
      const finished = { ...session, isActive: false, endTime: new Date() };
      const career = buildCareer({ history: [...after.history, finished], catalog: after.catalog, goals: after.goals, bodyWeights: after.bodyWeights, settings: after.settings, now: new Date() });
      tally("D1", `${where} après ${name} ${s.weight}×${s.reps}`, rankViolations(live, career.bySession.get(session.id)?.rank ?? null));
    }
  }
  console.log("| Invariant | Vérifiés | Violations |");
  console.log("|---|---|---|");
  for (const [code, entry] of Object.entries(counts)) console.log(`| ${code} | ${entry.checked} | ${entry.violations} |`);
  for (const [code, entry] of Object.entries(counts)) for (const example of entry.examples) console.log(`${code} · ${example}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
