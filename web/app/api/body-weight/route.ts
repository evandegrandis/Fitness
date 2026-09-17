import { randomUUID } from "node:crypto";
import { z } from "zod";

import { saveBodyWeight } from "@/lib/db/actions";
import { parseMeasuredOn, parseNumberish } from "@/lib/body-weight/parse";

/**
 * Ingestion d'une pesée depuis l'extérieur de l'app : balance connectée →
 * Apple Santé → automatisation Raccourcis (POST ici), ou Barbis en vocal.
 *
 * L'app tourne en accès public (`JEERA_PUBLIC_MODE`) : cette route est donc
 * ouverte à Internet et n'accepte qu'un porteur du jeton `BODY_WEIGHT_INGEST_TOKEN`
 * (variable Vercel). Sans jeton configuré, la route refuse tout.
 *
 * Une pesée par jour civil : même clé de conflit que dans l'app, une seconde
 * pesée le même jour corrige la première.
 */

const bodySchema = z.object({
  // Raccourcis iOS envoie la valeur telle que la variable Santé se rend en texte
  // (« 75,3 », « 76 kg », « 76,2 kg ») : on lit le premier nombre, virgule comprise.
  weightKg: z.union([
    z.number(),
    z.string().transform((v) => parseNumberish(v)),
  ]).pipe(z.number().gt(20).lt(400)),
  /**
   * ISO 8601 avec fuseau, jour « 2026-09-17 », ou la date telle que Raccourcis
   * rend un échantillon Santé en français (« 15 sept. 2026 à 09:41 »,
   * « 15/09/2026 09:41 »). Lue en heure de Paris. Défaut : maintenant.
   */
  measuredOn: z.string().transform((value, ctx) => {
    const iso = parseMeasuredOn(value);
    if (!iso) ctx.addIssue({ code: "custom", message: `date illisible : ${value}` });
    return iso ?? "";
  }).optional(),
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
  const expected = process.env.BODY_WEIGHT_INGEST_TOKEN;
  if (!expected) return Response.json({ error: "ingest_disabled" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !constantTimeEqual(auth.slice(7).trim(), expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const rawText = await request.text();
  // Le corps est journalisé tel quel (borné) : c'est le seul moyen de voir ce
  // qu'un Raccourci iOS envoie réellement quand une variable est mal posée.
  console.log(JSON.stringify({ event: "body_weight_payload", raw: rawText.slice(0, 300) }));
  let json: unknown = null;
  try { json = JSON.parse(rawText); } catch { /* invalid_request ci-dessous */ }
  // Tolérance aux clés tapées à la main dans Raccourcis (« mesuredOn », « weightkg »).
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const canonical = key.toLowerCase().replace(/[^a-z]/g, "");
      if (canonical === "measuredon" || canonical === "mesuredon" || canonical === "date") record.measuredOn ??= value;
      if (canonical === "weightkg" || canonical === "weight" || canonical === "poids") record.weightKg ??= value;
    }
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });

  const measuredOn = parsed.data.measuredOn ? new Date(parsed.data.measuredOn) : new Date();
  const weightKg = Math.round(parsed.data.weightKg * 10) / 10;
  try {
    await saveBodyWeight({ id: randomUUID(), measuredOn, weightKg });
  } catch (error) {
    console.error(JSON.stringify({ event: "body_weight_ingest_failed", source: parsed.data.source ?? null, error: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "write_failed" }, { status: 502 });
  }
  console.log(JSON.stringify({ event: "body_weight_ingested", source: parsed.data.source ?? null, day: measuredOn.toISOString().slice(0, 10), weightKg }));
  return Response.json({ ok: true, day: measuredOn.toISOString().slice(0, 10), weightKg });
}
