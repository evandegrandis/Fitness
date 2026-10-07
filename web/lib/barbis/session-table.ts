/**
 * Pour Barbis : une ligne par séance terminée, calculée par les moteurs de Jeera. C'est la table
 * sur laquelle Barbis calcule ses corrélations (sommeil, alcool, repos du muscle, nutrition,
 * heure) : l'unité est la séance, parce que les séries d'une même séance ne sont pas
 * indépendantes. Rien n'est stocké, tout se recalcule depuis l'historique.
 *
 *   - suggestions : verdict de chaque série jugée, par `sessionGame` (même règle que le compteur
 *     de la séance et que le bilan) : battue, tenue, en dessous. Une machine découverte n'est pas
 *     jugée (étalonnage) ;
 *   - capacité face à la tendance : pour chaque exercice, la capacité de la séance (meilleure
 *     série ramenée à frais, `exerciseStats`, celle de Progrès) contre la moyenne de ses 3
 *     séances précédentes, puis la moyenne sur les exercices de la séance ; une reprise après
 *     plus de 28 jours ne se compare pas ;
 *   - repos : heures entre le début de la séance et le début de la dernière séance qui a
 *     travaillé le même muscle (au moins une série comptée, coefficient du profil compris) ;
 *   - check-in de la veille : le jour J-1 (heure de Paris) porte l'alcool de J-1 et la nuit de
 *     J-1 à J (même lecture que `shouldExtendBeastSession` : « une nuit longue après alcool »).
 */

import type { Career } from "@/lib/engines/career";
import { parentSets } from "@/lib/engines/effective-sets";
import { PROGRESS_STATS, type ExerciseStat, type RecordEvent } from "@/lib/engines/progress-stats";
import { sessionGame } from "@/lib/engines/session-game";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import type { Exercise, LoggedSet, RecoveryCheckin, WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PARIS = "Europe/Paris";

export const SESSION_TABLE = {
  /** Un muscle compte comme travaillé dans une séance à partir d'une série comptée. */
  MUSCLE_MIN_SETS: 1,
  /** Capacité : moyenne des N séances précédentes de l'exercice (fenêtre de la tendance). */
  TREND_WINDOW: PROGRESS_STATS.TREND_WINDOW,
  /** Au-delà de cet écart avec la séance précédente, une reprise ne se compare pas. */
  MAX_GAP_DAYS: PROGRESS_STATS.DORMANT_DAYS,
} as const;

export interface SessionRow {
  id: string;
  /** Jour de la séance, heure de Paris (AAAA-MM-JJ). */
  date: string;
  /** Heure de début, Paris (HH:MM). */
  start: string;
  durationMin: number | null;
  template: string | null;
  /** Séries comptées comme dans l'Historique (compléments fusionnés, RIR 3+ pondéré). */
  sets: number;
  rank: { letter: string; score: number } | null;
  suggestions: { rated: number; beat: number; held: number; below: number };
  /** Séries étoilées dans l'Historique. */
  records: { exercise: string; weight: number; reps: number }[];
  muscles: { muscle: MuscleParent; label: string; sets: number; hoursSinceLast: number | null }[];
  capacity: { vsTrendPct: number; exercises: number } | null;
  checkinDayBefore: {
    date: string;
    sleepHours: number | null;
    alcohol: boolean | null;
    protein: boolean | null;
    creatine: boolean | null;
  } | null;
}

export function parisDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function parisTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function durationMinutes(session: WorkoutSession): number | null {
  const lastSet = session.exercises
    .flatMap((logged) => logged.sets)
    .filter((set) => set.completed)
    .reduce<number | null>((latest, set) => Math.max(latest ?? 0, set.timestamp.getTime()), null);
  const end = session.endTime?.getTime() ?? lastSet;
  return end === null ? null : Math.max(0, Math.round((end - session.startTime.getTime()) / 60_000));
}

/** Écart de chaque séance à la tendance de ses exercices, par séance (fractions). */
function capacityGaps(stats: readonly ExerciseStat[], sessionIdByTime: ReadonlyMap<number, string>): Map<string, number[]> {
  const gaps = new Map<string, number[]>();
  for (const stat of stats) {
    const points = stat.points;
    for (let index = SESSION_TABLE.TREND_WINDOW; index < points.length; index += 1) {
      const point = points[index];
      if (point.date.getTime() - points[index - 1].date.getTime() > SESSION_TABLE.MAX_GAP_DAYS * DAY_MS) continue;
      const previous = points.slice(index - SESSION_TABLE.TREND_WINDOW, index);
      const reference = previous.reduce((sum, entry) => sum + entry.value, 0) / previous.length;
      const sessionId = sessionIdByTime.get(point.date.getTime());
      if (!sessionId || reference <= 0) continue;
      gaps.set(sessionId, [...(gaps.get(sessionId) ?? []), point.value / reference - 1]);
    }
  }
  return gaps;
}

export interface SessionTableInput {
  /** Séances terminées, de la plus ancienne à la plus récente. */
  chronological: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  checkins: readonly RecoveryCheckin[];
  career: Career;
  records: readonly RecordEvent[];
  stats: readonly ExerciseStat[];
  /** Seules les séances commencées à partir de cette date sortent dans la table. */
  since: Date;
}

/** Une ligne par séance depuis `since`, la plus récente d'abord. */
export function sessionTable({ chronological, catalog, checkins, career, records, stats, since }: SessionTableInput): SessionRow[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const checkinByDay = new Map(checkins.map((checkin) => [parisDate(checkin.date), checkin]));
  const gaps = capacityGaps(stats, new Map(chronological.map((session) => [session.date.getTime(), session.id])));

  const setById = new Map<string, { set: LoggedSet; exercise: string }>();
  for (const session of chronological) {
    for (const logged of session.exercises) {
      const name = byId.get(logged.exerciseId)?.name ?? logged.exerciseName;
      for (const set of logged.sets) setById.set(set.id, { set, exercise: name });
    }
  }
  const recordsBySession = new Map<string, SessionRow["records"]>();
  for (const event of records) {
    const found = setById.get(event.setId);
    if (!found) continue;
    const list = recordsBySession.get(event.sessionId) ?? [];
    list.push({ exercise: found.exercise, weight: found.set.weight, reps: found.set.reps });
    recordsBySession.set(event.sessionId, list);
  }

  const lastWorked = new Map<MuscleParent, Date>();
  const rows: SessionRow[] = [];
  for (const [index, session] of chronological.entries()) {
    const totals = new Map<MuscleParent, number>();
    for (const logged of session.exercises) {
      for (const [parent, sets] of parentSets(logged, byId.get(logged.exerciseId))) {
        totals.set(parent, (totals.get(parent) ?? 0) + sets);
      }
    }
    const worked = [...totals].filter(([, sets]) => sets >= SESSION_TABLE.MUSCLE_MIN_SETS).sort((a, b) => b[1] - a[1]);
    const muscles = worked.map(([parent, sets]) => {
      const last = lastWorked.get(parent);
      return {
        muscle: parent,
        label: parentDisplayName[parent],
        sets: round1(sets),
        hoursSinceLast: last ? round1((session.startTime.getTime() - last.getTime()) / HOUR_MS) : null,
      };
    });
    for (const [parent] of worked) lastWorked.set(parent, session.startTime);
    if (session.startTime < since) continue;

    const game = sessionGame(session, catalog, chronological.slice(0, index));
    const rank = career.bySession.get(session.id)?.rank ?? null;
    const sessionGaps = gaps.get(session.id) ?? [];
    const date = parisDate(session.startTime);
    const checkin = checkinByDay.get(dayBefore(date));
    rows.push({
      id: session.id,
      date,
      start: parisTime(session.startTime),
      durationMin: durationMinutes(session),
      template: session.templateName,
      sets: round1(
        session.exercises.reduce(
          (sum, logged) => sum + physiologicalSetUnits(logged.sets, { increment: byId.get(logged.exerciseId)?.smallestIncrement }),
          0
        )
      ),
      rank: rank ? { letter: rank.letter, score: Math.round(rank.score) } : null,
      suggestions: { rated: game.rated, beat: game.beaten, held: game.held, below: game.below },
      records: recordsBySession.get(session.id) ?? [],
      muscles,
      capacity: sessionGaps.length
        ? { vsTrendPct: round1((sessionGaps.reduce((sum, gap) => sum + gap, 0) / sessionGaps.length) * 100), exercises: sessionGaps.length }
        : null,
      checkinDayBefore: checkin
        ? {
            date: dayBefore(date),
            sleepHours: checkin.sleepHours,
            alcohol: checkin.hadAlcohol,
            protein: checkin.proteinTargetMet,
            creatine: checkin.tookCreatine,
          }
        : null,
    });
  }
  return rows.reverse();
}
