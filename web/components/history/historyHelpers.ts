/**
 * Helpers purs partagés par les vues Historique (liste + détail). Regroupe les
 * séances par semaine ISO et calcule le nombre de sets record par séance en
 * s'appuyant sur `displayedRecordSetIDs` (source de vérité des étoiles PR).
 */

import { displayedRecordSetIDs } from "@/lib/engines/records";
import { orderedSets, type Exercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";

/** Lundi 00:00 de la semaine ISO contenant `date`. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export interface WeekGroupData {
  weekStart: Date;
  sessions: WorkoutSession[];
}

/** Regroupe les séances (déjà triées plus récent en premier) par semaine ISO, semaine la plus récente en premier. */
export function groupSessionsByIsoWeek(sessions: WorkoutSession[]): WeekGroupData[] {
  const map = new Map<number, WeekGroupData>();
  for (const session of sessions) {
    const weekStart = startOfIsoWeek(session.date);
    const key = weekStart.getTime();
    const existing = map.get(key);
    if (existing) {
      existing.sessions.push(session);
    } else {
      map.set(key, { weekStart, sessions: [session] });
    }
  }
  return [...map.values()].sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
}

/**
 * Calcule le nombre de sets marqués record dans une séance donnée, pour
 * chaque exercice loggé, en fournissant à `displayedRecordSetIDs` tout
 * l'historique de sets (jusqu'à et y compris la séance) pour cet exercice.
 */
export function countRecordSetsInSession(session: WorkoutSession, allSessions: WorkoutSession[], exercises: Exercise[]): number {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  // Chronologique (plus ancien en premier) jusqu'à la séance incluse.
  const chronological = [...allSessions].filter((s) => s.date <= session.date).reverse();

  let total = 0;
  for (const logged of session.exercises) {
    const exercise = exerciseById.get(logged.exerciseId);
    if (!exercise) continue;

    // Un "record" suppose un historique antérieur à battre : le tout premier
    // passage d'un exercice n'est pas un PR (on ne bat pas un record inexistant).
    const hadPriorHistory = allSessions.some(
      (s) =>
        s.id !== session.id &&
        s.date < session.date &&
        s.exercises.some((le) => le.exerciseId === logged.exerciseId),
    );
    if (!hadPriorHistory) continue;

    const setsForExercise: LoggedSet[] = [];
    for (const s of chronological) {
      for (const le of s.exercises) {
        if (le.exerciseId === logged.exerciseId) {
          setsForExercise.push(...orderedSets(le));
        }
      }
    }

    total += displayedRecordSetIDs(logged, setsForExercise, exercise).size;
  }
  return total;
}

/** Construit une map sessionId -> nb de sets record, pour un ensemble de séances. */
export function buildPrCountBySessionId(sessions: WorkoutSession[], exercises: Exercise[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const session of sessions) {
    result.set(session.id, countRecordSetsInSession(session, sessions, exercises));
  }
  return result;
}
