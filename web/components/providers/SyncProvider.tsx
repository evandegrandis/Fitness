"use client";

import { useEffect } from "react";
import { saveSession } from "@/lib/db/actions";
import { flush, pendingCount } from "@/lib/sync/outbox";
import { useSyncStatus } from "@/lib/sync/status";

/**
 * Moteur de synchronisation OFFLINE-FIRST. Vide la file locale (outbox) dès que
 * possible : au montage, au retour du réseau (`online`), et périodiquement.
 * Ne perd jamais de données — une séance non confirmée reste dans la file.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const setStatus = useSyncStatus((s) => s.setStatus);
  const setPending = useSyncStatus((s) => s.setPending);

  useEffect(() => {
    let cancelled = false;

    async function tryFlush() {
      const before = pendingCount();
      setPending(before);
      if (before === 0) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setStatus("offline");
        return;
      }
      setStatus("saving");
      const remaining = await flush(saveSession);
      if (cancelled) return;
      setPending(remaining);
      setStatus(remaining === 0 ? "saved" : navigator.onLine === false ? "offline" : "error");
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
  }, [setStatus, setPending]);

  return <>{children}</>;
}
