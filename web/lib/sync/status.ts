import { create } from "zustand";

import type { OutboxSnapshot } from "@/lib/sync/outbox";

export type SyncState = "idle" | "saving" | "saved" | "offline" | "error";

interface SyncStatusStore {
  /** État de la dernière tentative de synchronisation. */
  status: SyncState;
  /** Nombre d'opérations en attente de synchronisation (file locale). */
  pending: number;
  /** Opérations refusées définitivement par le serveur, en attente d'une décision. */
  deadLetters: number;
  /** Horodatage de la plus ancienne opération encore en file (null si vide). */
  oldestPendingAt: number | null;
  /** Dernier rejet observé sur une opération encore en file. */
  lastError: OutboxSnapshot["lastError"];
  setStatus: (status: SyncState) => void;
  setPending: (pending: number) => void;
  setSnapshot: (snapshot: OutboxSnapshot) => void;
}

/**
 * Statut global de synchronisation (offline-first). Séparé du store de séance
 * pour rester léger et lisible par la nav, l'en-tête de séance, la bannière
 * d'alerte et les réglages.
 */
export const useSyncStatus = create<SyncStatusStore>((set) => ({
  status: "idle",
  pending: 0,
  deadLetters: 0,
  oldestPendingAt: null,
  lastError: null,
  setStatus: (status) => set({ status }),
  setPending: (pending) => set({ pending }),
  setSnapshot: (snapshot) => set({
    pending: snapshot.pending,
    deadLetters: snapshot.deadLetters,
    oldestPendingAt: snapshot.oldestPendingAt,
    lastError: snapshot.lastError,
  }),
}));
