/**
 * OFFLINE_PWA_SPEC §1 (P4.3, C1) — génère `public/sw.js` à partir du gabarit ci-dessous, en y
 * injectant un identifiant de build STABLE pour la durée d'un déploiement mais DIFFÉRENT à chaque
 * nouveau build ("nom de cache versionné par build", §1). Lancé automatiquement avant `next dev`
 * ET `next build` via les hooks npm `predev`/`prebuild` (package.json) — toujours respectés par
 * `npm run dev` / `npm run build`, y compris sur Vercel qui invoque `npm run build`.
 *
 * Décision tracée (AGENTS.md : ce Next n'est pas standard, ne rien supposer) : le SW est un fichier
 * STATIQUE `public/sw.js` régénéré par ce script plutôt qu'une Route Handler dynamique
 * (`app/sw.js/route.ts`) — c'est le pattern EXPLICITEMENT documenté par
 * `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` (`public/sw.js` +
 * `navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'})`), donc le choix
 * le moins risqué : une Route Handler dans un dossier nommé littéralement `sw.js` fonctionnerait
 * probablement (les segments de route sont les noms de dossier tels quels) mais n'est confirmée
 * nulle part dans la doc lue, et cette phase ne peut pas être vérifiée par `next build`/`next dev`
 * (garde-fou de la mission : `tsc`/`vitest` seulement, jamais de build/dev réel).
 *
 * `VERCEL_GIT_COMMIT_SHA`/`VERCEL_DEPLOYMENT_ID` sont garantis présents PENDANT l'étape de build
 * sur Vercel (variables système disponibles au build sans réglage projet — contrairement à leur
 * disponibilité au RUNTIME des fonctions serverless, qui dépend d'un toggle projet non garanti).
 * En local (aucun des deux défini), repli sur `Date.now()` : change à chaque exécution du script,
 * suffisant pour observer le comportement "nouvelle version" en dev.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

// Un même commit peut être redéployé (variables/config/build différents) : l'identifiant de
// déploiement est donc prioritaire au SHA Git afin que chaque livraison obtienne son cache propre.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const SW_SOURCE = `// Généré automatiquement par scripts/generate-sw.ts — NE PAS ÉDITER À LA MAIN.
// Régénéré à chaque "npm run dev"/"npm run build" (hooks predev/prebuild) avec un nouveau BUILD_ID.
//
// OFFLINE_PWA_SPEC.md §1 (C1 — fraîcheur du code JAMAIS bloquée derrière un cache périmé) :
//   - Documents de navigation -> NETWORK-FIRST. En ligne = réseau. Hors-ligne = repli exact pour
//     une URL déjà visitée. Les payloads RSC restent réseau pur : leur clé dépend de l'état du
//     routeur et les rejouer approximativement peut mélanger deux arbres React.
//   - Assets immuables hashés par le build (_next/static/*) -> CACHE-FIRST (le hash change à chaque
//     contenu différent : un cache-first ne peut jamais y servir un contenu périmé).
//   - Mutations (méthode != GET : Server Actions, écritures) -> jamais interceptées (aucun
//     event.respondWith) = network-only implicite, l'offline lit le store, pas le SW (C2).
//   - skipWaiting + clients.claim : auto-activation immédiate, jamais d'attente de fermeture
//     d'onglet. Cache nommé "jeera-cache-<BUILD_ID>" ; à l'activate, purge de tout cache
//     "jeera-cache-*" dont le nom ne correspond pas au build courant.
const BUILD_ID = ${JSON.stringify(BUILD_ID)};
const CACHE_NAME = "jeera-cache-" + BUILD_ID;
const CACHE_PREFIX = "jeera-cache-";
const SHELL_URL = "/";
// Au-delà, on considère le réseau inutilisable et on sert le shell caché (cf. networkFirst).
// Assez long pour qu'une 4G normale gagne toujours, assez court pour ne pas rester devant un
// écran vide en salle.
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Le nouveau cache ne doit jamais prendre la main vide puis supprimer l'ancien : on pose un
      // shell frais AVANT skipWaiting. Si le réseau est indisponible, l'installation échoue et
      // l'ancien SW/cache reste actif — comportement plus sûr qu'un cold-start cassé.
      const response = await fetch(new Request(SHELL_URL, { cache: "reload" }));
      if (!response.ok) throw new Error("Impossible de préparer le shell offline");
      const cache = await caches.open(CACHE_NAME);
      const shellForCache = response.clone();
      const html = await response.text();
      await cache.put(SHELL_URL, shellForCache);

      // Un document HTML seul n'est pas un shell exécutable. Prépare aussi les chunks JS/CSS
      // hashés qu'il référence AVANT d'activer le worker et de purger l'ancien cache. Chaque asset
      // est indépendant : une police optionnelle manquante ne doit pas invalider tout le build.
      const assetUrls = new Set();
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        try {
          const assetUrl = new URL(match[1], self.location.origin);
          if (assetUrl.origin === self.location.origin && assetUrl.pathname.startsWith("/_next/static/")) {
            assetUrls.add(assetUrl.href);
          }
        } catch {
          // URL HTML malformée : ignore cet asset, le document reste utilisable en ligne.
        }
      }
      await Promise.all(
        [...assetUrls].map(async (assetUrl) => {
          try {
            const assetResponse = await fetch(new Request(assetUrl, { cache: "reload" }));
            if (assetResponse.ok) await cache.put(assetUrl, assetResponse);
          } catch {
            // Best effort pour les assets secondaires ; le shell lui-même est déjà garanti.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isImmutableStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isPublicAsset(request) {
  return ["font", "image", "manifest"].includes(request.destination);
}

async function networkFirst(request, event) {
  const cache = await caches.open(CACHE_NAME);

  // Lancée UNE seule fois et partagée : soit elle répond à temps et on la sert, soit elle est
  // consommée en tâche de fond pour rafraîchir le cache. Le put() est dans la chaîne (pas
  // fire-and-forget) : c'est la promesse tenue par respondWith()/waitUntil() qui maintient
  // l'event fetch vivant, un put() détaché pourrait être coupé par le navigateur.
  const network = fetch(request).then(async (response) => {
    if (response && response.ok) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });

  const cached = await cache.match(request);
  // Rien en cache : aucune alternative, on attend le réseau quel qu'en soit le délai.
  if (!cached) return network;

  // Réseau DÉGRADÉ (capté mais inutilisable — sous-sol de salle de sport) : fetch() ne rejette
  // pas, il attend, parfois plus d'une minute. Sans borne, l'app reste sur un écran vide alors
  // qu'un shell utilisable dort dans le cache — c'est le « une fois sur deux » constaté par Evan
  // (hors-ligne franc = rejet immédiat = repli OK ; réseau faible = attente infinie = écran vide).
  //
  // Nuance sur C1 (fraîcheur) : le réseau reste prioritaire, on ne sert le cache que s'il dépasse
  // NETWORK_TIMEOUT_MS. La requête n'est PAS annulée — elle continue et remplit le cache, donc le
  // démarrage suivant repart sur du frais. Un réseau normal (< 3 s) sert toujours la version fraîche.
  let timer;
  const timedOut = Symbol("network-timeout");
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(timedOut), NETWORK_TIMEOUT_MS);
  });

  const winner = await Promise.race([network.catch(() => timedOut), timeout]);
  clearTimeout(timer);
  if (winner !== timedOut && winner) return winner;

  event.waitUntil(network.catch(() => {}));
  return cached;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImmutableStaticAsset(url) || isPublicAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, event));
  }
  // Les autres GET dynamiques restent réseau pur : ne jamais transformer le SW en cache API/data.
});

// --- Notifications de fin de repos -----------------------------------------
// iOS gèle le JavaScript de la page dès que l'écran s'éteint : un setTimeout local ne se
// déclenchera jamais pendant un repos, téléphone posé. Seul un push serveur réveille le SW.
// Sur iOS, cela suppose l'app ajoutée à l'écran d'accueil (Web Push refusé en onglet Safari).
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Push sans payload (ou payload illisible) : on notifie quand même, c'est le signal qui compte.
    payload = {};
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Repos terminé", {
      body: payload.body || "C'est reparti !",
      // Même tag = la notif suivante remplace la précédente au lieu d'empiler les repos.
      tag: payload.tag || "jeera-rest",
      renotify: true,
      icon: "/icon",
      badge: "/icon",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      // Reprendre l'onglet déjà ouvert plutôt qu'en empiler un nouveau sur la séance en cours.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
`;

function main(): void {
  const outPath = path.resolve(process.cwd(), "public/sw.js");
  writeFileSync(outPath, SW_SOURCE, "utf8");
  console.log(`[generate-sw] public/sw.js régénéré (BUILD_ID=${BUILD_ID}).`);
}

main();
