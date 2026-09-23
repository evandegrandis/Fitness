/**
 * La dernière séance d'un exercice, telle qu'on veut la relire en salle.
 *
 * La carte affichait la DERNIÈRE série de la séance précédente, souvent la plus fatiguée :
 * « 85 kg × 8 » pour une séance ouverte à 85 × 17. Et elle sautait les séances en finisher seul
 * pour appeler « dernière séance » une séance vieille de 20 jours sans le dire.
 *
 *   - en-tête : la MEILLEURE série (capacité démontrée) de la dernière vraie séance de travail,
 *     avec son ancienneté quand elle dépasse une semaine ;
 *   - raccourci « répéter » : la série de même rang que celle qu'on s'apprête à faire.
 *
 * Moteur pur.
 */

import { estimated1RM } from "@/lib/engines/e1rm";
import { normalRecordSets } from "@/lib/engines/records";
import { SetType } from "@/lib/models/enums";
import { sessionsNewestFirst, type Exercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";

export interface LastWorkSession {
  date: Date;
  /** Séries de travail normales (hors échauffement, finisher, compléments), dans l'ordre. */
  sets: LoggedSet[];
}

const WORK_TYPES = new Set<string>([SetType.work, SetType.topSet, SetType.backoff]);

export function lastWorkSession(exercise: Exercise, history: readonly WorkoutSession[]): LastWorkSession | null {
  for (const session of sessionsNewestFirst(history)) {
    if (session.isActive) continue;
    const sets = session.exercises
      .filter((logged) => logged.exerciseId === exercise.id)
      .flatMap((logged) => logged.sets)
      .filter((set) => set.completed && WORK_TYPES.has(set.setType))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const leads = normalRecordSets(sets, exercise);
    if (leads.length > 0) return { date: session.date, sets: leads };
  }
  return null;
}

/** Capacité démontrée : e1RM sur les reps jusqu'à l'échec, ou reps jusqu'à l'échec au poids du corps. */
function demonstrated(set: LoggedSet): number {
  const repsToFailure = set.reps + Math.max(0, Math.min(4, set.reportedRir ?? 0));
  return set.weight > 0 ? estimated1RM(set.weight, repsToFailure) : repsToFailure;
}

/** La série qui résume le mieux la séance : celle qui a démontré le plus de capacité. */
export function headlineSet(session: LastWorkSession): LoggedSet {
  return session.sets.reduce((best, set) => (demonstrated(set) > demonstrated(best) ? set : best));
}

/** La série de même rang que la prochaine du jour, ou la dernière si la séance était plus courte. */
export function sameRankSet(session: LastWorkSession, completedWorkSetsToday: number): LoggedSet {
  return session.sets[Math.min(completedWorkSetsToday, session.sets.length - 1)];
}

/** Âge affichable quand la séance dépasse une semaine (« il y a 20 j »), sinon `null`. */
export function staleAgeLabel(session: LastWorkSession, now: Date): string | null {
  const days = Math.floor((now.getTime() - session.date.getTime()) / 86_400_000);
  return days > 7 ? `il y a ${days} j` : null;
}
