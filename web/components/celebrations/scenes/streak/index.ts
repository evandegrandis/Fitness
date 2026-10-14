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
  6: { load: () => import("./Streak6"), duration: 3700 },
  8: { load: () => import("./Streak8"), duration: 3800 },
  9: { load: () => import("./Streak9"), duration: 4000 },
  10: { load: () => import("./Streak10"), duration: 4200 },
  11: { load: () => import("./Streak11"), duration: 4000 },
  12: { load: () => import("./Streak12"), duration: 4200 },
  13: { load: () => import("./Streak13"), duration: 4000 },
  14: { load: () => import("./Streak14"), duration: 4200 },
  15: { load: () => import("./Streak15"), duration: 4000 },
  16: { load: () => import("./Streak16"), duration: 3800 },
  17: { load: () => import("./Streak17"), duration: 4200 },
  18: { load: () => import("./Streak18"), duration: 4000 },
  19: { load: () => import("./Streak19"), duration: 4200 },
  20: { load: () => import("./Streak20"), duration: 4000 },
  21: { load: () => import("./Streak21"), duration: 3800 },
  22: { load: () => import("./Streak22"), duration: 3900 },
  23: { load: () => import("./Streak23"), duration: 3800 },
  24: { load: () => import("./Streak24"), duration: 4000 },
  25: { load: () => import("./Streak25"), duration: 4000 },
  26: { load: () => import("./Streak26"), duration: 4000 },
  27: { load: () => import("./Streak27"), duration: 4000 },
  28: { load: () => import("./Streak28"), duration: 3900 },
  29: { load: () => import("./Streak29"), duration: 3900 },
  30: { load: () => import("./Streak30"), duration: 4000 },
  31: { load: () => import("./Streak31"), duration: 3800 },
  32: { load: () => import("./Streak32"), duration: 4000 },
  33: { load: () => import("./Streak33"), duration: 4200 },
  34: { load: () => import("./Streak34"), duration: 4000 },
  35: { load: () => import("./Streak35"), duration: 4000 },
  36: { load: () => import("./Streak36"), duration: 4000 },
  37: { load: () => import("./Streak37"), duration: 3800 },
  38: { load: () => import("./Streak38"), duration: 4400 },
  39: { load: () => import("./Streak39"), duration: 3900 },
  40: { load: () => import("./Streak40"), duration: 4000 },
  41: { load: () => import("./Streak41"), duration: 4200 },
  0: { load: () => import("./StreakChain"), duration: 2700 },
  [-1]: { load: () => import("./StreakLegend"), duration: 4000 },
};
