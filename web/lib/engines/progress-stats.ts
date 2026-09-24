/**
 * Les chiffres de l'onglet Progrès, calculés en un seul endroit et testés.
 *
 * Audit du 24/09/2026 : l'onglet affichait « +50 % ce mois » sur une machine pas touchée depuis
 * 19 semaines (fenêtre calée sur la dernière séance, pas sur aujourd'hui), « Plateau » sur une
 * machine qui progressait en reps à sa charge max, « Best il y a 4 sem » pour un record battu
 * l'avant-veille, « Dos haut 0 % · Couvert » pour un groupe sans objectif, une moyenne de volume
 * tirée vers le bas par la semaine en cours. Ici :
 *
 *   - la capacité d'une séance = sa meilleure série démontrée, ramenée à frais (e1RM sur reps +
 *     RIR déclaré + reps coûtées par la fatigue de la séance, ou reps au poids du corps) : des dips
 *     faits en fin de séance ne passent pas pour une baisse ;
 *   - la tendance compare la meilleure des 3 dernières séances à la meilleure des 3 d'avant,
 *     et ne s'affiche que si l'exercice est pratiqué en ce moment ;
 *   - les records sont les étoiles de l'Historique, au set près (même fonction), étalonnage inclus ;
 *   - une machine découverte n'a ni tendance ni verdict : elle s'étalonne (changement de salle).
 *
 * Moteur pur : tout se recalcule depuis l'historique.
 */

import { estimated1RM } from "@/lib/engines/e1rm";
import { coverageForWeek, currentWeekWindow, parentTotals } from "@/lib/engines/effective-sets";
import { defaultEquivalent, equivalenceKey, familyHistory, fatigueRepsBefore } from "@/lib/engines/equivalence";
import { machineMaxStatus, type MachineMaxStatus } from "@/lib/engines/machine-max";
import { displayedRecordSetIDs, normalRecordSets } from "@/lib/engines/records";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { isGoalMuscleParent } from "@/lib/models/muscles";
import {
  orderedSets,
  sessionsNewestFirst,
  type Exercise,
  type LoggedSet,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";

const DAY_MS = 86_400_000;

export const PROGRESS_STATS = {
  /** Semaines montrées dans l'historique de semaines. */
  WEEKS_SHOWN: 12,
  /** Semaines lues pour la série en cours (au-delà, la série est affichée « 26+ »). */
  WEEKS_FOR_STREAK: 26,
  /** Une semaine compte dans la série dès 3 séances : le rythme habituel d'Evan (3 à 4). */
  STREAK_MIN_SESSIONS: 3,
  /** Tendance : meilleure des N dernières séances contre meilleure des N précédentes. */
  TREND_WINDOW: 3,
  /** Gain minimal pour parler de progression (≈ 1 rep sur une série de 10). */
  PROGRESS_MIN: 0.015,
  /** Baisse minimale pour la signaler : plus large, une séance fatiguée n'est pas une baisse. */
  DECLINE_MIN: 0.03,
  /** Plateau : aucune étoile sur les N dernières séances de la machine, et pas de progression. */
  PLATEAU_SESSIONS: 4,
  /** Au-delà, l'exercice est « en pause » : aucune tendance affichée. */
  DORMANT_DAYS: 28,
  /** Fenêtre de la « salle actuelle ». */
  CURRENT_GYM_DAYS: 28,
  /** Records « récents » du résumé des exercices. */
  RECENT_RECORD_DAYS: 30,
} as const;

// ---------------------------------------------------------------------------
// Records : les étoiles de l'Historique, séance par séance
// ---------------------------------------------------------------------------

export interface RecordEvent {
  exerciseId: string;
  sessionId: string;
  date: Date;
  setId: string;
}

/**
 * Chaque série étoilée, avec sa séance. Même règle que `countRecordSetsInSession` (Historique) :
 * pas de record au tout premier passage d'un exercice, puis `displayedRecordSetIDs` sur tout ce
 * qui précède la séance et la séance elle-même. Un seul passage chronologique.
 */
export function recordEvents(history: readonly WorkoutSession[], catalog: readonly Exercise[]): RecordEvent[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const chronological = sessionsNewestFirst(history.filter((session) => !session.isActive)).reverse();
  const setsSoFar = new Map<string, LoggedSet[]>();
  const seen = new Set<string>();
  const events: RecordEvent[] = [];

  for (const session of chronological) {
    const today = new Map<string, LoggedSet[]>();
    for (const logged of session.exercises) {
      today.set(logged.exerciseId, [...(today.get(logged.exerciseId) ?? []), ...orderedSets(logged)]);
    }
    for (const logged of session.exercises) {
      const exercise = byId.get(logged.exerciseId);
      if (!exercise || !seen.has(logged.exerciseId)) continue;
      const among = [...(setsSoFar.get(logged.exerciseId) ?? []), ...(today.get(logged.exerciseId) ?? [])];
      for (const setId of displayedRecordSetIDs(logged, among, exercise)) {
        events.push({ exerciseId: logged.exerciseId, sessionId: session.id, date: session.date, setId });
      }
    }
    for (const [exerciseId, sets] of today) {
      setsSoFar.set(exerciseId, [...(setsSoFar.get(exerciseId) ?? []), ...sets]);
      seen.add(exerciseId);
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Semaines (macro)
// ---------------------------------------------------------------------------

export interface WeekStat {
  start: Date;
  end: Date;
  /** Part des objectifs atteinte, chaque muscle plafonné à son objectif (0..1). */
  score: number;
  sessions: number;
  /** Séries comptées comme dans l'Historique (compléments fusionnés). */
  sets: number;
  records: number;
  goalsMet: number;
  goalsTotal: number;
  inProgress: boolean;
  /** Meilleure semaine terminée de la période lue. */
  best: boolean;
}

function sessionSets(session: WorkoutSession, byId: ReadonlyMap<string, Exercise>): number {
  return session.exercises.reduce(
    (sum, logged) => sum + physiologicalSetUnits(logged.sets, { increment: byId.get(logged.exerciseId)?.smallestIncrement }),
    0
  );
}

/** Les `count` dernières semaines civiles (lundi → dimanche), de la plus ancienne à la courante. */
export function weekStats(
  history: readonly WorkoutSession[],
  catalog: readonly Exercise[],
  goals: readonly MuscleGoal[],
  now: Date,
  count: number = PROGRESS_STATS.WEEKS_SHOWN,
  records: readonly RecordEvent[] = recordEvents(history, catalog)
): WeekStat[] {
  const finished = history.filter((session) => !session.isActive);
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const goalParents = goals.filter((goal) => isGoalMuscleParent(goal.parent) && goal.weeklyGoalSets > 0);
  const currentStart = currentWeekWindow(now).start;
  const weeks: WeekStat[] = [];

  for (let k = count - 1; k >= 0; k -= 1) {
    const start = new Date(currentStart);
    start.setDate(start.getDate() - 7 * k);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const inWeek = (date: Date) => date >= start && date < end;
    const sessions = finished.filter((session) => inWeek(session.date));
    const totals = parentTotals([...finished], [...catalog], start, end);
    weeks.push({
      start,
      end,
      score: coverageForWeek([...finished], [...catalog], [...goals], start),
      sessions: sessions.length,
      sets: Math.round(sessions.reduce((sum, session) => sum + sessionSets(session, byId), 0) * 10) / 10,
      records: records.filter((event) => inWeek(event.date)).length,
      goalsMet: goalParents.filter((goal) => (totals.get(goal.parent) ?? 0) >= goal.weeklyGoalSets - 1e-9).length,
      goalsTotal: goalParents.length,
      inProgress: k === 0,
      best: false,
    });
  }

  const completed = weeks.filter((week) => !week.inProgress && week.sessions > 0);
  const bestScore = Math.max(0, ...completed.map((week) => week.score));
  if (bestScore > 0) {
    const best = completed.find((week) => week.score === bestScore);
    if (best) best.best = true;
  }
  return weeks;
}

export interface SessionStreak {
  /** Semaines d'affilée à 3 séances ou plus (la semaine en cours compte dès qu'elle y est). */
  weeks: number;
  /** La série a atteint la limite lue : affichée « 26+ ». */
  capped: boolean;
  /** La semaine en cours est déjà comptée. */
  currentCounted: boolean;
  currentSessions: number;
  target: number;
}

/** `weeks` de la plus ancienne à la courante, comme `weekStats`. */
export function sessionStreak(weeks: readonly WeekStat[], target: number = PROGRESS_STATS.STREAK_MIN_SESSIONS): SessionStreak {
  const current = weeks.at(-1);
  const currentCounted = !!current && current.inProgress && current.sessions >= target;
  let streak = currentCounted ? 1 : 0;
  let index = weeks.length - 2;
  for (; index >= 0; index -= 1) {
    if (weeks[index].sessions < target) break;
    streak += 1;
  }
  return {
    weeks: streak,
    capped: index < 0 && weeks.length > 0,
    currentCounted,
    currentSessions: current?.sessions ?? 0,
    target,
  };
}

// ---------------------------------------------------------------------------
// Exercices (micro)
// ---------------------------------------------------------------------------

export type ExerciseAxis = "load" | "reps";

export type ExerciseStatus =
  /** Machine découverte : sa première séance sert d'étalonnage. */
  | "new"
  /** Moins de séances qu'il n'en faut pour une tendance. */
  | "young"
  | "progress"
  | "stable"
  | "decline"
  | "plateau"
  | "maxed"
  /** Pas pratiqué depuis 4 semaines : aucune tendance. */
  | "dormant";

export interface CapacityPoint {
  date: Date;
  value: number;
  weight: number;
  reps: number;
  /** Séance faite sur une machine équivalente, convertie dans les charges de la cible. */
  convertedFrom: string | null;
  records: number;
}

export interface ExerciseStat {
  /** La machine du moment (dernière utilisée de sa famille). */
  exercise: Exercise;
  /** Machines équivalentes dont les séances, converties, prolongent la courbe. */
  conversions: { exercise: Exercise; ratio: number }[];
  axis: ExerciseAxis;
  points: CapacityPoint[];
  status: ExerciseStatus;
  /** Variation de capacité récente (fraction), `null` sans tendance. */
  delta: number | null;
  lastDate: Date;
  /** Séances sur la machine elle-même (hors séances converties). */
  ownSessions: number;
  records: number;
  lastRecordDate: Date | null;
  bestValue: number;
  maxStatus: MachineMaxStatus | null;
}

/** Charge réellement déplacée : le poids du corps compte pour les exercices lestés ou assistés. */
function movedLoad(set: LoggedSet, exercise: Exercise, bodyweightKg: number | null): number | null {
  if (exercise.setPatternMode === "weighted_bodyweight" || exercise.setPatternMode === "bodyweight") {
    return bodyweightKg ? bodyweightKg + set.weight : set.weight > 0 ? set.weight : null;
  }
  if (exercise.setPatternMode === "assisted_bodyweight") {
    return bodyweightKg ? Math.max(0, bodyweightKg - set.weight) : null;
  }
  return set.weight > 0 ? set.weight : null;
}

function repsToFailure(set: LoggedSet): number {
  return set.reps + Math.max(0, Math.min(4, set.reportedRir ?? 0));
}

/** Capacité à frais : e1RM sur les reps jusqu'à l'échec, plus celles que la fatigue a coûtées. */
function capacity(
  set: LoggedSet,
  exercise: Exercise,
  axis: ExerciseAxis,
  bodyweightKg: number | null,
  fatigueReps: number
): number {
  if (axis === "reps") return repsToFailure(set) + fatigueReps;
  const load = movedLoad(set, exercise, bodyweightKg);
  return load === null ? 0 : estimated1RM(load, repsToFailure(set) + fatigueReps);
}

function axisFor(exercise: Exercise, sets: readonly LoggedSet[], bodyweightKg: number | null): ExerciseAxis {
  const bodyweightMode =
    exercise.setPatternMode === "bodyweight" ||
    exercise.setPatternMode === "weighted_bodyweight" ||
    exercise.setPatternMode === "assisted_bodyweight";
  if (!bodyweightMode) return sets.some((set) => set.weight > 0) ? "load" : "reps";
  // Poids du corps inconnu : seules les reps se comparent d'une séance à l'autre.
  if (!bodyweightKg) return "reps";
  return exercise.setPatternMode === "bodyweight" && sets.every((set) => set.weight <= 0) ? "reps" : "load";
}

function maxOf(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}

function classifyTrend(
  points: readonly CapacityPoint[],
  ownRecent: readonly CapacityPoint[]
): { status: ExerciseStatus; delta: number | null } {
  const window = PROGRESS_STATS.TREND_WINDOW;
  if (points.length < window + 1) return { status: "young", delta: null };
  const recent = maxOf(points.slice(-window).map((point) => point.value));
  const previous = maxOf(points.slice(-2 * window, -window).map((point) => point.value));
  if (previous <= 0) return { status: "young", delta: null };
  const delta = recent / previous - 1;
  if (delta >= PROGRESS_STATS.PROGRESS_MIN) return { status: "progress", delta };
  if (delta <= -PROGRESS_STATS.DECLINE_MIN) return { status: "decline", delta };
  const plateau =
    ownRecent.length >= PROGRESS_STATS.PLATEAU_SESSIONS && ownRecent.every((point) => point.records === 0);
  return { status: plateau ? "plateau" : "stable", delta };
}

/**
 * Une carte par mouvement : les machines équivalentes dont le facteur est mesuré n'en font qu'une,
 * vue depuis la machine du moment (comme en salle). Les autres gardent leur carte.
 */
export function exerciseStats(
  history: readonly WorkoutSession[],
  catalog: readonly Exercise[],
  now: Date,
  bodyweightKg: number | null = null,
  records: readonly RecordEvent[] = recordEvents(history, catalog)
): ExerciseStat[] {
  const finished = sessionsNewestFirst(history.filter((session) => !session.isActive)).reverse();
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const recordsBySession = new Map<string, number>();
  for (const event of records) {
    const key = `${event.sessionId}::${event.exerciseId}`;
    recordsBySession.set(key, (recordsBySession.get(key) ?? 0) + 1);
  }

  const practiced = new Set(finished.flatMap((session) => session.exercises.map((logged) => logged.exerciseId)));
  const exerciseIdOfLogged = new Map(
    finished.flatMap((session) => session.exercises.map((logged) => [logged.id, logged.exerciseId] as const))
  );
  const families = new Map<string, ReturnType<typeof familyHistory>>();
  const absorbed = new Set<string>();
  const seenKeys = new Set<string>();
  for (const exercise of catalog) {
    if (!practiced.has(exercise.id)) continue;
    const key = equivalenceKey(exercise);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const target = defaultEquivalent(exercise, catalog, finished);
    const family = familyHistory(target, catalog, finished);
    if (family.conversions.length === 0) continue;
    families.set(target.id, family);
    for (const conversion of family.conversions) absorbed.add(conversion.exercise.id);
  }

  const stats: ExerciseStat[] = [];
  for (const exerciseId of practiced) {
    if (absorbed.has(exerciseId)) continue;
    const exercise = byId.get(exerciseId);
    if (!exercise) continue;
    const family = families.get(exerciseId);
    const sessions = family ? sessionsNewestFirst(family.history.filter((s) => !s.isActive)).reverse() : finished;
    const conversions = family?.conversions ?? [];
    const machineIds = new Set([exerciseId, ...conversions.map((conversion) => conversion.exercise.id)]);

    const perSession: { session: WorkoutSession; sets: LoggedSet[]; convertedFrom: string | null; sourceId: string }[] = [];
    for (const session of sessions) {
      const occurrences = session.exercises.filter((logged) => logged.exerciseId === exerciseId);
      const sets = normalRecordSets(occurrences.flatMap((logged) => orderedSets(logged)), exercise);
      if (sets.length === 0) continue;
      // Séance convertie : `familyHistory` suffixe l'id loggé d'origine par « ~cible ».
      const converted = occurrences.every((logged) => logged.id.endsWith(`~${exerciseId}`));
      const sourceId = converted
        ? exerciseIdOfLogged.get(occurrences[0].id.slice(0, -(exerciseId.length + 1))) ?? exerciseId
        : exerciseId;
      perSession.push({
        session,
        sets,
        convertedFrom: converted ? byId.get(sourceId)?.name ?? occurrences[0].exerciseName : null,
        sourceId,
      });
    }
    if (perSession.length === 0) continue;

    const allSets = perSession.flatMap((entry) => entry.sets);
    const axis = axisFor(exercise, allSets, bodyweightKg);
    const points: CapacityPoint[] = perSession
      .map(({ session, sets, convertedFrom, sourceId }) => {
        const scored = sets.map((set) => ({
          set,
          value: capacity(set, exercise, axis, bodyweightKg, fatigueRepsBefore(session, exercise, set, byId)),
        }));
        const best = scored.reduce((top, entry) => (entry.value > top.value ? entry : top));
        return {
          date: session.date,
          value: best.value,
          weight: best.set.weight,
          reps: best.set.reps,
          convertedFrom,
          records: recordsBySession.get(`${session.id}::${sourceId}`) ?? 0,
        };
      })
      // Série au poids du corps loggée sur un exercice chargé : rien de comparable.
      .filter((point) => point.value > 0);
    if (points.length === 0) continue;

    const own = points.filter((point) => point.convertedFrom === null);
    const lastDate = points.at(-1)!.date;
    const familyRecords = records.filter((event) => machineIds.has(event.exerciseId));
    const ownSets = finished
      .flatMap((session) => session.exercises)
      .filter((logged) => logged.exerciseId === exerciseId)
      .flatMap((logged) => orderedSets(logged))
      .filter((set) => set.completed);
    const maxStatus = exercise.maxLoad ? machineMaxStatus(exercise, ownSets, lastDate) : null;

    let status: ExerciseStatus;
    let delta: number | null = null;
    if (now.getTime() - lastDate.getTime() > PROGRESS_STATS.DORMANT_DAYS * DAY_MS) status = "dormant";
    else if (own.length <= 1 && points.at(-1)!.convertedFrom === null) status = "new";
    else if (maxStatus?.maxed) status = "maxed";
    else ({ status, delta } = classifyTrend(points, own.slice(-PROGRESS_STATS.PLATEAU_SESSIONS)));

    stats.push({
      exercise,
      conversions,
      axis,
      points,
      status,
      delta,
      lastDate,
      ownSessions: own.length,
      records: familyRecords.length,
      lastRecordDate: familyRecords.reduce<Date | null>((latest, event) => (!latest || event.date > latest ? event.date : latest), null),
      bestValue: maxOf(points.map((point) => point.value)),
      maxStatus,
    });
  }
  return stats.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
}

export function isCurrentGym(stat: ExerciseStat, now: Date): boolean {
  return now.getTime() - stat.lastDate.getTime() <= PROGRESS_STATS.CURRENT_GYM_DAYS * DAY_MS;
}

export interface ExercisesSummary {
  recentRecords: number;
  progressing: number;
  plateaus: number;
  newMachines: number;
  maxed: number;
  withMaxLoad: number;
}

export function exercisesSummary(
  stats: readonly ExerciseStat[],
  records: readonly RecordEvent[],
  now: Date
): ExercisesSummary {
  const current = stats.filter((stat) => isCurrentGym(stat, now));
  const since = now.getTime() - PROGRESS_STATS.RECENT_RECORD_DAYS * DAY_MS;
  return {
    recentRecords: records.filter((event) => event.date.getTime() >= since).length,
    progressing: current.filter((stat) => stat.status === "progress").length,
    plateaus: current.filter((stat) => stat.status === "plateau").length,
    newMachines: current.filter((stat) => stat.status === "new").length,
    maxed: current.filter((stat) => stat.maxStatus?.maxed).length,
    withMaxLoad: current.filter((stat) => stat.maxStatus && stat.maxStatus.maxLoad !== null).length,
  };
}

// ---------------------------------------------------------------------------
// Semaine en cours : rythme attendu
// ---------------------------------------------------------------------------

/**
 * Où en être aujourd'hui pour finir la semaine à 100 % : la part des séances habituelles déjà
 * faites (2 séances sur 4 → 50 %). Un muscle sous ce repère est en retard sur le rythme.
 */
export function weekPace(sessionsDone: number, habitualSessionsPerWeek: number): number {
  if (habitualSessionsPerWeek <= 0) return 1;
  return Math.min(1, sessionsDone / habitualSessionsPerWeek);
}

export function isBehindPace(done: number, goal: number, pace: number): boolean {
  return goal > 0 && done + 1e-9 < goal * pace;
}

