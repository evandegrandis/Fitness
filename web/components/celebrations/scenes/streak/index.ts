import type { ComponentType } from "react";

export interface StreakSceneDef {
  /** Import à la demande : chaque scène a son propre fichier, chargé seulement quand elle joue. */
  load: () => Promise<{ default: ComponentType<{ count: number }> }>;
  /** Durée avant fermeture automatique, en ms (un tap la ferme avant). */
  duration: number;
}

/**
 * Mises en scène de la série de S : une par compte, de 1 à 50, chacune sur le sens de son nombre
 * (Evan, 11/10/2026 ; garder la surprise : ne jamais les décrire en dehors du code). Clé 0 : le
 * « maillon », joué entre deux paliers au-delà de 50 ; clé -1 : la « légende », tous les 5 au-delà de 50.
 */
export const STREAK_SCENES: Record<number, StreakSceneDef> = {
  1: { load: () => import("./Streak1"), duration: 3800 },
  2: { load: () => import("./Streak2"), duration: 3600 },
  3: { load: () => import("./Streak3"), duration: 3900 },
  4: { load: () => import("./Streak4"), duration: 4000 },
  5: { load: () => import("./Streak5"), duration: 3500 },
  7: { load: () => import("./Streak7"), duration: 3700 },
  0: { load: () => import("./StreakChain"), duration: 2700 },
  [-1]: { load: () => import("./StreakLegend"), duration: 4000 },
};
