import { create } from "zustand";

export type SyncState = "idle" | "saving" | "saved" | "offline" | "error";

interface SyncStatusStore {
  /** État de la dernière tentative de synchronisation. */
  status: SyncState;
  /** Nombre de séances en attente de synchronisation (file locale). */
  pending: number;
  setStatus: (status: SyncState) => void;
  setPending: (pending: number) => void;
}

/**
 * Statut global de synchronisation (offline-first). Séparé du store de séance
 * pour rester léger et lisible par la nav, l'en-tête de séance, etc.
 */
export const useSyncStatus = create<SyncStatusStore>((set) => ({
  status: "idle",
  pending: 0,
  setStatus: (status) => set({ status }),
  setPending: (pending) => set({ pending }),
}));
