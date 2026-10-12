/**
 * Audit de la tendance des exercices (`exerciseStats`, Progrès › Exercices et `/api/barbis/training-state`), LECTURE
 * SEULE, sur un export (`export-data.ts`). Voir `web/TENDANCE.md`.
 *
 * 1. Ce que l'app annonce, avec le moteur du worktree d'où le script est lancé :
 *      TZ=Europe/Paris npx tsx scripts/suggestions-audit/tendance.ts <export.json> <sortie.jsonl> [--depuis AAAA-MM-JJ] [--au AAAA-MM-JJ]
 *    - chaque lundi 06:00 (heure de Paris) entre les deux dates, l'heure du bilan hebdo de Barbis : statut et écart de
 *      chaque exercice de la salle actuelle, calculés sur les seules séances d'avant ;
 *    - au dernier lundi : pour chaque séance d'un exercice (sa propre machine), l'écart de sa capacité à la moyenne de
 *      ses 3 séances d'avant (« capacité face à la tendance » de la table de Barbis) et le contexte de la séance (rang
 *      de l'exercice, séries comptées faites avant, dont le même muscle), lu sur les données brutes, pareil pour
 *      tous les moteurs.
 *    `--hors-echantillon AAAA-MM-JJ` : refait ces écarts avec le coût du contexte appris seulement sur les séances
 *    d'avant cette date (moteurs qui apprennent ce coût), pour juger les séances d'après hors échantillon.
 *    Pour un autre moteur (la branche principale), depuis son propre worktree :
 *      cd <autre>/web && TZ=Europe/Paris npx tsx --tsconfig ./tsconfig.json <ce fichier> <export.json> <sortie.jsonl> ...
 * 2. Comparaison, ancien moteur contre nouveau, et prévision par série du moteur de suggestion (`replay.ts`) :
 *      npx tsx scripts/suggestions-audit/tendance.ts --comparer <ancien.jsonl> <nouveau.jsonl> [--rejeu <rejeu.jsonl>] [--exercices Dips,"Lateral raises"]
 *
 * Intervalles à 95 % : bootstrap par séance (4 000 tirages). Le script n'écrit rien en base et refuse d'écrire sa
 * sortie dans le dépôt (elle contient l'historique).
 */
import { existsSync, readFileSync, unlinkSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DAY_MS = 86_400_000;
const B = 4000;

function insideRepo(path: string): boolean {
  let dir = dirname(resolve(path));
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, ".git"))) return true;
    dir = dirname(dir);
  }
  return false;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

interface StatusLine {
  kind: "statut";
  lundi: string;
  exerciseId: string;
  exercise: string;
  status: string;
  delta: number | null;
  threshold: number | null;
  points: { date: string; value: number; weight: number; reps: number; converted: boolean; rir: boolean | null }[];
}

interface GapLine {
  kind: "ecart";
  exerciseId: string;
  exercise: string;
  axis: string;
  sessionId: string;
  date: string;
  /** Date de la plus ancienne des 3 séances d'avant. */
  referenceFrom: string;
  gap: number;
  /** Coût du contexte appris seulement sur les séances d'avant `--hors-echantillon` (nouveau moteur). */
  outOfSample?: boolean;
  rank: number;
  exercises: number;
  setsBefore: number;
  sameMuscleBefore: number;
}

interface ContextLine {
  kind: "contexte";
  exerciseId: string;
  exercise: string;
  sessionId: string;
  date: string;
  rank: number;
  exercises: number;
  setsBefore: number;
  sameMuscleBefore: number;
}

interface CostLine {
  kind: "cout";
  costs: unknown;
}

type Line = StatusLine | GapLine | ContextLine | CostLine;

// ---------------------------------------------------------------------------------------------------------------
// 1. Ce que l'app annonce
// ---------------------------------------------------------------------------------------------------------------

async function announce(args: string[]) {
  const [dataPath, outPath] = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
  if (!dataPath || !outPath) {
    console.error("usage : tendance.ts <export.json> <sortie.jsonl> [--depuis AAAA-MM-JJ] [--au AAAA-MM-JJ]");
    process.exit(1);
  }
  if (insideRepo(outPath)) {
    console.error("tendance.ts : la sortie contient l'historique, elle doit être écrite hors du dépôt.");
    process.exit(1);
  }
  if (process.env.TZ !== "Europe/Paris") {
    console.error("tendance.ts : lancer avec TZ=Europe/Paris (lundis et semaines à l'heure de Paris, comme l'app).");
    process.exit(1);
  }
  const { exerciseStats, recordEvents, isCurrentGym } = await import("@/lib/engines/progress-stats");
  const { orderedSets, primaryParent, aggregateCoefficient, sessionsNewestFirst } = await import("@/lib/models/types");
  const { physiologicalSetUnits } = await import("@/lib/engines/set-structure");
  const { normalRecordSets } = await import("@/lib/engines/records");
  type AllData = import("@/lib/db/queries").AllData;
  type WorkoutSession = import("@/lib/models/types").WorkoutSession;
  type Exercise = import("@/lib/models/types").Exercise;

  const data = JSON.parse(readFileSync(dataPath, "utf8"), (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as AllData;
  const from = new Date(`${option(args, "--depuis") ?? "2026-08-24"}T06:00:00`);
  const to = new Date(`${option(args, "--au") ?? "2026-10-12"}T06:00:00`);
  const mondays: Date[] = [];
  for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 1) mondays.push(new Date(day));
  }
  if (existsSync(outPath)) unlinkSync(outPath);
  const byId = new Map<string, Exercise>(data.exercises.map((exercise) => [exercise.id, exercise]));
  const iso = (date: Date) => date.toISOString();
  const write = (lines: Line[]) => appendFileSync(outPath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");

  for (const now of mondays) {
    const history = sessionsNewestFirst(data.sessions.filter((session) => !session.isActive && session.date < now)).reverse();
    const weighIn = [...data.bodyWeights].filter((entry) => entry.measuredOn <= now).sort((a, b) => b.measuredOn.getTime() - a.measuredOn.getTime())[0];
    const bodyweightKg = weighIn?.weightKg ?? data.settings.bodyWeightKg ?? null;
    const stats = exerciseStats(history, data.exercises, now, bodyweightKg, recordEvents(history, data.exercises));
    write(
      stats
        .filter((stat) => isCurrentGym(stat, now))
        .map((stat): StatusLine => ({
          kind: "statut",
          lundi: iso(now),
          exerciseId: stat.exercise.id,
          exercise: stat.exercise.name,
          status: stat.status,
          delta: stat.delta,
          threshold: (stat as { deltaThreshold?: number | null }).deltaThreshold ?? null,
          points: stat.points.map((point) => ({
            date: iso(point.date),
            value: point.value,
            weight: point.weight,
            reps: point.reps,
            converted: point.convertedFrom !== null,
            rir: (point as { rirDeclared?: boolean }).rirDeclared ?? null,
          })),
        }))
    );

    if (now.getTime() !== mondays.at(-1)!.getTime()) continue;
    // Contexte de chaque séance de chaque exercice, lu sur les données brutes (même calcul pour tous les moteurs).
    const contexts = new Map<string, ContextLine>();
    for (const session of history) {
      const start = (exerciseId: string) =>
        Math.min(
          ...normalRecordSets(
            session.exercises.filter((logged) => logged.exerciseId === exerciseId).flatMap((logged) => orderedSets(logged)),
            byId.get(exerciseId)!
          ).map((set) => set.timestamp.getTime())
        );
      const ids = [...new Set(session.exercises.map((logged) => logged.exerciseId))].filter((id) => byId.has(id) && Number.isFinite(start(id)));
      const order = [...ids].sort((a, b) => start(a) - start(b));
      for (const id of ids) {
        const exercise = byId.get(id)!;
        const parent = primaryParent(exercise);
        let setsBefore = 0;
        let sameMuscleBefore = 0;
        for (const logged of session.exercises) {
          const other = byId.get(logged.exerciseId);
          if (!other || logged.exerciseId === id) continue;
          const units = physiologicalSetUnits(logged.sets.filter((set) => set.timestamp.getTime() < start(id)), { increment: other.smallestIncrement });
          setsBefore += units;
          if (parent) sameMuscleBefore += units * aggregateCoefficient(other, parent);
        }
        const line: ContextLine = {
          kind: "contexte", exerciseId: id, exercise: exercise.name, sessionId: session.id, date: iso(session.date),
          rank: order.indexOf(id) + 1, exercises: order.length, setsBefore, sameMuscleBefore,
        };
        contexts.set(`${session.id}::${id}`, line);
      }
    }
    write([...contexts.values()]);
    const sessionAt = new Map(history.map((session: WorkoutSession) => [session.date.getTime(), session.id]));
    const engine = (await import("@/lib/engines/progress-stats")) as {
      contextCosts?: (h: WorkoutSession[], c: Map<string, Exercise>, b: number | null) => unknown;
    };
    const split = option(args, "--hors-echantillon");
    const runs: { stats: typeof stats; outOfSample: boolean }[] = [{ stats, outOfSample: false }];
    if (split && engine.contextCosts) {
      const before = history.filter((session) => session.date < new Date(`${split}T00:00:00`));
      const costs = engine.contextCosts(before, byId, bodyweightKg);
      write([{ kind: "cout", costs: { horsEchantillon: split, ...(costs as object) } }]);
      const fixed = (exerciseStats as unknown as (...a: unknown[]) => typeof stats)(history, data.exercises, now, bodyweightKg, recordEvents(history, data.exercises), costs);
      runs.push({ stats: fixed, outOfSample: true });
    }
    const gaps: GapLine[] = [];
    for (const { stats, outOfSample } of runs) for (const stat of stats) {
      const points = stat.points;
      for (let index = 3; index < points.length; index += 1) {
        const point = points[index];
        if (point.convertedFrom !== null) continue;
        if (point.date.getTime() - points[index - 1].date.getTime() > 28 * DAY_MS) continue;
        const reference = points.slice(index - 3, index).reduce((sum, entry) => sum + entry.value, 0) / 3;
        const sessionId = sessionAt.get(point.date.getTime());
        const context = sessionId ? contexts.get(`${sessionId}::${stat.exercise.id}`) : undefined;
        if (!context || reference <= 0) continue;
        gaps.push({ ...context, kind: "ecart", axis: stat.axis, referenceFrom: iso(points[index - 3].date), gap: point.value / reference - 1, outOfSample });
      }
    }
    write(gaps);
    // Coût du contexte appris (moteurs qui l'ont).
    if (engine.contextCosts) write([{ kind: "cout", costs: engine.contextCosts(history, byId, bodyweightKg) }]);
  }
  console.log(`tendance écrite : ${outPath} (${mondays.length} lundis)`);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Comparaison
// ---------------------------------------------------------------------------------------------------------------

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

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** Bootstrap par séance d'une statistique calculée sur des lignes groupées par séance. */
function bootstrap<T>(rows: readonly T[], sessionOf: (row: T) => string, stat: (rows: T[]) => number): [number, number] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(sessionOf(row), [...(groups.get(sessionOf(row)) ?? []), row]);
  const keys = [...groups.keys()];
  const random = mulberry32(12);
  const draws: number[] = [];
  for (let b = 0; b < B; b += 1) {
    const sample: T[] = [];
    for (let k = 0; k < keys.length; k += 1) sample.push(...groups.get(keys[Math.floor(random() * keys.length)])!);
    const value = stat(sample);
    if (Number.isFinite(value)) draws.push(value);
  }
  draws.sort((a, b) => a - b);
  return [draws[Math.floor(0.025 * draws.length)], draws[Math.floor(0.975 * draws.length)]];
}

/** Pentes (moindres carrés) de y sur les colonnes de x, à l'intérieur de chaque exercice (effets fixes). */
function withinSlopes<T>(rows: readonly T[], groupOf: (row: T) => string, x: (row: T) => number[], y: (row: T) => number): number[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(groupOf(row), [...(groups.get(groupOf(row)) ?? []), row]);
  const X: number[][] = [];
  const Y: number[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const xs = group.map(x);
    const ys = group.map(y);
    const mx = xs[0].map((_, j) => mean(xs.map((row) => row[j])));
    const my = mean(ys);
    xs.forEach((row, i) => {
      X.push(row.map((value, j) => value - mx[j]));
      Y.push(ys[i] - my);
    });
  }
  const k = X[0]?.length ?? 0;
  const A = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => X.reduce((sum, row) => sum + row[i] * row[j], 0)), X.reduce((sum, row, n) => sum + row[i] * Y[n], 0)]);
  for (let i = 0; i < k; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < k; r += 1) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    [A[i], A[pivot]] = [A[pivot], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) return Array(k).fill(Number.NaN);
    for (let r = 0; r < k; r += 1) {
      if (r === i) continue;
      const factor = A[r][i] / A[i][i];
      for (let c = i; c <= k; c += 1) A[r][c] -= factor * A[i][c];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

function readLines(path: string): Line[] {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as Line);
}

const pct = (value: number | null, digits = 1) => (value === null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(digits).replace(".", ",")} %`);
const num = (value: number, digits = 2) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits).replace(".", ",")}`;
const day = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }).format(new Date(iso));

/** Règles de classement, appliquées à des capacités (de la plus ancienne à la plus récente). */
const OLD_RULE = (values: number[]) => {
  if (values.length < 4) return "young";
  const max = (list: number[]) => list.reduce((top, value) => Math.max(top, value), 0);
  const delta = max(values.slice(-3)) / max(values.slice(-6, -3)) - 1;
  return delta >= 0.015 ? "progress" : delta <= -0.03 ? "decline" : "stable";
};
const NEW_RULE = (values: number[], threshold: number) => {
  if (values.length < 4) return "young";
  const meanLog = (list: number[]) => mean(list.map(Math.log));
  const gap = meanLog(values.slice(-3)) - meanLog(values.slice(-6, -3));
  const limit = Math.log(1 + threshold);
  return gap >= limit ? "progress" : gap <= -limit ? "decline" : "stable";
};

function compare(args: string[]) {
  const [oldPath, newPath] = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
  const replayPath = option(args, "--rejeu");
  const focus = (option(args, "--exercices") ?? "Dips,Lateral raises").split(",");
  const old = readLines(oldPath);
  const neu = readLines(newPath);
  const statuses = (lines: Line[]) => lines.filter((line): line is StatusLine => line.kind === "statut");
  const announced = (lines: StatusLine[], lundi: string, status: string) => lines.filter((line) => line.lundi === lundi && line.status === status);
  const mondays = [...new Set(statuses(neu).map((line) => line.lundi))].sort();
  const lastMonday = mondays.at(-1)!;

  console.log("\n## Statuts annoncés chaque lundi 06:00 (salle actuelle : exercices pratiqués ces 28 derniers jours)\n");
  console.log("| Lundi | Ancienne : progrès | Ancienne : baisses | Nouvelle : progrès | Nouvelle : baisses | Avec tendance (ancienne / nouvelle) |");
  console.log("|---|---|---|---|---|---|");
  const totals = { oldUp: 0, oldDown: 0, newUp: 0, newDown: 0 };
  for (const lundi of mondays) {
    const o = statuses(old);
    const n = statuses(neu);
    const names = (list: StatusLine[]) => list.map((line) => `${line.exercise} ${pct(line.delta, 0)}`).join(", ") || "—";
    const withTrend = (list: StatusLine[]) => list.filter((line) => line.lundi === lundi && line.delta !== null).length;
    const [ou, od, nu, nd] = [announced(o, lundi, "progress"), announced(o, lundi, "decline"), announced(n, lundi, "progress"), announced(n, lundi, "decline")];
    totals.oldUp += ou.length;
    totals.oldDown += od.length;
    totals.newUp += nu.length;
    totals.newDown += nd.length;
    console.log(`| ${day(lundi)} | ${ou.length} | ${od.length} : ${names(od)} | ${nu.length} : ${names(nu)} | ${nd.length} : ${names(nd)} | ${withTrend(o)} / ${withTrend(n)} |`);
  }
  console.log(`| Total | ${totals.oldUp} | ${totals.oldDown} | ${totals.newUp} | ${totals.newDown} | |`);

  console.log(`\n## Lundi ${day(lastMonday)} : ${focus.join(", ")}\n`);
  const contexts = new Map(neu.filter((line): line is ContextLine => line.kind === "contexte").map((line) => [`${line.date}::${line.exercise}`, line]));
  for (const name of focus) {
    const o = statuses(old).find((line) => line.lundi === lastMonday && line.exercise === name);
    const n = statuses(neu).find((line) => line.lundi === lastMonday && line.exercise === name);
    if (!o || !n) {
      console.log(`${name} : absent ce lundi-là.`);
      continue;
    }
    console.log(`### ${name} : ancienne ${o.status} ${pct(o.delta)} ; nouvelle ${n.status} ${pct(n.delta)} (seuil ±${pct(n.threshold).slice(1)})\n`);
    console.log("| Séance | Rang | Séries avant (même muscle) | Meilleure série | Capacité ancienne | Capacité nouvelle | Fenêtre |");
    console.log("|---|---|---|---|---|---|---|");
    const count = n.points.length;
    n.points.slice(-6).forEach((point, index) => {
      const before = o.points.find((entry) => entry.date === point.date);
      const context = contexts.get(`${point.date}::${name}`);
      const where = context ? `${context.rank}/${context.exercises}` : "—";
      const sets = context ? `${context.setsBefore.toFixed(1).replace(".", ",")} (${context.sameMuscleBefore.toFixed(1).replace(".", ",")})` : "—";
      const window = count - 6 + index >= count - 3 ? "3 dernières" : "3 d'avant";
      const load = point.weight > 0 ? `${point.weight} kg` : "PDC";
      console.log(`| ${day(point.date)} | ${where} | ${sets} | ${load} × ${point.reps} | ${before ? before.value.toFixed(1).replace(".", ",") : "—"} | ${point.value.toFixed(1).replace(".", ",")} | ${window} |`);
    });
    console.log("");
  }

  console.log("## Écart de chaque séance à la moyenne de ses 3 séances d'avant (« capacité face à la tendance »)\n");
  const since = option(args, "--depuis") ?? "2026-08-17";
  const rirFrom = option(args, "--rir") ?? "2026-08-17";
  console.log(`Séances depuis le ${day(`${since}T12:00:00Z`)} dont les 3 séances d'avant ont toutes un RIR déclaré (depuis le ${day(`${rirFrom}T12:00:00Z`)}). Pentes à l'intérieur de chaque exercice.\n`);
  console.log("| Méthode | Axe | Séances d'exercice (séances) | Écart moyen [IC 95 %] | Par série faite avant | Par série du même muscle | Par rang de l'exercice |");
  console.log("|---|---|---|---|---|---|---|");
  const split = (neu.find((line): line is CostLine => line.kind === "cout" && "horsEchantillon" in (line.costs as object))?.costs as { horsEchantillon?: string } | undefined)?.horsEchantillon;
  const tables: [string, string, Line[], boolean][] = [["Ancienne", since, old, false], ["Nouvelle", since, neu, false]];
  if (split) tables.push(["Ancienne, depuis le " + day(`${split}T12:00:00Z`), split, old, false], [`Nouvelle, coût appris avant le ${day(`${split}T12:00:00Z`)} (hors échantillon)`, split, neu, true]);
  for (const [label, from, lines, outOfSample] of tables) {
    for (const axis of ["tous", "load", "reps"]) {
      const gaps = lines.filter((line): line is GapLine => line.kind === "ecart" && !!line.outOfSample === outOfSample && line.date >= from && line.referenceFrom >= rirFrom && (axis === "tous" || line.axis === axis));
      if (gaps.length === 0) continue;
      const ci = (stat: (rows: GapLine[]) => number) => {
        const [lo, hi] = bootstrap(gaps, (line) => line.sessionId, stat);
        return `${pct(stat(gaps), 2)} [${pct(lo, 2)} ; ${pct(hi, 2)}]`;
      };
      const slope = (x: (line: GapLine) => number) => (rows: GapLine[]) => withinSlopes(rows, (line) => line.exerciseId, (line) => [x(line)], (line) => line.gap)[0];
      const sessions = new Set(gaps.map((line) => line.sessionId)).size;
      const axisLabel = axis === "tous" ? "tous" : axis === "load" ? "charge" : "reps (poids du corps)";
      console.log(`| ${label} | ${axisLabel} | ${gaps.length} (${sessions}) | ${ci((rows) => mean(rows.map((line) => line.gap)))} | ${ci(slope((line) => line.setsBefore))} | ${ci(slope((line) => line.sameMuscleBefore))} | ${ci(slope((line) => line.rank))} |`);
    }
  }
  for (const cost of neu.filter((line): line is CostLine => line.kind === "cout")) {
    console.log(`\nCoût du contexte appris (reps jusqu'à l'échec par série faite avant / par série du même muscle, paires) : ${JSON.stringify(cost.costs)}`);
  }

  console.log("\n## Fausses alertes : les 6 dernières séances de chaque exercice dans tous les ordres possibles\n");
  console.log("Les 20 façons de répartir les 6 dernières capacités entre « 3 dernières » et « 3 d'avant » : aucune tendance, même dispersion");
  console.log("(tendance réelle comprise, donc estimation prudente). Exercices avec au moins 6 séances au dernier lundi.\n");
  const splits: number[][] = [];
  for (let a = 0; a < 6; a += 1) for (let b = a + 1; b < 6; b += 1) for (let c = b + 1; c < 6; c += 1) splits.push([a, b, c]);
  for (const [label, lines, rule] of [
    ["Ancienne (meilleure des 3 contre meilleure des 3, +1,5 % / −3 %)", old, (values: number[]) => OLD_RULE(values)],
    ["Nouvelle (moyenne contre prévision, seuil du bruit mesuré de l'exercice)", neu, null],
  ] as const) {
    let up = 0;
    let down = 0;
    let total = 0;
    let exercises = 0;
    for (const line of statuses(lines).filter((entry) => entry.lundi === lastMonday)) {
      const values = line.points.map((point) => point.value).slice(-6);
      const own = statuses(neu).find((entry) => entry.lundi === lastMonday && entry.exerciseId === line.exerciseId);
      if (values.length < 6 || !own?.threshold) continue;
      exercises += 1;
      for (const recent of splits) {
        const ordered = [...values.filter((_, index) => !recent.includes(index)), ...recent.map((index) => values[index])];
        const status = rule ? rule(ordered) : NEW_RULE(ordered, own.threshold);
        up += status === "progress" ? 1 : 0;
        down += status === "decline" ? 1 : 0;
        total += 1;
      }
    }
    console.log(`- ${label} : ${pct(up / total, 0).slice(1)} de « progrès » et ${pct(down / total, 0).slice(1)} de « baisses » (${exercises} exercices).`);
  }

  if (!replayPath) return;
  console.log("\n## Prévision par série du moteur de suggestion (rejeu `replay.ts`), première série de chaque exercice\n");
  interface ReplayRow {
    session_id: string;
    session_date: string;
    exercise_id: string;
    exercise: string;
    set_type: string;
    reps: number;
    rir: number | null;
    stop_reason: string | null;
    continuation: boolean;
    engine: { pred_at_actual: number };
    ctx: { position: number; calibrating: boolean };
  }
  const rows = readFileSync(replayPath, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as ReplayRow);
  const firsts = rows
    .filter((row) => ["work", "top_set", "backoff"].includes(row.set_type) && row.rir !== null && !row.continuation && !row.ctx.calibrating)
    .filter((row) => row.stop_reason !== "pain" && row.stop_reason !== "equipment" && row.ctx.position === 1 && row.session_date >= since)
    .map((row) => ({ row, residual: row.reps + Math.min(4, row.rir!) - 1 - row.engine.pred_at_actual, context: contexts.get(`${row.session_date}::${row.exercise}`) }))
    .filter((entry) => entry.context);
  const [setsSlope] = withinSlopes(firsts, (entry) => entry.row.exercise_id, (entry) => [entry.context!.setsBefore], (entry) => entry.residual);
  const [lo, hi] = bootstrap(firsts, (entry) => entry.row.session_id, (list) => withinSlopes(list, (entry) => entry.row.exercise_id, (entry) => [entry.context!.setsBefore], (entry) => entry.residual)[0]);
  const [sameSlope] = withinSlopes(firsts, (entry) => entry.row.exercise_id, (entry) => [entry.context!.sameMuscleBefore], (entry) => entry.residual);
  const [sameLo, sameHi] = bootstrap(firsts, (entry) => entry.row.session_id, (list) => withinSlopes(list, (entry) => entry.row.exercise_id, (entry) => [entry.context!.sameMuscleBefore], (entry) => entry.residual)[0]);
  console.log(`${firsts.length} premières séries : écart moyen faites − prévues ${num(mean(firsts.map((entry) => entry.residual)))} rep ; à l'intérieur d'un exercice, ${num(setsSlope, 3)} rep par série faite avant [${num(lo, 3)} ; ${num(hi, 3)}], ${num(sameSlope, 3)} par série du même muscle [${num(sameLo, 3)} ; ${num(sameHi, 3)}].`);
  for (const name of focus) {
    const list = firsts.filter((entry) => entry.row.exercise === name).slice(-6);
    console.log(`- ${name} : ${list.map((entry) => `${day(entry.row.session_date)} rang ${entry.context!.rank}, ${entry.context!.setsBefore.toFixed(0)} séries avant : ${num(entry.residual, 1)}`).join(" ; ")}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === "--comparer") compare(args.slice(1));
else
  announce(args).catch((error) => {
    console.error(error);
    process.exit(1);
  });
