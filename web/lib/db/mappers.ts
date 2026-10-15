/**
 * Conversions row Drizzle <-> types du domaine (`lib/models/types.ts`).
 * Utilisé par `queries.ts` (lecture), `actions.ts` (écriture) et
 * `scripts/seed.ts`. Centralisé ici pour ne pas dupliquer le mapping
 * imbriqué (Exercise -> muscleMappings, WorkoutSession -> exercises -> sets).
 */

import type {
  CardioEntryRow,
  ExerciseRow,
  LoggedExerciseRow,
  LoggedSetRow,
  MuscleGoalRow,
  MuscleMappingRow,
  NewExerciseRow,
  NewCardioEntryRow,
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
import { BenchmarkUnit, FatigueClass, MovementPattern, PLATEAU_WEAK_POINTS, ResistanceProfile, SetPatternMode, SetType, STOP_REASONS, TRAINING_PHASES } from "@/lib/models/enums";
import type {
  BenchmarkUnit as BenchmarkUnitT,
  FatigueClass as FatigueClassT,
  MovementPattern as MovementPatternT,
  PlateauWeakPoint,
  ProgressionPolicy,
  ResistanceProfile as ResistanceProfileT,
  SetPatternMode as SetPatternModeT,
  SetType as SetTypeT,
  StopReason,
  TrainingPhase,
} from "@/lib/models/enums";
import type { MuscleGroup, MuscleParent } from "@/lib/models/muscles";
import type {
  CardioEntry,
  CardioActivityType,
  Exercise,
  LoggedExercise,
  LoggedSet,
  MuscleGoal,
  MuscleMapping,
  ProfileSource,
  RecoveryCheckin,
  RecoveryCheckinInput,
  SupersetGroup,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
  SetTechnique,
} from "@/lib/models/types";
import { CARDIO_ACTIVITY_TYPES, SET_TECHNIQUES } from "@/lib/models/types";
import { withKnownMuscleProfile } from "@/lib/data/catalog-muscle-profiles";

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

function asNullableSetType(raw: string | null): SetTypeT | null {
  if (!raw) return null;
  const values = Object.values(SetType) as string[];
  return values.includes(raw) ? (raw as SetTypeT) : null;
}

function asSetTechnique(raw: string | null): SetTechnique | null {
  if (!raw) return null;
  return (SET_TECHNIQUES as readonly string[]).includes(raw) ? (raw as SetTechnique) : null;
}

function asTrainingPhase(raw: string | null): TrainingPhase | null {
  if (!raw) return null;
  return (TRAINING_PHASES as readonly string[]).includes(raw) ? (raw as TrainingPhase) : null;
}

function asStopReason(raw: string | null): StopReason | null {
  if (!raw) return null;
  return (STOP_REASONS as readonly string[]).includes(raw) ? (raw as StopReason) : null;
}

function asReportedRir(raw: number | null): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const clamped = Math.round(raw);
  if (clamped < 0 || clamped > 4) return null;
  return clamped;
}

function asCardioActivityType(raw: string): CardioActivityType {
  return (CARDIO_ACTIVITY_TYPES as readonly string[]).includes(raw)
    ? (raw as CardioActivityType)
    : "other";
}

function asProgressionPolicy(raw: string | null): ProgressionPolicy | null {
  if (!raw) return null;
  const values = ["generic", "overreachJump", "testThenPromote", "voluntaryCap"];
  return values.includes(raw) ? (raw as ProgressionPolicy) : null;
}

/** VARIATION_CYCLING_SPEC §5/§9 — colonne nullable, valeur inconnue/absente -> null (dégradation gracieuse). */
function asMovementPattern(raw: string | null): MovementPatternT | null {
  if (!raw) return null;
  const values = Object.values(MovementPattern) as string[];
  return values.includes(raw) ? (raw as MovementPatternT) : null;
}

/** VARIATION_CYCLING_SPEC §5.2/§9 (P2.1) — colonne nullable, valeur inconnue/absente -> null. */
function asResistanceProfile(raw: string | null): ResistanceProfileT | null {
  if (!raw) return null;
  const values = Object.values(ResistanceProfile) as string[];
  return values.includes(raw) ? (raw as ResistanceProfileT) : null;
}

/** VARIATION_CYCLING_SPEC §5.3/§9 (P2.1) — colonne nullable, valeur inconnue/absente -> null. */
function asPlateauWeakPoint(raw: string | null): PlateauWeakPoint | null {
  if (!raw) return null;
  const values = PLATEAU_WEAK_POINTS as readonly string[];
  return values.includes(raw) ? (raw as PlateauWeakPoint) : null;
}

/** BENCHMARK_LEVEL_SPEC.md §1/§9 (P3.1) — colonne nullable, valeur inconnue/absente -> null. */
function asBenchmarkUnit(raw: string | null): BenchmarkUnitT | null {
  if (!raw) return null;
  const values = Object.values(BenchmarkUnit) as string[];
  return values.includes(raw) ? (raw as BenchmarkUnitT) : null;
}

/** La colonne `fatigue_class` stocke la valeur interne ("heavy"/"medium"/"light"), pas le rawValue Swift H/M/L. */
function asFatigueClass(raw: string): FatigueClassT {
  const values = Object.values(FatigueClass) as string[];
  return values.includes(raw) ? (raw as FatigueClassT) : FatigueClass.medium;
}

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

const PROFILE_SOURCES = new Set<string>(["legacy", "known_profile", "donor", "barbis", "user"]);

function asProfileSource(value: string | null | undefined): ProfileSource | null {
  return value && PROFILE_SOURCES.has(value) ? (value as ProfileSource) : null;
}

export function mapExerciseRow(row: ExerciseRow, mappingRows: MuscleMappingRow[]): Exercise {
  return withKnownMuscleProfile({
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
    maxLoad: row.maxLoad ?? null,
    loadOffset: row.loadOffset ?? null,
    profileSource: asProfileSource(row.profileSource),
    equivalenceKey: row.equivalenceKey ?? null,
    muscleMappings: mappingRows
      .filter((m) => m.exerciseId === row.id)
      .map((m): MuscleMapping => ({
        muscleGroup: m.muscleGroup as MuscleGroup,
        coefficient: m.coefficient,
      })),
    lastUsed: row.lastUsed,
    movementPattern: asMovementPattern(row.movementPattern),
    resistanceProfile: asResistanceProfile(row.resistanceProfile),
    strengthStandardKey: row.strengthStandardKey ?? null,
    benchmarkUnit: asBenchmarkUnit(row.benchmarkUnit),
  });
}

/**
 * Colonnes qu'une édition utilisateur d'exercice peut réellement modifier.
 * `lastUsed` est volontairement absent : cette valeur est dérivée des séries
 * complétées et recalculée par les mutations de séance, jamais pilotée par un
 * snapshot potentiellement ancien du catalogue client.
 */
export function exerciseToUpsertUpdateRow(
  exercise: Exercise
): Omit<NewExerciseRow, "lastUsed"> {
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
    maxLoad: exercise.maxLoad ?? null,
    loadOffset: exercise.loadOffset ?? null,
    profileSource: exercise.profileSource ?? null,
    equivalenceKey: exercise.equivalenceKey ?? null,
    movementPattern: exercise.movementPattern,
    resistanceProfile: exercise.resistanceProfile,
    strengthStandardKey: exercise.strengthStandardKey,
    benchmarkUnit: exercise.benchmarkUnit,
  };
}

/** L'INSERT initial conserve la date importée; les UPDATE ne la touchent pas. */
export function exerciseToRow(exercise: Exercise): NewExerciseRow {
  return {
    ...exerciseToUpsertUpdateRow(exercise),
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
// WorkoutSession (exercises -> sets, supersetGroups, cardioEntries)
// ---------------------------------------------------------------------------

export function mapCardioEntryRow(row: CardioEntryRow): CardioEntry {
  return {
    id: row.id,
    activityType: asCardioActivityType(row.activityType),
    activityName: row.activityName,
    machineName: row.machineName,
    machineModel: row.machineModel,
    durationSeconds: row.durationSeconds,
    level: row.level,
    resistance: row.resistance,
    distanceKm: row.distanceKm,
    averageWatts: row.averageWatts,
    averageHeartRateBpm: row.averageHeartRateBpm,
    inclinePercent: row.inclinePercent,
    orderIndex: row.orderIndex,
  };
}

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
    suggestedWeight: row.suggestedWeight,
    suggestedReps: row.suggestedReps,
    predictedRepsAtActualWeight: row.predictedRepsAtActualWeight,
    suggestedSetType: asNullableSetType(row.suggestedSetType),
    suggestionMode: row.suggestionMode,
    suggestionReasonCodes: Array.isArray(row.suggestionReasonCodes)
      ? row.suggestionReasonCodes.filter((code): code is string => typeof code === "string")
      : [],
    suggestionEngineVersion: row.suggestionEngineVersion,
    logicalSetId: row.logicalSetId,
    setTechnique: asSetTechnique(row.setTechnique),
    reportedRir: asReportedRir(row.reportedRir),
    stopReason: asStopReason(row.stopReason),
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
    plateauWeakPoint: asPlateauWeakPoint(row.plateauWeakPoint),
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
 * exercices, ses superset_groups et ses cardio_entries).
 */
export function mapSessionRow(
  sessionRow: WorkoutSessionRow,
  exerciseRows: LoggedExerciseRow[],
  setRows: LoggedSetRow[],
  supersetRows: SupersetGroupRow[],
  cardioRows: CardioEntryRow[] = []
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
    cardioEntries: cardioRows
      .filter((entry) => entry.sessionId === sessionRow.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(mapCardioEntryRow),
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

export function sessionToCardioEntryRows(session: WorkoutSession): NewCardioEntryRow[] {
  return (session.cardioEntries ?? []).map((entry) => ({
    id: entry.id,
    sessionId: session.id,
    activityType: entry.activityType,
    activityName: entry.activityName,
    machineName: entry.machineName,
    machineModel: entry.machineModel,
    durationSeconds: entry.durationSeconds,
    level: entry.level,
    resistance: entry.resistance,
    distanceKm: entry.distanceKm,
    averageWatts: entry.averageWatts,
    averageHeartRateBpm: entry.averageHeartRateBpm,
    inclinePercent: entry.inclinePercent,
    orderIndex: entry.orderIndex,
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
    plateauWeakPoint: e.plateauWeakPoint,
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
      suggestedWeight: s.suggestedWeight ?? null,
      suggestedReps: s.suggestedReps ?? null,
      predictedRepsAtActualWeight: s.predictedRepsAtActualWeight ?? null,
      suggestedSetType: s.suggestedSetType ?? null,
      suggestionMode: s.suggestionMode ?? null,
      suggestionReasonCodes: s.suggestionReasonCodes ?? [],
      suggestionEngineVersion: s.suggestionEngineVersion ?? null,
      logicalSetId: s.logicalSetId ?? null,
      setTechnique: s.setTechnique ?? null,
      reportedRir: s.reportedRir ?? null,
      stopReason: s.stopReason ?? null,
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
    bodyWeightKg: row.bodyWeightKg ?? null,
    gender: row.gender === "male" || row.gender === "female" ? row.gender : null,
    ageYears: row.ageYears ?? null,
    trainingPhase: asTrainingPhase(row.trainingPhase),
    trainingPhaseStartedAt: row.trainingPhaseStartedAt ?? null,
    weeklyCardioMinutesGoal: row.weeklyCardioMinutesGoal ?? null,
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
    bodyWeightKg: settings.bodyWeightKg,
    gender: settings.gender,
    ageYears: settings.ageYears,
    trainingPhase: settings.trainingPhase,
    trainingPhaseStartedAt: settings.trainingPhaseStartedAt,
    weeklyCardioMinutesGoal: settings.weeklyCardioMinutesGoal,
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
    hadAlcohol: row.hadAlcohol,
  };
}

export function recoveryCheckinToRow(checkin: RecoveryCheckinInput): NewRecoveryCheckinRow {
  return {
    id: checkin.id,
    date: checkin.date,
    tookCreatine: checkin.tookCreatine,
    proteinTargetMet: checkin.proteinTargetMet,
    sleepHours: checkin.sleepHours,
    hadAlcohol: checkin.hadAlcohol,
  };
}
