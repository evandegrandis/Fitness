/** Paliers de la série de S qui ont chacun leur mise en scène (Evan, 07/10/2026). */
export const STREAK_MILESTONES = [2, 3, 4, 5, 7, 10, 15, 20, 25] as const;

/** Un palier : 2, 3, 4, 5, 7, 10, puis tous les 5. */
export function isStreakMilestone(count: number): boolean {
  return count >= 2 && ((STREAK_MILESTONES as readonly number[]).includes(count) || (count > 25 && count % 5 === 0));
}

/** Le prochain palier après `count`. */
export function nextStreakMilestone(count: number): number {
  const designed = STREAK_MILESTONES.find((milestone) => milestone > count);
  return designed ?? (Math.floor(count / 5) + 1) * 5;
}
