import type { ComponentType } from "react";
import { STREAK_SCENES } from "./index";
import { isStreakMilestone } from "./milestones";

export { isStreakMilestone, nextStreakMilestone, STREAK_MILESTONES } from "./milestones";

/**
 * La mise en scène d'un compte : celle du palier quand il en est un, sinon le « maillon » (la
 * chaîne de S qui s'allonge) ; au-delà de 25, la « légende » qui varie avec le compte. `null` sous 2.
 */
export function streakScene(count: number): { Component: ComponentType<{ count: number }>; duration: number } | null {
  if (count < 2) return null;
  const designed = STREAK_SCENES[count];
  if (designed) return designed;
  if (isStreakMilestone(count)) return STREAK_SCENES[-1] ?? null;
  return STREAK_SCENES[0] ?? null;
}
