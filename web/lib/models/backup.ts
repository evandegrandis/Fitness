/**
 * Validation + parsing du format d'export JSON de l'app iOS (version 2), tel
 * que produit par `Jeera/Utilities/DataExporter.swift::exportAll`. Les
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

import { fatigueClassFromRaw, SetPatternMode, SetType } from "./enums";
import type { FatigueClass, ProgressionPolicy } from "./enums";
import { LEAF_TO_PARENT, legacyMuscleMapping, MuscleGroup, MuscleParent } from "./muscles";
import type {
  Exercise,
  LoggedExercise,
  LoggedSet,
  MuscleGoal,
  MuscleMapping,
  SupersetGroup,
  UserSettings,
  WorkoutSession,
  WorkoutTemplate,
} from "./types";

// ---------------------------------------------------------------------------
// Schémas Zod — miroir des structs Codable Swift (DataExporter.swift)
// ---------------------------------------------------------------------------

const muscleMappingSchema = z.object({
  muscleGroup: z.string(),
  coefficient: z.number(),
});

const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  setPatternMode: z.string(),
  repTargetMin: z.number(),
  repTargetMax: z.number(),
  smallestIncrement: z.number(),
  isFavorite: z.boolean(),
  createdByUser: z.boolean(),
  sortOrder: z.number(),
  suggestedRestSeconds: z.number(),
  lastUsed: z.string().nullish(),
  machineSetting: z.string().nullish(),
  setupNotes: z.string().nullish(),
  benchmarkLow: z.number().nullish(),
  benchmarkHigh: z.number().nullish(),
  fatigueClass: z.string().nullish(),
  // Pas toujours présents dans l'export (ajoutés après coup côté modèle Swift) :
  progressionPolicy: z.string().nullish(),
  voluntaryRepCap: z.number().nullish(),
  muscleMappings: z.array(muscleMappingSchema),
});

const goalSchema = z.object({
  muscleGroup: z.string(),
  weeklyGoalSets: z.number(),
});

const settingsSchema = z.object({
  usesKilograms: z.boolean(),
  defaultSmallestIncrement: z.number(),
  defaultRestTimerSeconds: z.number(),
  defaultRepTargetMin: z.number(),
  defaultRepTargetMax: z.number(),
  userName: z.string().nullish(),
  supersetRestSeconds: z.number().nullish(),
});

const loggedSetSchema = z.object({
  // Absent dans l'export (LoggedSetData n'a pas d'id côté Swift) — généré au parsing.
  weight: z.number(),
  reps: z.number(),
  setType: z.string(),
  timestamp: z.string(),
  setSlotIndex: z.number(),
  completed: z.boolean(),
  supersetRoundIndex: z.number().nullish(),
});

const loggedExerciseSchema = z.object({
  id: z.string().nullish(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  orderIndex: z.number(),
  notes: z.string(),
  isLinkedToNext: z.boolean().nullish(),
  sets: z.array(loggedSetSchema),
});

const supersetGroupSchema = z.object({
  id: z.string(),
  orderIndex: z.number(),
  memberIDs: z.array(z.string()),
});

const sessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().nullish(),
  notes: z.string(),
  templateName: z.string().nullish(),
  exercises: z.array(loggedExerciseSchema),
  supersetGroups: z.array(supersetGroupSchema).nullish(),
});

const templateExerciseSchema = z.object({
  exerciseName: z.string(),
  orderIndex: z.number(),
  targetSets: z.number(),
});

const templateSchema = z.object({
  name: z.string(),
  sortOrder: z.number(),
  exercises: z.array(templateExerciseSchema),
});

export const backupSchema = z.object({
  version: z.number(),
  exportDate: z.string(),
  lastWorkoutLoggedAt: z.string().nullish(),
  deviceId: z.string().nullish(),
  exercises: z.array(exerciseSchema),
  goals: z.array(goalSchema),
  settings: settingsSchema.nullish(),
  sessions: z.array(sessionSchema),
  templates: z.array(templateSchema),
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
  exercises: Exercise[];
  goals: MuscleGoal[];
  settings: UserSettings;
  sessions: WorkoutSession[];
  templates: WorkoutTemplate[];
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

function resolveProgressionPolicy(raw: string | null | undefined): ProgressionPolicy | null {
  if (!raw) return null;
  const values = ["generic", "overreachJump", "testThenPromote", "voluntaryCap"];
  return values.includes(raw) ? (raw as ProgressionPolicy) : null;
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
 * Valide un JSON brut (format d'export v2) avec Zod puis le convertit en
 * objets du domaine. Lève une `ZodError` si la forme générale ne correspond
 * pas au schéma (le contenu défectueux au niveau champ individuel est
 * plutôt neutralisé par des valeurs par défaut, comme le fait l'importeur
 * Swift, pour rester tolérant sur de vieux backups).
 */
export function parseBackup(json: unknown): BackupData {
  const raw = backupSchema.parse(json);

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
        bodyWeightKg: null,
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
      };

  // -- Templates ------------------------------------------------------------
  const templates: WorkoutTemplate[] = raw.templates.map((tData, index): WorkoutTemplate => ({
    // TemplateData n'a pas d'id côté Swift (nom + sortOrder priment) — on en génère un stable.
    id: crypto.randomUUID(),
    name: tData.name,
    createdAt: new Date(),
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

    const exercisesLogged: LoggedExercise[] = sData.exercises.map(
      (leData, index): LoggedExercise => {
        const loggedId = loggedExerciseIds[index];
        const exercise = exerciseById.get(leData.exerciseId) ?? exerciseByName.get(leData.exerciseName);

        const sets: LoggedSet[] = leData.sets.map((setData): LoggedSet => ({
          // LoggedSetData n'a pas d'id côté export -> généré ici.
          id: crypto.randomUUID(),
          weight: setData.weight,
          reps: setData.reps,
          setType: resolveSetType(setData.setType),
          timestamp: toDate(setData.timestamp),
          setSlotIndex: setData.setSlotIndex,
          completed: setData.completed,
          supersetRoundIndex: setData.supersetRoundIndex ?? null,
        }));

        return {
          id: loggedId,
          orderIndex: leData.orderIndex,
          notes: leData.notes,
          exerciseId: exercise?.id ?? leData.exerciseId,
          exerciseName: exercise?.name ?? leData.exerciseName,
          sets,
          supersetGroupId: memberIdToGroupId.get(loggedId) ?? null,
        };
      }
    );

    return {
      id: sData.id,
      date: toDate(sData.date),
      startTime: toDate(sData.startTime),
      endTime: toDateOrNull(sData.endTime),
      notes: sData.notes,
      isActive: false,
      templateName: sData.templateName ?? null,
      exercises: exercisesLogged,
      supersetGroups,
    };
  });

  return {
    version: raw.version,
    exportDate: toDate(raw.exportDate),
    lastWorkoutLoggedAt: toDateOrNull(raw.lastWorkoutLoggedAt),
    deviceId: raw.deviceId ?? null,
    exercises,
    goals,
    settings,
    sessions,
    templates,
  };
}
