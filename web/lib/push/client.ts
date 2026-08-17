"use client";

/**
 * Abonnement Web Push côté navigateur.
 *
 * Contrainte iOS (16.4+) : les notifications ne sont accordées QUE si l'app a été ajoutée à
 * l'écran d'accueil. En onglet Safari, `Notification.requestPermission` échoue ou reste refusé —
 * d'où `canSubscribe()`, qui distingue « pas encore installée » d'un vrai refus pour pouvoir
 * l'expliquer à l'utilisateur au lieu d'afficher un échec opaque.
 */

export type PushSupport = "ready" | "needs_install" | "unsupported" | "denied";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS n'expose pas display-mode pour les PWA installées : il garde ce champ hérité.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "needs_install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (isIos() && !isStandalone()) return "needs_install";
  return "ready";
}

/**
 * Clé VAPID publique en base64url → `Uint8Array` attendu par `PushManager.subscribe`.
 * Le buffer est alloué explicitement : `new Uint8Array(length)` est typé sur `ArrayBufferLike`,
 * que `applicationServerKey` (qui exige un `ArrayBuffer`) refuse.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Demande la permission, s'abonne et enregistre l'abonnement côté serveur. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  const support = pushSupport();
  if (support !== "ready") return { ok: false, reason: support };

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: "missing_key" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Web Push exige un payload visible pour l'utilisateur : pas de push silencieux.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }));

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) return { ok: false, reason: "server_error" };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

/**
 * Demande au serveur de notifier la fin du repos. Volontairement « fire-and-forget » : la requête
 * reste ouverte pendant tout le repos côté serveur, l'appelant ne doit surtout pas l'attendre.
 * Renvoie un AbortController pour annuler si le repos est passé ou la séance terminée.
 *
 * Sans abonnement (notifications non activées), on ne tente rien : inutile de tenir une requête
 * ouverte pendant deux minutes pour un push qui ne partira pas.
 */
export function scheduleRestNotification(delaySeconds: number, body?: string): AbortController | null {
  if (delaySeconds < 1 || delaySeconds > 240) return null;
  const controller = new AbortController();

  void (async () => {
    const subscription = await currentSubscription().catch(() => null);
    if (!subscription || controller.signal.aborted) return;
    await fetch("/api/push/rest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        delaySeconds: Math.round(delaySeconds),
        body,
      }),
      signal: controller.signal,
    }).catch(() => {
      // Réseau coupé ou repos annulé : le minuteur visuel reste la source de vérité.
    });
  })();

  return controller;
}
