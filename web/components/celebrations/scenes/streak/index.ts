import type { ComponentType } from "react";
import Streak10 from "./Streak10";
import Streak15 from "./Streak15";
import Streak2 from "./Streak2";
import Streak20 from "./Streak20";
import Streak25 from "./Streak25";
import Streak3 from "./Streak3";
import Streak4 from "./Streak4";
import Streak5 from "./Streak5";
import Streak7 from "./Streak7";
import StreakChain from "./StreakChain";
import StreakLegend from "./StreakLegend";

type Scene = { Component: ComponentType<{ count: number }>; duration: number };

/**
 * Mises en scène de la série de S, par palier (Evan, 07/10/2026 : 2, 3, 4, 5, 7, 10, puis tous
 * les 5). Clé 0 : le « maillon », joué entre deux paliers ; clé -1 : la « légende », au-delà de 25.
 */
export const STREAK_SCENES: Record<number, Scene> = {
  2: { Component: Streak2, duration: 2900 },
  3: { Component: Streak3, duration: 3100 },
  4: { Component: Streak4, duration: 3400 },
  5: { Component: Streak5, duration: 3500 },
  7: { Component: Streak7, duration: 3700 },
  10: { Component: Streak10, duration: 3900 },
  15: { Component: Streak15, duration: 3900 },
  20: { Component: Streak20, duration: 4000 },
  25: { Component: Streak25, duration: 4000 },
  0: { Component: StreakChain, duration: 2700 },
  [-1]: { Component: StreakLegend, duration: 4000 },
};
