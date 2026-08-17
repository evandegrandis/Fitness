import webpush from "web-push";

import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Web Push côté serveur (notification de fin de repos).
 *
 * Pourquoi passer par un serveur pour une simple alarme locale : iOS gèle le JavaScript de la
 * page dès que l'écran s'éteint. Un `setTimeout` posé au début du repos ne se déclenchera donc
 * jamais, téléphone dans la poche — c'est précisément le moment où la notification sert. Seul
 * un push distant réveille le service worker.
 */

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
}

/** Configure VAPID à la demande : absence de clés = fonctionnalité désactivée, jamais un crash. */
function configured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contact.helmetbrown@gmail.com", publicKey, privateKey);
  return true;
}

/**
 * Envoie à tous les abonnements enregistrés (app mono-utilisateur : quelques appareils au plus).
 * Un abonnement révoqué par le navigateur (404/410) est purgé — sinon la table accumulerait
 * indéfiniment des cibles mortes à chaque réinstallation de la PWA.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!configured()) return { sent: 0, pruned: 0 };

  const subscriptions = await db.select().from(pushSubscriptions);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, row.endpoint));
          pruned += 1;
        }
        // Toute autre erreur (réseau, 5xx du service de push) est absorbée : une notification
        // de confort ne doit jamais faire échouer la requête qui l'a déclenchée.
      }
    })
  );

  return { sent, pruned };
}
