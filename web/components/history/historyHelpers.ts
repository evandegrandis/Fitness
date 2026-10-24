/**
 * Helpers purs partagés par les vues Historique (liste + détail). Regroupe les
 * séances par semaine ISO et calcule le nombre de sets record par séance en
 * s'appuyant sur `session-stars.ts` (source de vérité des étoiles PR).
 */

import { sessionStarIds, setsBeforeSession } from "@/lib/engines/session-stars";
import { sessionsNewestFirst, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";

/** ~3,5 min par série de travail (exécution + repos), moyenne réaliste toutes séries confondues. */
const MINUTES_PER_SET_ESTIMATE = 3.5;

/**
 * Durée d'une séance : réelle si `endTime` connu, sinon ESTIMÉE depuis le
 * nombre de séries de travail (séances transcrites du carnet, sans horaires).
 * `estimated: true` → l'UI préfixe la durée d'un « ~ ».
 */
export function sessionDurationMinutes(
  session: WorkoutSession,
  exercises: Exercise[] = []
): { minutes: number; estimated: boolean } {
  if (session.endTime) {
    return { minutes: Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60_000), estimated: false };
  }
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sets = session.exercises.reduce(
    (acc, logged) =>
      acc +
      physiologicalSetUnits(logged.sets, {
        increment: exerciseById.get(logged.exerciseId)?.smallestIncrement,
      }),
    0
  );
  return { minutes: Math.round(sets * MINUTES_PER_SET_ESTIMATE), estimated: true };
}

/** Libellé court d'une durée de séance, avec « ~ » si estimée. Ex : « ~1 h 03 », « 45 min ». */
export function sessionDurationLabel(session: WorkoutSession, exercises: Exercise[] = []): string {
  const { minutes, estimated } = sessionDurationMinutes(session, exercises);
  const prefix = estimated ? "~" : "";
  if (minutes < 60) return `${prefix}${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${prefix}${h} h` : `${prefix}${h} h ${String(m).padStart(2, "0")}`;
}

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

/** Regroupe les séances par semaine ISO et normalise aussi l'ordre interne, quel que soit l'appelant. */
export function groupSessionsByIsoWeek(sessions: WorkoutSession[]): WeekGroupData[] {
  const map = new Map<number, WeekGroupData>();
  for (const session of sessionsNewestFirst(sessions)) {
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
  // Chronologique (plus ancien en premier) jusqu'à la séance exclue. On
  // tranche par date métier PUIS startTime (et id), via l'invariant global :
  // comparer seulement `date` omettait tout historique antérieur effectué le
  // même jour et pouvait aussi inclure une séance plus tardive dans le calcul.
  const allChronological = sessionsNewestFirst(
    allSessions.some((candidate) => candidate.id === session.id)
      ? allSessions
      : [...allSessions, session]
  ).reverse();
  const targetIndex = allChronological.findIndex((candidate) => candidate.id === session.id);
  const priorSessions = allChronological.slice(0, targetIndex);
  // La définition unique des étoiles (`session-stars.ts`) : pas de record au tout premier passage d'un
  // exercice, puis `displayedRecordSetIDs` sur tout ce qui précède et la séance elle-même.
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  return sessionStarIds(session, setsBeforeSession(priorSessions), exerciseById).length;
}

/** Construit une map sessionId -> nb de sets record, pour un ensemble de séances. */
export function buildPrCountBySessionId(sessions: WorkoutSession[], exercises: Exercise[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const session of sessions) {
    result.set(session.id, countRecordSetsInSession(session, sessions, exercises));
  }
  return result;
}
