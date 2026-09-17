import { z } from "zod";

import { ingestActivity, parseActivityLines } from "@/lib/activity/ingest";
import { parseMeasuredOn, parseNumberish } from "@/lib/body-weight/parse";

/**
 * Ingestion de l'activité quotidienne (pas, énergie active) depuis Apple
 * Santé via un Raccourci. Même jeton que la pesée. Une ligne par jour civil,
 * chaque envoi remplace : les totaux Santé ne font que croître dans la
 * journée, la dernière valeur est donc toujours la plus complète.
 */

const numberish = z.union([
  z.number(),
  z.string().transform((v) => parseNumberish(v)),
]);

/** Mode lot : le raccourci envoie toutes ses lignes « date | valeur » d'un coup. */
const batchSchema = z.object({
  metric: z.enum(["steps", "active_energy"]).optional(),
  type: z.enum(["steps", "active_energy"]).optional(),
  granularity: z.enum(["hour", "day", "auto"]).default("auto"),
  lines: z.string().min(1).max(2_000_000),
  source: z.string().max(40).optional(),
});

const bodySchema = z.object({
  /**
   * ISO, « 2026-09-17 » ou date française de Raccourcis ; lu en heure de Paris.
   * L'heure est conservée : un échantillon groupé par heure (« 17 sept. à 14:00 »)
   * alimente le détail horaire, un échantillon à minuit est un total du jour.
   */
  day: z.string().transform((value, ctx) => {
    const iso = parseMeasuredOn(value);
    if (!iso) ctx.addIssue({ code: "custom", message: `date illisible : ${value}` });
    return iso ?? "";
  }),
  steps: numberish.pipe(z.number().min(0).max(199_999)).optional(),
  activeEnergyKcal: numberish.pipe(z.number().min(0).max(9_999)).optional(),
  source: z.string().max(40).optional(),
});

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return diff === 0;
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.HEALTH_INGEST_TOKEN ?? process.env.BODY_WEIGHT_INGEST_TOKEN;
  if (!expected) return Response.json({ error: "ingest_disabled" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !constantTimeEqual(auth.slice(7).trim(), expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const rawText = await request.text();
  console.log(JSON.stringify({ event: "daily_activity_payload", bytes: rawText.length, raw: rawText.slice(0, 200) }));
  let json: unknown = null;
  try { json = JSON.parse(rawText); } catch { /* invalid_request ci-dessous */ }
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const canonical = key.toLowerCase().replace(/[^a-z]/g, "");
      if (["day", "date", "measuredon", "mesuredon", "jour"].includes(canonical)) record.day ??= value;
      if (["steps", "pas", "step"].includes(canonical)) record.steps ??= value;
      if (["activeenergykcal", "activeenergy", "kcal", "energieactive", "energie"].includes(canonical)) record.activeEnergyKcal ??= value;
    }
  }
  if (json && typeof json === "object" && typeof (json as { lines?: unknown }).lines === "string") {
    const batch = batchSchema.safeParse(json);
    if (!batch.success) return Response.json({ error: "invalid_request", issues: batch.error.issues }, { status: 400 });
    const metric = batch.data.metric ?? batch.data.type ?? "steps";
    const { lines, rejected } = parseActivityLines(batch.data.lines);
    try {
      const summary = await ingestActivity(metric, batch.data.granularity, lines, batch.data.source ?? null);
      summary.rejected = rejected;
      console.log(JSON.stringify({ event: "activity_batch_ingested", metric, source: batch.data.source ?? null, ...summary }));
      return Response.json({ ok: true, metric, ...summary });
    } catch (error) {
      console.error(JSON.stringify({ event: "activity_batch_failed", error: error instanceof Error ? error.message : String(error) }));
      return Response.json({ error: "write_failed" }, { status: 502 });
    }
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  const { day: at, steps, activeEnergyKcal, source } = parsed.data;
  if (steps === undefined && activeEnergyKcal === undefined) return Response.json({ error: "nothing_to_store" }, { status: 400 });

  // Un élément à la fois (raccourci « une requête par échantillon ») passe par
  // la même ingestion que le mode lot : même détection jour/heure, mêmes totaux.
  try {
    const results = [];
    if (steps !== undefined) results.push(await ingestActivity("steps", "auto", [{ at, value: steps }], source ?? null));
    if (activeEnergyKcal !== undefined) results.push(await ingestActivity("active_energy", "auto", [{ at, value: activeEnergyKcal }], source ?? null));
    const granularity = results[0]?.granularity ?? "day";
    console.log(JSON.stringify({ event: "daily_activity_ingested", at, granularity, steps: steps ?? null, activeEnergyKcal: activeEnergyKcal ?? null, source: source ?? null }));
    return Response.json({ ok: true, at, granularity, steps: steps ?? null, activeEnergyKcal: activeEnergyKcal ?? null });
  } catch (error) {
    console.error(JSON.stringify({ event: "daily_activity_ingest_failed", error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "write_failed" }, { status: 502 });
  }
}
