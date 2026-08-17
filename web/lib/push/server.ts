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

/** L'abonnement existe-t-il ? Sert de contrôle d'accès avant toute attente côté serveur. */
export async function findSubscription(endpoint: string) {
  const [row] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  return row ?? null;
}

/**
 * Notifie UN abonnement précis — celui qui a demandé le minuteur.
 *
 * Volontairement pas un « envoyer à tous » : d'une part l'app est déployée en accès public
 * (`JEERA_PUBLIC_MODE`), donc une route capable d'arroser tous les abonnés serait un vecteur de
 * spam pour quiconque connaît l'URL ; d'autre part, avec plusieurs appareils enregistrés, seul
 * celui qui est en séance a une raison de sonner.
 *
 * Un abonnement révoqué par le navigateur (404/410) est purgé — sinon la table accumulerait des
 * cibles mortes à chaque réinstallation de la PWA.
 */
export async function sendPushTo(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (!configured()) return { sent: 0, pruned: 0 };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    );
    return { sent: 1, pruned: 0 };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));
      return { sent: 0, pruned: 1 };
    }
    // Toute autre erreur (réseau, 5xx du service de push) est absorbée : une notification de
    // confort ne doit jamais faire échouer la requête qui l'a déclenchée.
    return { sent: 0, pruned: 0 };
  }
}
