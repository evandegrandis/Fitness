import { z } from "zod";

import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Enregistre (POST) ou révoque (DELETE) un abonnement Web Push.
 * Protégé par le cookie de session comme le reste de l'app (cf. `proxy.ts`).
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  // L'endpoint EST l'identité de l'abonnement : réenregistrer le même appareil doit rafraîchir
  // les clés plutôt que dupliquer la ligne (le navigateur peut faire tourner ses clés).
  await db
    .insert(pushSubscriptions)
    .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: keys.p256dh, auth: keys.auth },
    });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const parsed = z
    .object({ endpoint: z.string().url() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_endpoint" }, { status: 400 });

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
  return Response.json({ ok: true });
}
