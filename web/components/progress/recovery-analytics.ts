import {
  sessionsNewestFirst,
  type RecoveryCheckin,
  type WorkoutSession,
} from "@/lib/models/types";

/**
 * Une nuit n'est qualifiable de « sans alcool » que si l'utilisateur l'a
 * explicitement confirmé. `null` signifie inconnu, pas « non ».
 */
export function sleepHoursWithoutAlcohol(checkin: RecoveryCheckin): number | null {
  return checkin.hadAlcohol === false ? checkin.sleepHours : null;
}

/** Ordre causal pour comparer chaque séance à celle qui la précède réellement. */
export function recoverySessionsChronological(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessionsNewestFirst(sessions).reverse();
}
