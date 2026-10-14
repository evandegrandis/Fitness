/** Dernier compte qui a sa propre mise en scène (Evan, 11/10/2026 : une scène pour chaque S de 1 à 50). */
export const LAST_DESIGNED_STREAK = 50;

/** Un palier : chaque compte de 1 à 50, puis tous les 5. */
export function isStreakMilestone(count: number): boolean {
  return count >= 1 && (count <= LAST_DESIGNED_STREAK || count % 5 === 0);
}

/** Le prochain palier après `count`. */
export function nextStreakMilestone(count: number): number {
  if (count < LAST_DESIGNED_STREAK) return Math.max(1, Math.floor(count) + 1);
  return (Math.floor(count / 5) + 1) * 5;
}
