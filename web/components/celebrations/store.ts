"use client";

import { create } from "zustand";
import type { RankLetter } from "@/lib/engines/session-rank";

/**
 * Les célébrations de l'app (Evan, 07/10/2026 : « je remarque rien quand je débloque un secret »).
 *
 * Deux voies, jouées l'une après l'autre :
 * - « scène » : plein écran (passage de rang en séance, série de S, secret). En séance elle ne
 *   capte aucun toucher ; dans le bilan, un tap la ferme ;
 * - « bandeau » : en haut de l'écran, court, jamais bloquant (approche d'un rang, suggestion battue).
 * Rien ici ne lit ni n'écrit une charge : les événements sont des faits déjà calculés ailleurs.
 */
export type CelebrationEvent =
  | { kind: "rank-up"; letter: Exclude<RankLetter, "C"> }
  | {
      kind: "near-rank";
      letter: Exclude<RankLetter, "C">;
      /** Séries de plus pour l'atteindre (`null` : les séries seules ne suffisent pas). */
      sets: number | null;
      /** Records de plus (`null` : impossible ou insuffisant). */
      records: number | null;
      /** Avancée entre le seuil du rang actuel et celui du suivant, 0..1. */
      fraction: number;
    }
  | { kind: "beaten"; combo: number }
  | { kind: "streak"; count: number }
  | { kind: "secret"; id: string; title: string; description: string };

export type CelebrationLane = "scene" | "toast";

export function laneOf(event: CelebrationEvent): CelebrationLane {
  return event.kind === "near-rank" || event.kind === "beaten" ? "toast" : "scene";
}

export interface QueuedCelebration {
  key: number;
  event: CelebrationEvent;
}

interface CelebrationState {
  scene: QueuedCelebration[];
  toast: QueuedCelebration[];
  celebrate: (event: CelebrationEvent) => void;
  done: (lane: CelebrationLane, key: number) => void;
  clear: () => void;
}

let nextKey = 1;

export const useCelebrations = create<CelebrationState>((set) => ({
  scene: [],
  toast: [],
  celebrate: (event) =>
    set((state) => {
      const lane = laneOf(event);
      const item = { key: nextKey++, event };
      if (lane === "scene") return { scene: [...state.scene, item] };
      // Un bandeau en attente du même genre est remplacé par le plus récent (combo ×3 puis ×4 :
      // seul ×4 compte). Celui qui est déjà à l'écran reste.
      const [showing, ...waiting] = state.toast;
      if (!showing) return { toast: [item] };
      return { toast: [showing, ...waiting.filter((queued) => queued.event.kind !== event.kind), item] };
    }),
  done: (lane, key) =>
    set((state) =>
      lane === "scene" ? { scene: state.scene.filter((item) => item.key !== key) } : { toast: state.toast.filter((item) => item.key !== key) }
    ),
  clear: () => set({ scene: [], toast: [] }),
}));

/** Raccourci hors React (hooks de séance, bilan, boutons « Revoir »). */
export function celebrate(event: CelebrationEvent): void {
  useCelebrations.getState().celebrate(event);
}
