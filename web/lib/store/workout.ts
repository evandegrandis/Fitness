/**
 * Store client de séance, miroir de `Jeera/ViewModels/WorkoutViewModel.swift`.
 *
 * 100% client — aucun import serveur (pas de "use server", pas de DB, pas de
 * next/headers). Persistance de la séance en cours via `localStorage`
 * (middleware `persist` de Zustand). Les données de référence (catalog,
 * history, goals, settings, templates, recoveryCheckins) sont hydratées
 * depuis la DB par la couche serveur via `hydrate()` et ne sont PAS
 * persistées côté client.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { buildRecords, classify, EMPTY_RECORDS, type ExerciseRecords, type RecordKind } from "@/lib/engines/records";
import { rollingPriorities } from "@/lib/engines/effective-sets";
import { PriorLoad, SessionFatigueContext } from "@/lib/engines/session-fatigue";
import { suggest, type SetSuggestion, type SuggestParams } from "@/lib/engines/progression";
import { buildSessionReview, type SessionReview } from "@/lib/engines/bilan";
import { HISTORY_WINDOW, RECORDS_HISTORY_WINDOW } from "@/lib/engines/constants";
import { FATIGUE_CLASS_PROPERTIES, SetType } from "@/lib/models/enums";
import type { MuscleParent } from "@/lib/models/muscles";
import {
  completedWorkSets,
  orderedSets,
  primaryParent,
  warmupSets,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type MuscleGoal,
  type RecoveryCheckin,
  type UserSettings,
  type WorkoutSession,
  type WorkoutTemplate,
} from "@/lib/models/types";
import type { WorkoutMode } from "@/lib/theme/modes";
import {
  applyReorderAfterValidate,
  autoDetectSupersetIfNeeded,
  detachFromSupersetGroup as detachFromSupersetGroupPure,
  handleSupersetLink as handleSupersetLinkPure,
  isLastInSuperset,
  isLinkedToNext,
  moveExercise as moveExercisePure,
  toggleSuperset as toggleSupersetPure,
} from "@/lib/store/superset";
import { buildFinishedWorkoutSnapshot, type FinishedWorkoutSnapshot } from "@/lib/store/snapshot";

export type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";

// ---------------------------------------------------------------------------
// UI helper types
// ---------------------------------------------------------------------------

export interface RestState {
  exerciseId: string;
  startedAtMs: number;
  targetSeconds: number;
}

export interface UndoState {
  message: string;
  /** Séance à restaurer si l'utilisateur annule l'action. */
  snapshot: WorkoutSession;
}

export interface AchievementState {
  setId: string;
  kind: RecordKind;
  exerciseName: string;
  weight: number;
  reps: number;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

interface ReferenceData {
  catalog: Exercise[];
  history: WorkoutSession[];
  goals: MuscleGoal[];
  settings: UserSettings;
  templates: WorkoutTemplate[];
  recoveryCheckins: RecoveryCheckin[];
}

const DEFAULT_SETTINGS: UserSettings = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "",
  supersetRestSeconds: 180,
};

export interface WorkoutState extends ReferenceData {
  active: WorkoutSession | null;
  activeMode: WorkoutMode;
  selectedStartMode: WorkoutMode;

  rest: RestState | null;
  undo: UndoState | null;
  achievement: AchievementState | null;
  armedSupersetExerciseId: string | null;
  justHitRecord: Record<string, RecordKind>;
  recordsCache: Record<string, ExerciseRecords>;

  /**
   * WS4 — override "Je suis frais" : ensemble des `loggedExerciseId` (exercice DE LA SÉANCE
   * ACTIVE, pas exercice du catalogue) pour lesquels l'utilisateur a explicitement annulé le
   * deload d'absence pour cette séance. Réinitialisé à chaque `finish()`/`discard()` (scope =
   * une séance). Consommé par `suggestion()` via `suggest({ freshOverride: true })`.
   * Volontairement absent de `partialize` (non persisté dans localStorage) : un `Set` ne
   * survit pas à la sérialisation JSON par défaut, et l'override n'a de sens que pour la
   * session de navigation en cours (reload = redemander si besoin).
   */
  freshOverrides: Set<string>;
  /** Active l'override "Je suis frais" pour cet exercice loggé, pour le reste de la séance active. */
  setFreshOverride: (loggedExerciseId: string) => void;
  /** Réactive le deload (annule l'override) pour cet exercice loggé. */
  clearFreshOverride: (loggedExerciseId: string) => void;

  /** true une fois que le store a été réhydraté depuis localStorage côté client. */
  hasHydratedStorage: boolean;
  setHasHydratedStorage: (value: boolean) => void;

  // -- Hydration reference data -------------------------------------------
  hydrate: (data: ReferenceData) => void;

  // -- Lifecycle -------------------------------------------------------------
  startEmpty: (mode?: WorkoutMode) => void;
  startFromTemplate: (templateId: string, mode?: WorkoutMode) => void;
  repeatLast: (mode?: WorkoutMode) => void;
  finish: () => { session: WorkoutSession; snapshot: FinishedWorkoutSnapshot } | null;
  discard: () => void;

  /**
   * Bilan post-séance intelligent (recalcul pur, voir `lib/engines/bilan.ts`).
   * `session` n'a pas besoin d'être déjà dans `history` — appelable aussi bien
   * juste avant `finish()` (session = `active`) que juste après (session =
   * `finish().session`), tant que `history` ne contient pas déjà `session`.
   */
  sessionReview: (session: WorkoutSession) => SessionReview;

  // -- Exercises ---------------------------------------------------------
  addExercise: (exerciseId: string) => void;
  replaceExercise: (loggedExerciseId: string, newExerciseId: string) => void;
  removeExercise: (loggedExerciseId: string) => void;
  moveExercise: (from: number, to: number) => void;
  duplicateExercise: (loggedExerciseId: string) => void;

  // -- Superset ------------------------------------------------------------
  toggleSuperset: (loggedExerciseId: string) => void;
  handleSupersetLink: (loggedExerciseId: string) => void;
  detachFromSupersetGroup: (loggedExerciseId: string) => void;

  // -- Sets ------------------------------------------------------------------
  logSet: (loggedExerciseId: string, input: { weight: number; reps: number; setType?: SetType }) => void;
  editSet: (setId: string, input: { weight: number; reps: number }) => void;
  deleteSet: (loggedExerciseId: string, setId: string) => void;
  undoLastAction: () => void;

  // -- Suggestions -----------------------------------------------------------
  suggestion: (loggedExerciseId: string) => SetSuggestion;
  warmupSuggestion: (loggedExerciseId: string) => SetSuggestion | null;

  // -- Records -----------------------------------------------------------------
  records: (exerciseId: string) => ExerciseRecords;
  invalidateRecords: (exerciseId: string) => void;

  // -- Rest timer --------------------------------------------------------------
  startRest: (exerciseId: string, seconds: number) => void;
  skipRest: () => void;

  // -- Misc ----------------------------------------------------------------------
  dismissAchievement: () => void;
  setSelectedStartMode: (mode: WorkoutMode) => void;
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function findExercise(catalog: Exercise[], exerciseId: string): Exercise | undefined {
  return catalog.find((e) => e.id === exerciseId);
}

/** Reconvertit en Date les champs date d'une séance rechargée depuis localStorage (JSON → string). */
function reviveSessionDates(active: WorkoutSession | null): WorkoutSession | null {
  if (!active) return null;
  const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(v as string));
  return {
    ...active,
    date: toDate(active.date),
    startTime: toDate(active.startTime),
    endTime: active.endTime == null ? null : toDate(active.endTime),
    exercises: active.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, timestamp: toDate(s.timestamp) })),
    })),
  };
}

function findLoggedExercise(session: WorkoutSession | null, loggedExerciseId: string): LoggedExercise | undefined {
  return session?.exercises.find((e) => e.id === loggedExerciseId);
}

/**
 * Miroir de `WorkoutViewModel.fetchRecentSets` : renvoie les work sets des N
 * dernières séances TERMINÉES (les plus récentes en premier) pour un
 * exercice donné, en cherchant dans `history` (déjà triée plus récent -> plus
 * ancien par convention du store).
 */
export function recentWorkSetsForExercise(history: WorkoutSession[], exerciseId: string, maxSessions: number): LoggedSet[][] {
  const found: LoggedSet[][] = [];
  for (const session of history) {
    for (const logged of session.exercises) {
      if (logged.exerciseId === exerciseId) {
        found.push(orderedSets(logged).filter((s) => s.setType === SetType.work || s.setType === SetType.topSet || s.setType === SetType.backoff));
        if (found.length >= maxSessions) break;
      }
    }
    if (found.length >= maxSessions) break;
  }
  return found;
}

/**
 * WS4 — jours écoulés entre `now` et la DERNIÈRE séance contenant >= 1 work set COMPLÉTÉ de CET
 * exercice exact (même `exerciseId`, aucune fusion de variantes). `history` est déjà triée du
 * plus récent au plus ancien par convention du store. `null` si aucune séance historique ne
 * contient cet exercice (premier essai jamais loggé) — l'appelant doit alors traiter le gap
 * comme "inconnu" (pas de deload, comme si l'exercice était neuf).
 */
export function daysSinceLastExercise(history: WorkoutSession[], exerciseId: string, now: Date = new Date()): number | null {
  for (const session of history) {
    const hasCompletedWorkSet = session.exercises.some(
      (logged) => logged.exerciseId === exerciseId && completedWorkSets(logged).length > 0
    );
    if (hasCompletedWorkSet) {
      const diffMs = now.getTime() - session.date.getTime();
      return Math.max(0, Math.floor(diffMs / 86_400_000));
    }
  }
  return null;
}

/**
 * Miroir de `WorkoutViewModel.sessionFatigueContext(before:)` : accumule les
 * exercices déjà complétés avant `loggedExerciseId` dans l'ordre de la
 * séance active. ALGO_V2 §6.2 — inclut aussi les PARTENAIRES du groupe de
 * superset EN COURS (même `supersetGroupId` que `loggedExerciseId`, sets déjà
 * complétés dans les rounds précédents) : ils comptent l'un pour l'autre dans
 * la fatigue intra-séance, round par round, en plus des exercices précédents
 * dans l'ordre de la séance (déjà couvert par la boucle `ordered.slice(0, idx)`).
 */
function buildSessionFatigueContext(
  session: WorkoutSession | null,
  catalog: Exercise[],
  loggedExerciseId: string,
  baselines?: { baselineSystemicCost: number; baselineSameParentSets: number }
): SessionFatigueContext {
  if (!session) return SessionFatigueContext.empty;
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = ordered.findIndex((e) => e.id === loggedExerciseId);
  if (idx === -1) return SessionFatigueContext.empty;

  const current = ordered[idx];
  const priorLoads: PriorLoad[] = [];

  for (const prior of ordered.slice(0, idx)) {
    const exercise = findExercise(catalog, prior.exerciseId);
    if (!exercise) continue;
    const parent = primaryParent(exercise);
    if (!parent) continue;
    const workSetsCompleted = completedWorkSets(prior).length;
    if (workSetsCompleted <= 0) continue;
    priorLoads.push({ primaryParent: parent, workSetsCompleted, fatigueClass: exercise.fatigueClass });
  }

  // §6.2 — partenaires du groupe de superset EN COURS (positionnés APRÈS `current` dans l'ordre,
  // donc non couverts par la boucle ci-dessus) : leurs sets déjà complétés dans les rounds
  // précédents comptent aussi pour la fatigue de `current`.
  if (current?.supersetGroupId !== null && current?.supersetGroupId !== undefined) {
    for (const partner of ordered.slice(idx + 1)) {
      if (partner.supersetGroupId !== current.supersetGroupId) continue;
      const exercise = findExercise(catalog, partner.exerciseId);
      if (!exercise) continue;
      const parent = primaryParent(exercise);
      if (!parent) continue;
      const workSetsCompleted = completedWorkSets(partner).length;
      if (workSetsCompleted <= 0) continue;
      priorLoads.push({ primaryParent: parent, workSetsCompleted, fatigueClass: exercise.fatigueClass });
    }
  }

  return new SessionFatigueContext(priorLoads, baselines);
}

/**
 * ALGO_V2 §6.1 — baselines de fatigue "habituelle" pour cet exercice : médiane du coût
 * systémique / des sets sur le même parent, mesurés AVANT cet exercice, sur ses 5 dernières
 * occurrences historiques. Sert à ne pénaliser que l'EXCÈS de fatigue (le profil empirique de
 * `predictReps` intègre déjà la fatigue habituelle). `history` déjà triée plus récent -> plus
 * ancien. Coûteux à calculer exactement (nécessiterait de rejouer position-par-position chaque
 * séance passée) : approximé par la position moyenne de CET exercice dans les séances où il
 * apparaît (nombre de sets des exercices précédents dans la séance, sommés par fatigueClass).
 */
function buildFatigueBaselines(
  history: WorkoutSession[],
  catalog: Exercise[],
  exerciseId: string
): { baselineSystemicCost: number; baselineSameParentSets: number } | undefined {
  const targetExercise = findExercise(catalog, exerciseId);
  const parent = targetExercise ? primaryParent(targetExercise) : null;
  const systemicCosts: number[] = [];
  const sameParentCounts: number[] = [];

  let occurrences = 0;
  for (const session of history) {
    const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = ordered.findIndex((e) => e.exerciseId === exerciseId);
    if (idx <= 0) continue; // premier exercice de la séance ou absent -> pas de contexte "avant"
    occurrences += 1;
    if (occurrences > 5) break;

    let systemicCost = 0;
    let sameParentSets = 0;
    for (const prior of ordered.slice(0, idx)) {
      const exercise = findExercise(catalog, prior.exerciseId);
      if (!exercise) continue;
      const workSetsCompleted = completedWorkSets(prior).length;
      if (workSetsCompleted <= 0) continue;
      systemicCost += workSetsCompleted * FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
      if (parent && primaryParent(exercise) === parent) sameParentSets += workSetsCompleted;
    }
    systemicCosts.push(systemicCost);
    sameParentCounts.push(sameParentSets);
  }

  if (systemicCosts.length === 0) return undefined;
  const sortedCosts = [...systemicCosts].sort((a, b) => a - b);
  const sortedParent = [...sameParentCounts].sort((a, b) => a - b);
  const mid = Math.floor(sortedCosts.length / 2);
  const medianOf = (arr: number[]): number =>
    arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  return { baselineSystemicCost: medianOf(sortedCosts), baselineSameParentSets: medianOf(sortedParent) };
}

/** ALGO_V2 §5.1 — poids de corps utilisateur, même clé localStorage que `SettingsBodySection`. */
const BODY_WEIGHT_STORAGE_KEY = "user_body_weight_kg";

function readBodyweightKg(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(BODY_WEIGHT_STORAGE_KEY);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined;
}

/** Miroir de `Double.cleanWeight` (Swift) : entier sans décimale, sinon 2 décimales max. */
function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

/** Renvoie une copie de `record` sans la clé `key`. */
function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k !== key) result[k] = v;
  }
  return result;
}

/** Miroir de `WorkoutViewModel.dominantParent` : muscle au coefficient le plus élevé. */
function dominantParent(exercise: Exercise | undefined): MuscleParent | null {
  if (!exercise || exercise.muscleMappings.length === 0) return null;
  const best = exercise.muscleMappings.reduce((a, b) => (b.coefficient > a.coefficient ? b : a));
  return primaryParentOfLeaf(exercise, best.muscleGroup);
}

function primaryParentOfLeaf(exercise: Exercise, muscleGroup: string): MuscleParent | null {
  // primaryParent() already resolves via the highest-coefficient mapping; reuse
  // by constructing a 1-mapping exercise view is unnecessary — resolve directly.
  const mapping = exercise.muscleMappings.find((m) => m.muscleGroup === muscleGroup);
  if (!mapping) return null;
  return primaryParent({ ...exercise, muscleMappings: [mapping] });
}

/**
 * Miroir de `WorkoutViewModel.applyMonkFatigueAwareOrdering` : après un set,
 * essaie de placer juste après l'exercice courant un candidat dont le muscle
 * dominant n'a pas été travaillé dans les 2 derniers exercices actifs.
 */
function applyMonkFatigueAwareOrdering(session: WorkoutSession, catalog: Exercise[], loggedExerciseId: string): WorkoutSession {
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const currentIdx = ordered.findIndex((e) => e.id === loggedExerciseId);
  if (currentIdx === -1) return session;

  const recent = ordered
    .filter((e) => completedWorkSets(e).length > 0)
    .sort((a, b) => {
      const aLast = completedWorkSets(a).at(-1)?.timestamp.getTime() ?? -Infinity;
      const bLast = completedWorkSets(b).at(-1)?.timestamp.getTime() ?? -Infinity;
      return bLast - aLast;
    });
  const fatiguedParents = new Set(
    recent
      .slice(0, 2)
      .map((e) => dominantParent(findExercise(catalog, e.exerciseId)))
      .filter((p): p is MuscleParent => p !== null)
  );

  let candidateIdx = -1;
  for (let idx = 0; idx < ordered.length; idx++) {
    if (idx <= currentIdx) continue;
    const ex = ordered[idx];
    if (ex.id === loggedExerciseId) continue;
    if (ex.supersetGroupId !== null) continue;
    const parent = dominantParent(findExercise(catalog, ex.exerciseId));
    if (!parent) continue;
    if (!fatiguedParents.has(parent)) {
      candidateIdx = idx;
      break;
    }
  }

  if (candidateIdx === -1 || candidateIdx <= currentIdx + 1) return session;

  const mutable = [...ordered];
  const [moving] = mutable.splice(candidateIdx, 1);
  mutable.splice(currentIdx + 1, 0, moving);
  return { ...session, exercises: mutable.map((e, i) => ({ ...e, orderIndex: i })) };
}

/** Construit une `LoggedExercise` vide pour `exercise`, à l'`orderIndex` donné. */
function makeLoggedExercise(exercise: Exercise, orderIndex: number): LoggedExercise {
  return {
    id: newId(),
    orderIndex,
    notes: "",
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: [],
    supersetGroupId: null,
  };
}

function makeEmptySession(templateName: string | null = null): WorkoutSession {
  const now = new Date();
  return {
    id: newId(),
    date: now,
    startTime: now,
    endTime: null,
    notes: "",
    isActive: true,
    templateName,
    exercises: [],
    supersetGroups: [],
  };
}

/**
 * Miroir de `WorkoutViewModel.preferredBaseExercises` (branche beast) :
 * dernière séance sinon meilleur template (score favoris/heavy/repos long).
 */
function preferredBeastBase(history: WorkoutSession[], templates: WorkoutTemplate[], catalog: Exercise[]): Exercise[] {
  const lastSession = history[0];
  if (lastSession) {
    const ordered = [...lastSession.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
    const base = ordered.map((e) => findExercise(catalog, e.exerciseId)).filter((e): e is Exercise => e !== undefined);
    if (base.length > 0) return base;
  }
  if (templates.length === 0) return [];
  const scored = templates.map((t) => ({ t, score: templateModeScoreBeast(t, catalog) }));
  scored.sort((a, b) => a.score - b.score);
  const best = scored.at(-1)?.t;
  if (!best) return [];
  return best.exercises
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((te) => catalog.find((e) => e.name === te.exerciseName))
    .filter((e): e is Exercise => e !== undefined);
}

function templateModeScoreBeast(template: WorkoutTemplate, catalog: Exercise[]): number {
  const exercises = template.exercises
    .map((te) => catalog.find((e) => e.name === te.exerciseName))
    .filter((e): e is Exercise => e !== undefined);
  if (exercises.length === 0) return 0;
  return exercises.reduce(
    (score, exercise) =>
      score +
      (exercise.isFavorite ? 2.5 : 0) +
      (exercise.fatigueClass === "heavy" ? 2.0 : 0) +
      (exercise.suggestedRestSeconds >= 150 ? 1.0 : 0),
    0
  );
}

/**
 * Miroir de la branche `.monk` de `preferredBaseExercises` : meilleur
 * template selon les priorités de déficit, sinon dernière séance.
 */
function preferredMonkBase(
  history: WorkoutSession[],
  templates: WorkoutTemplate[],
  catalog: Exercise[],
  goals: MuscleGoal[]
): Exercise[] {
  const priorities = rollingPriorities(history, catalog, goals);
  if (templates.length > 0) {
    const scored = templates.map((t) => ({ t, score: templateModeScoreMonk(t, catalog, priorities) }));
    scored.sort((a, b) => a.score - b.score);
    const best = scored.at(-1)?.t;
    if (best) {
      const chosen = best.exercises
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((te) => catalog.find((e) => e.name === te.exerciseName))
        .filter((e): e is Exercise => e !== undefined);
      if (chosen.length > 0) return chosen;
    }
  }
  const lastSession = history[0];
  if (lastSession) {
    const ordered = [...lastSession.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
    const base = ordered.map((e) => findExercise(catalog, e.exerciseId)).filter((e): e is Exercise => e !== undefined);
    if (base.length > 0) return base;
  }
  return [];
}

function templateModeScoreMonk(template: WorkoutTemplate, catalog: Exercise[], priorities: [MuscleParent, number][]): number {
  const exercises = template.exercises
    .map((te) => catalog.find((e) => e.name === te.exerciseName))
    .filter((e): e is Exercise => e !== undefined);
  if (exercises.length === 0) return 0;
  const weightMap = new Map<MuscleParent, number>(priorities.slice(0, 5).map(([parent], index) => [parent, 6 - index]));
  return exercises.reduce((score, exercise) => {
    const contribution = exercise.muscleMappings.reduce((subtotal, mapping) => {
      const parent = primaryParentOfLeaf(exercise, mapping.muscleGroup) ?? undefined;
      const weight = parent ? weightMap.get(parent) ?? 0 : 0;
      return subtotal + weight * mapping.coefficient;
    }, 0);
    return score + contribution;
  }, 0);
}

function seedExercisesInto(session: WorkoutSession, exercises: Exercise[]): WorkoutSession {
  const seen = new Set<string>();
  const unique = exercises.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  const startIndex = session.exercises.length;
  const logged = unique.map((exercise, i) => makeLoggedExercise(exercise, startIndex + i));
  return { ...session, exercises: [...session.exercises, ...logged] };
}

/**
 * Miroir de `WorkoutViewModel.appendMonkDeficitExercises` : ajoute jusqu'à
 * `maxExtra` exercices couvrant les 3 parents les plus déficitaires, non
 * déjà présents dans la séance.
 */
function appendMonkDeficitExercises(
  session: WorkoutSession,
  catalog: Exercise[],
  history: WorkoutSession[],
  goals: MuscleGoal[],
  maxExtra: number
): WorkoutSession {
  if (maxExtra <= 0) return session;
  const priorities = rollingPriorities(history, catalog, goals);
  const targetParents = new Set(priorities.slice(0, 3).map(([parent]) => parent));
  if (targetParents.size === 0) return session;

  const existingIds = new Set(session.exercises.map((e) => e.exerciseId));
  const candidates = catalog
    .filter(
      (ex) =>
        !existingIds.has(ex.id) &&
        ex.muscleMappings.some((m) => {
          const parent = leafParentSafe(ex, m.muscleGroup);
          return parent !== null && targetParents.has(parent) && m.coefficient >= 0.3;
        })
    )
    .sort((a, b) => scoreMonkCandidate(b, targetParents) - scoreMonkCandidate(a, targetParents));

  return seedExercisesInto(session, candidates.slice(0, maxExtra));
}

function leafParentSafe(exercise: Exercise, muscleGroup: string): MuscleParent | null {
  return primaryParentOfLeaf(exercise, muscleGroup);
}

function scoreMonkCandidate(exercise: Exercise, targetParents: Set<MuscleParent>): number {
  return exercise.muscleMappings
    .filter((m) => targetParents.has(leafParentSafe(exercise, m.muscleGroup) as MuscleParent))
    .reduce((acc, m) => acc + m.coefficient, 0);
}

/** Miroir de `WorkoutViewModel.shouldExtendBeastSession`. */
function shouldExtendBeastSession(recoveryCheckins: RecoveryCheckin[]): boolean {
  if (recoveryCheckins.length === 0) return false;
  const sorted = [...recoveryCheckins].sort((a, b) => b.date.getTime() - a.date.getTime());
  const window = sorted.slice(0, 2);
  const avgSleep = window.reduce((acc, c) => acc + c.sleepHours, 0) / window.length;
  const adherence = window.filter((c) => c.tookCreatine || c.proteinTargetMet).length;
  return avgSleep >= 7.0 && adherence >= 1;
}

/** Miroir de `WorkoutViewModel.appendBeastExtensionExercises`. */
function appendBeastExtensionExercises(session: WorkoutSession, catalog: Exercise[], maxExtra: number): WorkoutSession {
  if (maxExtra <= 0) return session;
  const existingIds = new Set(session.exercises.map((e) => e.exerciseId));
  const sessionCategories = new Set(
    session.exercises.map((e) => catalog.find((c) => c.id === e.exerciseId)?.category).filter((c): c is string => !!c)
  );
  const sessionParents = new Set(
    session.exercises
      .map((e) => catalog.find((c) => c.id === e.exerciseId))
      .filter((e): e is Exercise => e !== undefined)
      .flatMap((exercise) => exercise.muscleMappings.map((m) => leafParentSafe(exercise, m.muscleGroup)))
      .filter((p): p is MuscleParent => p !== null)
  );

  const scoreOf = (ex: Exercise): number =>
    (ex.isFavorite ? 2.5 : 0) +
    (ex.fatigueClass === "heavy" ? 2.0 : 0) +
    (ex.suggestedRestSeconds >= 150 ? 1.0 : 0) +
    (sessionCategories.has(ex.category) ? 1.5 : 0) +
    (ex.muscleMappings.some((m) => sessionParents.has(leafParentSafe(ex, m.muscleGroup) as MuscleParent) && m.coefficient >= 0.3) ? 1.5 : 0);

  const candidates = catalog
    .filter((ex) => !existingIds.has(ex.id) && (ex.isFavorite || ex.fatigueClass === "heavy" || ex.suggestedRestSeconds >= 150))
    .sort((a, b) => scoreOf(b) - scoreOf(a));

  return seedExercisesInto(session, candidates.slice(0, maxExtra));
}

/** Miroir de `applyModeOverlayIfNeeded` + `seedSessionForModeIfNeeded`. */
function seedSessionForMode(
  session: WorkoutSession,
  mode: WorkoutMode,
  ref: ReferenceData
): WorkoutSession {
  let working = session;
  if (working.exercises.length === 0) {
    if (mode === "beast") {
      working = seedExercisesInto(working, preferredBeastBase(ref.history, ref.templates, ref.catalog));
    } else if (mode === "monk") {
      working = seedExercisesInto(working, preferredMonkBase(ref.history, ref.templates, ref.catalog, ref.goals));
    }
  }
  return applyModeOverlay(working, mode, ref);
}

/** Miroir de `applyModeOverlayIfNeeded`, appelé aussi pour template/repeat-last starts. */
function applyModeOverlay(session: WorkoutSession, mode: WorkoutMode, ref: ReferenceData): WorkoutSession {
  if (mode === "monk") {
    return appendMonkDeficitExercises(session, ref.catalog, ref.history, ref.goals, 2);
  }
  if (mode === "beast" && shouldExtendBeastSession(ref.recoveryCheckins)) {
    return appendBeastExtensionExercises(session, ref.catalog, 1);
  }
  return session;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      catalog: [],
      history: [],
      goals: [],
      settings: DEFAULT_SETTINGS,
      templates: [],
      recoveryCheckins: [],

      active: null,
      activeMode: "normal",
      selectedStartMode: "normal",

      rest: null,
      undo: null,
      achievement: null,
      armedSupersetExerciseId: null,
      justHitRecord: {},
      recordsCache: {},
      freshOverrides: new Set<string>(),

      hasHydratedStorage: false,
      setHasHydratedStorage: (value) => set({ hasHydratedStorage: value }),

      hydrate: (data) => set({ ...data }),

      // -----------------------------------------------------------------
      // Lifecycle
      // -----------------------------------------------------------------

      startEmpty: (mode) => {
        const state = get();
        const resolvedMode = mode ?? state.selectedStartMode;
        const session = seedSessionForMode(makeEmptySession(), resolvedMode, state);
        set({ active: session, activeMode: resolvedMode, recordsCache: {}, justHitRecord: {}, freshOverrides: new Set() });
      },

      startFromTemplate: (templateId, mode) => {
        const state = get();
        const template = state.templates.find((t) => t.id === templateId);
        if (!template) return;
        const resolvedMode = mode ?? state.selectedStartMode;
        const exercises = template.exercises
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((te) => findExercise(state.catalog, state.catalog.find((e) => e.name === te.exerciseName)?.id ?? ""))
          .filter((e): e is Exercise => e !== undefined);
        let session = seedExercisesInto(makeEmptySession(template.name), exercises);
        session = applyModeOverlay(session, resolvedMode, state);
        set({ active: session, activeMode: resolvedMode, recordsCache: {}, justHitRecord: {}, freshOverrides: new Set() });
      },

      repeatLast: (mode) => {
        const state = get();
        const lastSession = state.history[0];
        if (!lastSession) return;
        const resolvedMode = mode ?? state.selectedStartMode;
        const ordered = [...lastSession.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
        const exercises = ordered.map((e) => findExercise(state.catalog, e.exerciseId)).filter((e): e is Exercise => e !== undefined);
        let session = seedExercisesInto(makeEmptySession(lastSession.templateName), exercises);
        session = applyModeOverlay(session, resolvedMode, state);
        set({ active: session, activeMode: resolvedMode, recordsCache: {}, justHitRecord: {}, freshOverrides: new Set() });
      },

      finish: () => {
        const state = get();
        if (!state.active) return null;
        const finishedSession: WorkoutSession = { ...state.active, isActive: false, endTime: new Date() };
        const snapshot = buildFinishedWorkoutSnapshot({
          session: finishedSession,
          exercises: state.catalog,
          justHitRecord: state.justHitRecord,
          finishedSessions: state.history,
          goals: state.goals,
        });
        set({
          active: null,
          activeMode: "normal",
          history: [finishedSession, ...state.history],
          rest: null,
          justHitRecord: {},
          armedSupersetExerciseId: null,
          recordsCache: {},
          freshOverrides: new Set(),
        });
        return { session: finishedSession, snapshot };
      },

      discard: () => {
        set({
          active: null,
          activeMode: "normal",
          rest: null,
          armedSupersetExerciseId: null,
          freshOverrides: new Set(),
        });
      },

      sessionReview: (session) => {
        const state = get();
        // `history` ne doit jamais contenir `session` elle-même (voir doc `buildSessionReview`) :
        // filtre défensif au cas où l'appelant passe la séance juste finie (déjà en tête de `history`
        // après `finish()`).
        const history = state.history.filter((s) => s.id !== session.id);
        return buildSessionReview(session, history, state.catalog, state.goals);
      },

      // -----------------------------------------------------------------
      // Exercises
      // -----------------------------------------------------------------

      addExercise: (exerciseId) => {
        const state = get();
        if (!state.active) return;
        const exercise = findExercise(state.catalog, exerciseId);
        if (!exercise) return;
        const orderIndex = state.active.exercises.reduce((max, e) => Math.max(max, e.orderIndex), -1) + 1;
        const logged = makeLoggedExercise(exercise, orderIndex);
        set({ active: { ...state.active, exercises: [...state.active.exercises, logged] } });
      },

      replaceExercise: (loggedExerciseId, newExerciseId) => {
        const state = get();
        if (!state.active) return;
        const newExercise = findExercise(state.catalog, newExerciseId);
        if (!newExercise) return;
        set({
          active: {
            ...state.active,
            exercises: state.active.exercises.map((e) =>
              e.id === loggedExerciseId
                ? { ...e, exerciseId: newExercise.id, exerciseName: newExercise.name, sets: [] }
                : e
            ),
          },
        });
      },

      removeExercise: (loggedExerciseId) => {
        const state = get();
        if (!state.active) return;
        const exerciseName = state.active.exercises.find((e) => e.id === loggedExerciseId)?.exerciseName ?? "Exercice";
        const snapshot = state.active;
        const remaining = state.active.exercises
          .filter((e) => e.id !== loggedExerciseId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((e, i) => ({ ...e, orderIndex: i }));
        set({
          active: { ...state.active, exercises: remaining },
          undo: { message: `${exerciseName} supprimé`, snapshot },
        });
      },

      moveExercise: (from, to) => {
        const state = get();
        if (!state.active) return;
        set({ active: moveExercisePure(state.active, from, to) });
      },

      duplicateExercise: (loggedExerciseId) => {
        const state = get();
        if (!state.active) return;
        const ordered = [...state.active.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
        const idx = ordered.findIndex((e) => e.id === loggedExerciseId);
        if (idx === -1) return;
        const source = ordered[idx];
        const shifted = ordered.map((e, i) => (i > idx ? { ...e, orderIndex: e.orderIndex + 1 } : e));
        const duplicate: LoggedExercise = {
          id: newId(),
          orderIndex: source.orderIndex + 1,
          notes: "",
          exerciseId: source.exerciseId,
          exerciseName: source.exerciseName,
          sets: [],
          supersetGroupId: null,
        };
        set({ active: { ...state.active, exercises: [...shifted, duplicate] } });
      },

      // -----------------------------------------------------------------
      // Superset
      // -----------------------------------------------------------------

      toggleSuperset: (loggedExerciseId) => {
        const state = get();
        if (!state.active) return;
        const result = toggleSupersetPure(state.active, loggedExerciseId, state.armedSupersetExerciseId, newId);
        set({ active: result.session, armedSupersetExerciseId: result.armed });
      },

      handleSupersetLink: (loggedExerciseId) => {
        const state = get();
        if (!state.active) return;
        const result = handleSupersetLinkPure(state.active, loggedExerciseId, state.armedSupersetExerciseId, newId);
        set({ active: result.session, armedSupersetExerciseId: result.armed });
      },

      detachFromSupersetGroup: (loggedExerciseId) => {
        const state = get();
        if (!state.active) return;
        set({ active: detachFromSupersetGroupPure(state.active, loggedExerciseId) });
      },

      // -----------------------------------------------------------------
      // Sets
      // -----------------------------------------------------------------

      logSet: (loggedExerciseId, input) => {
        const state = get();
        if (!state.active) return;
        const loggedExercise = findLoggedExercise(state.active, loggedExerciseId);
        if (!loggedExercise) return;
        const exercise = findExercise(state.catalog, loggedExercise.exerciseId);

        const setType = input.setType ?? SetType.work;
        const priorRecords = exercise ? get().records(exercise.id) : EMPTY_RECORDS;

        const roundIndex = loggedExercise.supersetGroupId !== null ? completedWorkSets(loggedExercise).length + 1 : null;
        const nextSlot = (orderedSets(loggedExercise).reduce((max, s) => Math.max(max, s.setSlotIndex), -1)) + 1;

        const newSet: LoggedSet = {
          id: newId(),
          weight: input.weight,
          reps: input.reps,
          setType,
          timestamp: new Date(),
          setSlotIndex: nextSlot,
          completed: true,
          supersetRoundIndex: roundIndex,
        };

        let session: WorkoutSession = {
          ...state.active,
          exercises: state.active.exercises.map((e) => (e.id === loggedExerciseId ? { ...e, sets: [...e.sets, newSet] } : e)),
        };

        session = autoDetectSupersetIfNeeded(session, loggedExerciseId, newId);

        let justHitRecord = state.justHitRecord;
        let recordsCache = state.recordsCache;
        let achievement = state.achievement;

        if (exercise) {
          const kind = classify(newSet, exercise, priorRecords);
          if (kind) {
            justHitRecord = { ...justHitRecord, [newSet.id]: kind };
            achievement = {
              setId: newSet.id,
              kind,
              exerciseName: exercise.name,
              weight: newSet.weight,
              reps: newSet.reps,
            };

            const updatedHeaviest =
              newSet.weight > 0 && newSet.weight > priorRecords.heaviestValidated && newSet.reps >= exercise.repTargetMin
                ? newSet.weight
                : priorRecords.heaviestValidated;
            const updatedReps =
              newSet.weight > 0 && newSet.weight > priorRecords.heaviestValidated && newSet.reps >= exercise.repTargetMin
                ? newSet.reps
                : priorRecords.repsAtHeaviestValidated;
            const newBestByWeight = { ...priorRecords.bestRepsByWeight };
            if (newSet.weight > 0 && newSet.reps >= exercise.repTargetMin && newSet.reps > (newBestByWeight[newSet.weight] ?? 0)) {
              newBestByWeight[newSet.weight] = newSet.reps;
            }
            const newBWReps =
              newSet.weight === 0 && newSet.reps > priorRecords.bestBodyweightReps ? newSet.reps : priorRecords.bestBodyweightReps;
            const epley = newSet.weight > 0 && newSet.reps >= exercise.repTargetMin ? newSet.weight * (1 + newSet.reps / 30) : 0;
            const newE1RM = epley > 0 ? Math.max(priorRecords.bestE1RM, epley) : priorRecords.bestE1RM;
            const newHeaviestEver = newSet.weight > 0 ? Math.max(priorRecords.heaviestEver, newSet.weight) : priorRecords.heaviestEver;

            recordsCache = {
              ...recordsCache,
              [exercise.id]: {
                heaviestValidated: updatedHeaviest,
                repsAtHeaviestValidated: updatedReps,
                heaviestEver: newHeaviestEver,
                bestRepsByWeight: newBestByWeight,
                bestBodyweightReps: newBWReps,
                bestE1RM: newE1RM,
                isEmpty: false,
              },
            };
          }
        }

        // Rest timer rules.
        const updatedLogged = findLoggedExercise(session, loggedExerciseId)!;
        let rest = state.rest;
        if (isLinkedToNext(session, updatedLogged)) {
          rest = null;
        } else {
          const isEndOfSupersetBlock = isLastInSuperset(session, updatedLogged);
          const restSeconds = isEndOfSupersetBlock
            ? state.settings.supersetRestSeconds
            : exercise?.suggestedRestSeconds ?? state.settings.defaultRestTimerSeconds;
          rest = { exerciseId: loggedExerciseId, startedAtMs: Date.now(), targetSeconds: restSeconds };
        }

        session = applyReorderAfterValidate(session, loggedExerciseId);
        if (state.activeMode === "monk") {
          session = applyMonkFatigueAwareOrdering(session, state.catalog, loggedExerciseId);
        }

        set({
          active: session,
          justHitRecord,
          recordsCache,
          achievement,
          rest,
        });

        if (achievement) {
          setTimeout(() => {
            const current = get().achievement;
            if (current?.setId === achievement!.setId) {
              set({ achievement: null });
            }
          }, 2000);
        }
      },

      editSet: (setId, input) => {
        const state = get();
        if (!state.active) return;
        let exerciseId: string | null = null;
        const exercises = state.active.exercises.map((e) => {
          if (!e.sets.some((s) => s.id === setId)) return e;
          exerciseId = e.exerciseId;
          return {
            ...e,
            sets: e.sets.map((s) => (s.id === setId ? { ...s, weight: input.weight, reps: input.reps } : s)),
          };
        });
        const justHitRecord = omitKey(state.justHitRecord, setId);
        const recordsCache = { ...state.recordsCache };
        if (exerciseId) delete recordsCache[exerciseId];
        set({ active: { ...state.active, exercises }, justHitRecord, recordsCache });
      },

      deleteSet: (loggedExerciseId, setId) => {
        const state = get();
        if (!state.active) return;
        const loggedExercise = findLoggedExercise(state.active, loggedExerciseId);
        if (!loggedExercise) return;
        const removedSet = loggedExercise.sets.find((s) => s.id === setId);
        const snapshot = state.active;

        const exercises = state.active.exercises.map((e) =>
          e.id === loggedExerciseId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e
        );
        const justHitRecord = omitKey(state.justHitRecord, setId);
        const recordsCache = { ...state.recordsCache };
        delete recordsCache[loggedExercise.exerciseId];

        const message = removedSet
          ? `Set supprimé — ${removedSet.weight > 0 ? cleanWeight(removedSet.weight) : "BW"}x${removedSet.reps}`
          : "Set supprimé";

        set({
          active: { ...state.active, exercises },
          justHitRecord,
          recordsCache,
          undo: { message, snapshot },
        });
      },

      undoLastAction: () => {
        const state = get();
        if (!state.undo) return;
        set({ active: state.undo.snapshot, undo: null });
      },

      // -----------------------------------------------------------------
      // WS4 — override deload "Je suis frais"
      // -----------------------------------------------------------------

      setFreshOverride: (loggedExerciseId) => {
        const state = get();
        const next = new Set(state.freshOverrides);
        next.add(loggedExerciseId);
        set({ freshOverrides: next });
      },

      clearFreshOverride: (loggedExerciseId) => {
        const state = get();
        if (!state.freshOverrides.has(loggedExerciseId)) return;
        const next = new Set(state.freshOverrides);
        next.delete(loggedExerciseId);
        set({ freshOverrides: next });
      },

      // -----------------------------------------------------------------
      // Suggestions
      // -----------------------------------------------------------------

      suggestion: (loggedExerciseId) => {
        const state = get();
        const loggedExercise = findLoggedExercise(state.active, loggedExerciseId);
        const exercise = loggedExercise ? findExercise(state.catalog, loggedExercise.exerciseId) : undefined;
        if (!loggedExercise || !exercise) {
          return {
            weight: 20,
            reps: 10,
            setType: SetType.work,
            explanation: "Pas de données pour cet exercice",
            confidence: 0.4,
            reasonCodes: [],
            mode: "record_attempt",
            sessionFatigueWarning: null,
          } as SetSuggestion;
        }

        const recentHistory = recentWorkSetsForExercise(state.history, exercise.id, HISTORY_WINDOW);
        const currentSessionSets = orderedSets(loggedExercise).filter((s) => s.completed);
        const fatigueBaselines = buildFatigueBaselines(state.history, state.catalog, exercise.id);
        const sessionFatigue = buildSessionFatigueContext(state.active, state.catalog, loggedExerciseId, fatigueBaselines);
        // WS4 — gap daté sur CET exercice exact (pas de fusion de variantes), et override
        // "Je suis frais" éventuellement armé par l'utilisateur pour cet exercice loggé.
        const gapDays = daysSinceLastExercise(state.history, exercise.id) ?? undefined;
        const freshOverride = state.freshOverrides.has(loggedExerciseId);

        const params: SuggestParams = {
          exercise,
          currentSetIndex: completedWorkSets(loggedExercise).length,
          recentHistory,
          currentSessionSets,
          sessionFatigue,
          gapDays,
          freshOverride,
          // ALGO_V2 §5.1 — poids de corps pour weighted/assisted bodyweight (predictReps).
          bodyweightKg: readBodyweightKg(),
        };
        let result = suggest(params);

        const currentSetIndex = completedWorkSets(loggedExercise).length;
        if (state.activeMode === "beast" && currentSetIndex === 1 && result.weight > 0 && result.mode !== "fallback_hypertrophy") {
          const bump = Math.max(1, exercise.smallestIncrement);
          const bumpedReps = result.mode === "plateau_break" ? result.reps : Math.max(exercise.repTargetMin, result.reps - 1);
          result = {
            ...result,
            weight: result.weight + bump,
            reps: bumpedReps,
            explanation: `Beast mode: ${result.explanation}`,
            reasonCodes: [...result.reasonCodes, "beast_mode_weight_bias"],
          };
        }

        return result;
      },

      warmupSuggestion: (loggedExerciseId) => {
        const state = get();
        const loggedExercise = findLoggedExercise(state.active, loggedExerciseId);
        const exercise = loggedExercise ? findExercise(state.catalog, loggedExercise.exerciseId) : undefined;
        if (!loggedExercise || !exercise) return null;
        if (completedWorkSets(loggedExercise).length > 0) return null;
        if (warmupSets(loggedExercise).some((s) => s.completed)) return null;
        if (exercise.setPatternMode !== "straight" && exercise.setPatternMode !== "top_set_backoff") return null;

        const workingSuggestion = get().suggestion(loggedExerciseId);
        if (workingSuggestion.weight < 40) return null;

        const inc = exercise.smallestIncrement;
        const workWeight = workingSuggestion.weight;
        const rawWarmup = Math.round((workWeight * 0.6) / inc) * inc;
        const warmupWeight = Math.max(20, Math.min(rawWarmup, workWeight - inc));

        return {
          weight: warmupWeight,
          reps: 10,
          setType: SetType.warmup,
          explanation: `Échauffement à ${cleanWeight(warmupWeight)}kg avant ${cleanWeight(workWeight)}kg.`,
          confidence: 0.85,
          reasonCodes: ["auto_warmup"],
          mode: "record_attempt",
          sessionFatigueWarning: null,
        } as SetSuggestion;
      },

      // -----------------------------------------------------------------
      // Records
      // -----------------------------------------------------------------

      records: (exerciseId) => {
        const state = get();
        const cached = state.recordsCache[exerciseId];
        if (cached) return cached;
        const exercise = findExercise(state.catalog, exerciseId);
        if (!exercise) return EMPTY_RECORDS;

        // Fenêtre volontairement plus large que HISTORY_WINDOW (10) : les records (PRs) doivent
        // rester visibles même s'ils datent de plus de 10 séances, contrairement à la décision de
        // charge/reps qui ne doit regarder que le passé récent. Ne pas aligner sur HISTORY_WINDOW.
        const sessions = recentWorkSetsForExerciseSessions(state.history, exerciseId, RECORDS_HISTORY_WINDOW);
        const historicalSets = sessions.flat();
        const records = buildRecords(exercise, historicalSets);
        set({ recordsCache: { ...state.recordsCache, [exerciseId]: records } });
        return records;
      },

      invalidateRecords: (exerciseId) => {
        const state = get();
        const recordsCache = { ...state.recordsCache };
        delete recordsCache[exerciseId];
        set({ recordsCache });
      },

      // -----------------------------------------------------------------
      // Rest timer
      // -----------------------------------------------------------------

      startRest: (exerciseId, seconds) => {
        set({ rest: { exerciseId, startedAtMs: Date.now(), targetSeconds: seconds } });
      },

      skipRest: () => set({ rest: null }),

      // -----------------------------------------------------------------
      // Misc
      // -----------------------------------------------------------------

      dismissAchievement: () => set({ achievement: null }),
      setSelectedStartMode: (mode) => set({ selectedStartMode: mode }),
    }),
    {
      name: "jeera-workout-store",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        active: state.active,
        activeMode: state.activeMode,
        rest: state.rest,
        justHitRecord: state.justHitRecord,
        armedSupersetExerciseId: state.armedSupersetExerciseId,
      }),
      // localStorage sérialise les Date en chaînes ISO : on les revit à la
      // réhydratation, sinon `session.startTime.getTime()` casse (string).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkoutState>;
        return { ...current, ...p, active: reviveSessionDates(p.active ?? null) };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydratedStorage(true);
      },
    }
  )
);

// `records()` needs to see the FULL set of historical sessions for an
// exercise (not just work sets from the primary session) — this helper
// mirrors `fetchRecentSets(maxSessions: 20)` used for the records cache.
function recentWorkSetsForExerciseSessions(history: WorkoutSession[], exerciseId: string, maxSessions: number): LoggedSet[][] {
  return recentWorkSetsForExercise(history, exerciseId, maxSessions);
}

// ---------------------------------------------------------------------------
// Selectors / helpers exposés pour l'UI
// ---------------------------------------------------------------------------

/** Secondes restantes du rest timer courant. Le store ne fait pas tourner de timer — l'UI recalcule via Date.now(). */
export function restRemainingSeconds(state: Pick<WorkoutState, "rest">): number {
  if (!state.rest) return 0;
  const elapsedSeconds = (Date.now() - state.rest.startedAtMs) / 1000;
  return Math.max(0, state.rest.targetSeconds - elapsedSeconds);
}
