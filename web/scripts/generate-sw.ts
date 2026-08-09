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

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      // Attendu (pas fire-and-forget) : la promesse renvoyée à respondWith() est la SEULE chose
      // qui maintient l'event fetch vivant ; un put() non attendu pourrait être interrompu par le
      // navigateur juste après le retour de la réponse (le SW n'a plus de raison de rester actif).
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
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
    event.respondWith(networkFirst(request));
  }
  // Les autres GET dynamiques restent réseau pur : ne jamais transformer le SW en cache API/data.
});
`;

function main(): void {
  const outPath = path.resolve(process.cwd(), "public/sw.js");
  writeFileSync(outPath, SW_SOURCE, "utf8");
  console.log(`[generate-sw] public/sw.js régénéré (BUILD_ID=${BUILD_ID}).`);
}

main();
