/**
 * Validation + parsing du format d'export JSON Jeera (versions 1 à 4), dont
 * le socle est produit par `Jeera/Utilities/DataExporter.swift::exportAll`. Les
 * schémas Zod ci-dessous suivent EXACTEMENT les structs Codable Swift
 * (`ExerciseData`, `SessionData`, `LoggedExerciseData`, `LoggedSetData`,
 * `SupersetGroupData`, `TemplateData`, `GoalData`, `SettingsData`).
 *
 * `parseBackup` valide puis convertit vers les types du domaine
 * (`lib/models/types.ts`) :
 *   - dates ISO 8601 -> `Date`
 *   - muscleGroup inconnu -> `legacyMuscleMapping`
 *   - goal.muscleGroup (rawValue parent OU ancienne feuille) -> `MuscleParent`
 *   - supersetGroups[].memberIDs -> memberOrder
 *   - valeurs manquantes -> défauts (miroir de `DataExporter.importAll`)
 */

import { z } from "zod";

import { BenchmarkUnit, fatigueClassFromRaw, MovementPattern, PLATEAU_WEAK_POINTS, ResistanceProfile, SetPatternMode, SetType, STOP_REASONS, TRAINING_PHASES } from "./enums";
import type {
  BenchmarkUnit as BenchmarkUnitT,
  FatigueClass,
  MovementPattern as MovementPatternT,
  PlateauWeakPoint,
  ProgressionPolicy,
  ResistanceProfile as ResistanceProfileT,
  StopReason,
  TrainingPhase,
} from "./enums";
import { LEAF_TO_PARENT, legacyMuscleMapping, MuscleGroup, MuscleParent } from "./muscles";
import type {
  BodyWeightEntry,
  CardioActivityType,
  CardioEntry,
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
  SetTechnique,
} from "./types";
import { CARDIO_ACTIVITY_TYPES, SET_TECHNIQUES, sessionsNewestFirst } from "./types";
import type { WorkoutMode } from "@/lib/theme/modes";

// ---------------------------------------------------------------------------
// Schémas Zod — miroir des structs Codable Swift (DataExporter.swift)
// ---------------------------------------------------------------------------

const finiteNumber = z.number().finite();
const isoDateString = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Date ISO invalide");
export const CURRENT_BACKUP_VERSION = 4;
const workoutModeSchema = z.enum(["normal", "beast", "monk"]);

const muscleMappingSchema = z.object({
  muscleGroup: z.string(),
  coefficient: finiteNumber.min(0).max(1),
});

const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  setPatternMode: z.string(),
  repTargetMin: finiteNumber.int().positive(),
  repTargetMax: finiteNumber.int().positive(),
  smallestIncrement: finiteNumber.nonnegative(),
  isFavorite: z.boolean(),
  createdByUser: z.boolean(),
  sortOrder: finiteNumber.int(),
  suggestedRestSeconds: finiteNumber.int().nonnegative(),
  lastUsed: isoDateString.nullish(),
  machineSetting: z.string().nullish(),
  setupNotes: z.string().nullish(),
  benchmarkLow: finiteNumber.nullish(),
  benchmarkHigh: finiteNumber.nullish(),
  fatigueClass: z.string().nullish(),
  // Pas toujours présents dans l'export (ajoutés après coup côté modèle Swift) :
  progressionPolicy: z.string().nullish(),
  voluntaryRepCap: finiteNumber.int().nonnegative().nullish(),
  muscleMappings: z.array(muscleMappingSchema),
  // VARIATION_CYCLING_SPEC §5 — champ web-only, absent de tous les exports Swift existants.
  movementPattern: z.string().nullish(),
  // VARIATION_CYCLING_SPEC §5.2 (P2.1) — idem, champ web-only.
  resistanceProfile: z.string().nullish(),
  // BENCHMARK_LEVEL_SPEC.md §1 (P3.1) — idem, champ web-only.
  strengthStandardKey: z.string().nullish(),
  benchmarkUnit: z.string().nullish(),
});

const goalSchema = z.object({
  muscleGroup: z.string(),
  weeklyGoalSets: finiteNumber.nonnegative(),
});

const settingsSchema = z.object({
  usesKilograms: z.boolean(),
  defaultSmallestIncrement: finiteNumber.positive(),
  defaultRestTimerSeconds: finiteNumber.int().positive(),
  defaultRepTargetMin: finiteNumber.int().positive(),
  defaultRepTargetMax: finiteNumber.int().positive(),
  userName: z.string().nullish(),
  supersetRestSeconds: finiteNumber.int().positive().nullish(),
  bodyWeightKg: finiteNumber.positive().nullish(),
  gender: z.enum(["male", "female"]).nullish(),
  ageYears: finiteNumber.int().min(10).max(120).nullish(),
  // Absents des exports antérieurs : nullish pour rester rétrocompatible (§9).
  trainingPhase: z.enum(TRAINING_PHASES).nullish(),
  trainingPhaseStartedAt: z.union([z.string(), z.date()]).nullish(),
});

const loggedSetSchema = z.object({
  // Optionnel pour les anciens exports Swift; v3 le préserve pour un round-trip exact.
  id: z.string().min(1).nullish(),
  weight: finiteNumber.nonnegative(),
  reps: finiteNumber.int().nonnegative(),
  setType: z.string(),
  timestamp: isoDateString,
  setSlotIndex: finiteNumber.int().nonnegative(),
  completed: z.boolean(),
  supersetRoundIndex: finiteNumber.int().positive().nullish(),
  suggestedWeight: finiteNumber.nonnegative().nullish(),
  suggestedReps: finiteNumber.int().nonnegative().nullish(),
  predictedRepsAtActualWeight: finiteNumber.int().nonnegative().nullish(),
  suggestedSetType: z.string().nullish(),
  suggestionMode: z.string().nullish(),
  suggestionReasonCodes: z.array(z.string()).default([]),
  suggestionEngineVersion: z.string().nullish(),
  logicalSetId: z.string().min(1).nullish(),
  setTechnique: z.enum(SET_TECHNIQUES).nullish(),
  reportedRir: finiteNumber.int().min(0).max(4).nullish(),
  stopReason: z.enum(STOP_REASONS).nullish(),
});

const loggedExerciseSchema = z.object({
  id: z.string().nullish(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  orderIndex: finiteNumber.int().nonnegative(),
  notes: z.string(),
  isLinkedToNext: z.boolean().nullish(),
  sets: z.array(loggedSetSchema),
  // VARIATION_CYCLING_SPEC §5.3 (P2.1) — champ web-only, capture 1-tap "où ça a calé ?".
  plateauWeakPoint: z.string().nullish(),
});

const supersetGroupSchema = z.object({
  id: z.string(),
  orderIndex: finiteNumber.int().nonnegative(),
  memberIDs: z.array(z.string()),
});

const cardioEntrySchema = z.object({
  id: z.string(),
  activityType: z.enum(CARDIO_ACTIVITY_TYPES).nullish(),
  activityName: z.string(),
  machineName: z.string().nullish(),
  machineModel: z.string().nullish(),
  durationSeconds: finiteNumber.int().positive(),
  level: finiteNumber.int().nonnegative().nullish(),
  resistance: finiteNumber.nonnegative().nullish(),
  distanceKm: finiteNumber.nonnegative().nullish(),
  averageWatts: finiteNumber.nonnegative().nullish(),
  averageHeartRateBpm: finiteNumber.int().min(20).max(260).nullish(),
  inclinePercent: finiteNumber.min(-30).max(100).nullish(),
  orderIndex: finiteNumber.int().nonnegative(),
});

const sessionSchema = z.object({
  id: z.string(),
  date: isoDateString,
  startTime: isoDateString,
  endTime: isoDateString.nullish(),
  notes: z.string(),
  isActive: z.boolean().nullish(),
  templateName: z.string().nullish(),
  exercises: z.array(loggedExerciseSchema),
  supersetGroups: z.array(supersetGroupSchema).nullish(),
  cardioEntries: z.array(cardioEntrySchema).nullish(),
});

const templateExerciseSchema = z.object({
  exerciseName: z.string(),
  orderIndex: finiteNumber.int().nonnegative(),
  targetSets: finiteNumber.int().positive(),
});

const templateSchema = z.object({
  id: z.string().min(1).nullish(),
  name: z.string(),
  createdAt: isoDateString.nullish(),
  sortOrder: finiteNumber.int(),
  exercises: z.array(templateExerciseSchema),
});

const recoveryCheckinSchema = z.object({
  id: z.string().min(1),
  date: isoDateString,
  tookCreatine: z.boolean().nullable(),
  proteinTargetMet: z.boolean().nullable(),
  sleepHours: finiteNumber.min(0).max(24).nullable(),
  hadAlcohol: z.boolean().nullable(),
});

export const backupSchema = z.object({
  // Refus explicite des versions futures : un import destructif ne doit jamais supprimer des
  // champs qu'une version plus ancienne de l'app ne comprend pas encore.
  version: finiteNumber.int().positive().max(CURRENT_BACKUP_VERSION),
  exportDate: isoDateString,
  lastWorkoutLoggedAt: isoDateString.nullish(),
  deviceId: z.string().nullish(),
  activeMode: workoutModeSchema.default("normal"),
  selectedStartMode: workoutModeSchema.default("normal"),
  pendingVariantSwitches: z.record(z.string(), z.string()).default({}),
  treatedVariantSuggestions: z.record(z.string(), z.literal(true)).default({}),
  rotationAcceptedAt: z.record(z.string(), isoDateString).default({}),
  exercises: z.array(exerciseSchema),
  goals: z.array(goalSchema),
  settings: settingsSchema.nullish(),
  sessions: z.array(sessionSchema),
  templates: z.array(templateSchema),
  recoveryCheckins: z.array(recoveryCheckinSchema).default([]),
  // Absent des exports antérieurs : `.default([])` garde les anciens fichiers importables (§9).
  bodyWeights: z
    .array(
      z.object({
        id: z.string().min(1),
        measuredOn: z.union([z.string(), z.date()]),
        weightKg: finiteNumber.positive(),
      })
    )
    .default([]),
});

export type BackupJson = z.infer<typeof backupSchema>;

// ---------------------------------------------------------------------------
// Résultat de parsing — objets conformes aux types du domaine
// ---------------------------------------------------------------------------

export interface BackupData {
  version: number;
  exportDate: Date;
  lastWorkoutLoggedAt: Date | null;
  deviceId: string | null;
  activeMode: WorkoutMode;
  selectedStartMode: WorkoutMode;
  pendingVariantSwitches: Record<string, string>;
  treatedVariantSuggestions: Record<string, true>;
  rotationAcceptedAt: Record<string, string>;
  exercises: Exercise[];
  goals: MuscleGoal[];
  settings: UserSettings;
  sessions: WorkoutSession[];
  templates: WorkoutTemplate[];
  recoveryCheckins: RecoveryCheckin[];
  bodyWeights: BodyWeightEntry[];
}

/** Sous-ensemble sérialisable du store nécessaire à un export web v4 complet. */
export interface BackupExportSource {
  catalog: Exercise[];
  history: WorkoutSession[];
  active: WorkoutSession | null;
  goals: MuscleGoal[];
  settings: UserSettings;
  templates: WorkoutTemplate[];
  recoveryCheckins: RecoveryCheckin[];
  bodyWeights: BodyWeightEntry[];
  activeMode: WorkoutMode;
  selectedStartMode: WorkoutMode;
  pendingVariantSwitches: Record<string, string>;
  treatedVariantSuggestions: Record<string, true>;
  rotationAcceptedAt: Record<string, string>;
}

/**
 * Sérialiseur pur utilisé par l'UI et les tests de round-trip. Garder ce mapping hors du composant
 * empêche qu'un nouveau champ du modèle soit validé à l'import mais oublié à l'export.
 */
export function createBackupJson(
  source: BackupExportSource,
  exportDate: Date = new Date()
): BackupJson {
  const finished = sessionsNewestFirst(
    source.history.filter((session) => session.id !== source.active?.id)
  );
  const sessions = [...finished, ...(source.active ? [source.active] : [])];

  return backupSchema.parse({
    version: CURRENT_BACKUP_VERSION,
    exportDate: exportDate.toISOString(),
    lastWorkoutLoggedAt: finished[0]?.date.toISOString() ?? null,
    deviceId: "web",
    activeMode: source.activeMode,
    selectedStartMode: source.selectedStartMode,
    pendingVariantSwitches: source.pendingVariantSwitches,
    treatedVariantSuggestions: source.treatedVariantSuggestions,
    rotationAcceptedAt: source.rotationAcceptedAt,
    exercises: source.catalog.map((exercise) => ({
      ...exercise,
      lastUsed: exercise.lastUsed?.toISOString() ?? null,
    })),
    goals: source.goals.map((goal) => ({
      muscleGroup: goal.parent,
      weeklyGoalSets: goal.weeklyGoalSets,
    })),
    settings: source.settings,
    bodyWeights: source.bodyWeights.map((entry) => ({
      id: entry.id,
      measuredOn: entry.measuredOn.toISOString(),
      weightKg: entry.weightKg,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      date: session.date.toISOString(),
      startTime: session.startTime.toISOString(),
      endTime: session.endTime?.toISOString() ?? null,
      notes: session.notes,
      templateName: session.templateName,
      isActive: session.isActive,
      exercises: session.exercises.map((loggedExercise) => ({
        id: loggedExercise.id,
        exerciseId: loggedExercise.exerciseId,
        exerciseName: loggedExercise.exerciseName,
        orderIndex: loggedExercise.orderIndex,
        notes: loggedExercise.notes,
        plateauWeakPoint: loggedExercise.plateauWeakPoint,
        sets: loggedExercise.sets.map((set) => ({
          id: set.id,
          weight: set.weight,
          reps: set.reps,
          setType: set.setType,
          timestamp: set.timestamp.toISOString(),
          setSlotIndex: set.setSlotIndex,
          completed: set.completed,
          supersetRoundIndex: set.supersetRoundIndex,
          suggestedWeight: set.suggestedWeight ?? null,
          suggestedReps: set.suggestedReps ?? null,
          predictedRepsAtActualWeight: set.predictedRepsAtActualWeight ?? null,
          suggestedSetType: set.suggestedSetType ?? null,
          suggestionMode: set.suggestionMode ?? null,
          suggestionReasonCodes: set.suggestionReasonCodes ?? [],
          suggestionEngineVersion: set.suggestionEngineVersion ?? null,
          logicalSetId: set.logicalSetId ?? null,
          setTechnique: set.setTechnique ?? null,
          reportedRir: set.reportedRir ?? null,
          stopReason: set.stopReason ?? null,
        })),
      })),
      supersetGroups: session.supersetGroups.map((group) => ({
        id: group.id,
        orderIndex: group.orderIndex,
        memberIDs: group.memberOrder,
      })),
      cardioEntries: session.cardioEntries ?? [],
    })),
    templates: source.templates.map((template) => ({
      id: template.id,
      name: template.name,
      createdAt: template.createdAt.toISOString(),
      sortOrder: template.sortOrder,
      exercises: template.exercises,
    })),
    recoveryCheckins: source.recoveryCheckins.map((checkin) => ({
      ...checkin,
      date: checkin.date.toISOString(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Helpers de conversion
// ---------------------------------------------------------------------------

/** Résout une valeur brute de muscleGroup (feuille) vers un `MuscleGroup` connu, via legacyMuscleMapping en repli. */
function resolveMuscleGroup(raw: string): MuscleGroup | null {
  if ((Object.values(MuscleGroup) as string[]).includes(raw)) {
    return raw as MuscleGroup;
  }
  return legacyMuscleMapping[raw] ?? null;
}

/**
 * Résout `goal.muscleGroup` vers un `MuscleParent`. Le champ peut contenir
 * soit un rawValue de parent direct, soit une ancienne feuille (ou une
 * chaîne legacy), auquel cas on remonte au parent — miroir de
 * `MuscleGoal.parent` / `DataExporter.importAll` (étape "2. Import goals").
 */
function resolveMuscleParent(raw: string): MuscleParent | null {
  if ((Object.values(MuscleParent) as string[]).includes(raw)) {
    return raw as MuscleParent;
  }
  const leaf = resolveMuscleGroup(raw);
  if (leaf) {
    return LEAF_TO_PARENT[leaf];
  }
  return null;
}

function resolveSetPatternMode(raw: string): SetPatternMode {
  const values = Object.values(SetPatternMode) as string[];
  return values.includes(raw) ? (raw as SetPatternMode) : SetPatternMode.straight;
}

function resolveSetType(raw: string): SetType {
  const values = Object.values(SetType) as string[];
  return values.includes(raw) ? (raw as SetType) : SetType.work;
}

function resolveOptionalSetType(raw: string | null | undefined): SetType | null {
  if (!raw) return null;
  const values = Object.values(SetType) as string[];
  return values.includes(raw) ? (raw as SetType) : null;
}

function resolveCardioActivityType(raw: CardioActivityType | null | undefined, name: string): CardioActivityType {
  if (raw) return raw;
  const normalized = name.toLocaleLowerCase("fr");
  if (normalized.includes("rameur") || normalized.includes("rowing")) return "rowing";
  if (normalized.includes("vélo") || normalized.includes("velo") || normalized.includes("bike")) return "cycling";
  if (normalized.includes("natation") || normalized.includes("nage") || normalized.includes("swim")) return "swimming";
  if (normalized.includes("ellipt")) return "elliptical";
  if (normalized.includes("escal") || normalized.includes("stair")) return "stairs";
  if (normalized.includes("course") || normalized.includes("tapis") || normalized.includes("run")) return "running";
  return "other";
}

function resolveProgressionPolicy(raw: string | null | undefined): ProgressionPolicy | null {
  if (!raw) return null;
  const values = ["generic", "overreachJump", "testThenPromote", "voluntaryCap"];
  return values.includes(raw) ? (raw as ProgressionPolicy) : null;
}

/** VARIATION_CYCLING_SPEC §5/§9 — valeur inconnue/absente -> null (dégradation gracieuse, jamais de crash). */
function resolveMovementPattern(raw: string | null | undefined): MovementPatternT | null {
  if (!raw) return null;
  const values = Object.values(MovementPattern) as string[];
  return values.includes(raw) ? (raw as MovementPatternT) : null;
}

/** VARIATION_CYCLING_SPEC §5.2/§9 (P2.1) — valeur inconnue/absente -> null, jamais de crash. */
function resolveResistanceProfile(raw: string | null | undefined): ResistanceProfileT | null {
  if (!raw) return null;
  const values = Object.values(ResistanceProfile) as string[];
  return values.includes(raw) ? (raw as ResistanceProfileT) : null;
}

/** BENCHMARK_LEVEL_SPEC.md §1/§9 (P3.1) — valeur inconnue/absente -> null, jamais de crash. */
function resolveBenchmarkUnit(raw: string | null | undefined): BenchmarkUnitT | null {
  if (!raw) return null;
  const values = Object.values(BenchmarkUnit) as string[];
  return values.includes(raw) ? (raw as BenchmarkUnitT) : null;
}

/** VARIATION_CYCLING_SPEC §5.3/§9 (P2.1) — valeur inconnue/absente -> null, jamais de crash. */
function resolvePlateauWeakPoint(raw: string | null | undefined): PlateauWeakPoint | null {
  if (!raw) return null;
  const values = PLATEAU_WEAK_POINTS as readonly string[];
  return values.includes(raw) ? (raw as PlateauWeakPoint) : null;
}

function toDate(raw: string): Date {
  return new Date(raw);
}

function toDateOrNull(raw: string | null | undefined): Date | null {
  return raw ? new Date(raw) : null;
}

// ---------------------------------------------------------------------------
// parseBackup
// ---------------------------------------------------------------------------

/**
 * Valide un JSON brut (formats d'export historiques jusqu'à v4) avec Zod puis le convertit en
 * objets du domaine. Lève une `ZodError` si la forme générale ne correspond
 * pas au schéma (le contenu défectueux au niveau champ individuel est
 * plutôt neutralisé par des valeurs par défaut, comme le fait l'importeur
 * Swift, pour rester tolérant sur de vieux backups).
 */
export function parseBackup(json: unknown): BackupData {
  const raw = backupSchema.parse(json);

  const activeSessions = raw.sessions.filter((session) => session.isActive === true);
  if (activeSessions.length > 1) {
    throw new Error("Le backup contient plusieurs séances actives.");
  }
  if (activeSessions.some((session) => session.endTime != null)) {
    throw new Error("Une séance active ne peut pas avoir d'heure de fin.");
  }

  const duplicateOf = (values: string[]): string | null => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) return value;
      seen.add(value);
    }
    return null;
  };
  const duplicateExerciseId = duplicateOf(raw.exercises.map((exercise) => exercise.id));
  if (duplicateExerciseId) throw new Error(`ID d'exercice dupliqué: ${duplicateExerciseId}`);
  const duplicateSessionId = duplicateOf(raw.sessions.map((session) => session.id));
  if (duplicateSessionId) throw new Error(`ID de séance dupliqué: ${duplicateSessionId}`);

  if (raw.version >= 3) {
    const unknownMuscle = raw.exercises
      .flatMap((exercise) => exercise.muscleMappings)
      .find((mapping) => resolveMuscleGroup(mapping.muscleGroup) === null);
    if (unknownMuscle) throw new Error(`Muscle inconnu dans le backup: ${unknownMuscle.muscleGroup}`);
    const unknownGoal = raw.goals.find((goal) => resolveMuscleParent(goal.muscleGroup) === null);
    if (unknownGoal) throw new Error(`Objectif musculaire inconnu: ${unknownGoal.muscleGroup}`);
    const invalidMode = raw.exercises.find(
      (exercise) => !(Object.values(SetPatternMode) as string[]).includes(exercise.setPatternMode)
    );
    if (invalidMode) throw new Error(`Mode de séries inconnu: ${invalidMode.setPatternMode}`);
    const invalidSet = raw.sessions
      .flatMap((session) => session.exercises)
      .flatMap((exercise) => exercise.sets)
      .find((set) => !(Object.values(SetType) as string[]).includes(set.setType));
    if (invalidSet) throw new Error(`Type de série inconnu: ${invalidSet.setType}`);
    if (raw.version >= 4) {
      const invalidSuggestedSet = raw.sessions
        .flatMap((session) => session.exercises)
        .flatMap((exercise) => exercise.sets)
        .find(
          (set) =>
            set.suggestedSetType != null &&
            !(Object.values(SetType) as string[]).includes(set.suggestedSetType)
        );
      if (invalidSuggestedSet) {
        throw new Error(`Type de série suggéré inconnu: ${invalidSuggestedSet.suggestedSetType}`);
      }
    }
    if (raw.templates.some((template) => !template.id || !template.createdAt)) {
      throw new Error("Un backup v3 doit préserver les IDs et dates des templates.");
    }
    if (raw.sessions.some((session) => session.exercises.some((exercise) => !exercise.id))) {
      throw new Error("Un backup v3 doit préserver les IDs des exercices loggués.");
    }
    if (raw.sessions.some((session) => session.exercises.some((exercise) => exercise.sets.some((set) => !set.id)))) {
      throw new Error("Un backup v3 doit préserver les IDs des séries.");
    }
    const duplicateLoggedExerciseId = duplicateOf(
      raw.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.id as string))
    );
    if (duplicateLoggedExerciseId) {
      throw new Error(`ID d'exercice loggué dupliqué: ${duplicateLoggedExerciseId}`);
    }
    const duplicateSetId = duplicateOf(
      raw.sessions.flatMap((session) =>
        session.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id as string))
      )
    );
    if (duplicateSetId) throw new Error(`ID de série dupliqué: ${duplicateSetId}`);
    const duplicateTemplateId = duplicateOf(raw.templates.map((template) => template.id as string));
    if (duplicateTemplateId) throw new Error(`ID de template dupliqué: ${duplicateTemplateId}`);
    const duplicateCardioId = duplicateOf(
      raw.sessions.flatMap((session) => (session.cardioEntries ?? []).map((entry) => entry.id))
    );
    if (duplicateCardioId) throw new Error(`ID cardio dupliqué: ${duplicateCardioId}`);
    const duplicateSupersetId = duplicateOf(
      raw.sessions.flatMap((session) => (session.supersetGroups ?? []).map((group) => group.id))
    );
    if (duplicateSupersetId) throw new Error(`ID de superset dupliqué: ${duplicateSupersetId}`);
    const duplicateRecoveryId = duplicateOf(raw.recoveryCheckins.map((checkin) => checkin.id));
    if (duplicateRecoveryId) throw new Error(`ID de récupération dupliqué: ${duplicateRecoveryId}`);

    const catalogIds = new Set(raw.exercises.map((exercise) => exercise.id));
    const catalogNames = new Set(raw.exercises.map((exercise) => exercise.name));
    for (const session of raw.sessions) {
      const loggedIds = new Set(session.exercises.map((exercise) => exercise.id as string));
      const unknownExercise = session.exercises.find(
        (exercise) => !catalogIds.has(exercise.exerciseId) && !catalogNames.has(exercise.exerciseName)
      );
      if (unknownExercise) {
        throw new Error(`Exercice loggué sans catalogue: ${unknownExercise.exerciseName}`);
      }
      const assignedMembers = new Set<string>();
      for (const group of session.supersetGroups ?? []) {
        if (group.memberIDs.length < 2 || group.memberIDs.length > 4) {
          throw new Error(`Le superset ${group.id} doit contenir 2 à 4 exercices.`);
        }
        if (new Set(group.memberIDs).size !== group.memberIDs.length) {
          throw new Error(`Le superset ${group.id} contient un membre dupliqué.`);
        }
        for (const memberId of group.memberIDs) {
          if (!loggedIds.has(memberId)) {
            throw new Error(`Membre de superset introuvable: ${memberId}`);
          }
          if (assignedMembers.has(memberId)) {
            throw new Error(`Exercice loggué présent dans plusieurs supersets: ${memberId}`);
          }
          assignedMembers.add(memberId);
        }
      }
    }
    const recoveryDates = raw.recoveryCheckins.map((checkin) => checkin.date);
    if (new Set(recoveryDates).size !== recoveryDates.length) {
      throw new Error("Le backup contient plusieurs check-ins pour la même date.");
    }
  }

  // -- Exercices --------------------------------------------------------
  const exercises: Exercise[] = raw.exercises.map((exData): Exercise => {
    const muscleMappings: MuscleMapping[] = exData.muscleMappings
      .map((m): MuscleMapping | null => {
        const muscleGroup = resolveMuscleGroup(m.muscleGroup);
        if (!muscleGroup) return null;
        return { muscleGroup, coefficient: m.coefficient };
      })
      .filter((m): m is MuscleMapping => m !== null);

    const fatigueClass: FatigueClass = fatigueClassFromRaw(exData.fatigueClass ?? undefined);

    return {
      id: exData.id,
      name: exData.name,
      category: exData.category,
      setPatternMode: resolveSetPatternMode(exData.setPatternMode),
      repTargetMin: exData.repTargetMin,
      repTargetMax: exData.repTargetMax,
      smallestIncrement: exData.smallestIncrement,
      isFavorite: exData.isFavorite,
      createdByUser: exData.createdByUser,
      sortOrder: exData.sortOrder,
      suggestedRestSeconds: exData.suggestedRestSeconds,
      machineSetting: exData.machineSetting ?? "",
      setupNotes: exData.setupNotes ?? "",
      benchmarkLow: exData.benchmarkLow ?? null,
      benchmarkHigh: exData.benchmarkHigh ?? null,
      fatigueClass,
      progressionPolicy: resolveProgressionPolicy(exData.progressionPolicy),
      voluntaryRepCap: exData.voluntaryRepCap ?? 0,
      muscleMappings,
      lastUsed: toDateOrNull(exData.lastUsed),
      movementPattern: resolveMovementPattern(exData.movementPattern),
      resistanceProfile: resolveResistanceProfile(exData.resistanceProfile),
      strengthStandardKey: exData.strengthStandardKey ?? null,
      benchmarkUnit: resolveBenchmarkUnit(exData.benchmarkUnit),
    };
  });

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const exerciseByName = new Map(exercises.map((e) => [e.name, e]));

  // -- Goals --------------------------------------------------------------
  const goals: MuscleGoal[] = raw.goals
    .map((g): MuscleGoal | null => {
      const parent = resolveMuscleParent(g.muscleGroup);
      if (!parent) return null;
      return { parent, weeklyGoalSets: g.weeklyGoalSets };
    })
    .filter((g): g is MuscleGoal => g !== null);

  // -- Settings -------------------------------------------------------------
  const settings: UserSettings = raw.settings
    ? {
        usesKilograms: raw.settings.usesKilograms,
        defaultSmallestIncrement: raw.settings.defaultSmallestIncrement,
        defaultRestTimerSeconds: raw.settings.defaultRestTimerSeconds,
        defaultRepTargetMin: raw.settings.defaultRepTargetMin,
        defaultRepTargetMax: raw.settings.defaultRepTargetMax,
        userName: raw.settings.userName ?? "Evan",
        supersetRestSeconds: raw.settings.supersetRestSeconds ?? 180,
        bodyWeightKg: raw.settings.bodyWeightKg ?? null,
        gender: raw.settings.gender ?? null,
        ageYears: raw.settings.ageYears ?? null,
        trainingPhase: (raw.settings.trainingPhase ?? null) as TrainingPhase | null,
        trainingPhaseStartedAt: raw.settings.trainingPhaseStartedAt
          ? new Date(raw.settings.trainingPhaseStartedAt)
          : null,
      }
    : {
        usesKilograms: true,
        defaultSmallestIncrement: 2.5,
        defaultRestTimerSeconds: 120,
        defaultRepTargetMin: 8,
        defaultRepTargetMax: 12,
        userName: "Evan",
        supersetRestSeconds: 180,
        bodyWeightKg: null,
        gender: null,
        ageYears: null,
        trainingPhase: null,
        trainingPhaseStartedAt: null,
      };

  const bodyWeights: BodyWeightEntry[] = raw.bodyWeights.map((entry) => ({
    id: entry.id,
    measuredOn: new Date(entry.measuredOn),
    weightKg: entry.weightKg,
  }));

  // -- Templates ------------------------------------------------------------
  const templates: WorkoutTemplate[] = raw.templates.map((tData, index): WorkoutTemplate => ({
    // Les anciens exports Swift n'avaient ni id ni createdAt.
    id: tData.id ?? crypto.randomUUID(),
    name: tData.name,
    createdAt: tData.createdAt ? toDate(tData.createdAt) : new Date(0),
    sortOrder: tData.sortOrder ?? index,
    exercises: tData.exercises.map((te) => ({
      exerciseName: te.exerciseName,
      orderIndex: te.orderIndex,
      targetSets: te.targetSets,
    })),
  }));

  // -- Sessions ---------------------------------------------------------------
  const sessions: WorkoutSession[] = raw.sessions.map((sData): WorkoutSession => {
    // Index des logged exercises par id stable (généré si absent) pour
    // pouvoir re-brancher supersetGroups.memberIDs -> supersetGroupId.
    const loggedExerciseIds: string[] = sData.exercises.map(
      (leData) => leData.id ?? crypto.randomUUID()
    );

    // Map memberId (LoggedExercise.id) -> groupId, construite depuis
    // supersetGroups[].memberIDs (le format canonique v2). Si absent, on ne
    // reconstruit pas la logique de repli "legacy isLinkedToNext" ici — le
    // format v2 du backup contient toujours `supersetGroups` (voir
    // DataExporter.swift `SessionData.supersetGroups`); un backup vraiment
    // pré-v2 sans ce champ perd simplement l'info de superset (comme un
    // import qui échouerait à retrouver des groupes), les exercices restent
    // valides et standalone.
    const memberIdToGroupId = new Map<string, string>();
    const supersetGroups: SupersetGroup[] = (sData.supersetGroups ?? []).map(
      (gData): SupersetGroup => {
        for (const memberId of gData.memberIDs) {
          memberIdToGroupId.set(memberId, gData.id);
        }
        return {
          id: gData.id,
          orderIndex: gData.orderIndex,
          memberOrder: gData.memberIDs,
        };
      }
    );

    const cardioEntries: CardioEntry[] = (sData.cardioEntries ?? [])
      .map((entry) => ({
        id: entry.id,
        activityType: resolveCardioActivityType(entry.activityType, entry.activityName),
        activityName: entry.activityName,
        machineName: entry.machineName ?? null,
        machineModel: entry.machineModel ?? null,
        durationSeconds: entry.durationSeconds,
        level: entry.level ?? null,
        resistance: entry.resistance ?? null,
        distanceKm: entry.distanceKm ?? null,
        averageWatts: entry.averageWatts ?? null,
        averageHeartRateBpm: entry.averageHeartRateBpm ?? null,
        inclinePercent: entry.inclinePercent ?? null,
        orderIndex: entry.orderIndex,
      }))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const exercisesLogged: LoggedExercise[] = sData.exercises.map(
      (leData, index): LoggedExercise => {
        const loggedId = loggedExerciseIds[index];
        const exercise = exerciseById.get(leData.exerciseId) ?? exerciseByName.get(leData.exerciseName);

        const sets: LoggedSet[] = leData.sets.map((setData): LoggedSet => ({
          id: setData.id ?? crypto.randomUUID(),
          weight: setData.weight,
          reps: setData.reps,
          setType: resolveSetType(setData.setType),
          timestamp: toDate(setData.timestamp),
          setSlotIndex: setData.setSlotIndex,
          completed: setData.completed,
          supersetRoundIndex: setData.supersetRoundIndex ?? null,
          suggestedWeight: setData.suggestedWeight ?? null,
          suggestedReps: setData.suggestedReps ?? null,
          predictedRepsAtActualWeight: setData.predictedRepsAtActualWeight ?? null,
          suggestedSetType: resolveOptionalSetType(setData.suggestedSetType),
          suggestionMode: setData.suggestionMode ?? null,
          suggestionReasonCodes: setData.suggestionReasonCodes ?? [],
          suggestionEngineVersion: setData.suggestionEngineVersion ?? null,
          logicalSetId: setData.logicalSetId ?? null,
          setTechnique: (setData.setTechnique ?? null) as SetTechnique | null,
          reportedRir: setData.reportedRir ?? null,
          stopReason: (setData.stopReason ?? null) as StopReason | null,
        }));

        return {
          id: loggedId,
          orderIndex: leData.orderIndex,
          notes: leData.notes,
          exerciseId: exercise?.id ?? leData.exerciseId,
          exerciseName: exercise?.name ?? leData.exerciseName,
          sets,
          supersetGroupId: memberIdToGroupId.get(loggedId) ?? null,
          plateauWeakPoint: resolvePlateauWeakPoint(leData.plateauWeakPoint),
        };
      }
    );

    return {
      id: sData.id,
      date: toDate(sData.date),
      startTime: toDate(sData.startTime),
      endTime: toDateOrNull(sData.endTime),
      notes: sData.notes,
      isActive: sData.isActive ?? false,
      templateName: sData.templateName ?? null,
      exercises: exercisesLogged,
      supersetGroups,
      cardioEntries,
    };
  });

  const recoveryCheckins: RecoveryCheckin[] = raw.recoveryCheckins.map((checkin) => ({
    id: checkin.id,
    date: toDate(checkin.date),
    tookCreatine: checkin.tookCreatine,
    proteinTargetMet: checkin.proteinTargetMet,
    sleepHours: checkin.sleepHours,
    hadAlcohol: checkin.hadAlcohol,
  }));

  return {
    version: raw.version,
    exportDate: toDate(raw.exportDate),
    lastWorkoutLoggedAt: toDateOrNull(raw.lastWorkoutLoggedAt),
    deviceId: raw.deviceId ?? null,
    activeMode: raw.activeMode,
    selectedStartMode: raw.selectedStartMode,
    pendingVariantSwitches: raw.pendingVariantSwitches,
    treatedVariantSuggestions: raw.treatedVariantSuggestions,
    rotationAcceptedAt: raw.rotationAcceptedAt,
    exercises,
    goals,
    settings,
    sessions,
    templates,
    recoveryCheckins,
    bodyWeights,
  };
}
