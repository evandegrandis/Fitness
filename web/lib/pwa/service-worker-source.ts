/**
 * Source du service worker (`public/sw.js`, régénéré à chaque build par `scripts/generate-sw.ts`).
 * Gardée ici, hors de `scripts/` (exclu du build Vercel sauf `generate-sw.ts`), pour être testée
 * (`lib/pwa/__tests__/service-worker.test.ts`).
 *
 * Refait le 08/10/2026 après trois écrans vus par Evan en salle (3G faible) : écran noir, « This
 * page couldn't load », et Safari « FetchEvent.respondWith received an error: TypeError: Load
 * failed ». Règles :
 *
 * 1. Une navigation n'échoue JAMAIS : coquille en cache, sinon réseau avec un délai court, sinon
 *    une page de repli en français. `respondWith` ne reçoit jamais une promesse rejetée.
 * 2. La coquille de l'app (Séance, Progrès, Historique, Réglages) ne contient plus aucune donnée
 *    (`app/(app)/layout.tsx`) : elle est servie DU CACHE, tout de suite, quel que soit le réseau.
 *    Elle est versionnée par build (cache `jeera-shell-<BUILD_ID>`, rempli à l'installation).
 *    Fraîcheur du code (OFFLINE_PWA_SPEC, C1) : chaque déploiement produit un nouveau `sw.js`, que
 *    le navigateur détecte à la navigation (et `ServiceWorkerRegistrar` à chaque retour au premier
 *    plan) ; il s'installe, s'active aussitôt et l'app se recharge au premier moment sans saisie.
 * 3. Les fichiers versionnés par le build (`/_next/static/`) : cache d'abord. Ils sont gardés d'un
 *    build à l'autre (leur nom change avec leur contenu) pour qu'une page ouverte avant un
 *    déploiement puisse encore charger ses morceaux de code hors ligne.
 * 4. Les segments que le routeur précharge pour les onglets (`Next-Router-Segment-Prefetch`) sont
 *    des fichiers statiques du build : gardés avec la coquille de ce build, l'onglet change sans
 *    réseau. Données, API, actions serveur et autres payloads RSC (qui dépendent de l'état du
 *    routeur) : jamais interceptés (le cache des données est le stockage local, C2).
 */
export function serviceWorkerSource(buildId: string): string {
  return `// Généré par scripts/generate-sw.ts depuis lib/pwa/service-worker-source.ts. NE PAS ÉDITER.
const BUILD_ID = ${JSON.stringify(buildId)};
const SHELL_CACHE = "jeera-shell-" + BUILD_ID;
const STATIC_CACHE = "jeera-static-v1";
const ASSET_CACHE = "jeera-assets-v1";
const APP_ROUTES = ["/", "/progres", "/historique", "/reglages"];
// Page pas encore en cache (détail d'une séance) : au-delà, le réseau est jugé inutilisable.
const NAV_TIMEOUT_MS = 4000;
const STATIC_MAX_ENTRIES = 600;

const FALLBACK_HTML = \`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07080e"><title>Jeera</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07080e;color:#f4ecdc;font-family:-apple-system,system-ui,sans-serif}
main{max-width:22rem;padding:1.5rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#a9a39a;font-size:.9rem;line-height:1.4}
a,button{display:inline-block;margin:.75rem .5rem 0 0;padding:.6rem 1rem;border-radius:999px;border:1px solid #f97316;color:#f97316;background:none;font-size:.9rem;text-decoration:none}</style>
</head><body><main data-offline-fallback><h1>Pas de réseau pour cette page</h1>
<p>L'app ne l'a pas encore en mémoire. Ta séance est enregistrée sur le téléphone : rien n'est perdu.</p>
<a href="/">Revenir à la séance</a><button onclick="location.reload()">Réessayer</button></main></body></html>\`;

function offlineFallback() {
  return new Response(FALLBACK_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Jeera-Fallback": "1" },
  });
}

function isAppShell(pathname) {
  return APP_ROUTES.includes(pathname);
}

function isCacheableDocument(pathname) {
  return isAppShell(pathname) || pathname.startsWith("/historique/");
}

function staticAssetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) urls.add(url.href);
    } catch {
      // URL malformée : ignorée.
    }
  }
  return [...urls];
}

async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  const statics = await caches.open(STATIC_CACHE);
  let homeCached = false;
  await Promise.all(
    APP_ROUTES.map(async (route) => {
      try {
        const response = await fetch(new Request(route, { cache: "no-cache", credentials: "same-origin" }));
        if (!response.ok || response.redirected) return;
        const html = await response.clone().text();
        await shell.put(route, response);
        if (route === "/") homeCached = true;
        await Promise.all(
          staticAssetUrls(html).map(async (assetUrl) => {
            if (await statics.match(assetUrl)) return;
            try {
              const asset = await fetch(assetUrl);
              if (asset.ok) await statics.put(assetUrl, asset);
            } catch {
              // Un morceau manquant sera pris au vol plus tard.
            }
          })
        );
      } catch {
        // Une page manquante n'empêche pas les autres.
      }
    })
  );
  // Sans la séance en cache, ce worker ne vaut pas mieux que l'ancien : l'installation échoue et
  // l'ancien reste actif (réseau trop faible pour préparer la nouvelle version).
  if (!homeCached) throw new Error("Coquille de l'app indisponible");
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

async function pruneStatic() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - STATIC_MAX_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          // "jeera-cache-*" : caches de l'ancien worker (avant le 08/10/2026).
          .filter((name) => (name.startsWith("jeera-shell-") && name !== SHELL_CACHE) || name.startsWith("jeera-cache-"))
          .map((name) => caches.delete(name))
      );
      await pruneStatic().catch(() => {});
      await self.clients.claim();
    })()
  );
});

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function handleNavigation(event) {
  const request = event.request;
  const url = new URL(request.url);
  try {
    const shell = await caches.open(SHELL_CACHE);
    const key = isAppShell(url.pathname) ? url.pathname : url.pathname + url.search;
    if (isCacheableDocument(url.pathname)) {
      const cached = await shell.match(key);
      if (cached) return cached;
    }
    const network = fetch(request).then(async (response) => {
      if (response && response.ok && !response.redirected && isCacheableDocument(url.pathname)) {
        await shell.put(key, response.clone()).catch(() => {});
      }
      return response;
    });
    // La réponse tardive finit quand même dans le cache, pour la prochaine fois.
    event.waitUntil(network.catch(() => null));
    const response = await withTimeout(network.catch(() => null), NAV_TIMEOUT_MS);
    if (response) return response;
    // Réseau absent ou muet : une coquille de l'app vaut mieux qu'une erreur Safari.
    if (isAppShell(url.pathname)) {
      const home = await shell.match("/");
      if (home) return home;
    }
    return offlineFallback();
  } catch {
    return offlineFallback();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then(async (response) => {
    if (response && response.ok) await cache.put(event.request, response.clone()).catch(() => {});
    return response;
  });
  if (cached) {
    event.waitUntil(network.catch(() => null));
    return cached;
  }
  return network;
}

function isPublicAsset(request, url) {
  return (
    ["font", "image", "manifest"].includes(request.destination) ||
    url.pathname.startsWith("/statue/") ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  // Préchargement des onglets par le routeur (segments statiques du build, URL unique par segment
  // et par build) : gardé avec la coquille de CE build. Les onglets changent alors sans réseau,
  // y compris juste après l'ouverture en 3G et hors ligne.
  if (request.headers.get("next-router-segment-prefetch") && isCacheableDocument(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (isPublicAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(event, ASSET_CACHE));
  }
  // Le reste (API, données, autres payloads RSC) : réseau pur, jamais servi depuis ce cache.
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
}
