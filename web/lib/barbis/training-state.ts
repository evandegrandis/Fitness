/**
 * L'état d'entraînement servi à Barbis (`GET /api/barbis/training-state`), calculé par les
 * moteurs de Jeera et par eux seuls : Barbis ne recompte ni séries, ni records, ni tendances.
 * Avant (07/10/2026), Barbis refaisait un 1RM d'Epley sans RIR, ses propres « records » (+0,5 %)
 * et « baisses » (−5 %) et comptait les séries « reps ≥ 6 » : il pouvait contredire l'app.
 *
 *   - semaine : séries par muscle (`parentTotals`, comme l'accueil), objectifs, score et palier
 *     (`weekStats`), séries qui manquent pour le palier suivant et pour l'or ;
 *   - records : exactement les étoiles de l'Historique (`recordEvents`) ;
 *   - exercices : statut et tendance de Progrès › Exercices (`exerciseStats`) ;
 *   - séances : la table par séance de `session-table.ts` (bilan résumé + base des corrélations).
 *
 * Les semaines suivent l'horloge du serveur (UTC sur Vercel) : une séance commencée entre minuit
 * et 2 h, heure de Paris, un lundi, tomberait dans la semaine d'avant. Aucune ne l'a été.
 */

import { buildCareer } from "@/lib/engines/career";
import { parentTotals } from "@/lib/engines/effective-sets";
import {
  PROGRESS_STATS,
  WEEK_TIERS,
  exerciseStats,
  isCurrentGym,
  nextWeekTier,
  recordEvents,
  setsToNextTier,
  weekStats,
  weekStreak,
  type ExerciseStat,
  type WeekStat,
} from "@/lib/engines/progress-stats";
import { GOAL_MUSCLE_PARENTS, TRACKED_ONLY_PARENTS, isGoalMuscleParent, parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import {
  sessionsNewestFirst,
  type BodyWeightEntry,
  type Exercise,
  type MuscleGoal,
  type RecoveryCheckin,
  type UserSettings,
  type WorkoutSession,
} from "@/lib/models/types";
import { parisDate, sessionTable, type SessionRow } from "./session-table";

const DAY_MS = 86_400_000;
const WEEKS = PROGRESS_STATS.WEEKS_SHOWN;
const GOLD = WEEK_TIERS.find((entry) => entry.tier === "or")!;

const round1 = (value: number) => Math.round(value * 10) / 10;

export const TRAINING_DEFINITIONS = {
  sets: "Séries comptées comme dans l'Historique de Jeera : compléments de moins de 90 s fusionnés, série à RIR 3 = 0,75, RIR 4+ = 0,5 ; par muscle, coefficient du profil de l'exercice.",
  week: "Semaine civile du lundi au dimanche. Score = part des objectifs de séries atteinte, chaque muscle plafonné à son objectif ; bronze 40 %, argent 55 %, or 70 %.",
  records: "Étoiles de l'Historique de Jeera : charge max, 1RM estimé (+2 %), reps à charge égale ou au poids du corps ; jamais à la première séance d'une machine (étalonnage).",
  trend: "Capacité = meilleure série de la séance ramenée à frais (1RM estimé sur reps + RIR déclaré + reps coûtées par la fatigue de la séance). Tendance = meilleure des 3 dernières séances contre meilleure des 3 d'avant : progression dès +1,5 %, baisse dès −3 %.",
  suggestions: "Chaque série jugée contre la cible affichée au moment de la valider, par la règle du moteur : à la même charge, battue avec plus de reps, tenue avec autant ; à une autre charge, les reps doivent rester dans la fourchette, plus lourd c'est battu, plus léger les reps sont ramenées à la charge de la cible (7,5 % de charge = 1 rep) puis comparées. En dessous sinon. Une machine découverte n'est pas jugée.",
  capacityVsTrend: "Par séance : capacité de chaque exercice contre la moyenne de ses 3 séances précédentes (reprise après 28 jours exclue), moyenne sur les exercices.",
  checkinDayBefore: "Check-in du jour J-1 (heure de Paris) : alcool de J-1 et nuit de J-1 à J, déclarés dans Jeera.",
} as const;

export interface WeekMuscle {
  muscle: MuscleParent;
  label: string;
  sets: number;
  goal: number | null;
  remaining: number | null;
}

export interface WeekDetail {
  /** Lundi, heure de Paris. */
  start: string;
  /** Dimanche, heure de Paris. */
  end: string;
  inProgress: boolean;
  sessions: number;
  sets: number;
  scorePct: number;
  tier: string | null;
  records: number;
  goalsMet: number;
  goalsTotal: number;
  goalSetsTotal: number;
  nextTier: { tier: string; setsMissing: number } | null;
  /** Séries (sur des muscles encore sous leur objectif) qui manquent pour l'or, 0 une fois atteint. */
  setsToGold: number;
  muscles: WeekMuscle[];
}

export interface ExerciseTrend {
  exercise: string;
  status: ExerciseStat["status"];
  deltaPct: number | null;
  lastDate: string;
  sessions: number;
  records: number;
  lastRecordDate: string | null;
  last: { weight: number; reps: number };
  convertedFrom: string[];
}

export interface TrainingState {
  generatedAt: string;
  timezone: "Europe/Paris";
  days: number;
  definitions: typeof TRAINING_DEFINITIONS;
  weeks: { start: string; inProgress: boolean; sessions: number; sets: number; scorePct: number; tier: string | null; records: number }[];
  streak: { weeks: number; jokers: number };
  currentWeek: WeekDetail;
  lastWeek: WeekDetail;
  exercises: ExerciseTrend[];
  records: { date: string; sessionId: string; exercise: string; weight: number; reps: number }[];
  sessions: SessionRow[];
}

export interface TrainingStateInput {
  sessions: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  goals: readonly MuscleGoal[];
  settings: UserSettings;
  checkins: readonly RecoveryCheckin[];
  bodyWeights: readonly BodyWeightEntry[];
  now: Date;
  /** Fenêtre des séances, records et exercices servis (l'historique entier est toujours lu). */
  days: number;
}

function weekDetail(week: WeekStat, finished: WorkoutSession[], catalog: Exercise[], goals: readonly MuscleGoal[]): WeekDetail {
  const totals = parentTotals(finished, catalog, week.start, week.end);
  const goalOf = new Map(goals.filter((goal) => isGoalMuscleParent(goal.parent) && goal.weeklyGoalSets > 0).map((goal) => [goal.parent, goal.weeklyGoalSets]));
  const goalSetsTotal = [...goalOf.values()].reduce((sum, goal) => sum + goal, 0);
  const muscles: WeekMuscle[] = [...GOAL_MUSCLE_PARENTS, ...TRACKED_ONLY_PARENTS]
    .map((parent) => {
      const goal = goalOf.get(parent) ?? null;
      const sets = round1(totals.get(parent) ?? 0);
      return { muscle: parent, label: parentDisplayName[parent], sets, goal, remaining: goal === null ? null : round1(Math.max(0, goal - sets)) };
    })
    .filter((row) => row.goal !== null || row.sets > 0);
  const next = nextWeekTier(week.score);
  const lastDay = new Date(week.end.getTime() - DAY_MS / 2);
  return {
    start: parisDate(new Date(week.start.getTime() + DAY_MS / 2)),
    end: parisDate(lastDay),
    inProgress: week.inProgress,
    sessions: week.sessions,
    sets: week.sets,
    scorePct: Math.round(week.score * 100),
    tier: week.tier,
    records: week.records,
    goalsMet: week.goalsMet,
    goalsTotal: week.goalsTotal,
    goalSetsTotal,
    nextTier: next ? { tier: next.tier, setsMissing: setsToNextTier(week.score, goalSetsTotal) ?? 0 } : null,
    setsToGold: week.score + 1e-9 >= GOLD.min || goalSetsTotal <= 0 ? 0 : Math.ceil((GOLD.min - week.score) * goalSetsTotal - 1e-9),
    muscles,
  };
}

export function buildTrainingState({ sessions, catalog, goals, settings, checkins, bodyWeights, now, days }: TrainingStateInput): TrainingState {
  const finished = sessions.filter((session) => !session.isActive);
  const chronological = sessionsNewestFirst(finished).reverse();
  const catalogList = [...catalog];
  const since = new Date(now.getTime() - days * DAY_MS);
  const events = recordEvents(chronological, catalogList);
  const weeks = weekStats(chronological, catalogList, goals, now, PROGRESS_STATS.WEEKS_FOR_STREAK, events);
  const streak = weekStreak(weeks);
  const latestWeighIn = [...bodyWeights].sort((a, b) => b.measuredOn.getTime() - a.measuredOn.getTime())[0];
  const bodyweightKg = latestWeighIn?.weightKg ?? settings.bodyWeightKg ?? null;
  const stats = exerciseStats(chronological, catalogList, now, bodyweightKg, events);
  const career = buildCareer({ history: chronological, catalog, goals, bodyWeights, settings, now });

  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const setById = new Map(chronological.flatMap((session) => session.exercises.flatMap((logged) => logged.sets.map((set) => [set.id, { set, logged }] as const))));

  return {
    generatedAt: now.toISOString(),
    timezone: "Europe/Paris",
    days,
    definitions: TRAINING_DEFINITIONS,
    weeks: weeks.slice(-WEEKS).map((week) => ({
      start: parisDate(new Date(week.start.getTime() + DAY_MS / 2)),
      inProgress: week.inProgress,
      sessions: week.sessions,
      sets: week.sets,
      scorePct: Math.round(week.score * 100),
      tier: week.tier,
      records: week.records,
    })),
    streak: { weeks: streak.weeks, jokers: streak.jokers },
    currentWeek: weekDetail(weeks.at(-1)!, chronological, catalogList, goals),
    lastWeek: weekDetail(weeks.at(-2)!, chronological, catalogList, goals),
    exercises: stats
      // Les machines pratiquées ces 28 derniers jours (salle actuelle) : au-delà, l'exercice est en pause.
      .filter((stat) => isCurrentGym(stat, now))
      .map((stat) => {
        const last = stat.points.at(-1)!;
        return {
          exercise: stat.exercise.name,
          status: stat.status,
          deltaPct: stat.delta === null ? null : round1(stat.delta * 100),
          lastDate: parisDate(stat.lastDate),
          sessions: stat.points.length,
          records: stat.records,
          lastRecordDate: stat.lastRecordDate ? parisDate(stat.lastRecordDate) : null,
          last: { weight: last.weight, reps: last.reps },
          convertedFrom: stat.conversions.map((conversion) => conversion.exercise.name),
        };
      }),
    records: events
      .filter((event) => event.date >= since)
      .map((event) => {
        const found = setById.get(event.setId);
        return {
          date: parisDate(event.date),
          sessionId: event.sessionId,
          exercise: byId.get(event.exerciseId)?.name ?? found?.logged.exerciseName ?? event.exerciseId,
          weight: found?.set.weight ?? 0,
          reps: found?.set.reps ?? 0,
        };
      })
      .reverse(),
    sessions: sessionTable({ chronological, catalog: catalogList, checkins, career, records: events, stats, since }),
  };
}
