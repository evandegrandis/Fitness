import { z } from "zod";

import { sendPushToAll } from "@/lib/push/server";

/**
 * Programme la notification de fin de repos.
 *
 * Le client appelle cette route au démarrage du minuteur, avec le temps restant. La fonction
 * tient la requête ouverte pendant le repos puis envoie le push. C'est volontairement le
 * mécanisme le plus simple qui fonctionne pour une app mono-utilisateur : un vrai ordonnanceur
 * (cron, workflow durable) serait plus robuste mais demanderait une infrastructure sans commune
 * mesure avec l'enjeu — une alarme de 2 minutes, quelques fois par semaine.
 *
 * Conséquence assumée : si la fonction est recyclée en cours d'attente, la notification saute.
 * Le minuteur visuel dans l'app, lui, reste la source de vérité et n'en dépend pas.
 */

export const maxDuration = 300;

// Le repos le plus long réglé dans l'app est le superset (180 s) ; on garde une marge sans
// jamais s'approcher de `maxDuration`, l'envoi lui-même devant tenir dans la fenêtre restante.
const MAX_DELAY_SECONDS = 240;

const bodySchema = z.object({
  delaySeconds: z.number().int().min(1).max(MAX_DELAY_SECONDS),
  title: z.string().min(1).max(80).optional(),
  body: z.string().min(1).max(160).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { delaySeconds, title, body } = parsed.data;

  // Abandonne l'attente si le client se déconnecte (séance terminée, repos passé) : inutile de
  // garder la fonction en vie, et surtout de notifier un repos que l'utilisateur a déjà zappé.
  const aborted = new Promise<"aborted">((resolve) => {
    request.signal.addEventListener("abort", () => resolve("aborted"), { once: true });
  });
  const elapsed = new Promise<"elapsed">((resolve) => {
    setTimeout(() => resolve("elapsed"), delaySeconds * 1000);
  });

  if ((await Promise.race([elapsed, aborted])) === "aborted") {
    return Response.json({ ok: true, skipped: "aborted" });
  }

  const result = await sendPushToAll({
    title: title ?? "Repos terminé",
    body: body ?? "C'est reparti !",
    tag: "jeera-rest",
  });

  return Response.json({ ok: true, ...result });
}
