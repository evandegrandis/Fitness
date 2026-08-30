"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { flush, pendingCount } from "@/lib/sync/outbox";
import { defaultOutboxHandlers } from "@/lib/sync/handlers";
import { useSyncStatus } from "@/lib/sync/status";

/**
 * Moteur de synchronisation OFFLINE-FIRST. Vide la file locale (outbox) dès que
 * possible : au montage, au retour du réseau (`online`), et périodiquement.
 * Ne perd jamais de données — une séance non confirmée reste dans la file.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setStatus = useSyncStatus((s) => s.setStatus);
  const setPending = useSyncStatus((s) => s.setPending);

  useEffect(() => {
    let cancelled = false;

    async function tryFlush() {
      try {
        const before = pendingCount();
        setPending(before);
        if (before === 0) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatus("offline");
          return;
        }
        setStatus("saving");
        const remaining = await flush(defaultOutboxHandlers);
        if (cancelled) return;
        setPending(remaining);
        setStatus(remaining === 0 ? "saved" : navigator.onLine === false ? "offline" : "error");
        // StoreHydrator refuse volontairement le snapshot serveur tant qu'une
        // écriture locale attend. Une fois l'outbox vidée, le snapshot SSR qui
        // avait été refusé est déjà périmé : relire la route force une requête
        // Neon fraîche et rend immédiatement les séances synchronisées visibles
        // sur tous les appareils, sans exiger un second hard refresh manuel.
        if (remaining === 0) router.refresh();
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void tryFlush();
    const onOnline = () => void tryFlush();
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => void tryFlush(), 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [router, setStatus, setPending]);

  return <>{children}</>;
}
