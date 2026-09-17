import { and, gte, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { parseMeasuredOn, parseNumberish } from "@/lib/body-weight/parse";
import { db } from "@/lib/db/client";
import { activityHourly, dailyActivity } from "@/lib/db/schema";

/**
 * Ingestion de l'activité Apple Santé envoyée par un Raccourci, en un seul
 * POST par exécution : le raccourci accumule une ligne « date | valeur » par
 * échantillon (groupé par heure ou par jour) et envoie le tout. Ici on parse,
 * on écrit le détail horaire quand il existe, et on recalcule les totaux du
 * jour concerné depuis ce détail. Idempotent : renvoyer les mêmes lignes ne
 * change rien, renvoyer une heure plus complète remplace la précédente.
 */

export type ActivityMetric = "steps" | "active_energy";
export type ActivityGranularity = "hour" | "day" | "auto";

/** Le détail horaire ne vit que sur les deux derniers jours ; au-delà, seul le total du jour reste. */
export const HOURLY_RETENTION_DAYS = 2;

export interface ParsedLine {
  at: string;
  value: number;
}

export interface IngestSummary {
  parsed: number;
  rejected: number;
  hours_written: number;
  days_written: number;
  first: string | null;
  last: string | null;
}

/** Une ligne = `<date> | <valeur>` (ou tabulation, point-virgule). Les lignes vides sont ignorées. */
export function parseActivityLines(text: string): { lines: ParsedLine[]; rejected: number } {
  const lines: ParsedLine[] = [];
  let rejected = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const separator = line.includes("|") ? "|" : line.includes("\t") ? "\t" : line.includes(";") ? ";" : null;
    if (!separator) { rejected += 1; continue; }
    const index = line.lastIndexOf(separator);
    const at = parseMeasuredOn(line.slice(0, index).trim());
    const value = parseNumberish(line.slice(index + 1).trim());
    if (!at || !Number.isFinite(value) || value < 0) { rejected += 1; continue; }
    lines.push({ at, value });
  }
  return { lines, rejected };
}

function parisDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Bornes UTC d'un jour civil de Paris. */
function parisDayBounds(day: string): { start: Date; end: Date } {
  const [year, month, date] = day.split("-").map(Number);
  const probe = new Date(Date.UTC(year!, month! - 1, date!, 12));
  const offsetPart = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
    .formatToParts(probe).find((part) => part.type === "timeZoneName")?.value ?? "GMT+01:00";
  const match = offsetPart.match(/([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 60;
  const start = new Date(Date.UTC(year!, month! - 1, date!) - offsetMinutes * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

/**
 * « auto » : des échantillons tous datés à minuit (Paris) sont des totaux
 * journaliers (Santé groupé par jour) ; sinon c'est du détail horaire.
 */
export function detectGranularity(lines: ParsedLine[]): "hour" | "day" {
  const allMidnight = lines.every((line) => {
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(line.at));
    return time === "00:00";
  });
  return allMidnight ? "day" : "hour";
}

export async function ingestActivity(metric: ActivityMetric, requested: ActivityGranularity, lines: ParsedLine[], source: string | null): Promise<IngestSummary & { granularity: "hour" | "day" }> {
  const granularity = requested === "auto" ? detectGranularity(lines) : requested;
  const summary: IngestSummary & { granularity: "hour" | "day" } = { granularity, parsed: lines.length, rejected: 0, hours_written: 0, days_written: 0, first: null, last: null };
  if (lines.length === 0) return summary;
  const sorted = [...lines].sort((a, b) => a.at.localeCompare(b.at));
  summary.first = sorted[0]!.at;
  summary.last = sorted[sorted.length - 1]!.at;
  const column = metric === "steps" ? "steps" : "activeEnergyKcal";
  const operations: BatchItem<"pg">[] = [];

  if (granularity === "hour") {
    // Détail horaire : une ligne par heure, la dernière valeur remplace.
    const byHour = new Map<string, number>();
    for (const line of sorted) {
      const hour = new Date(line.at);
      hour.setUTCMinutes(0, 0, 0);
      byHour.set(hour.toISOString(), (byHour.get(hour.toISOString()) ?? 0) + line.value);
    }
    for (const [iso, value] of byHour) {
      const row = column === "steps" ? { steps: Math.round(value) } : { activeEnergyKcal: value };
      operations.push(
        db.insert(activityHourly).values({ hour: new Date(iso), ...row }).onConflictDoUpdate({
          target: activityHourly.hour,
          set: { ...row, updatedAt: new Date() },
        }),
      );
    }
    summary.hours_written = byHour.size;
    // 9 mois par heure ≈ 6 500 lignes : lots de 200 pour rester sous les limites d'une requête Neon HTTP.
    for (let index = 0; index < operations.length; index += 200) {
      const chunk = operations.slice(index, index + 200);
      await db.batch(chunk as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    }
    // Totaux des jours touchés, recalculés depuis le détail (source de vérité horaire).
    const days = [...new Set([...byHour.keys()].map((iso) => parisDay(new Date(iso))))];
    const totals: BatchItem<"pg">[] = [];
    for (const day of days) {
      const { start, end } = parisDayBounds(day);
      const [sum] = await db.select({ total: sql<number>`coalesce(sum(${column === "steps" ? activityHourly.steps : activityHourly.activeEnergyKcal}), 0)` })
        .from(activityHourly).where(and(gte(activityHourly.hour, start), lt(activityHourly.hour, end)));
      const total = Number(sum?.total ?? 0);
      const row = column === "steps" ? { steps: Math.round(total) } : { activeEnergyKcal: total };
      // Une fenêtre horaire qui commence au milieu d'un jour ne couvre qu'une
      // partie de ce jour : sa somme est une borne basse. Les pas ne font que
      // s'accumuler, donc le total du jour ne peut que monter : on garde le
      // maximum entre le total déjà connu (import par jour) et la somme des heures.
      totals.push(
        db.insert(dailyActivity).values({ day, ...row, source }).onConflictDoUpdate({
          target: dailyActivity.day,
          set: column === "steps"
            ? { steps: sql`greatest(excluded.steps, coalesce(${dailyActivity.steps}, 0))`, source, updatedAt: new Date() }
            : { activeEnergyKcal: sql`greatest(excluded.active_energy_kcal, coalesce(${dailyActivity.activeEnergyKcal}, 0))`, source, updatedAt: new Date() },
        }),
      );
    }
    summary.days_written = days.length;
    if (totals.length) await db.batch(totals as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    // Fusion : une fois le total du jour posé, le détail des jours anciens n'a plus d'usage.
    const keepFrom = parisDayBounds(parisDay(new Date(Date.now() - (HOURLY_RETENTION_DAYS - 1) * 24 * 60 * 60_000))).start;
    await db.delete(activityHourly).where(lt(activityHourly.hour, keepFrom));
    return summary;
  }

  // Granularité jour : totaux directs, une ligne par jour civil de Paris.
  const byDay = new Map<string, number>();
  for (const line of sorted) {
    const day = parisDay(new Date(line.at));
    byDay.set(day, (byDay.get(day) ?? 0) + line.value);
  }
  for (const [day, value] of byDay) {
    const row = column === "steps" ? { steps: Math.round(value) } : { activeEnergyKcal: value };
    operations.push(
      db.insert(dailyActivity).values({ day, ...row, source }).onConflictDoUpdate({
        target: dailyActivity.day,
        set: { ...row, source, updatedAt: new Date() },
      }),
    );
  }
  summary.days_written = byDay.size;
  // Un lot D1/Neon reste borné : 9 mois par jour = ~270 instructions, ce qui passe en un batch.
  for (let index = 0; index < operations.length; index += 200) {
    const chunk = operations.slice(index, index + 200);
    await db.batch(chunk as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  }
  return summary;
}
