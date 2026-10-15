/**
 * Critères de réussite du moteur de suggestion (chantier « moteur fiable », 14/10/2026, `web/SUGGESTIONS.md` §7) à
 * partir d'un ou deux rejeux simulés (`replay.ts --simuler`) : la base, puis le candidat sur les MÊMES séries.
 *
 *   npx tsx scripts/suggestions-audit/criteres.ts <base.jsonl> [candidat.jsonl] [--split 2026-09-21]
 *        [--depuis 2026-08-17] [--seance 2026-10-13 ...] [--json sortie.json] [--violations 20]
 *
 * (a) prévision à la charge choisie : écart = reps faites au RIR 1 − reps prévues à cette charge (reprojection 7,5 %),
 *     par contexte ; erreur moyenne, biais, part à une rep près ; différence appariée candidat − base, IC bootstrap par
 *     séance, p bilatéral, Holm sur les contextes concluants (≥ 20 séries et ≥ 8 séances).
 * (b) cible : écart de cible = reps faites ramenées à la charge de la cible (règle 7,5 % de `versus.ts`) − reps de la
 *     cible ; battues / tenues / en dessous (`versus.ts`, calculé par le rejeu) ; cibles à 3 reps ou plus ; écart de charge.
 * (c) invariants (`lib/engines/target-invariants.ts`) sur TOUTES les cibles rejouées.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { isNearMaxAttempt, targetInvariantViolations, type InvariantSet, type Violation } from "@/lib/engines/target-invariants";
import { effTotal } from "@/lib/engines/predict";
import { ALGO_V2 } from "@/lib/engines/constants";

interface Row {
  session_id: string;
  session_date: string;
  ts: string;
  idx: number;
  exercise: string;
  le_id: string;
  pattern_mode: string;
  rep_min: number;
  rep_max: number;
  increment: number;
  max_load?: number | null;
  load_offset?: number | null;
  bw?: number | null;
  usual_load?: number | null;
  set_id: string;
  set_type: string;
  weight: number;
  reps: number;
  rir: number | null;
  continuation: boolean;
  /** Complément tel que le store rejoué l'a décidé (ce que le moteur voit), à défaut celui de la base. */
  continuation_replayed?: boolean | null;
  stored: { weight: number; reps: number | null } | null;
  engine: {
    weight: number;
    reps: number;
    mode: string;
    reasons: string[];
    set_type?: string | null;
    prediction?: { weight: number; reps: number };
    pred_at_actual: number;
    verdict: "beat" | "met" | "below" | null;
  };
  ctx: {
    position: number;
    interleaved: boolean;
    superset_group: boolean;
    calibrating: boolean;
    muscle_sets_other: number;
    interval_same_s: number | null;
  };
}

const B = 4000;
const MIN_SETS = 20;
const MIN_SESSIONS = 8;
const NORMAL = new Set(["work", "top_set", "backoff"]);

function load(path: string): Row[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moyenne d'une valeur par série, IC bootstrap par séance et p bilatéral contre 0. */
function cluster(units: { session: string; value: number }[], seed = 11) {
  const by = new Map<string, { sum: number; n: number }>();
  for (const u of units) {
    const g = by.get(u.session) ?? { sum: 0, n: 0 };
    g.sum += u.value;
    g.n += 1;
    by.set(u.session, g);
  }
  const groups = [...by.values()];
  const n = units.length;
  const mean = units.reduce((s, u) => s + u.value, 0) / Math.max(1, n);
  const rand = mulberry32(seed);
  const boots: number[] = [];
  for (let b = 0; b < B && groups.length > 0; b++) {
    let sum = 0;
    let k = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(rand() * groups.length)];
      sum += g.sum;
      k += g.n;
    }
    boots.push(sum / Math.max(1, k));
  }
  boots.sort((x, y) => x - y);
  const lo = boots[Math.floor(0.025 * boots.length)] ?? NaN;
  const hi = boots[Math.max(0, Math.floor(0.975 * boots.length) - 1)] ?? NaN;
  const below = boots.filter((v) => v <= 0).length / Math.max(1, boots.length);
  const above = boots.filter((v) => v >= 0).length / Math.max(1, boots.length);
  return { n, sessions: groups.length, mean, ci: [lo, hi] as [number, number], p: Math.max(1 / B, Math.min(1, 2 * Math.min(below, above))), conclusive: n >= MIN_SETS && groups.length >= MIN_SESSIONS };
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const fr = (x: number, d = 2, sign = false) => {
  if (!Number.isFinite(x)) return "n.d.";
  const v = Math.abs(x) < 0.5 * 10 ** -d ? 0 : x;
  return (sign && v > 0 ? "+" : "") + v.toFixed(d).replace(".", ",").replace("-", "−");
};
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)} %` : "n.d.");
const ci = (c: [number, number], d = 2) => `[${fr(c[0], d, true)} ; ${fr(c[1], d, true)}]`;

const repsAtRir1 = (r: Row) => r.reps + Math.max(0, Math.min(4, Math.round(r.rir ?? 0))) - 1;
const mode = (r: Row) => (r.pattern_mode === "weighted_bodyweight" ? "weighted_bodyweight" : r.pattern_mode === "assisted_bodyweight" ? "assisted_bodyweight" : "external") as "external";

/** Séries du jour d'avant cette ligne, sur le même exercice (échauffements et finishers exclus). */
function todayBefore(rows: Row[]): Map<string, InvariantSet[]> {
  const out = new Map<string, InvariantSet[]>();
  const running = new Map<string, InvariantSet[]>();
  for (const r of rows) {
    const key = `${r.session_id}|${r.le_id}`;
    const list = running.get(key) ?? [];
    out.set(r.set_id, [...list]);
    if (NORMAL.has(r.set_type)) list.push({ weight: r.weight, reps: r.reps, rir: r.rir, continuation: r.continuation_replayed ?? r.continuation });
    running.set(key, list);
  }
  return out;
}

function isCore(r: Row) {
  return NORMAL.has(r.set_type) && !r.continuation && !r.ctx.calibrating && r.engine.reasons[0] !== "fallback";
}

/** Contextes de (a) et (b). */
function contexts(r: Row, before: InvariantSet[], split: string): string[] {
  const out = ["toutes"];
  out.push(r.session_date.slice(0, 10) < split ? `avant le ${split}` : `à partir du ${split}`);
  out.push(r.ctx.position <= 1 ? "1re série" : "séries suivantes");
  const regular = before.filter((s) => !s.continuation);
  const last = regular.at(-1);
  const ex = { setPatternMode: r.pattern_mode, repTargetMin: r.rep_min, repTargetMax: r.rep_max, smallestIncrement: r.increment };
  if (last) {
    const i = before.lastIndexOf(last);
    const attempt = isNearMaxAttempt(last, before.slice(0, i), ex, r.usual_load ?? null, r.bw ?? undefined);
    const eff = (w: number) => effTotal(w, mode(r), r.bw ?? undefined);
    const heavy = r.pattern_mode !== "bodyweight" && r.usual_load != null && last.rir !== null &&
      last.reps + Math.min(4, last.rir) - 1 < r.rep_min && eff(last.weight) >= eff(r.usual_load) + r.increment - 1e-9;
    if (attempt || heavy) out.push("juste après un essai ou une série lourde");
  }
  if (r.ctx.position <= 1 && r.ctx.muscle_sets_other >= 1) out.push("1re série après le même muscle");
  if (r.pattern_mode === "bodyweight" || (r.pattern_mode !== "straight" && r.pattern_mode !== "top_set_backoff" && r.pattern_mode !== "ramping" && r.weight === 0)) out.push("poids du corps");
  if (r.ctx.superset_group || r.ctx.interleaved) out.push("superset");
  return out;
}

interface Summary {
  a: Record<string, { n: number; sessions: number; mae: number; maeCi: [number, number]; bias: number; biasCi: [number, number]; within1: number; diff?: { mean: number; ci: [number, number]; p: number; pHolm: number | null; conclusive: boolean } }>;
  b: Record<string, { n: number; sessions: number; gapMean: number; gapCi: [number, number]; gapMedian: number; beat: number; beatCi: [number, number]; beatOrMet: number; far3: number; loadGapMedian: number | null }>;
  c: { total: number; byCode: Record<string, number>; examples: { date: string; exercise: string; done: string; target: string; v: Violation }[] };
}

function evaluate(rows: Row[], base: Map<string, Row> | null, split: string, since: string, maxExamples: number): Summary {
  const before = todayBefore(rows);
  const byId = new Map(rows.map((r) => [r.set_id, r]));
  // (a)
  const aCells = new Map<string, Row[]>();
  for (const r of rows) {
    if (!isCore(r) || r.rir === null || !Number.isFinite(r.engine.pred_at_actual)) continue;
    if (base && !(base.get(r.set_id) && Number.isFinite(base.get(r.set_id)!.engine.pred_at_actual))) continue;
    for (const c of contexts(r, before.get(r.set_id)!, split)) aCells.set(c, [...(aCells.get(c) ?? []), r]);
  }
  const a: Summary["a"] = {};
  const diffs: { key: string; p: number; conclusive: boolean; pHolm?: number | null }[] = [];
  for (const [key, members] of aCells) {
    const err = members.map((r) => ({ session: r.session_id, value: repsAtRir1(r) - r.engine.pred_at_actual }));
    const mae = cluster(err.map((u) => ({ ...u, value: Math.abs(u.value) })));
    const bias = cluster(err);
    a[key] = { n: mae.n, sessions: mae.sessions, mae: mae.mean, maeCi: mae.ci, bias: bias.mean, biasCi: bias.ci, within1: err.filter((u) => Math.abs(u.value) <= 1).length / Math.max(1, err.length) };
    if (base) {
      const d = cluster(members.map((r) => {
        const o = base.get(r.set_id)!;
        return { session: r.session_id, value: Math.abs(repsAtRir1(r) - r.engine.pred_at_actual) - Math.abs(repsAtRir1(o) - o.engine.pred_at_actual) };
      }));
      a[key].diff = { mean: d.mean, ci: d.ci, p: d.p, pHolm: null, conclusive: d.conclusive };
      diffs.push({ key, p: d.p, conclusive: d.conclusive });
    }
  }
  const eligible = diffs.filter((d) => d.conclusive && d.key !== "toutes").sort((x, y) => x.p - y.p);
  let running = 0;
  eligible.forEach((d, rank) => {
    running = Math.max(running, Math.min(1, (eligible.length - rank) * d.p));
    a[d.key].diff!.pHolm = running;
  });
  // (b)
  const bCells = new Map<string, Row[]>();
  for (const r of rows) {
    if (!isCore(r) || r.session_date.slice(0, 10) < since || r.engine.verdict == null) continue;
    for (const c of contexts(r, before.get(r.set_id)!, split).filter((c) => ["toutes", "1re série", "séries suivantes", `avant le ${split}`, `à partir du ${split}`, "juste après un essai ou une série lourde"].includes(c))) {
      bCells.set(c, [...(bCells.get(c) ?? []), r]);
    }
  }
  const b: Summary["b"] = {};
  for (const [key, members] of bCells) {
    const gap = (r: Row) => {
      const from = effTotal(r.weight, mode(r));
      const kgPerRep = Math.max(r.increment, ALGO_V2.REP_SLOPE_PCT * Math.max(1, from));
      return r.reps + (from - effTotal(r.engine.weight, mode(r))) / kgPerRep - r.engine.reps;
    };
    const g = cluster(members.map((r) => ({ session: r.session_id, value: gap(r) })));
    const beat = cluster(members.map((r) => ({ session: r.session_id, value: r.engine.verdict === "beat" ? 1 : 0 })));
    const later = members.filter((r) => r.ctx.position > 1 && r.weight > 0 && r.engine.weight > 0 && mode(r) === "external");
    b[key] = {
      n: g.n, sessions: g.sessions, gapMean: g.mean, gapCi: g.ci, gapMedian: median(members.map(gap)),
      beat: beat.mean, beatCi: beat.ci,
      beatOrMet: members.filter((r) => r.engine.verdict !== "below").length / members.length,
      far3: members.filter((r) => Math.abs(gap(r)) >= 3 - 1e-9).length / members.length,
      loadGapMedian: later.length ? median(later.map((r) => Math.abs(r.engine.weight - r.weight) / r.weight)) : null,
    };
  }
  // (c)
  const byCode: Record<string, number> = {};
  const examples: Summary["c"]["examples"] = [];
  let total = 0;
  for (const r of rows) {
    const today = before.get(r.set_id)!;
    const v = targetInvariantViolations({
      exercise: { setPatternMode: r.pattern_mode, repTargetMin: r.rep_min, repTargetMax: r.rep_max, smallestIncrement: r.increment, maxLoad: r.max_load ?? null, loadOffset: r.load_offset ?? null },
      today,
      target: { weight: r.engine.weight, reps: r.engine.reps, mode: r.engine.mode, reasonCodes: r.engine.reasons, setType: r.engine.set_type ?? undefined },
      usualLoad: r.usual_load ?? null,
      bodyweightKg: r.bw ?? undefined,
    });
    for (const x of v) {
      total += 1;
      byCode[x.code] = (byCode[x.code] ?? 0) + 1;
      if (examples.length < maxExamples) examples.push({ date: r.ts.slice(0, 16), exercise: r.exercise, done: `${r.weight} × ${r.reps} RIR ${r.rir ?? "?"}`, target: `${r.engine.weight} × ${r.engine.reps}`, v: x });
    }
  }
  void byId;
  return { a, b, c: { total, byCode, examples } };
}

function main() {
  const args = process.argv.slice(2);
  const files: string[] = [];
  let split = "2026-09-21";
  let since = "2026-08-17";
  let json: string | null = null;
  let maxExamples = 15;
  let until = "9999-99-99";
  const seances: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--split") split = args[++i];
    else if (args[i] === "--depuis") since = args[++i];
    else if (args[i] === "--json") json = args[++i];
    else if (args[i] === "--seance") seances.push(args[++i]);
    else if (args[i] === "--violations") maxExamples = Number(args[++i]);
    else if (args[i] === "--au") until = args[++i];
    else files.push(args[i]);
  }
  if (files.length < 1 || files.length > 2) {
    console.error("usage : criteres.ts <base.jsonl> [candidat.jsonl] [--split AAAA-MM-JJ] [--depuis AAAA-MM-JJ] [--seance AAAA-MM-JJ] [--json sortie.json]");
    process.exit(1);
  }
  // `--au` : mesure (a) et (b) sur les séances jusqu'à cette date incluse (réglage), les invariants sur tout.
  const keep = (rows: Row[]) => rows.filter((r) => r.session_date.slice(0, 10) <= until);
  const baseAll = load(files[0]);
  const candAll = files[1] ? load(files[1]) : null;
  const baseRows = keep(baseAll);
  const candRows = candAll ? keep(candAll) : null;
  const baseMap = new Map(baseRows.map((r) => [r.set_id, r]));
  const baseSummary = { ...evaluate(baseRows, null, split, since, maxExamples), c: evaluate(baseAll, null, split, since, maxExamples).c };
  const candSummary = candRows && candAll ? { ...evaluate(candRows, baseMap, split, since, maxExamples), c: evaluate(candAll, baseMap, split, since, maxExamples).c } : null;
  const names = candRows ? ["base", "candidat"] : ["base"];
  const summaries = candSummary ? [baseSummary, candSummary] : [baseSummary];

  console.log(`\n## (a) Prévision à la charge choisie (séries avec RIR ; écart = faites au RIR 1 − prévues)\n`);
  console.log(`| Contexte | Séries (séances) | ${names.map((n) => `Erreur ${n} [IC]`).join(" | ")} | ${names.map((n) => `Biais ${n}`).join(" | ")} | ${names.map((n) => `±1 ${n}`).join(" | ")}${candSummary ? " | Différence [IC], p Holm" : ""} |`);
  console.log(`|---|---|${names.map(() => "---|").join("")}${names.map(() => "---|").join("")}${names.map(() => "---|").join("")}${candSummary ? "---|" : ""}`);
  const ref = candSummary ?? baseSummary;
  for (const key of Object.keys(ref.a)) {
    const cells = summaries.map((s) => s.a[key]);
    const c0 = cells[cells.length - 1];
    const d = candSummary?.a[key]?.diff;
    console.log(`| ${key} | ${c0.n} (${c0.sessions})${c0.n < MIN_SETS || c0.sessions < MIN_SESSIONS ? " *" : ""} | ${cells.map((c) => (c ? `${fr(c.mae)} ${ci(c.maeCi)}` : "n.d.")).join(" | ")} | ${cells.map((c) => (c ? fr(c.bias, 2, true) : "n.d.")).join(" | ")} | ${cells.map((c) => (c ? pct(c.within1) : "n.d.")).join(" | ")}${d ? ` | ${fr(d.mean, 2, true)} ${ci(d.ci)}, ${d.pHolm == null ? (d.conclusive ? `p ${fr(d.p, 3)}` : "non concluant") : `p Holm ${fr(d.pHolm, 3)}`}` : ""} |`);
  }
  console.log(`\n* moins de ${MIN_SETS} séries ou ${MIN_SESSIONS} séances : pas de conclusion.`);

  console.log(`\n## (b) Cible (séries jugées depuis le ${since} ; écart = faites ramenées à la charge de la cible − cible)\n`);
  console.log(`| Contexte | Moteur | Séries (séances) | Écart moyen [IC] | Médian | Battues [IC] | Battues ou tenues | À 3 reps ou plus | Écart de charge médian (séries 2+) |`);
  console.log(`|---|---|---|---|---|---|---|---|---|`);
  for (const key of Object.keys(ref.b)) {
    summaries.forEach((s, i) => {
      const c = s.b[key];
      if (!c) return;
      console.log(`| ${i === 0 ? key : ""} | ${names[i]} | ${c.n} (${c.sessions}) | ${fr(c.gapMean, 2, true)} ${ci(c.gapCi)} | ${fr(c.gapMedian, 1, true)} | ${pct(c.beat)} [${pct(c.beatCi[0])} ; ${pct(c.beatCi[1])}] | ${pct(c.beatOrMet)} | ${pct(c.far3)} | ${c.loadGapMedian == null ? "n.d." : `${fr(100 * c.loadGapMedian, 1)} %`} |`);
    });
  }

  console.log(`\n## (c) Invariants (toutes les cibles rejouées)\n`);
  summaries.forEach((s, i) => {
    console.log(`- ${names[i]} : ${s.c.total} violation(s) ${JSON.stringify(s.c.byCode)}`);
    for (const e of s.c.examples) console.log(`    ${e.date} ${e.exercise} : fait ${e.done}, cible ${e.target} — ${e.v.code} (${e.v.detail})`);
  });

  for (const day of seances) {
    console.log(`\n## Séance du ${day}, série par série\n`);
    console.log(`| Heure | Exercice | Cible vécue | Cible base | ${candRows ? "Cible candidat | " : ""}Fait |`);
    console.log(`|---|---|---|---|${candRows ? "---|" : ""}---|`);
    const candMap = candRows ? new Map(candRows.map((r) => [r.set_id, r])) : null;
    for (const r of baseRows.filter((x) => x.session_date.slice(0, 10) === day || x.ts.slice(0, 10) === day)) {
      if (!NORMAL.has(r.set_type)) continue;
      const c = candMap?.get(r.set_id);
      const t = (x: Row | undefined) => (x ? `${x.engine.weight} × ${x.engine.reps}${x.engine.verdict ? ` (${x.engine.verdict === "beat" ? "battue" : x.engine.verdict === "met" ? "tenue" : "en dessous"})` : ""}` : "");
      console.log(`| ${r.ts.slice(11, 16)} | ${r.exercise} | ${r.stored?.weight ?? "?"} × ${r.stored?.reps ?? "?"} | ${t(r)} | ${candRows ? `${t(c)} | ` : ""}${r.weight} × ${r.reps} RIR ${r.rir ?? "?"}${r.continuation ? " (enchaînée)" : ""} |`);
    }
  }
  if (json) writeFileSync(json, JSON.stringify({ base: baseSummary, candidat: candSummary }, null, 1));
}

main();
