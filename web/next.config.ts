import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        // Statue (modèle 3D, logo) : fichiers versionnés par leur nom, jamais modifiés en place.
        source: "/statue/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // OFFLINE_PWA_SPEC §1 (C1) — le SCRIPT du service worker ne doit jamais être servi périmé
        // depuis le cache HTTP du navigateur : sinon `navigator.serviceWorker.register()`
        // pourrait continuer à installer une ANCIENNE version après un déploiement, ce qui
        // bloquerait la fraîcheur du code à la source. `public/sw.js` est déjà régénéré à chaque
        // build avec un nouveau BUILD_ID (`scripts/generate-sw.ts`, hook `prebuild`) ; ce header
        // garantit en plus que le navigateur revalide TOUJOURS plutôt que de réutiliser sa propre
        // copie HTTP du fichier.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
