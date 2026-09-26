/**
 * Quête de la semaine (Evan, 26/09/2026) : un muscle en retard, un nombre de séries atteignable.
 *
 * Tirée des objectifs et du volume réel des 4 semaines terminées qui précèdent : elle est fixée
 * dès le lundi et ne bouge plus de la semaine. Le « maître du jeu » la dimensionne par des règles
 * fixes (habitude + 2 séries ou +25 %, +1 seulement après une semaine de nuits courtes). Rien ne
 * touche aux suggestions de charge. Jamais les avant-bras ni les obliques (sans objectif, de toute
 * façon), jamais deux semaines de suite le même muscle.
 */

import { currentWeekWindow, parentTotals } from "@/lib/engines/effective-sets";
import { MUSCLE_PARENTS, MuscleParent, parentDisplayName } from "@/lib/models/muscles";
import type { Exercise, MuscleGoal, RecoveryCheckin, WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;

export const WEEKLY_QUEST = {
  HABIT_WEEKS: 4,
  /**
   * Première semaine de quête (lundi 21/09/2026). La chaîne des quêtes part de là : chaque semaine
   * prolonge exactement celle de la semaine d'avant.
   */
  EPOCH: new Date(2026, 8, 21),
  MIN_TARGET: 3,
  STEP_SETS: 2,
  STEP_RATIO: 1.25,
  /** Retard minimal (en séries) pour mériter une quête. */
  MIN_SHORTFALL: 2,
  /** Nuit moyenne de la semaine précédente sous laquelle la quête ne demande qu'une série de plus. */
  TIRED_SLEEP_HOURS: 6.5,
} as const;

const NEVER_PUSHED: ReadonlySet<MuscleParent> = new Set([MuscleParent.forearms, MuscleParent.obliques]);

export interface WeeklyQuest {
  parent: MuscleParent;
  label: string;
  /** Séries visées cette semaine. */
  target: number;
  /** Séries efficaces faites cette semaine (séance en cours comprise). */
  done: number;
  completed: boolean;
  /** Habitude des 4 semaines précédentes, pour dire d'où part la quête. */
  habit: number;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function tiredWeekBefore(checkins: readonly RecoveryCheckin[], weekStart: Date): boolean {
  const from = addDays(weekStart, -7);
  const nights = checkins
    .filter((checkin) => checkin.date >= from && checkin.date < weekStart && checkin.sleepHours !== null)
    .map((checkin) => checkin.sleepHours!);
  if (nights.length < 3) return false;
  return nights.reduce((sum, hours) => sum + hours, 0) / nights.length < WEEKLY_QUEST.TIRED_SLEEP_HOURS;
}

/** Séries par muscle de chaque semaine civile, de `weeks` semaines avant `weekStart` jusqu'à elle (exclue). */
function weeklyTotals(history: WorkoutSession[], catalog: Exercise[], weekStart: Date, weeks: number): Map<MuscleParent, number>[] {
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(weekStart, -7 * (weeks - index));
    return parentTotals(history, catalog, start, addDays(start, 7));
  });
}

/**
 * Le muscle le plus en retard sur son objectif, à l'aune des 4 semaines qui précèdent la semaine
 * `index` de `totals` (qui en contient au moins 4 avant elle).
 */
function pick(
  totals: readonly Map<MuscleParent, number>[],
  index: number,
  goals: readonly MuscleGoal[],
  excluded: MuscleParent | null
): { parent: MuscleParent; habit: number; goal: number } | null {
  let best: { parent: MuscleParent; habit: number; goal: number; ratio: number } | null = null;
  for (const parent of MUSCLE_PARENTS) {
    if (NEVER_PUSHED.has(parent) || parent === excluded) continue;
    const goal = goals.find((candidate) => candidate.parent === parent)?.weeklyGoalSets ?? 0;
    if (goal <= 0) continue;
    const window = totals.slice(index - WEEKLY_QUEST.HABIT_WEEKS, index);
    const habit = window.reduce((sum, week) => sum + (week.get(parent) ?? 0), 0) / WEEKLY_QUEST.HABIT_WEEKS;
    if (goal - habit < WEEKLY_QUEST.MIN_SHORTFALL) continue;
    const ratio = (goal - habit) / goal;
    if (!best || ratio > best.ratio + 1e-9 || (Math.abs(ratio - best.ratio) <= 1e-9 && goal > best.goal)) {
      best = { parent, habit, goal, ratio };
    }
  }
  return best;
}

export function weeklyQuest({
  history,
  catalog,
  goals,
  checkins,
  active = null,
  now,
}: {
  history: WorkoutSession[];
  catalog: Exercise[];
  goals: readonly MuscleGoal[];
  checkins: readonly RecoveryCheckin[];
  active?: WorkoutSession | null;
  now: Date;
}): WeeklyQuest | null {
  const weekStart = currentWeekWindow(now).start;
  // La chaîne des quêtes se déroule depuis la première semaine de quête, chacune écartant le muscle
  // de la précédente : la quête d'une semaine ne dépend que du passé, et deux semaines ne se
  // suivent jamais sur le même muscle.
  const weeksSinceEpoch = Math.max(0, Math.round((weekStart.getTime() - currentWeekWindow(WEEKLY_QUEST.EPOCH).start.getTime()) / (7 * DAY_MS)));
  const totals = weeklyTotals(history, catalog, weekStart, WEEKLY_QUEST.HABIT_WEEKS + weeksSinceEpoch);
  let chosen: ReturnType<typeof pick> = null;
  for (let index = WEEKLY_QUEST.HABIT_WEEKS; index <= totals.length; index += 1) {
    chosen = pick(totals, index, goals, chosen?.parent ?? null);
  }
  if (!chosen) return null;

  const base = Math.ceil(chosen.habit - 1e-9);
  const step = tiredWeekBefore(checkins, weekStart)
    ? base + 1
    : Math.max(base + WEEKLY_QUEST.STEP_SETS, Math.ceil(chosen.habit * WEEKLY_QUEST.STEP_RATIO - 1e-9));
  const target = Math.min(chosen.goal, Math.max(WEEKLY_QUEST.MIN_TARGET, step));
  const done =
    Math.round((parentTotals(history, catalog, weekStart, addDays(weekStart, 7), active).get(chosen.parent) ?? 0) * 10) / 10;

  return {
    parent: chosen.parent,
    label: parentDisplayName[chosen.parent],
    target,
    done,
    completed: done >= target - 1e-9,
    habit: Math.round(chosen.habit * 10) / 10,
  };
}
