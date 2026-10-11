/**
 * Rapport d'audit des suggestions à partir d'un ou deux rejeux (`replay.ts`). Voir `web/SUGGESTIONS.md`.
 *
 *   npx tsx scripts/suggestions-audit/report.ts <rejeu.jsonl>                        # un moteur
 *   npx tsx scripts/suggestions-audit/report.ts <ancien.jsonl> <nouveau.jsonl>      # ancien contre nouveau
 *   options : --split 2026-09-21 (période avant/après), --seance 2026-10-11 (série par série, répétable)
 *
 * Mesure (même définition que l'audit du 11/10/2026) : pour chaque série de travail avec RIR, hors
 * étalonnage, compléments de série et repli « 20 kg par défaut », écart = reps faites ramenées au RIR 1
 * (reps + RIR − 1, 4+ compté 4) moins les reps prévues par le moteur à la charge réellement choisie
 * (suggestion reprojetée par la règle du moteur, 7,5 % de charge = 1 rep, en continu).
 * Intervalles : bootstrap par séance (les séries d'une séance ne sont pas indépendantes), 4 000 tirages.
 * Comparaison : différence d'erreur moyenne nouveau − ancien sur les MÊMES séries, p bootstrap bilatéral,
 * correction de Holm sur toutes les cases du rapport. Une case de moins de 20 séries ou 8 séances ne conclut pas.
 */
import { readFileSync } from "node:fs";

interface Row {
  session_id: string;
  session_date: string;
  ts: string;
  set_id: string;
  exercise: string;
  fatigue_class: string;
  set_type: string;
  weight: number;
  reps: number;
  rir: number | null;
  continuation: boolean;
  engine: { weight: number; reps: number; reasons: string[]; pred_at_actual: number; rep_drop: { drop: number; source: string } | null };
  ctx: {
    position: number;
    rank: number;
    interval_same_s: number | null;
    interleaved: boolean;
    superset_group: boolean;
    calibrating: boolean;
    prev: { weight: number } | null;
  };
}

const B = 4000;
const MIN_SETS = 20;
const MIN_SESSIONS = 8;

function load(path: string): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Row;
    rows.set(row.set_id, row);
  }
  return rows;
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

interface Unit {
  session: string;
  value: number;
}

/** Moyenne et intervalle bootstrap par séance ; p bilatéral contre zéro. */
function clusterMean(units: Unit[], seed = 7) {
  const bySession = new Map<string, { sum: number; n: number }>();
  for (const u of units) {
    const cur = bySession.get(u.session) ?? { sum: 0, n: 0 };
    cur.sum += u.value;
    cur.n += 1;
    bySession.set(u.session, cur);
  }
  const groups = [...bySession.values()];
  const N = units.length;
  const mean = units.reduce((s, u) => s + u.value, 0) / Math.max(1, N);
  const rand = mulberry32(seed);
  const boots: number[] = [];
  for (let b = 0; b < B; b++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(rand() * groups.length)];
      sum += g.sum;
      n += g.n;
    }
    boots.push(sum / Math.max(1, n));
  }
  boots.sort((x, y) => x - y);
  const below = boots.filter((v) => v <= 0).length / B;
  const above = boots.filter((v) => v >= 0).length / B;
  return {
    n: N,
    sessions: groups.length,
    mean,
    ci: [boots[Math.floor(0.025 * B)], boots[Math.floor(0.975 * B) - 1]] as [number, number],
    p: Math.max(1 / B, Math.min(1, 2 * Math.min(below, above))),
    conclusive: N >= MIN_SETS && groups.length >= MIN_SESSIONS,
  };
}

function holm<T extends { p: number; conclusive: boolean; pHolm?: number | null }>(items: T[]): void {
  const eligible = items.filter((i) => i.conclusive).sort((a, b) => a.p - b.p);
  let running = 0;
  eligible.forEach((item, rank) => {
    running = Math.max(running, Math.min(1, (eligible.length - rank) * item.p));
    item.pHolm = running;
  });
  for (const item of items) if (!item.conclusive) item.pHolm = null;
}

const fr = (x: number, d = 2, sign = false) => {
  const v = Math.abs(x) < 0.5 * 10 ** -d ? 0 : x;
  return (sign && v > 0 ? "+" : "") + v.toFixed(d).replace(".", ",").replace("-", "−");
};
const ci = (c: [number, number], d = 2) => `[${fr(c[0], d, true)} ; ${fr(c[1], d, true)}]`;
const pv = (p: number | null | undefined) => (p == null ? "n.d." : p < 0.001 ? "< 0,001" : fr(p, 3));

function repsAtRir1(row: Row): number {
  return row.reps + Math.max(0, Math.min(4, Math.round(row.rir ?? 0))) - 1;
}

function isCore(row: Row): boolean {
  return (
    row.rir !== null &&
    ["work", "top_set", "backoff"].includes(row.set_type) &&
    !row.continuation &&
    !row.ctx.calibrating &&
    row.engine.reasons[0] !== "fallback"
  );
}

type Cell = { family: string; level: string; ids: string[] };

function cells(rows: Map<string, Row>, ids: string[], split: string | null, reference: Map<string, Row>): Cell[] {
  const out: Cell[] = [];
  const add = (family: string, key: (r: Row) => string | null) => {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const level = key(rows.get(id)!);
      if (level === null) continue;
      groups.set(level, [...(groups.get(level) ?? []), id]);
    }
    for (const [level, members] of groups) out.push({ family, level, ids: members });
  };
  add("Ensemble", () => "toutes les séries");
  if (split) add(`Période (réglages choisis avant le ${split})`, (r) => (r.session_date.slice(0, 10) < split ? `avant le ${split}` : `à partir du ${split}`));
  add("Position dans l'exercice", (r) => ["1re", "2e", "3e", "4e+"][Math.min(r.ctx.position, 4) - 1]);
  add("Rang dans la séance", (r) => (r.ctx.rank <= 5 ? "1-5" : r.ctx.rank <= 10 ? "6-10" : r.ctx.rank <= 15 ? "11-15" : "16+"));
  add("Rôle (charge par rapport à la série d'avant)", (r) =>
    !r.ctx.prev ? "première" : Math.abs(r.weight - r.ctx.prev.weight) < 1e-9 ? "même charge" : r.weight < r.ctx.prev.weight ? "plus léger (retour)" : "plus lourd (montée)"
  );
  add("Branche de l'ancien moteur", (r) => reference.get(r.set_id)?.engine.reasons[0] ?? "?");
  add("Classe de fatigue", (r) => r.fatigue_class);
  add("Intervalle depuis la série d'avant (séries 2+)", (r) => {
    const s = r.ctx.interval_same_s;
    if (r.ctx.position < 2 || s === null) return null;
    const m = s / 60;
    return m < 3 ? "< 3 min" : m < 4 ? "3-4 min" : m < 5 ? "4-5 min" : m < 7 ? "5-7 min" : "> 7 min";
  });
  add("Superset (séries 2+)", (r) => (r.ctx.position < 2 ? null : r.ctx.interleaved ? "alternée" : "enchaînée"));
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const files: string[] = [];
  let split: string | null = null;
  const seances: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--split") split = args[++i];
    else if (args[i] === "--seance") seances.push(args[++i]);
    else files.push(args[i]);
  }
  if (files.length < 1 || files.length > 2) {
    console.error("usage : report.ts <rejeu.jsonl> [nouveau.jsonl] [--split AAAA-MM-JJ] [--seance AAAA-MM-JJ]");
    process.exit(1);
  }
  const old = load(files[0]);
  const neu = files[1] ? load(files[1]) : null;
  const ids = [...old.keys()].filter((id) => isCore(old.get(id)!) && (!neu || (neu.has(id) && isCore(neu.get(id)!))));
  const err = (rows: Map<string, Row>, id: string) => {
    const r = rows.get(id)!;
    return repsAtRir1(r) - r.engine.pred_at_actual;
  };
  const lines: string[] = [];
  const w = (s = "") => lines.push(s);
  const sessionsCount = new Set(ids.map((id) => old.get(id)!.session_id)).size;
  const dates = ids.map((id) => old.get(id)!.session_date.slice(0, 10)).sort();
  w(`Séries comparées : ${ids.length} sur ${sessionsCount} séances, du ${dates[0]} au ${dates[dates.length - 1]}.`);
  w("Écart = reps faites (au RIR 1) − reps prévues à la charge choisie ; négatif = moteur trop optimiste.");
  w();

  const table = cells(neu ?? old, ids, split, old).map((cell) => {
    const units = (rows: Map<string, Row>, f: (id: string) => number) => cell.ids.map((id) => ({ session: rows.get(id)!.session_id, value: f(id) }));
    const maeOld = clusterMean(units(old, (id) => Math.abs(err(old, id))));
    const biasOld = clusterMean(units(old, (id) => err(old, id)));
    if (!neu) return { cell, maeOld, biasOld, p: biasOld.p, conclusive: biasOld.conclusive, pHolm: null as number | null };
    const maeNew = clusterMean(units(neu, (id) => Math.abs(err(neu, id))));
    const biasNew = clusterMean(units(neu, (id) => err(neu, id)));
    const diff = clusterMean(units(neu, (id) => Math.abs(err(neu, id)) - Math.abs(err(old, id))));
    return { cell, maeOld, biasOld, maeNew, biasNew, diff, p: diff.p, conclusive: diff.conclusive, pHolm: null as number | null };
  });
  holm(table);

  if (neu) {
    w("| Contexte | Niveau | Séries | Séances | Erreur moy. ancien → nouveau | Différence [IC 95 %] | Holm p | Écart ancien [IC] | Écart nouveau [IC] |");
    w("|---|---|---|---|---|---|---|---|---|");
    for (const t of table) {
      if (!("diff" in t) || !t.diff || !t.maeNew || !t.biasNew) continue;
      const flag = t.conclusive ? "" : " (insuffisant)";
      w(`| ${t.cell.family} | ${t.cell.level} | ${t.maeOld.n} | ${t.maeOld.sessions}${flag} | ${fr(t.maeOld.mean)} → ${fr(t.maeNew.mean)} | ${fr(t.diff.mean, 2, true)} ${ci(t.diff.ci)} | ${pv(t.pHolm)} | ${fr(t.biasOld.mean, 2, true)} ${ci(t.biasOld.ci)} | ${fr(t.biasNew.mean, 2, true)} ${ci(t.biasNew.ci)} |`);
    }
  } else {
    w("| Contexte | Niveau | Séries | Séances | Erreur moy. [IC 95 %] | Écart [IC 95 %] | Holm p (écart ≠ 0) |");
    w("|---|---|---|---|---|---|---|");
    for (const t of table) {
      const flag = t.conclusive ? "" : " (insuffisant)";
      w(`| ${t.cell.family} | ${t.cell.level} | ${t.maeOld.n} | ${t.maeOld.sessions}${flag} | ${fr(t.maeOld.mean)} ${ci(t.maeOld.ci)} | ${fr(t.biasOld.mean, 2, true)} ${ci(t.biasOld.ci)} | ${pv(t.pHolm)} |`);
    }
  }

  for (const day of seances) {
    w();
    w(`### Séance du ${day}, série par série`);
    w();
    w(neu ? "| Exercice | Fait (RIR) | Ancien moteur | Nouveau moteur | Prévu à la charge faite, ancien → nouveau | Perte apprise |" : "| Exercice | Fait (RIR) | Moteur | Prévu à la charge faite |");
    w(neu ? "|---|---|---|---|---|---|" : "|---|---|---|---|");
    const day_rows = [...old.values()].filter((r) => r.session_date.slice(0, 10) === day && r.set_type !== "warmup").sort((a, b) => a.ts.localeCompare(b.ts));
    for (const r of day_rows) {
      const done = `${fr(r.weight, 1).replace(",0", "")} × ${r.reps} (${r.rir ?? "?"})`;
      const o = `${fr(r.engine.weight, 1).replace(",0", "")} × ${r.engine.reps}`;
      if (!neu) {
        w(`| ${r.exercise} | ${done} | ${o} | ${fr(r.engine.pred_at_actual, 1)} |`);
        continue;
      }
      const n = neu.get(r.set_id)!;
      const nn = `${fr(n.engine.weight, 1).replace(",0", "")} × ${n.engine.reps}`;
      const drop = n.engine.rep_drop ? `${fr(n.engine.rep_drop.drop, 1)} (${n.engine.rep_drop.source})` : "";
      w(`| ${r.exercise} | ${done} | ${o} | ${nn}${nn !== o ? " ◆" : ""} | ${fr(r.engine.pred_at_actual, 1)} → ${fr(n.engine.pred_at_actual, 1)} | ${drop} |`);
    }
    if (neu) w("\n◆ = suggestion différente. (RIR) = RIR déclaré.");
  }
  console.log(lines.join("\n"));
}

main();
