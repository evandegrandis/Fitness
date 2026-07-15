/**
 * Conversions row Drizzle <-> types du domaine (`lib/models/types.ts`).
 * Utilisé par `queries.ts` (lecture), `actions.ts` (écriture) et
 * `scripts/seed.ts`. Centralisé ici pour ne pas dupliquer le mapping
 * imbriqué (Exercise -> muscleMappings, WorkoutSession -> exercises -> sets).
 */

import type {
  ExerciseRow,
  LoggedExerciseRow,
  LoggedSetRow,
  MuscleGoalRow,
  MuscleMappingRow,
  NewExerciseRow,
  NewLoggedExerciseRow,
  NewLoggedSetRow,
  NewMuscleGoalRow,
  NewMuscleMappingRow,
  NewRecoveryCheckinRow,
  NewSupersetGroupRow,
  NewTemplateExerciseRow,
  NewUserSettingsRow,
  NewWorkoutSessionRow,
  NewWorkoutTemplateRow,
  RecoveryCheckinRow,
  SupersetGroupRow,
  TemplateExerciseRow,
  UserSettingsRow,
  WorkoutSessionRow,
  WorkoutTemplateRow,
} from "./schema";
import { FatigueClass, SetPatternMode, SetType } from "@/lib/models/enums";
import type {
  FatigueClass as FatigueClassT,
  ProgressionPolicy,
  SetPatternMode as SetPatternModeT,
  SetType as SetTypeT,
} from "@/lib/models/enums";
import type { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type {
  Exercise,
  LoggedExercise,
  LoggedSet,
  MuscleGoal,
  MuscleMapping,
  RecoveryCheckin,
  SupersetGroup,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Helpers de coercition (les colonnes text ne sont pas validées par Postgres)
// ---------------------------------------------------------------------------

function asSetPatternMode(raw: string): SetPatternModeT {
  const values = Object.values(SetPatternMode) as string[];
  return values.includes(raw) ? (raw as SetPatternModeT) : SetPatternMode.straight;
}

function asSetType(raw: string): SetTypeT {
  const values = Object.values(SetType) as string[];
  return values.includes(raw) ? (raw as SetTypeT) : SetType.work;
}

function asProgressionPolicy(raw: string | null): ProgressionPolicy | null {
  if (!raw) return null;
  const values = ["generic", "overreachJump", "testThenPromote", "voluntaryCap"];
  return values.includes(raw) ? (raw as ProgressionPolicy) : null;
}

/** La colonne `fatigue_class` stocke la valeur interne ("heavy"/"medium"/"light"), pas le rawValue Swift H/M/L. */
function asFatigueClass(raw: string): FatigueClassT {
  const values = Object.values(FatigueClass) as string[];
  return values.includes(raw) ? (raw as FatigueClassT) : FatigueClass.medium;
}

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

export function mapExerciseRow(row: ExerciseRow, mappingRows: MuscleMappingRow[]): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    setPatternMode: asSetPatternMode(row.setPatternMode),
    repTargetMin: row.repTargetMin,
    repTargetMax: row.repTargetMax,
    smallestIncrement: row.smallestIncrement,
    isFavorite: row.isFavorite,
    createdByUser: row.createdByUser,
    sortOrder: row.sortOrder,
    suggestedRestSeconds: row.suggestedRestSeconds,
    machineSetting: row.machineSetting,
    setupNotes: row.setupNotes,
    benchmarkLow: row.benchmarkLow,
    benchmarkHigh: row.benchmarkHigh,
    fatigueClass: asFatigueClass(row.fatigueClass),
    progressionPolicy: asProgressionPolicy(row.progressionPolicy),
    voluntaryRepCap: row.voluntaryRepCap,
    muscleMappings: mappingRows
      .filter((m) => m.exerciseId === row.id)
      .map((m): MuscleMapping => ({
        muscleGroup: m.muscleGroup as MuscleGroup,
        coefficient: m.coefficient,
      })),
    lastUsed: row.lastUsed,
  };
}

export function exerciseToRow(exercise: Exercise): NewExerciseRow {
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    setPatternMode: exercise.setPatternMode,
    repTargetMin: exercise.repTargetMin,
    repTargetMax: exercise.repTargetMax,
    smallestIncrement: exercise.smallestIncrement,
    isFavorite: exercise.isFavorite,
    createdByUser: exercise.createdByUser,
    sortOrder: exercise.sortOrder,
    suggestedRestSeconds: exercise.suggestedRestSeconds,
    machineSetting: exercise.machineSetting,
    setupNotes: exercise.setupNotes,
    benchmarkLow: exercise.benchmarkLow,
    benchmarkHigh: exercise.benchmarkHigh,
    fatigueClass: exercise.fatigueClass,
    progressionPolicy: exercise.progressionPolicy,
    voluntaryRepCap: exercise.voluntaryRepCap,
    lastUsed: exercise.lastUsed,
  };
}

export function exerciseToMappingRows(exercise: Exercise): NewMuscleMappingRow[] {
  return exercise.muscleMappings.map((m, index) => ({
    id: `${exercise.id}:${m.muscleGroup}:${index}`,
    exerciseId: exercise.id,
    muscleGroup: m.muscleGroup,
    coefficient: m.coefficient,
  }));
}

// ---------------------------------------------------------------------------
// WorkoutSession (exercises -> sets, supersetGroups)
// ---------------------------------------------------------------------------

function mapLoggedSetRow(row: LoggedSetRow): LoggedSet {
  return {
    id: row.id,
    weight: row.weight,
    reps: row.reps,
    setType: asSetType(row.setType),
    timestamp: row.timestamp,
    setSlotIndex: row.setSlotIndex,
    completed: row.completed,
    supersetRoundIndex: row.supersetRoundIndex,
  };
}

function mapLoggedExerciseRow(row: LoggedExerciseRow, setRows: LoggedSetRow[]): LoggedExercise {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    notes: row.notes,
    exerciseId: row.exerciseId,
    exerciseName: row.exerciseName,
    sets: setRows
      .filter((s) => s.loggedExerciseId === row.id)
      .sort((a, b) => a.setSlotIndex - b.setSlotIndex)
      .map(mapLoggedSetRow),
    supersetGroupId: row.supersetGroupId,
  };
}

function mapSupersetGroupRow(row: SupersetGroupRow): SupersetGroup {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    memberOrder: row.memberOrder,
  };
}

/**
 * Assemble une `WorkoutSession` complète à partir des rows plates issues des
 * jointures (une session, ses logged_exercises, tous les logged_sets de ces
 * exercices, et ses superset_groups).
 */
export function mapSessionRow(
  sessionRow: WorkoutSessionRow,
  exerciseRows: LoggedExerciseRow[],
  setRows: LoggedSetRow[],
  supersetRows: SupersetGroupRow[]
): WorkoutSession {
  const exercises = exerciseRows
    .filter((e) => e.sessionId === sessionRow.id)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((e) => mapLoggedExerciseRow(e, setRows));

  const supersetGroups = supersetRows
    .filter((g) => g.sessionId === sessionRow.id)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(mapSupersetGroupRow);

  return {
    id: sessionRow.id,
    date: sessionRow.date,
    startTime: sessionRow.startTime,
    endTime: sessionRow.endTime,
    notes: sessionRow.notes,
    isActive: sessionRow.isActive,
    templateName: sessionRow.templateName,
    exercises,
    supersetGroups,
  };
}

export function sessionToRow(session: WorkoutSession): NewWorkoutSessionRow {
  return {
    id: session.id,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    notes: session.notes,
    isActive: session.isActive,
    templateName: session.templateName,
  };
}

export function sessionToSupersetRows(session: WorkoutSession): NewSupersetGroupRow[] {
  return session.supersetGroups.map((g) => ({
    id: g.id,
    sessionId: session.id,
    orderIndex: g.orderIndex,
    memberOrder: g.memberOrder,
  }));
}

export function sessionToLoggedExerciseRows(session: WorkoutSession): NewLoggedExerciseRow[] {
  return session.exercises.map((e) => ({
    id: e.id,
    sessionId: session.id,
    orderIndex: e.orderIndex,
    notes: e.notes,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    supersetGroupId: e.supersetGroupId,
  }));
}

export function sessionToLoggedSetRows(session: WorkoutSession): NewLoggedSetRow[] {
  return session.exercises.flatMap((e) =>
    e.sets.map((s) => ({
      id: s.id,
      loggedExerciseId: e.id,
      weight: s.weight,
      reps: s.reps,
      setType: s.setType,
      timestamp: s.timestamp,
      setSlotIndex: s.setSlotIndex,
      completed: s.completed,
      supersetRoundIndex: s.supersetRoundIndex,
    }))
  );
}

// ---------------------------------------------------------------------------
// MuscleGoal
// ---------------------------------------------------------------------------

export function mapGoalRow(row: MuscleGoalRow): MuscleGoal {
  return {
    parent: row.muscleParent as MuscleParent,
    weeklyGoalSets: row.weeklyGoalSets,
  };
}

export function goalToRow(goal: MuscleGoal): NewMuscleGoalRow {
  return {
    muscleParent: goal.parent,
    weeklyGoalSets: goal.weeklyGoalSets,
  };
}

// ---------------------------------------------------------------------------
// WorkoutTemplate (+ template_exercises)
// ---------------------------------------------------------------------------

export function mapTemplateRow(
  row: WorkoutTemplateRow,
  exerciseRows: TemplateExerciseRow[]
): WorkoutTemplate {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    sortOrder: row.sortOrder,
    exercises: exerciseRows
      .filter((e) => e.templateId === row.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => ({
        exerciseName: e.exerciseName,
        orderIndex: e.orderIndex,
        targetSets: e.targetSets,
      })),
  };
}

export function templateToRow(template: WorkoutTemplate): NewWorkoutTemplateRow {
  return {
    id: template.id,
    name: template.name,
    createdAt: template.createdAt,
    sortOrder: template.sortOrder,
  };
}

export function templateToExerciseRows(template: WorkoutTemplate): NewTemplateExerciseRow[] {
  return template.exercises.map((e, index) => ({
    id: `${template.id}:${index}`,
    templateId: template.id,
    exerciseName: e.exerciseName,
    orderIndex: e.orderIndex,
    targetSets: e.targetSets,
  }));
}

// ---------------------------------------------------------------------------
// UserSettings (row singleton)
// ---------------------------------------------------------------------------

export function mapSettingsRow(row: UserSettingsRow): UserSettings {
  return {
    usesKilograms: row.usesKilograms,
    defaultSmallestIncrement: row.defaultSmallestIncrement,
    defaultRestTimerSeconds: row.defaultRestTimerSeconds,
    defaultRepTargetMin: row.defaultRepTargetMin,
    defaultRepTargetMax: row.defaultRepTargetMax,
    userName: row.userName,
    supersetRestSeconds: row.supersetRestSeconds,
  };
}

export function settingsToRow(settings: UserSettings): NewUserSettingsRow {
  return {
    id: "singleton",
    usesKilograms: settings.usesKilograms,
    defaultSmallestIncrement: settings.defaultSmallestIncrement,
    defaultRestTimerSeconds: settings.defaultRestTimerSeconds,
    defaultRepTargetMin: settings.defaultRepTargetMin,
    defaultRepTargetMax: settings.defaultRepTargetMax,
    userName: settings.userName,
    supersetRestSeconds: settings.supersetRestSeconds,
  };
}

// ---------------------------------------------------------------------------
// RecoveryCheckin
// ---------------------------------------------------------------------------

export function mapRecoveryCheckinRow(row: RecoveryCheckinRow): RecoveryCheckin {
  return {
    id: row.id,
    date: row.date,
    tookCreatine: row.tookCreatine,
    proteinTargetMet: row.proteinTargetMet,
    sleepHours: row.sleepHours,
  };
}

export function recoveryCheckinToRow(checkin: RecoveryCheckin): NewRecoveryCheckinRow {
  return {
    id: checkin.id,
    date: checkin.date,
    tookCreatine: checkin.tookCreatine,
    proteinTargetMet: checkin.proteinTargetMet,
    sleepHours: checkin.sleepHours,
  };
}
