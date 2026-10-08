"use client";

import { useEffect } from "react";
import { flush, pendingCount, snapshot } from "@/lib/sync/outbox";
import { defaultOutboxHandlers } from "@/lib/sync/handlers";
import { useSyncStatus } from "@/lib/sync/status";
import { REFRESH_DATA_EVENT } from "@/components/providers/StoreHydrator";

const SYNC_NEEDED_EVENT = "jeera:sync-needed";

/**
 * Moteur de synchronisation OFFLINE-FIRST. Vide la file locale (outbox) dès que
 * possible : au montage, au retour du réseau (`online`), et périodiquement.
 * Ne perd jamais de données — une séance non confirmée reste dans la file.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const setStatus = useSyncStatus((s) => s.setStatus);
  const setPending = useSyncStatus((s) => s.setPending);
  const setSnapshot = useSyncStatus((s) => s.setSnapshot);

  useEffect(() => {
    let cancelled = false;

    async function tryFlush() {
      try {
        const before = pendingCount();
        setPending(before);
        // Les dead letters se lisent sans réseau : la bannière doit les montrer
        // même quand il n'y a plus rien à rejouer.
        try { setSnapshot(snapshot()); } catch { /* file illisible : le statut « error » suit */ }
        if (before === 0) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatus("offline");
          return;
        }
        setStatus("saving");
        const remaining = await flush(defaultOutboxHandlers);
        if (cancelled) return;
        setPending(remaining);
        try { setSnapshot(snapshot()); } catch { /* idem */ }
        setStatus(remaining === 0 ? "saved" : navigator.onLine === false ? "offline" : "error");
        // StoreHydrator refuse volontairement le snapshot serveur tant qu'une
        // écriture locale attend. Une fois l'outbox vidée, il relit Neon en
        // arrière-plan. (Jusqu'au 08/10/2026 : `router.refresh()`, qui rechargeait
        // tout l'arbre serveur avec le jeu de données entier et passait dans la
        // file d'actions du routeur, devant les actions suivantes.)
        if (remaining === 0) window.dispatchEvent(new Event(REFRESH_DATA_EVENT));
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void tryFlush();
    const onOnline = () => void tryFlush();
    const onSyncNeeded = () => void tryFlush();
    window.addEventListener("online", onOnline);
    window.addEventListener(SYNC_NEEDED_EVENT, onSyncNeeded);
    const interval = setInterval(() => void tryFlush(), 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener(SYNC_NEEDED_EVENT, onSyncNeeded);
      clearInterval(interval);
    };
  }, [setStatus, setPending, setSnapshot]);

  return <>{children}</>;
}
