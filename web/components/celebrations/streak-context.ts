import type { Career } from "@/lib/engines/career";
import type { RankLetter } from "@/lib/engines/session-rank";

export interface StreakContext {
  /** S d'affilée jusqu'à cette séance (0 si elle n'est pas au rang S). */
  count: number;
  /** Série d'au moins 2 S que cette séance vient d'interrompre (0 sinon). */
  broken: number;
  best: number;
  /** Rangs des séances classées, de la plus ancienne à celle-ci. */
  letters: RankLetter[];
}

/** Où en est la série de S à une séance donnée (le parcours est chronologique). */
export function streakContext(career: Career, sessionId: string): StreakContext | null {
  let previous = 0;
  const letters: RankLetter[] = [];
  for (const entry of career.bySession.values()) {
    if (entry.sessionId === sessionId) {
      if (!entry.rank) return null;
      letters.push(entry.rank.letter);
      return { count: entry.sStreak, broken: entry.rank.letter !== "S" && previous >= 2 ? previous : 0, best: career.sStreak.best, letters };
    }
    if (entry.rank) {
      previous = entry.sStreak;
      letters.push(entry.rank.letter);
    }
  }
  return null;
}
