/**
 * Les chiffres de l'onglet Progrès, calculés en un seul endroit et testés.
 *
 * Audit du 24/09/2026 : l'onglet affichait « +50 % ce mois » sur une machine pas touchée depuis
 * 19 semaines (fenêtre calée sur la dernière séance, pas sur aujourd'hui), « Plateau » sur une
 * machine qui progressait en reps à sa charge max, « Best il y a 4 sem » pour un record battu
 * l'avant-veille, « Dos haut 0 % · Couvert » pour un groupe sans objectif, une moyenne de volume
 * tirée vers le bas par la semaine en cours. Ici :
 *
 *   - la capacité d'une séance = sa meilleure série démontrée, à contexte neutre (e1RM sur reps +
 *     RIR déclaré + reps que les séries faites avant dans la séance ont coûtées, coût APPRIS sur
 *     l'historique, ou reps au poids du corps) : des dips faits en fin de séance ne passent pas
 *     pour une baisse (`capacity-trend.ts`, 12/10/2026) ;
 *   - la tendance est l'écart des 3 dernières séances à ce que Jeera prévoyait d'après les 3
 *     d'avant, jugé contre le bruit mesuré de l'exercice, et ne s'affiche que si l'exercice est
 *     pratiqué en ce moment ;
 *   - les records sont les étoiles de l'Historique, au set près (même fonction), étalonnage inclus ;
 *   - une machine découverte n'a ni tendance ni verdict : elle s'étalonne (changement de salle).
 *
 * Moteur pur : tout se recalcule depuis l'historique.
 */

import {
  CAPACITY_TREND,
  capacityTrend,
  contextReps,
  learnContextCosts,
  setContext,
  trendNoise,
  type AxisContextPair,
  type ContextCosts,
  type NoiseSample,
} from "@/lib/engines/capacity-trend";
import { estimated1RM } from "@/lib/engines/e1rm";
import { coverageForWeek, currentWeekWindow, parentTotals } from "@/lib/engines/effective-sets";
import { defaultEquivalent, equivalenceKey, familyHistory } from "@/lib/engines/equivalence";
import { machineMaxStatus, type MachineMaxStatus } from "@/lib/engines/machine-max";
import { normalRecordSets } from "@/lib/engines/records";
import { sessionStarIds } from "@/lib/engines/session-stars";
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
  /** Tendance : écart des N dernières séances à la prévision tirée des N d'avant (`CAPACITY_TREND.WINDOW`). */
  TREND_WINDOW: CAPACITY_TREND.WINDOW,
  /** Plateau : aucune étoile sur les N dernières séances de la machine, et pas de progression. */
  PLATEAU_SESSIONS: 4,
  /** Au-delà, l'exercice est « en pause » : aucune tendance affichée. */
  DORMANT_DAYS: 28,
  /** Fenêtre de la « salle actuelle ». */
  CURRENT_GYM_DAYS: 28,
  /** Records « récents » du résumé des exercices. */
  RECENT_RECORD_DAYS: 30,
} as const;

/**
 * Paliers de semaine (Evan, 26/09/2026). Le score est la part des objectifs musculaires atteinte,
 * chaque muscle plafonné à son objectif. Avec ~150 séries d'objectifs pour ~70 faites en 4
 * séances, aucune semaine réelle n'était « gagnée » (moyenne 45 %, meilleure 59 %) : l'app disait
 * « en retard » à chaque séance. Les objectifs restent l'horizon ; les paliers rendent la semaine
 * gagnable : bronze = une semaine normale, argent = une bonne semaine, or = une semaine d'exception.
 */
export type WeekTier = "bronze" | "argent" | "or";

export const WEEK_TIERS: readonly { tier: WeekTier; label: string; min: number }[] = [
  { tier: "bronze", label: "Bronze", min: 0.4 },
  { tier: "argent", label: "Argent", min: 0.55 },
  { tier: "or", label: "Or", min: 0.7 },
];

/** Palier atteint par un score, `null` sous le bronze. */
export function weekTier(score: number): WeekTier | null {
  let reached: WeekTier | null = null;
  for (const entry of WEEK_TIERS) if (score + 1e-9 >= entry.min) reached = entry.tier;
  return reached;
}

/** Prochain palier à viser, `null` une fois l'or atteint. */
export function nextWeekTier(score: number): (typeof WEEK_TIERS)[number] | null {
  return WEEK_TIERS.find((entry) => score + 1e-9 < entry.min) ?? null;
}

/**
 * Séries qui manquent pour le prochain palier, faites sur des muscles encore sous leur objectif
 * (une série au-delà d'un objectif atteint ne compte plus dans le score). `null` à l'or.
 */
export function setsToNextTier(score: number, goalTotal: number): number | null {
  const next = nextWeekTier(score);
  if (!next || goalTotal <= 0) return null;
  return Math.max(1, Math.ceil((next.min - score) * goalTotal - 1e-9));
}

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
  const events: RecordEvent[] = [];
  const exerciseOfSet = new Map<string, string>();

  for (const session of chronological) {
    for (const logged of session.exercises) for (const set of logged.sets) exerciseOfSet.set(set.id, logged.exerciseId);
    // La définition unique des étoiles (`session-stars.ts`), sur tout ce qui précède la séance.
    for (const setId of sessionStarIds(session, setsSoFar, byId)) {
      events.push({ exerciseId: exerciseOfSet.get(setId)!, sessionId: session.id, date: session.date, setId });
    }
    for (const logged of session.exercises) {
      setsSoFar.set(logged.exerciseId, [...(setsSoFar.get(logged.exerciseId) ?? []), ...orderedSets(logged)]);
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
  /** Palier atteint (bronze, argent, or), `null` en dessous. */
  tier: WeekTier | null;
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
    const score = coverageForWeek([...finished], [...catalog], [...goals], start);
    weeks.push({
      start,
      end,
      score,
      tier: weekTier(score),
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

export interface WeekStreak {
  /**
   * Semaines d'affilée au bronze ou mieux (Evan, 26/09/2026 : « ce qui compte, c'est le nombre de
   * séries par semaine, pas le nombre de séances »). La semaine en cours compte dès qu'elle
   * atteint le bronze, et ne casse pas la série tant qu'elle est en cours.
   */
  weeks: number;
  /** La série a atteint la limite lue : affichée « 26+ ». */
  capped: boolean;
  /** La semaine en cours est déjà comptée. */
  currentCounted: boolean;
  /** Jokers en réserve (gagnés sur les semaines or). */
  jokers: number;
  /** Débuts des semaines sous le bronze couvertes par un joker. */
  protectedWeeks: Date[];
}

/**
 * Jokers (Evan, 26/09/2026) : une semaine or terminée en rapporte un (trois au plus) ; une semaine
 * terminée sous le bronze (maladie, voyage) en consomme un tout seul, et la série ne casse pas,
 * sans grandir pour autant. Rien à déclarer : tout se lit dans les séries.
 */
export const JOKERS = { MAX: 3 } as const;

export function weekStreak(weeks: readonly WeekStat[]): WeekStreak {
  let streak = 0;
  let jokers = 0;
  let unbroken = true;
  const protectedWeeks: Date[] = [];
  for (const week of weeks) {
    if (week.inProgress) continue;
    if (week.tier) {
      streak += 1;
      if (week.tier === "or") jokers = Math.min(JOKERS.MAX, jokers + 1);
    } else if (streak > 0 && jokers > 0) {
      jokers -= 1;
      protectedWeeks.push(week.start);
    } else {
      streak = 0;
      unbroken = false;
    }
  }
  const current = weeks.at(-1);
  const currentCounted = !!current && current.inProgress && current.tier !== null;
  if (currentCounted) streak += 1;
  const completed = weeks.some((week) => !week.inProgress);
  return { weeks: streak, capped: unbroken && completed, currentCounted, jokers, protectedWeeks };
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
  /** Reps jusqu'à l'échec que les séries faites avant dans la séance ont coûtées à la meilleure série (coût appris). */
  contextReps: number;
  /** RIR déclaré sur la meilleure série : sans lui, la capacité suppose l'échec et ne mesure pas le bruit. */
  rirDeclared: boolean;
}

export interface ExerciseStat {
  /** La machine du moment (dernière utilisée de sa famille). */
  exercise: Exercise;
  /** Machines équivalentes dont les séances, converties, prolongent la courbe. */
  conversions: { exercise: Exercise; ratio: number }[];
  axis: ExerciseAxis;
  points: CapacityPoint[];
  status: ExerciseStatus;
  /**
   * Écart moyen des 3 dernières séances à ce que Jeera prévoyait d'après les 3 d'avant, contexte de séance compris
   * (fraction), `null` sans tendance.
   */
  delta: number | null;
  /** Écart à dépasser pour parler de progression ou de baisse : le bruit mesuré de l'exercice (fraction). */
  deltaThreshold: number | null;
  /** Bruit d'une séance à l'autre : écart-type du log de la capacité, mesuré sur l'exercice (`capacity-trend.ts`). */
  noise: number;
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

/** Capacité à contexte neutre : e1RM sur les reps jusqu'à l'échec, plus celles que le contexte de la séance a coûtées. */
function capacity(
  set: LoggedSet,
  exercise: Exercise,
  axis: ExerciseAxis,
  bodyweightKg: number | null,
  contextCostReps: number
): number {
  if (axis === "reps") return repsToFailure(set) + contextCostReps;
  const load = movedLoad(set, exercise, bodyweightKg);
  return load === null ? 0 : estimated1RM(load, repsToFailure(set) + contextCostReps);
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

/**
 * Coût du contexte appris sur l'historique (`capacity-trend.ts`), par axe : pour chaque exercice, ses séances
 * consécutives (28 jours au plus, RIR déclaré sur la meilleure série des deux) forment une paire. Écart de capacité en
 * reps jusqu'à l'échec (au poids du corps) ou ramené en reps par la règle d'Epley de la capacité (charge moyenne de la
 * paire). Exporté pour l'audit (`scripts/suggestions-audit/tendance.ts`).
 */
export function contextCosts(
  finished: readonly WorkoutSession[],
  byId: ReadonlyMap<string, Exercise>,
  bodyweightKg: number | null
): ContextCosts {
  const series = new Map<string, { date: Date; raw: number; load: number; rir: boolean; sets: number; same: number }[]>();
  const ownSets = new Map<string, LoggedSet[]>();
  for (const session of finished) {
    for (const logged of session.exercises) {
      ownSets.set(logged.exerciseId, [...(ownSets.get(logged.exerciseId) ?? []), ...orderedSets(logged)]);
    }
  }
  const axes = new Map([...ownSets].flatMap(([id, sets]) => {
    const exercise = byId.get(id);
    return exercise ? [[id, axisFor(exercise, sets, bodyweightKg)] as const] : [];
  }));
  for (const session of finished) {
    for (const id of new Set(session.exercises.map((logged) => logged.exerciseId))) {
      const exercise = byId.get(id);
      const axis = axes.get(id);
      if (!exercise || !axis) continue;
      const sets = normalRecordSets(session.exercises.filter((logged) => logged.exerciseId === id).flatMap((logged) => orderedSets(logged)), exercise);
      const scored = sets.map((set) => ({ set, raw: capacity(set, exercise, axis, bodyweightKg, 0) })).filter((entry) => entry.raw > 0);
      if (scored.length === 0) continue;
      const best = scored.reduce((top, entry) => (entry.raw > top.raw ? entry : top));
      const context = setContext(session, exercise, best.set.timestamp, byId);
      const load = axis === "reps" ? 0 : movedLoad(best.set, exercise, bodyweightKg) ?? 0;
      const entry = { date: session.date, raw: best.raw, load, rir: best.set.reportedRir != null, sets: context.sets, same: context.sameMuscleSets };
      series.set(id, [...(series.get(id) ?? []), entry]);
    }
  }
  const pairs: AxisContextPair[] = [];
  for (const [id, entries] of series) {
    const axis = axes.get(id)!;
    for (let index = 1; index < entries.length; index += 1) {
      const a = entries[index - 1];
      const b = entries[index];
      if (!a.rir || !b.rir || b.date.getTime() - a.date.getTime() > CAPACITY_TREND.MAX_GAP_DAYS * DAY_MS) continue;
      const repsGap = axis === "reps" ? b.raw - a.raw : (30 * (b.raw - a.raw)) / ((a.load + b.load) / 2);
      if (!Number.isFinite(repsGap)) continue;
      pairs.push({ axis, repsGap, setsGap: b.sets - a.sets, sameMuscleGap: b.same - a.same });
    }
  }
  return learnContextCosts(pairs);
}

/** Écarts de log de capacité entre séances consécutives d'une même machine (RIR déclaré, 28 jours au plus). */
function noiseSamples(exerciseId: string, axis: ExerciseAxis, points: readonly CapacityPoint[]): NoiseSample[] {
  const samples: NoiseSample[] = [];
  const lastBySource = new Map<string | null, CapacityPoint>();
  for (const point of points) {
    const previous = lastBySource.get(point.convertedFrom);
    lastBySource.set(point.convertedFrom, point);
    if (!previous || !previous.rirDeclared || !point.rirDeclared) continue;
    if (point.date.getTime() - previous.date.getTime() > CAPACITY_TREND.MAX_GAP_DAYS * DAY_MS) continue;
    samples.push({ exerciseId, axis, logGap: Math.log(point.value / previous.value) });
  }
  return samples;
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
  records: readonly RecordEvent[] = recordEvents(history, catalog),
  /** Coût du contexte imposé (audit hors échantillon) ; appris sur `history` sinon. */
  costs?: ContextCosts
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

  const learned = costs ?? contextCosts(finished, byId, bodyweightKg);
  const cards: { stat: Omit<ExerciseStat, "status" | "delta" | "deltaThreshold" | "noise">; own: CapacityPoint[] }[] = [];
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
        const scored = sets.map((set) => {
          const costReps = contextReps(learned[axis], setContext(session, exercise, set.timestamp, byId));
          return { set, costReps, value: capacity(set, exercise, axis, bodyweightKg, costReps) };
        });
        const best = scored.reduce((top, entry) => (entry.value > top.value ? entry : top));
        return {
          date: session.date,
          value: best.value,
          weight: best.set.weight,
          reps: best.set.reps,
          convertedFrom,
          records: recordsBySession.get(`${session.id}::${sourceId}`) ?? 0,
          contextReps: best.costReps,
          rirDeclared: best.set.reportedRir != null,
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

    cards.push({
      own,
      stat: {
        exercise,
        conversions,
        axis,
        points,
        lastDate,
        ownSessions: own.length,
        records: familyRecords.length,
        lastRecordDate: familyRecords.reduce<Date | null>((latest, event) => (!latest || event.date > latest ? event.date : latest), null),
        bestValue: maxOf(points.map((point) => point.value)),
        maxStatus,
      },
    });
  }

  // Le bruit de chaque exercice se mesure sur ses séances, rétréci vers celui de tous les exercices du même axe.
  const noise = trendNoise(cards.flatMap(({ stat }) => noiseSamples(stat.exercise.id, stat.axis, stat.points)));
  const stats: ExerciseStat[] = cards.map(({ stat: card, own }) => {
    const stat = { ...card, noise: noise(card.exercise.id, card.axis) };
    const { points, lastDate, maxStatus } = stat;
    if (now.getTime() - lastDate.getTime() > PROGRESS_STATS.DORMANT_DAYS * DAY_MS) return { ...stat, status: "dormant", delta: null, deltaThreshold: null };
    if (own.length <= 1 && points.at(-1)!.convertedFrom === null) return { ...stat, status: "new", delta: null, deltaThreshold: null };
    if (maxStatus?.maxed) return { ...stat, status: "maxed", delta: null, deltaThreshold: null };
    const trend = capacityTrend(points, stat.noise);
    if (trend.direction === null) return { ...stat, status: "young", delta: null, deltaThreshold: null };
    const recentOwn = own.slice(-PROGRESS_STATS.PLATEAU_SESSIONS);
    const plateau = recentOwn.length >= PROGRESS_STATS.PLATEAU_SESSIONS && recentOwn.every((point) => point.records === 0);
    const status: ExerciseStatus =
      trend.direction === "up" ? "progress" : trend.direction === "down" ? "decline" : plateau ? "plateau" : "stable";
    return { ...stat, status, delta: trend.delta, deltaThreshold: trend.threshold };
  });
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

