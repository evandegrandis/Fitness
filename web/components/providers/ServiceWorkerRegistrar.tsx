"use client";

import { useEffect } from "react";

/**
 * OFFLINE_PWA_SPEC §1 (P4.3, C1) — enregistre le service worker à la racine (`/sw.js`, scope `/`).
 * `updateViaCache: "none"` : le navigateur ne doit JAMAIS réutiliser SA PROPRE copie HTTP de
 * `/sw.js` pour décider s'il existe une mise à jour (en plus du header `Cache-Control: no-cache`
 * déjà posé dans `next.config.ts`, ceinture + bretelles — les deux mécanismes sont indépendants :
 * l'un régit le cache HTTP navigateur, l'autre le comportement spécifique du sous-système Service
 * Worker). `self.skipWaiting()` + `self.clients.claim()` côté SW (`scripts/generate-sw.ts`) font le
 * reste : auto-activation immédiate, jamais d'attente de fermeture d'onglet — un simple reload EN
 * LIGNE suffit à obtenir le nouveau code (test manuel documenté dans VARIATION_CYCLING_IMPL.md,
 * case P4.3).
 *
 * Ne bloque jamais le rendu ni ne fait planter l'app si l'enregistrement échoue (navigateur sans
 * support, contexte non sécurisé en dev sans HTTPS, etc.) — best-effort, l'app reste utilisable
 * sans SW, juste sans le repli hors-ligne du shell.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let cancelled = false;
    const hadController = navigator.serviceWorker.controller !== null;
    let refreshing = false;

    const onControllerChange = () => {
      if (cancelled || !hadController || refreshing) return;
      refreshing = true;
      // `skipWaiting()` active bien le nouveau worker, mais le document déjà chargé garde ses
      // anciens chunks jusqu'à un reload. Celui-ci garantit qu'une seule action utilisateur suffit
      // pour passer au code du nouveau déploiement (pas de « deuxième reload » implicite).
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (cancelled) return;
        registration = reg;
      } catch {
        // Best-effort — voir doc ci-dessus.
      }
    }

    void register();

    // Ne pas attendre l'heuristique par défaut du navigateur (jusqu'à 24h) pour vérifier une
    // nouvelle version : revérifie explicitement dès que l'onglet redevient visible ou que le
    // réseau revient (C1 — "au retour en ligne, un nouveau SW prend la main immédiatement").
    const checkForUpdate = () => void registration?.update();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", checkForUpdate);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", checkForUpdate);
    };
  }, []);

  return null;
}
