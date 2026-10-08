"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

const AUTO_RELOAD_KEY = "jeera:auto-reload-after-chunk-error";
/** Une seule relance automatique par période : jamais de boucle de rechargements. */
const AUTO_RELOAD_COOLDOWN_MS = 60_000;

/** Morceau de code qui n'a pas pu être téléchargé (3G, déploiement entre-temps). */
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|Load failed|Failed to fetch/i.test(error.message ?? "")
  );
}

/**
 * Ce que l'app montre quand un écran plante, à la place de « This page couldn't load » (écran
 * noir de Next qu'Evan a vu en salle le 08/10/2026 et qui l'obligeait à fermer l'app). La séance
 * vit dans le stockage local : réessayer ou recharger ne perd rien. Un morceau de code manquant
 * (réseau coupé pendant son téléchargement) déclenche UNE relance automatique dès que le réseau
 * est là.
 */
export function AppErrorRecovery({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    if (!isChunkLoadError(error)) return;
    const reloadWhenOnline = () => {
      try {
        const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? 0);
        if (Date.now() - last < AUTO_RELOAD_COOLDOWN_MS) return;
        sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    };
    if (navigator.onLine) {
      reloadWhenOnline();
      return;
    }
    window.addEventListener("online", reloadWhenOnline, { once: true });
    return () => window.removeEventListener("online", reloadWhenOnline);
  }, [error]);

  return (
    <main data-app-error className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <div className="surface-solid rounded-2xl px-5 py-6">
        <h1 className="font-display text-xl font-bold text-(--color-fg)">Cet écran n&apos;a pas pu s&apos;afficher</h1>
        <p className="mt-2 text-sm text-(--color-fg-muted)">
          Ta séance est enregistrée sur le téléphone : rien n&apos;est perdu.
          {typeof navigator !== "undefined" && navigator.onLine === false ? " Le réseau est coupé, l'app réessaiera à son retour." : ""}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={retry}
            className="pill flex-1 justify-center"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            <RotateCw size={14} />
            Réessayer
          </button>
          <button type="button" onClick={() => window.location.reload()} className="pill flex-1 justify-center">
            Recharger l&apos;app
          </button>
        </div>
      </div>
    </main>
  );
}
