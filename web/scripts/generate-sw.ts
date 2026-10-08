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
import { serviceWorkerSource } from "../lib/pwa/service-worker-source";

// Un même commit peut être redéployé (variables/config/build différents) : l'identifiant de
// déploiement est donc prioritaire au SHA Git afin que chaque livraison obtienne son cache propre.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

function main(): void {
  const outPath = path.resolve(process.cwd(), "public/sw.js");
  writeFileSync(outPath, serviceWorkerSource(BUILD_ID), "utf8");
  console.log(`[generate-sw] public/sw.js régénéré (BUILD_ID=${BUILD_ID}).`);
}

main();
