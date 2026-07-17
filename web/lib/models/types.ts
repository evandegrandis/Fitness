/**
 * Interfaces du domaine Jeera — miroir des `@Model` SwiftData, sans les
 * annotations SwiftData et sans relations inverses circulaires. Les relations
 * sont modélisées par ID + tableaux imbriqués, à l'image de l'export JSON
 * (`DataExporter.swift`). Les dates sont des `Date` natifs (converties depuis
 * l'ISO 8601 du backup par `lib/models/backup.ts`).
 */

import type { FatigueClass, ProgressionPolicy, SetPatternMode, SetType } from "./enums";
import { SetType as SetTypeValues } from "./enums";
import type { MuscleGroup, MuscleParent } from "./muscles";
import { LEAVES_OF_PARENT } from "./muscles";

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

export interface MuscleMapping {
  muscleGroup: MuscleGroup;
  coefficient: number;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  setPatternMode: SetPatternMode;
  repTargetMin: number;
  repTargetMax: number;
  smallestIncrement: number;
  isFavorite: boolean;
  createdByUser: boolean;
  sortOrder: number;
  suggestedRestSeconds: number;
  machineSetting: string;
  setupNotes: string;
  /** Borne basse du bandeau de référence ("score moyen d'un homme de 25 ans après 1 an"). */
  benchmarkLow: number | null;
  /** Borne haute du bandeau de référence ("naturellement atteignable"). */
  benchmarkHigh: number | null;
  fatigueClass: FatigueClass;
  /** null == .generic partout (comportement Swift : optional traité comme generic). */
  progressionPolicy: ProgressionPolicy | null;
  /** Actif seulement si progressionPolicy === "voluntaryCap". 0 == désactivé. */
  voluntaryRepCap: number;
  muscleMappings: MuscleMapping[];
  lastUsed: Date | null;
}

// ---------------------------------------------------------------------------
// LoggedSet / LoggedExercise
// ---------------------------------------------------------------------------

export interface LoggedSet {
  id: string;
  weight: number;
  reps: number;
  setType: SetType;
  timestamp: Date;
  setSlotIndex: number;
  completed: boolean;
  /** Round (1-based) à l'intérieur d'un superset. null si standalone / set pré-superset. */
  supersetRoundIndex: number | null;
}

export interface LoggedExercise {
  id: string;
  orderIndex: number;
  notes: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
  /** Groupe de superset auquel appartient cet exercice loggé, null si standalone. */
  supersetGroupId: string | null;
}

// ---------------------------------------------------------------------------
// SupersetGroup
// ---------------------------------------------------------------------------

export interface SupersetGroup {
  id: string;
  orderIndex: number;
  /** Ordre stable des LoggedExercise.id membres de ce groupe. */
  memberOrder: string[];
}

// ---------------------------------------------------------------------------
// WorkoutSession
// ---------------------------------------------------------------------------

export interface WorkoutSession {
  id: string;
  date: Date;
  startTime: Date;
  endTime: Date | null;
  notes: string;
  isActive: boolean;
  templateName: string | null;
  exercises: LoggedExercise[];
  supersetGroups: SupersetGroup[];
}

// ---------------------------------------------------------------------------
// MuscleGoal
// ---------------------------------------------------------------------------

export interface MuscleGoal {
  parent: MuscleParent;
  weeklyGoalSets: number;
}

// ---------------------------------------------------------------------------
// WorkoutTemplate
// ---------------------------------------------------------------------------

export interface WorkoutTemplate {
  id: string;
  name: string;
  createdAt: Date;
  sortOrder: number;
  exercises: {
    exerciseName: string;
    orderIndex: number;
    targetSets: number;
  }[];
}

// ---------------------------------------------------------------------------
// UserSettings / RecoveryCheckin
// ---------------------------------------------------------------------------

export interface UserSettings {
  usesKilograms: boolean;
  defaultSmallestIncrement: number;
  defaultRestTimerSeconds: number;
  defaultRepTargetMin: number;
  defaultRepTargetMax: number;
  userName: string;
  supersetRestSeconds: number;
  /** Poids de corps (kg) — utilisé par le moteur pour les exercices au poids du corps / lestés. */
  bodyWeightKg: number | null;
}

export interface RecoveryCheckin {
  id: string;
  date: Date;
  tookCreatine: boolean;
  proteinTargetMet: boolean;
  sleepHours: number;
}

// ---------------------------------------------------------------------------
// Fonctions utilitaires PURES — miroir des propriétés calculées Swift.
// Utilisées par les moteurs (lib/engines/), définies ici pour rester à côté
// des types qu'elles manipulent.
// ---------------------------------------------------------------------------

/** Miroir de `LoggedExercise.orderedSets` : sets triés par `setSlotIndex`. */
export function orderedSets(exercise: LoggedExercise): LoggedSet[] {
  return [...exercise.sets].sort((a, b) => a.setSlotIndex - b.setSlotIndex);
}

/**
 * Miroir de `LoggedExercise.workSets` : sets de travail (work, topSet,
 * backoff), triés par slot — exclut les warmups.
 */
export function workSets(exercise: LoggedExercise): LoggedSet[] {
  return orderedSets(exercise).filter(
    (set) =>
      set.setType === SetTypeValues.work ||
      set.setType === SetTypeValues.topSet ||
      set.setType === SetTypeValues.backoff
  );
}

/** Miroir de `LoggedExercise.completedWorkSets` : work sets avec `completed === true`. */
export function completedWorkSets(exercise: LoggedExercise): LoggedSet[] {
  return workSets(exercise).filter((set) => set.completed);
}

/** Miroir de `LoggedExercise.warmupSets`. */
export function warmupSets(exercise: LoggedExercise): LoggedSet[] {
  return orderedSets(exercise).filter((set) => set.setType === SetTypeValues.warmup);
}

/**
 * Miroir de `Exercise.primaryMuscle` : le mapping avec le coefficient le plus
 * élevé. `null` si aucun mapping.
 */
export function primaryMuscle(exercise: Exercise): MuscleGroup | null {
  if (exercise.muscleMappings.length === 0) return null;
  return exercise.muscleMappings.reduce((best, current) =>
    current.coefficient > best.coefficient ? current : best
  ).muscleGroup;
}

/** Miroir de `Exercise.primaryParent` : parent du `primaryMuscle`. */
export function primaryParent(exercise: Exercise): MuscleParent | null {
  const muscle = primaryMuscle(exercise);
  if (!muscle) return null;
  // Import différé pour éviter un cycle — LEAF_TO_PARENT est déjà importé plus haut.
  return leafToParentOf(muscle);
}

function leafToParentOf(leaf: MuscleGroup): MuscleParent {
  // Recherche directe via LEAVES_OF_PARENT (évite une deuxième table dupliquée).
  for (const parent of Object.keys(LEAVES_OF_PARENT) as MuscleParent[]) {
    if (LEAVES_OF_PARENT[parent].includes(leaf)) return parent;
  }
  throw new Error(`Unmapped leaf muscle: ${leaf}`);
}

/**
 * Miroir de `Exercise.mappings(for:)` : coefficient pour une feuille précise,
 * 0 si l'exercice ne la mappe pas.
 */
export function mappingCoefficient(exercise: Exercise, muscleGroup: MuscleGroup): number {
  return exercise.muscleMappings.find((m) => m.muscleGroup === muscleGroup)?.coefficient ?? 0;
}

/**
 * Miroir de `Exercise.aggregateCoefficient(for:)` : max des coefficients des
 * feuilles de cet exercice appartenant au parent donné (0 si aucune). Le max
 * (et non la somme) évite de compter deux fois un synergiste (ex: triceps
 * compté à la fois pour push et pour triceps).
 */
export function aggregateCoefficient(exercise: Exercise, parent: MuscleParent): number {
  const leaves = LEAVES_OF_PARENT[parent];
  const coefficients = exercise.muscleMappings
    .filter((m) => leaves.includes(m.muscleGroup))
    .map((m) => m.coefficient);
  return coefficients.length > 0 ? Math.max(...coefficients) : 0;
}
