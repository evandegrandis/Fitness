/**
 * Agrégation "effective sets" par muscle, miroir exact de
 * `Jeera/Engines/EffectiveSetsEngine.swift`.
 *
 * Source de vérité unique pour la couverture musculaire. Deux fenêtres :
 *   - Roulante 7 jours → boucle de guidance principale (accueil, chips, statut).
 *   - Semaine calendaire → uniquement pour l'historique, jamais pour décider.
 */

import { LEAVES_OF_PARENT, MUSCLE_PARENTS, parentDisplayName, type MuscleGroup, type MuscleParent } from "@/lib/models/muscles";
import {
  aggregateCoefficient,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";

// ---------------------------------------------------------------------------
// Statut de couverture
// ---------------------------------------------------------------------------

/** Miroir de `CoverageStatus` (Swift). Labels calmes, sans framing d'échec. */
export type CoverageStatus = "covered" | "onTrack" | "toStrengthen" | "priority";

export const coverageStatusLabel: Record<CoverageStatus, string> = {
  covered: "Couvert",
  onTrack: "En bonne voie",
  toStrengthen: "À renforcer",
  priority: "Prioritaire",
};

export const coverageStatusAccent: Record<CoverageStatus, string> = {
  covered: "green",
  onTrack: "blue",
  toStrengthen: "orange",
  priority: "red",
};

// ---------------------------------------------------------------------------
// Progrès d'un groupe parent
// ---------------------------------------------------------------------------

/** Miroir de `ParentMuscleProgress` (Swift), avec les propriétés calculées. */
export interface ParentMuscleProgress {
  parent: MuscleParent;
  effectiveSets: number;
  goalSets: number;
  /** min(effectiveSets / goalSets, 1). 0 si goalSets == 0. */
  coverage: number;
  /** Int(round(coverage * 100)). */
  percentDisplay: number;
  /** max(0, goalSets - effectiveSets). */
  remaining: number;
  status: CoverageStatus;
}

function computeStatus(effectiveSets: number, goalSets: number): CoverageStatus {
  if (goalSets === 0) return "covered";
  const c = effectiveSets / goalSets;
  if (c >= 1.0) return "covered";
  if (c >= 0.7) return "onTrack";
  if (c >= 0.4) return "toStrengthen";
  return "priority";
}

/** Construit un `ParentMuscleProgress` complet à partir des bruts (effectiveSets, goalSets). */
function buildProgress(parent: MuscleParent, effectiveSets: number, goalSets: number): ParentMuscleProgress {
  const coverage = goalSets > 0 ? Math.min(effectiveSets / goalSets, 1.0) : 0;
  const percentDisplay = Math.round(coverage * 100);
  const remaining = Math.max(0, goalSets - effectiveSets);
  const status = computeStatus(effectiveSets, goalSets);
  return { parent, effectiveSets, goalSets, coverage, percentDisplay, remaining, status };
}

// ---------------------------------------------------------------------------
// Dates locales (miroir de `Calendar.current.startOfDay` / `date(byAdding:.day)`)
// ---------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Effective sets pour un LoggedExercise unique
// ---------------------------------------------------------------------------

/**
 * Miroir de `EffectiveSetsEngine.leafSets(for:)`. `exercise` doit être résolu
 * séparément côté web (pas de relation SwiftData) — passé explicitement.
 */
export function leafSets(loggedExercise: LoggedExercise, exercise: Exercise | undefined): Map<MuscleGroup, number> {
  const result = new Map<MuscleGroup, number>();
  if (!exercise) return result;
  const completed = physiologicalSetUnits(loggedExercise.sets, {
    increment: exercise.smallestIncrement,
  });
  if (completed <= 0) return result;
  for (const mapping of exercise.muscleMappings) {
    result.set(mapping.muscleGroup, (result.get(mapping.muscleGroup) ?? 0) + completed * mapping.coefficient);
  }
  return result;
}

/**
 * Miroir de `EffectiveSetsEngine.parentSets(for:)`. Chaque logged exercise
 * contribue `max(coefficient)` de ses feuilles par parent — jamais de double
 * comptage dans le même parent.
 */
export function parentSets(loggedExercise: LoggedExercise, exercise: Exercise | undefined): Map<MuscleParent, number> {
  const result = new Map<MuscleParent, number>();
  if (!exercise) return result;
  const completed = physiologicalSetUnits(loggedExercise.sets, {
    increment: exercise.smallestIncrement,
  });
  if (completed <= 0) return result;
  for (const parent of MUSCLE_PARENTS) {
    const coeff = aggregateCoefficient(exercise, parent);
    if (coeff > 0) {
      result.set(parent, completed * coeff);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Résolution d'exercice — helper interne
// ---------------------------------------------------------------------------

/** Index par exerciseId pour résoudre `Exercise` depuis `LoggedExercise.exerciseId`. */
function indexExercises(exercises: Exercise[]): Map<string, Exercise> {
  return new Map(exercises.map((e) => [e.id, e]));
}

// ---------------------------------------------------------------------------
// Totaux
// ---------------------------------------------------------------------------

/**
 * Miroir de `EffectiveSetsEngine.parentTotals`. Total des sets effectifs
 * niveau parent pour les sessions dans [windowStart, windowEnd) (fenêtre
 * demi-ouverte). Si `liveSession` est fournie et sa date est dans la
 * fenêtre, ses sets en cours sont comptés en direct.
 */
export function parentTotals(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  windowStart: Date,
  windowEnd: Date,
  liveSession?: WorkoutSession | null
): Map<MuscleParent, number> {
  const exerciseIndex = indexExercises(exercises);
  const inRange = sessions.filter((s) => !s.isActive && s.date >= windowStart && s.date < windowEnd);

  const totals = new Map<MuscleParent, number>();
  const accumulate = (session: WorkoutSession) => {
    for (const logged of session.exercises) {
      const exercise = exerciseIndex.get(logged.exerciseId);
      for (const [p, v] of parentSets(logged, exercise)) {
        totals.set(p, (totals.get(p) ?? 0) + v);
      }
    }
  };

  for (const s of inRange) accumulate(s);
  if (liveSession && liveSession.date >= windowStart && liveSession.date < windowEnd) {
    accumulate(liveSession);
  }
  return totals;
}

/** Miroir de `EffectiveSetsEngine.leafTotals`. */
export function leafTotals(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  windowStart: Date,
  windowEnd: Date,
  liveSession?: WorkoutSession | null
): Map<MuscleGroup, number> {
  const exerciseIndex = indexExercises(exercises);
  const inRange = sessions.filter((s) => !s.isActive && s.date >= windowStart && s.date < windowEnd);

  const totals = new Map<MuscleGroup, number>();
  const accumulate = (session: WorkoutSession) => {
    for (const logged of session.exercises) {
      const exercise = exerciseIndex.get(logged.exerciseId);
      for (const [leaf, v] of leafSets(logged, exercise)) {
        totals.set(leaf, (totals.get(leaf) ?? 0) + v);
      }
    }
  };

  for (const s of inRange) accumulate(s);
  if (liveSession && liveSession.date >= windowStart && liveSession.date < windowEnd) {
    accumulate(liveSession);
  }
  return totals;
}

/** Fenêtre roulante 7 jours demi-ouverte se terminant à `referenceDate` (inclus). */
function rolling7DayWindow(referenceDate: Date): { start: Date; end: Date } {
  const end = addDays(startOfDay(referenceDate), 1);
  const start = addDays(end, -7);
  return { start, end };
}

/**
 * Miroir de `EffectiveSetsEngine.rolling7DayLeafBreakdown`. Répartition
 * niveau feuille pour la fenêtre roulante 7 jours, filtrée à un parent donné.
 */
export function rolling7DayLeafBreakdown(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  parent: MuscleParent,
  referenceDate: Date = new Date(),
  liveSession?: WorkoutSession | null
): { leaf: MuscleGroup; sets: number }[] {
  const { start, end } = rolling7DayWindow(referenceDate);
  const totals = leafTotals(sessions, exercises, start, end, liveSession);
  return LEAVES_OF_PARENT[parent]
    .map((leaf) => ({ leaf, sets: totals.get(leaf) ?? 0 }))
    .sort((a, b) => b.sets - a.sets);
}

// ---------------------------------------------------------------------------
// Progrès roulant 7 jours (boucle de guidance PRINCIPALE)
// ---------------------------------------------------------------------------

function goalMapOf(goals: MuscleGoal[]): Map<MuscleParent, number> {
  const map = new Map<MuscleParent, number>();
  for (const g of goals) {
    map.set(g.parent, g.weeklyGoalSets);
  }
  return map;
}

/**
 * Miroir de `EffectiveSetsEngine.rolling7DayProgress`. Couverture niveau
 * parent sur les 7 derniers jours se terminant à `referenceDate`. Le modèle
 * canonique "que faire aujourd'hui ?".
 */
export function rolling7DayProgress(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  goals: MuscleGoal[],
  referenceDate: Date = new Date(),
  liveSession?: WorkoutSession | null
): ParentMuscleProgress[] {
  const { start, end } = rolling7DayWindow(referenceDate);
  const totals = parentTotals(sessions, exercises, start, end, liveSession);
  const goalMap = goalMapOf(goals);

  const result: ParentMuscleProgress[] = [];
  for (const parent of MUSCLE_PARENTS) {
    const goal = goalMap.get(parent) ?? 0;
    const current = totals.get(parent) ?? 0;
    if (goal <= 0 && current <= 0) continue;
    result.push(buildProgress(parent, current, goal));
  }
  return result;
}

/**
 * Miroir de `EffectiveSetsEngine.rolling7DayGlobalCoverage`. Moyenne
 * pondérée de la couverture par parent (plafonnée à 1.0) sur tous les
 * parents à objectif non nul. 0..1.
 */
export function rolling7DayGlobalCoverage(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  goals: MuscleGoal[],
  referenceDate: Date = new Date(),
  liveSession?: WorkoutSession | null
): number {
  const progress = rolling7DayProgress(sessions, exercises, goals, referenceDate, liveSession);
  const withGoals = progress.filter((p) => p.goalSets > 0);
  if (withGoals.length === 0) return 0;
  const totalGoal = withGoals.reduce((acc, p) => acc + p.goalSets, 0);
  if (totalGoal <= 0) return 0;
  const weighted = withGoals.reduce((acc, p) => acc + Math.min(p.effectiveSets, p.goalSets), 0);
  return weighted / totalGoal;
}

// ---------------------------------------------------------------------------
// Agrégats semaine calendaire (historique uniquement)
// ---------------------------------------------------------------------------

/**
 * Miroir de `EffectiveSetsEngine.coverageForWeek`. Couverture pour une
 * semaine calendaire (Lun-Dim). Utilisé uniquement pour les en-têtes de
 * section d'historique — jamais pour décider.
 */
export function coverageForWeek(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  goals: MuscleGoal[],
  weekStart: Date
): number {
  const weekEnd = addDays(weekStart, 7);
  const totals = parentTotals(sessions, exercises, weekStart, weekEnd);
  const goalMap = goalMapOf(goals);
  const goalParents = [...goalMap.entries()].filter(([, v]) => v > 0);
  if (goalParents.length === 0) return 0;
  const totalGoal = goalParents.reduce((acc, [, v]) => acc + v, 0);
  const weighted = goalParents.reduce((acc, [parent, goal]) => acc + Math.min(totals.get(parent) ?? 0, goal), 0);
  return weighted / totalGoal;
}

/** Miroir de `EffectiveSetsEngine.parentsWorkedInWeek`. */
export function parentsWorkedInWeek(sessions: WorkoutSession[], exercises: Exercise[], weekStart: Date): number {
  const weekEnd = addDays(weekStart, 7);
  const totals = parentTotals(sessions, exercises, weekStart, weekEnd);
  let count = 0;
  for (const v of totals.values()) {
    if (v > 0) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Ligne de statut (framing roulant 7 jours)
// ---------------------------------------------------------------------------

/** Miroir de `EffectiveSetsEngine.rollingStatusLine`. */
export function rollingStatusLine(
  progress: ParentMuscleProgress[],
  sessions: WorkoutSession[],
  _referenceDate: Date = new Date()
): string {
  void _referenceDate;
  const withGoals = progress.filter((p) => p.goalSets > 0);
  if (withGoals.length === 0) return "Pas encore d'objectifs configurés";

  const totalGoal = withGoals.reduce((acc, p) => acc + p.goalSets, 0);
  const covered = withGoals.reduce((acc, p) => acc + Math.min(p.effectiveSets, p.goalSets), 0);
  const pct = Math.round((covered / totalGoal) * 100);

  const priorities = withGoals
    .filter((p) => p.status === "priority" || p.status === "toStrengthen")
    .sort((a, b) => b.remaining - a.remaining);

  if (priorities.length === 0) {
    return `Couverture ${pct}% sur 7 jours — tu es dans ta zone`;
  }
  const names = priorities
    .slice(0, 2)
    .map((p) => parentDisplayName[p.parent].toLowerCase())
    .join(" et ");
  if (pct >= 70) {
    return `Couverture ${pct}% — focus ${names}`;
  }
  return `Couverture ${pct}% sur 7 jours — ${names} à renforcer`;
}

// ---------------------------------------------------------------------------
// Muscles prioritaires (bandeau de chips & recommandation)
// ---------------------------------------------------------------------------

/**
 * Miroir de `EffectiveSetsEngine.rollingPriorities`. Priorité des parents sur
 * la fenêtre roulante 7 jours, ordonnée par nombre de sets manquants. Les
 * muscles à objectif entièrement couvert sont exclus.
 */
export function rollingPriorities(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  goals: MuscleGoal[],
  referenceDate: Date = new Date(),
  liveSession?: WorkoutSession | null
): [MuscleParent, number][] {
  const progress = rolling7DayProgress(sessions, exercises, goals, referenceDate, liveSession);
  return progress
    .filter((p) => p.goalSets > 0 && p.remaining >= 0.5)
    .sort((a, b) => b.remaining - a.remaining)
    .map((p) => [p.parent, p.remaining] as [MuscleParent, number]);
}

// ---------------------------------------------------------------------------
// Impact en direct
// ---------------------------------------------------------------------------

/**
 * Miroir de `EffectiveSetsEngine.liveParentImpact`. Impact niveau parent en
 * direct d'un seul exercice étant donné son nombre de sets complétés. Utilisé
 * par la carte de séance active pour afficher "+1 Pecs".
 */
export function liveParentImpact(exercise: Exercise, completedSets: number): Map<MuscleParent, number> {
  const result = new Map<MuscleParent, number>();
  for (const parent of MUSCLE_PARENTS) {
    const c = aggregateCoefficient(exercise, parent);
    if (c > 0) {
      result.set(parent, completedSets * c);
    }
  }
  return result;
}

/**
 * Variante à privilégier dès que l'appelant possède les sets eux-mêmes : elle
 * évite que deux mini-blocs d'un drop-set apparaissent comme "+2" en direct.
 * `liveParentImpact(exercise, number)` reste compatible pour les appelants qui
 * n'ont encore qu'un compteur agrégé.
 */
export function liveParentImpactForSets(exercise: Exercise, sets: LoggedSet[]): Map<MuscleParent, number> {
  return liveParentImpact(
    exercise,
    physiologicalSetUnits(sets, { increment: exercise.smallestIncrement })
  );
}
