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

import {
  buildFinisherRecords,
  buildRecords,
  classify,
  classifyFinisher,
  displayedRecordSetIDs,
  EMPTY_RECORDS,
  normalRecordSets,
  type ExerciseRecords,
  type RecordKind,
} from "@/lib/engines/records";
import { weeklyPriorities } from "@/lib/engines/effective-sets";
import { PriorLoad, SessionFatigueContext } from "@/lib/engines/session-fatigue";
import {
  effectiveLoad,
  stepLoad,
  suggest,
  type SetSuggestion,
  type SuggestParams,
} from "@/lib/engines/progression";
import { collectExerciseHistory } from "@/lib/engines/patterns";
import {
  compositeSetBlocks,
  immediateCompositeKind,
  physiologicalSetUnits,
  SET_STRUCTURE,
} from "@/lib/engines/set-structure";
import { finisherPromptReason, type FinisherPromptReason } from "@/lib/engines/finisher";
import { detectLevelUp, type LevelUp } from "@/lib/engines/level-up";
import { defaultEquivalent, equivalenceKey, familyHistory, startingPointFromEquivalent } from "@/lib/engines/equivalence";
import { buildSessionReview, type SessionReview } from "@/lib/engines/bilan";
import { ALGO_V2, HISTORY_WINDOW } from "@/lib/engines/constants";
import { FATIGUE_CLASS_PROPERTIES, SetType } from "@/lib/models/enums";
import type { PlateauWeakPoint, StopReason } from "@/lib/models/enums";
import type { MuscleParent } from "@/lib/models/muscles";
import {
  completedWorkSets,
  orderedSets,
  primaryParent,
  sessionsNewestFirst,
  warmupSets,
  type BodyWeightEntry,
  type CardioEntry,
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
  cloneSupersetTopology,
  detachFromSupersetGroup as detachFromSupersetGroupPure,
  handleSupersetLink as handleSupersetLinkPure,
  isSupersetRoundComplete,
  moveExercise as moveExercisePure,
  recomputeSupersetRoundIndices,
  toggleSuperset as toggleSupersetPure,
} from "@/lib/store/superset";
import { buildFinishedWorkoutSnapshot, type FinishedWorkoutSnapshot } from "@/lib/store/snapshot";
import { withKnownMuscleProfile } from "@/lib/data/catalog-muscle-profiles";
import { cleanWeight } from "@/lib/format";

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

/**
 * Proposition de finisher en attente de réponse. La série est DÉJÀ loggée en série
 * normale : on ne bloque jamais la saisie, on propose seulement de la requalifier.
 */
export interface FinisherPromptState {
  setId: string;
  loggedExerciseId: string;
  exerciseName: string;
  reason: FinisherPromptReason;
}

export interface AchievementState {
  setId: string;
  kind: RecordKind;
  exerciseName: string;
  weight: number;
  reps: number;
  /** Le record atteint la charge max de la machine (objectif « maxer chaque machine »). */
  machineMaxed?: boolean;
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
  /** Pesées datées, plus récente en premier (cf. `lib/engines/body-weight.ts`). */
  bodyWeights: BodyWeightEntry[];
}

const DEFAULT_SETTINGS: UserSettings = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "",
  supersetRestSeconds: 180,
  bodyWeightKg: null,
  gender: null,
  ageYears: null,
  trainingPhase: null,
  trainingPhaseStartedAt: null,
  weeklyCardioMinutesGoal: null,
};

export interface WorkoutState extends ReferenceData {
  active: WorkoutSession | null;
  activeMode: WorkoutMode;
  selectedStartMode: WorkoutMode;

  rest: RestState | null;
  undo: UndoState | null;
  achievement: AchievementState | null;

  /**
   * Finisher proposé pour la dernière série loggée, `null` s'il n'y a rien à demander.
   * Non bloquant : ignorer la bande revient à garder une série normale.
   */
  pendingFinisherPrompt: FinisherPromptState | null;
  /** Palier StrengthLevel franchi par la dernière série, `null` sinon. Éphémère, non persisté. */
  levelUp: LevelUp | null;
  dismissLevelUp: () => void;
  /**
   * `loggedExerciseId` pour lesquels Evan a déjà répondu « non » dans cette séance —
   * on ne repose plus la question, pour que la proposition reste rare.
   */
  finisherPromptDeclined: string[];
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
  /** Watermark du dernier snapshot SSR effectivement appliqué aux données de référence. */
  lastServerSnapshotAt: string | null;

  // -- Hydration reference data -------------------------------------------
  hydrate: (data: ReferenceData) => void;

  /**
   * OFFLINE_PWA_SPEC §4 (P4.4) — reflète immédiatement un changement de réglages dans le store,
   * QUE l'écriture Neon (`updateSettings`) ait réussi, échoué, ou soit mise en file hors-ligne
   * (`lib/sync/write-through.ts`). Sans ça, une modification offline (ex. corriger son poids de
   * corps à la salle sans réseau) ne serait visible QUE dans l'état local du composant Réglages —
   * `suggestion()` (qui lit `state.settings.bodyWeightKg`) continuerait de voir l'ANCIENNE valeur
   * pour le reste de la séance hors-ligne. Persisté par le cache offline (P4.1, `partialize`).
   */
  setSettings: (settings: UserSettings) => void;
  /** OFFLINE_PWA_SPEC §4 (P4.4) — miroir de `setSettings` pour un exercice du catalogue (création/édition). */
  upsertExerciseInCatalog: (exercise: Exercise) => void;
  /** OFFLINE_PWA_SPEC §4 (P4.4) — miroir de `setSettings` pour une suppression d'exercice du catalogue. */
  removeExerciseFromCatalog: (exerciseId: string) => void;

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
   * VARIATION_CYCLING_SPEC §8 — masque `plateau.suggestedVariant` pour tout exercice déjà
   * accepté/refusé POUR CETTE séance précise (`treatedVariantSuggestions`, scope = `session.id`,
   * jamais permanent — un même exercice peut re-plateauer plus tard sur une AUTRE séance et
   * redevenir suggérable, cf. décision tracée dans la note P1.6).
   */
  sessionReview: (session: WorkoutSession) => SessionReview;

  /**
   * VARIATION_CYCLING_SPEC §8 — rotation de variation proposée dans le bilan : `oldExerciseId ->
   * newExerciseId` en attente d'application à la PROCHAINE séance (non destructif — jamais en pleine
   * séance, §8). Consommé (et retiré) au prochain `startEmpty`/`startFromTemplate`/`repeatLast` qui
   * seedrait `oldExerciseId`. Persisté (`partialize`) : l'acceptation peut précéder de plusieurs
   * jours (et un reload) le début de la séance suivante.
   */
  pendingVariantSwitches: Record<string, string>;
  /**
   * VARIATION_CYCLING_SPEC §8 — bookkeeping INTERNE (pas une API UI : lire `plateau.suggestedVariant`,
   * qui est déjà `null` une fois traité). Clé `${sessionId}:${exerciseId}` — scope volontairement
   * limité à une séance précise (voir doc de `sessionReview`).
   */
  treatedVariantSuggestions: Record<string, true>;
  /**
   * VARIATION_CYCLING_SPEC §8 — accepte la rotation de variation suggérée dans le bilan de
   * `sessionId` pour `oldExerciseId` vers `newExerciseId`. Si `oldExerciseId` est DÉJÀ présent dans
   * la séance ACTIVE avec 0 set complété (cas : une nouvelle séance a déjà démarré avant que le
   * bilan de la précédente soit traité), la bascule s'applique immédiatement (mêmes règles que
   * `replaceExercise` : sets vidés) plutôt que de rester en attente.
   */
  acceptVariantSwitch: (sessionId: string, oldExerciseId: string, newExerciseId: string) => void;
  /** VARIATION_CYCLING_SPEC §8 — refuse la suggestion : la carte disparaît pour CETTE séance, sans planifier de bascule. */
  dismissVariantSwitch: (sessionId: string, oldExerciseId: string) => void;
  /**
   * VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : horodatage (ISO) de la dernière rotation
   * ACCEPTÉE vers cet `exerciseId` (la variante ADOPTÉE, PAS celle quittée — `acceptVariantSwitch`
   * l'écrit sous `newExerciseId`). Consommé par `isRotationCooldownActive` pour geler toute
   * nouvelle proposition (bilan ET indice live) sur CETTE variante pendant `ROTATION_COOLDOWN_DAYS`
   * jours (ne pas re-proposer en boucle juste après l'avoir adoptée, §8). Persisté (`partialize`),
   * même raison que `pendingVariantSwitches` : l'acceptation peut précéder de plusieurs jours (et un
   * reload) les séances qui suivront sur la nouvelle variante.
   */
  rotationAcceptedAt: Record<string, string>;
  /**
   * VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — capture 1-tap « où ça a calé ? » à l'entrée en
   * plateau. SEULE donnée utilisateur réellement nouvelle persistée par cette feature (input brut,
   * pas un état dérivé — ne viole pas l'invariant de pureté HARDENED §0.2). Mute la séance
   * `sessionId` DANS `history` (la revue post-séance porte toujours sur une séance déjà terminée
   * par `finish()`, donc déjà dans `history` — jamais `active`, cf. doc de `sessionReview`). Pure
   * côté store ; c'est à l'appelant (composant UI) d'écrire en base via `saveSession` (même
   * découplage que le reste du store — voir `ActiveSession.tsx`/`PostWorkoutSheet.tsx`).
   */
  setPlateauWeakPoint: (sessionId: string, loggedExerciseId: string, weakPoint: PlateauWeakPoint) => void;

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
  logSet: (
    loggedExerciseId: string,
    input: {
      weight: number;
      reps: number;
      setType?: SetType;
      suggestedWeight?: number | null;
      suggestedReps?: number | null;
      suggestedSetType?: SetType | null;
      predictedRepsAtActualWeight?: number | null;
      suggestionMode?: string | null;
      suggestionReasonCodes?: string[];
      suggestionEngineVersion?: string | null;
      reportedRir?: number | null;
      stopReason?: StopReason | null;
    }
  ) => void;
  editSet: (
    setId: string,
    input: {
      weight: number;
      reps: number;
      setType?: SetType;
      reportedRir?: number | null;
      stopReason?: StopReason | null;
    }
  ) => void;
  deleteSet: (loggedExerciseId: string, setId: string) => void;
  undoLastAction: () => void;

  /**
   * Séance démarrée avec l'intention « cardio » : `ActiveSession` ouvre le bloc cardio d'emblée,
   * puis consomme le drapeau. Éphémère (hors `partialize`) — une intention de démarrage n'a pas
   * à survivre à un reload.
   */
  cardioIntent: boolean;
  startCardio: () => void;
  consumeCardioIntent: () => void;

  /** Ferme le toast d'annulation sans annuler quoi que ce soit. */
  dismissUndo: () => void;

  /** Enregistre une pesée du jour dans le store (l'écriture DB reste à l'appelant). */
  setBodyWeightEntry: (entry: BodyWeightEntry) => void;
  removeBodyWeightEntry: (id: string) => void;

  /** Requalifie en finisher la série visée par la proposition en cours. */
  confirmFinisherPrompt: () => void;
  /** Referme la proposition ; l'exercice ne la redemandera plus de la séance. */
  dismissFinisherPrompt: () => void;

  // -- Cardio ----------------------------------------------------------------
  addCardioEntry: (input: Omit<CardioEntry, "id" | "orderIndex">) => void;
  deleteCardioEntry: (entryId: string) => void;

  // -- Suggestions -----------------------------------------------------------
  suggestion: (loggedExerciseId: string) => SetSuggestion;
  warmupSuggestion: (loggedExerciseId: string) => SetSuggestion | null;

  // -- Records -----------------------------------------------------------------
  records: (exerciseId: string) => ExerciseRecords;
  invalidateRecords: (exerciseId: string) => void;

  // -- Rest timer --------------------------------------------------------------
  startRest: (exerciseId: string, seconds: number) => void;
  skipRest: () => void;
  /** Ajoute (ou retire) des secondes au repos en cours. */
  addRestSeconds: (delta: number) => void;

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

/** `Date instanceof` sinon reconstruit depuis une string ISO (JSON localStorage). */
function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

/** Reconvertit en Date les champs date d'UNE séance rechargée depuis localStorage (JSON → string). */
function reviveSessionDatesNonNull(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    date: toDate(session.date),
    startTime: toDate(session.startTime),
    endTime: session.endTime == null ? null : toDate(session.endTime),
    // Préserve `undefined` pour les anciens caches : à la synchro, cette valeur signifie
    // « conserver le cardio déjà présent en base », tandis que `[]` signifie « tout retirer ».
    cardioEntries: session.cardioEntries?.map((entry) => ({
      ...entry,
      activityType: entry.activityType ?? "other",
      machineName: entry.machineName ?? null,
      machineModel: entry.machineModel ?? null,
      level: entry.level ?? null,
      resistance: entry.resistance ?? null,
      distanceKm: entry.distanceKm ?? null,
      averageWatts: entry.averageWatts ?? null,
      averageHeartRateBpm: entry.averageHeartRateBpm ?? null,
      inclinePercent: entry.inclinePercent ?? null,
    })),
    exercises: session.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({
        ...s,
        timestamp: toDate(s.timestamp),
        suggestedWeight: s.suggestedWeight ?? null,
        suggestedReps: s.suggestedReps ?? null,
        predictedRepsAtActualWeight: s.predictedRepsAtActualWeight ?? null,
        suggestedSetType: s.suggestedSetType ?? null,
        suggestionMode: s.suggestionMode ?? null,
        suggestionReasonCodes: Array.isArray(s.suggestionReasonCodes)
          ? s.suggestionReasonCodes.filter((code): code is string => typeof code === "string")
          : [],
        suggestionEngineVersion: s.suggestionEngineVersion ?? null,
        logicalSetId: s.logicalSetId ?? null,
        setTechnique: s.setTechnique ?? null,
      })),
    })),
  };
}

/** Reconvertit en Date les champs date d'une séance rechargée depuis localStorage (JSON → string). */
function reviveSessionDates(active: WorkoutSession | null): WorkoutSession | null {
  return active ? reviveSessionDatesNonNull(active) : null;
}

/**
 * OFFLINE_PWA_SPEC §2 (P4.1) — `history` est désormais mis en cache offline (`partialize`) : chaque
 * séance doit subir la MÊME revivification de Date que `active` (`reviveSessionDatesNonNull`), sinon
 * `.getTime()` casse partout où l'historique est lu après un cold-start hors-ligne (moteurs de
 * suggestion, records, lifecycle…).
 */
function reviveHistoryDates(history: WorkoutSession[]): WorkoutSession[] {
  return sessionsNewestFirst(history.map(reviveSessionDatesNonNull));
}

/** OFFLINE_PWA_SPEC §2 (P4.1) — revit `Exercise.lastUsed` (seul champ Date du catalogue). */
function reviveCatalogDates(catalog: Exercise[]): Exercise[] {
  return catalog.map((exercise) =>
    withKnownMuscleProfile({
      ...exercise,
      lastUsed: exercise.lastUsed == null ? null : toDate(exercise.lastUsed),
    })
  );
}

/**
 * Décision tracée (au-delà de la lettre d'OFFLINE_PWA_SPEC §2, qui ne nomme explicitement que
 * `history`/`catalog.lastUsed`) : `recoveryCheckins[].date` et `templates[].createdAt` sont AUSSI des
 * champs `Date` désormais mis en cache offline par ce même lot (`partialize` ci-dessous les inclut
 * tous). Sans revivification, `shouldExtendBeastSession` (`.date.getTime()`, appelable hors-ligne au
 * démarrage d'une séance Beast) et l'export backup (`SettingsBackupSection.tsx`,
 * `t.createdAt.toISOString()`) planteraient sur un cold-start hors-ligne — un bug que ce lot
 * introduirait lui-même s'il n'était pas corrigé ici. Mêmes garde-fous `instanceof Date` que les
 * autres revivals (idempotent si jamais appelé sur un état déjà revivifié).
 */
function reviveRecoveryCheckinDates(checkins: RecoveryCheckin[]): RecoveryCheckin[] {
  return checkins.map((checkin) => ({ ...checkin, date: toDate(checkin.date) }));
}

function reviveBodyWeightDates(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  return entries.map((entry) => ({ ...entry, measuredOn: toDate(entry.measuredOn) }));
}

function reviveTemplateDates(templates: WorkoutTemplate[]): WorkoutTemplate[] {
  return templates.map((template) => ({ ...template, createdAt: toDate(template.createdAt) }));
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
  for (const session of sessionsNewestFirst(history)) {
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
 * NOTE — le reclassement automatique en finisher a été retiré le 17/08/2026.
 * Il exigeait `reps >= max(15, repTargetMax)` et ratait donc les vrais finishers
 * courts (un HSPU ×3 en fin de séance), tout en requalifiant des séries en douce.
 * La détection vit désormais dans `lib/engines/finisher.ts` et se contente de
 * PROPOSER : voir `pendingFinisherPrompt` / `confirmFinisherPrompt`.
 */

/** Proposition immédiate pour compléter un mini-set jusqu'au seuil effectif de 8 reps. */
function compositeCompletionSuggestion(
  loggedExercise: LoggedExercise,
  exercise: Exercise
): SetSuggestion | null {
  const normalSets = completedWorkSets(loggedExercise);
  const last = normalSets.at(-1);
  if (!last) return null;

  const blocks = compositeSetBlocks(normalSets, { increment: exercise.smallestIncrement });
  const tail = blocks.at(-1);
  const tailEndsAtLast = tail?.sets.at(-1)?.id === last.id;
  const repsAlreadyDone = tailEndsAtLast ? tail.totalReps : last.reps;
  // Une série qui compte déjà physiologiquement (notamment 18 kg x 7 à RIR 0
  // ou 1) est terminée. Lui demander artificiellement 1 rep à 16 kg supprimait
  // la vraie suggestion de série suivante après le repos.
  if (
    repsAlreadyDone <= 0 ||
    repsAlreadyDone >= SET_STRUCTURE.EFFECTIVE_REPS_PER_SET ||
    (tailEndsAtLast && (tail?.effectiveSetUnits ?? 0) > 0)
  ) {
    return null;
  }

  const increment = Math.max(0.5, exercise.smallestIncrement);
  const easierWeight = last.weight === 0
    ? 0
    : stepLoad(last.weight, increment, exercise.setPatternMode, false);
  const remainingReps = Math.max(1, SET_STRUCTURE.EFFECTIVE_REPS_PER_SET - repsAlreadyDone);
  return {
    weight: Math.round(easierWeight * 100) / 100,
    reps: remainingReps,
    setType: SetType.work,
    explanation: `Série courte : complète-la avec ${remainingReps} rep${remainingReps > 1 ? "s" : ""}${last.weight > 0 ? " à la charge inférieure" : ""} pour former exactement 1 série effective.`,
    confidence: 0.94,
    reasonCodes: ["logical_set_completion"],
    mode: "fallback_hypertrophy",
    sessionFatigueWarning: null,
  };
}

function isNormalWorkSet(set: LoggedSet): boolean {
  return (
    set.completed &&
    set.reps > 0 &&
    (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff)
  );
}

/**
 * Répare les métadonnées de séries logiques après édition/suppression. Une complétion automatique
 * ne reste fusionnée que si son lead est encore sous 8 reps et si sa difficulté n'a pas augmenté.
 * Les techniques d'intensification explicitement enregistrées restent groupées, tant que leur
 * lead existe et qu'elles ne sont pas devenues plus difficiles que lui.
 */
function normalizeLogicalSetLinks(sets: LoggedSet[], exercise: Exercise | undefined): LoggedSet[] {
  if (!exercise) return sets;
  const normalizedById = new Map<string, LoggedSet>();
  const groups = new Map<string, { lead: LoggedSet; totalReps: number }>();

  for (const original of [...sets].sort(
    (a, b) => a.setSlotIndex - b.setSlotIndex || a.timestamp.getTime() - b.timestamp.getTime()
  )) {
    if (!isNormalWorkSet(original)) {
      normalizedById.set(original.id, { ...original, logicalSetId: null, setTechnique: null });
      continue;
    }

    const requestedGroup = original.logicalSetId ? groups.get(original.logicalSetId) : undefined;
    const notHarderThanLead = requestedGroup
      ? effectiveLoad(original.weight, exercise.setPatternMode) <=
        effectiveLoad(requestedGroup.lead.weight, exercise.setPatternMode) + 1e-9
      : false;
    const explicitIntensity =
      original.setTechnique === "drop_set" || original.setTechnique === "rest_pause";
    const validCompletion =
      original.setTechnique === "completion" &&
      requestedGroup !== undefined &&
      requestedGroup.totalReps < SET_STRUCTURE.EFFECTIVE_REPS_PER_SET;
    const continues =
      requestedGroup !== undefined && notHarderThanLead && (explicitIntensity || validCompletion);

    if (continues) {
      const normalized = { ...original, logicalSetId: requestedGroup.lead.id };
      normalizedById.set(original.id, normalized);
      requestedGroup.totalReps += original.reps;
      continue;
    }

    const lead = { ...original, logicalSetId: original.id, setTechnique: null };
    normalizedById.set(original.id, lead);
    groups.set(original.id, { lead, totalReps: original.reps });
  }

  return sets.map((set) => normalizedById.get(set.id) ?? set);
}

function hasInterveningExerciseSince(
  session: WorkoutSession,
  loggedExerciseId: string,
  previousSet: LoggedSet,
  nextTimestamp: Date
): boolean {
  const after = previousSet.timestamp.getTime();
  const before = nextTimestamp.getTime();
  return session.exercises.some(
    (candidate) =>
      candidate.id !== loggedExerciseId &&
      candidate.sets.some(
        (set) =>
          set.completed &&
          set.timestamp.getTime() > after &&
          set.timestamp.getTime() < before
      )
  );
}

/**
 * WS4 — jours écoulés entre `now` et la DERNIÈRE séance contenant >= 1 work set COMPLÉTÉ de CET
 * exercice exact (même `exerciseId`, aucune fusion de variantes). `history` est déjà triée du
 * plus récent au plus ancien par convention du store. `null` si aucune séance historique ne
 * contient cet exercice (premier essai jamais loggé) — l'appelant doit alors traiter le gap
 * comme "inconnu" (pas de deload, comme si l'exercice était neuf).
 */
export function daysSinceLastExercise(history: WorkoutSession[], exerciseId: string, now: Date = new Date()): number | null {
  for (const session of sessionsNewestFirst(history)) {
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

/** Jours depuis le dernier vrai set lesté, distincts du simple retour de l'exercice. */
export function daysSinceLastWeightedExercise(
  history: WorkoutSession[],
  exerciseId: string,
  now: Date = new Date()
): number | null {
  for (const session of sessionsNewestFirst(history)) {
    const hasCompletedWeightedSet = session.exercises.some(
      (logged) =>
        logged.exerciseId === exerciseId &&
        logged.sets.some(
          (set) =>
            set.completed &&
            set.weight > 0 &&
            (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff)
        )
    );
    if (hasCompletedWeightedSet) {
      const diffMs = now.getTime() - session.date.getTime();
      return Math.max(0, Math.floor(diffMs / 86_400_000));
    }
  }
  return null;
}

/**
 * Contexte live : accumule tous les AUTRES exercices déjà réellement effectués, selon leurs sets
 * complétés — pas selon leur position visuelle. Cela couvre naturellement les supersets de 2, 3
 * ou 4 exercices et les séances exécutées dans un ordre différent de la liste.
 */
function buildSessionFatigueContext(
  session: WorkoutSession | null,
  catalog: Exercise[],
  loggedExerciseId: string,
  baselines?: { baselineSystemicCost: number; baselineSameParentSets: number },
  after?: Date
): SessionFatigueContext {
  if (!session) return SessionFatigueContext.empty;
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = ordered.findIndex((e) => e.id === loggedExerciseId);
  if (idx === -1) return SessionFatigueContext.empty;

  const priorLoads: PriorLoad[] = [];

  for (const prior of ordered) {
    if (prior.id === loggedExerciseId) continue;
    const exercise = findExercise(catalog, prior.exerciseId);
    if (!exercise) continue;
    const parent = primaryParent(exercise);
    if (!parent) continue;
    const relevantSets = after
      ? prior.sets.filter((set) => set.timestamp.getTime() > after.getTime())
      : prior.sets;
    const workSetsCompleted = physiologicalSetUnits(relevantSets, {
      increment: exercise.smallestIncrement,
    });
    if (workSetsCompleted <= 0) continue;
    priorLoads.push({
      primaryParent: parent,
      workSetsCompleted,
      fatigueClass: exercise.fatigueClass,
      exerciseName: exercise.name,
    });
  }

  return new SessionFatigueContext(priorLoads, baselines);
}

/**
 * ALGO_V2 §6.1 — baselines de fatigue "habituelle" pour cet exercice : médiane du coût
 * systémique / des sets sur le même parent, mesurés AVANT cet exercice, sur ses 5 dernières
 * occurrences historiques. Sert à ne pénaliser que l'EXCÈS de fatigue (le profil empirique de
 * `predictReps` intègre déjà la fatigue habituelle). Le contexte est reconstruit par chronologie
 * réelle : seuls les sets des autres exercices terminés avant le dernier set de la cible comptent.
 */
function buildFatigueBaselines(
  history: WorkoutSession[],
  catalog: Exercise[],
  exerciseId: string
): { baselineSystemicCost: number; baselineSameParentSets: number } | undefined {
  const targetExercise = findExercise(catalog, exerciseId);
  const parent = targetExercise ? primaryParent(targetExercise) : null;
  const samples: { systemicCost: number; sameParentSets: number }[] = [];

  for (const session of sessionsNewestFirst(history)) {
    const sample = fatigueBeforeOccurrence(session, catalog, parent, (logged) => logged.exerciseId === exerciseId);
    if (!sample) continue;
    samples.push(sample);
    if (samples.length >= 5) break;
  }
  if (samples.length > 0) return medianBaselines(samples);

  // Exercice jamais fait : sans habitude propre, la fatigue du moment était comparée à ZÉRO et
  // tout exercice découvert en milieu de séance déclenchait « fatigue systémique ». À défaut,
  // l'habitude se lit sur les exercices du même muscle principal (5 dernières séances).
  // Les exercices du même muscle ET du même type de mouvement occupent la même place dans les
  // séances (un développé suit le pec deck) : ce sont eux qui disent l'habitude. À défaut, le
  // même muscle seulement.
  if (!parent) return undefined;
  const recent = sessionsNewestFirst(history).slice(0, 5);
  const collect = (matches: (exercise: Exercise) => boolean) => {
    const found: { systemicCost: number; sameParentSets: number }[] = [];
    for (const session of recent) {
      for (const logged of session.exercises) {
        const exercise = findExercise(catalog, logged.exerciseId);
        if (!exercise || exercise.id === exerciseId || primaryParent(exercise) !== parent || !matches(exercise)) continue;
        const sample = fatigueBeforeOccurrence(session, catalog, parent, (candidate) => candidate.id === logged.id);
        if (sample) found.push(sample);
      }
    }
    return found;
  };
  const pattern = targetExercise?.movementPattern ?? null;
  const samePattern = pattern ? collect((exercise) => exercise.movementPattern === pattern) : [];
  const fallback = samePattern.length > 0 ? samePattern : collect(() => true);
  return fallback.length > 0 ? medianBaselines(fallback) : undefined;
}

/**
 * Coût systémique et séries sur le même muscle faits AVANT une occurrence (chronologie réelle :
 * seuls les sets des autres exercices terminés avant le dernier set de la cible comptent).
 * `null` si l'occurrence n'a aucun set de travail complété.
 */
function fatigueBeforeOccurrence(
  session: WorkoutSession,
  catalog: Exercise[],
  parent: MuscleParent | null,
  isTarget: (logged: LoggedExercise) => boolean
): { systemicCost: number; sameParentSets: number } | null {
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const targets = ordered.filter(isTarget);
  const targetSets = targets.flatMap((logged) =>
    logged.sets.filter(
      (set) =>
        set.completed &&
        (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff)
    )
  );
  if (targetSets.length === 0) return null;

  let systemicCost = 0;
  let sameParentSets = 0;
  const cutoff = targetSets.reduce(
    (latest, set) => (set.timestamp > latest ? set.timestamp : latest),
    targetSets[0].timestamp
  );
  const targetIds = new Set(targets.map((target) => target.id));
  for (const prior of ordered) {
    if (targetIds.has(prior.id)) continue;
    const exercise = findExercise(catalog, prior.exerciseId);
    if (!exercise) continue;
    const workSetsCompleted = physiologicalSetUnits(
      prior.sets.filter((set) => set.timestamp <= cutoff),
      { increment: exercise.smallestIncrement }
    );
    if (workSetsCompleted <= 0) continue;
    systemicCost += workSetsCompleted * FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
    if (parent && primaryParent(exercise) === parent) sameParentSets += workSetsCompleted;
  }
  return { systemicCost, sameParentSets };
}

function medianBaselines(
  samples: { systemicCost: number; sameParentSets: number }[]
): { baselineSystemicCost: number; baselineSameParentSets: number } {
  const medianOf = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  return {
    baselineSystemicCost: medianOf(samples.map((sample) => sample.systemicCost)),
    baselineSameParentSets: medianOf(samples.map((sample) => sample.sameParentSets)),
  };
}

/** ALGO_V2 §5.1 — poids de corps utilisateur, même clé localStorage que `SettingsBodySection`. */
/** Poids de corps : source de vérité = `settings.bodyWeightKg` (base), avec repli localStorage legacy. */
function readBodyweightKg(settings: UserSettings): number | undefined {
  if (settings.bodyWeightKg && settings.bodyWeightKg > 0) return settings.bodyWeightKg;
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem("user_body_weight_kg");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined;
}

/** Renvoie une copie de `record` sans la clé `key`. */
function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k !== key) result[k] = v;
  }
  return result;
}

/**
 * Retire les étoiles transitoires qui ne font plus partie des vrais records
 * all-time (par exemple un ancien 16 x 8 désormais dominé par 18 x 9). Ce
 * nettoyage protège aussi la détection de fatigue, qui utilise la date du
 * dernier PR de la séance.
 */
function sanitizeActiveRecordMarks(
  history: WorkoutSession[],
  session: WorkoutSession,
  catalog: Exercise[],
  marks: Record<string, RecordKind>
): Record<string, RecordKind> {
  const next = { ...marks };
  const exerciseById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const historicalByExerciseId = new Map<string, LoggedSet[]>();
  for (const historicalSession of history) {
    if (historicalSession.isActive) continue;
    for (const logged of historicalSession.exercises) {
      const list = historicalByExerciseId.get(logged.exerciseId) ?? [];
      list.push(...logged.sets);
      historicalByExerciseId.set(logged.exerciseId, list);
    }
  }

  for (const logged of session.exercises) {
    const exercise = exerciseById.get(logged.exerciseId);
    if (!exercise) continue;
    const activeOccurrences = session.exercises.filter(
      (candidate) => candidate.exerciseId === logged.exerciseId
    );
    const allSets = [
      ...(historicalByExerciseId.get(logged.exerciseId) ?? []),
      ...activeOccurrences.flatMap((candidate) => candidate.sets),
    ];
    const validIds = new Set<string>();
    for (const occurrence of activeOccurrences) {
      for (const setId of displayedRecordSetIDs(occurrence, allSets, exercise)) validIds.add(setId);
    }
    for (const occurrence of activeOccurrences) {
      for (const set of occurrence.sets) {
        if (next[set.id] !== undefined && !validIds.has(set.id)) delete next[set.id];
      }
    }
  }
  return next;
}

/** Reconstitue les PR de la séance active depuis les faits, y compris après un reload. */
function latestDerivedPrAt(
  history: WorkoutSession[],
  loggedExercise: LoggedExercise,
  exercise: Exercise
): Date | null {
  const historicalSets = collectExerciseHistory(history, exercise.id).sets.flat();
  const priorSets = [...historicalSets];
  let priorRecords = buildRecords(exercise, priorSets);
  let latest: Date | null = null;
  for (const set of normalRecordSets(orderedSets(loggedExercise), exercise)) {
    if (classify(set, exercise, priorRecords) !== null && (!latest || set.timestamp > latest)) {
      latest = set.timestamp;
    }
    priorSets.push(set);
    priorRecords = buildRecords(exercise, priorSets);
  }
  return latest;
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
    plateauWeakPoint: null,
  };
}

/**
 * VARIATION_CYCLING_SPEC §8 — applique les rotations de variation ACCEPTÉES en attente
 * (`pendingVariantSwitches`, oldExerciseId -> newExerciseId) à une séance fraîchement construite,
 * AVANT qu'elle ne devienne `active` (jamais en pleine séance — la bascule efface les sets, donc
 * elle ne doit jamais s'appliquer à un exercice déjà en cours). Renvoie les ids CONSOMMÉS pour que
 * l'appelant les retire de `pendingVariantSwitches` dans le même `set()` (atomique, §8 "carte
 * disparaît une fois traitée").
 */
function applyPendingVariantSwitches(
  session: WorkoutSession,
  catalog: Exercise[],
  pending: Record<string, string>
): { session: WorkoutSession; consumedIds: string[] } {
  if (Object.keys(pending).length === 0) return { session, consumedIds: [] };
  const consumedIds: string[] = [];
  const exercises = session.exercises.map((logged) => {
    const newExerciseId = pending[logged.exerciseId];
    if (!newExerciseId) return logged;
    const newExercise = findExercise(catalog, newExerciseId);
    if (!newExercise) return logged;
    consumedIds.push(logged.exerciseId);
    return { ...logged, exerciseId: newExercise.id, exerciseName: newExercise.name };
  });
  return { session: { ...session, exercises }, consumedIds };
}

/**
 * Machines équivalentes (lib/engines/equivalence.ts) : dans une séance qui démarre, chaque
 * exercice devient la machine de sa famille utilisée en DERNIER. Un modèle « Chest Press » écrit
 * dans l'ancienne salle ouvre donc la Chest Press LifeFitness. Deux machines de la même famille ne
 * cohabitent pas : la seconde est retirée, sauf si elle appartient à un superset (sa place dans le
 * tour compte).
 */
function resolveSessionEquivalents(
  session: WorkoutSession,
  catalog: Exercise[],
  history: WorkoutSession[]
): WorkoutSession {
  const inSuperset = new Set(session.supersetGroups.flatMap((group) => group.memberOrder));
  const seenFamilies = new Set<string>();
  const exercises: LoggedExercise[] = [];
  for (const logged of [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const exercise = findExercise(catalog, logged.exerciseId);
    if (!exercise || logged.sets.length > 0) {
      exercises.push(logged);
      continue;
    }
    const resolved = defaultEquivalent(exercise, catalog, history);
    const family = equivalenceKey(resolved);
    if (seenFamilies.has(family) && !inSuperset.has(logged.id)) continue;
    seenFamilies.add(family);
    exercises.push(
      resolved.id === exercise.id
        ? logged
        : { ...logged, exerciseId: resolved.id, exerciseName: resolved.name }
    );
  }
  return { ...session, exercises: exercises.map((logged, orderIndex) => ({ ...logged, orderIndex })) };
}

/**
 * Mouvements qui justifient une série d'échauffement : les polyarticulaires. Un exercice non
 * tagué n'en reçoit une que s'il est déclaré lourd.
 */
function needsWarmup(exercise: Exercise): boolean {
  if (exercise.movementPattern === null) return exercise.fatigueClass === "heavy";
  return exercise.movementPattern !== "isolation";
}

/** Copie `record` en retirant `keys` (no-op si `keys` est vide — évite une recréation d'objet inutile). */
function withoutKeys<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  if (keys.length === 0) return record;
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : `true` si `exerciseId` a été la CIBLE d'une
 * rotation acceptée il y a moins de `ALGO_V2.ROTATION_COOLDOWN_DAYS` jours (`rotationAcceptedAt`).
 * Décision d'impl. tracée (pas dans le code du spec littéral) : le "OU jusqu'à un nouveau
 * isPlateau" du §8 n'est PAS recalculé séparément ici — `PLATEAU_STALL_DAYS` (14) ==
 * `ROTATION_COOLDOWN_DAYS` (14) dans `constants.ts`, donc un isPlateau structurellement "frais"
 * (calculé sur le run de la nouvelle variante, qui vient de démarrer) ne peut de toute façon pas
 * survenir avant l'expiration de ce cooldown ; distinguer un isPlateau "frais" d'un isPlateau
 * "hérité" de l'historique pré-rotation de la même variante nécessiterait le même bookkeeping de
 * "run courant" cross-exercice déjà différé en P1.2/P2.2 — hors scope explicite de ce lot, signalé
 * pas oublié (cf. note P2.3 dans VARIATION_CYCLING_IMPL.md).
 */
function isRotationCooldownActive(exerciseId: string, rotationAcceptedAt: Record<string, string>, now: Date): boolean {
  const acceptedAtIso = rotationAcceptedAt[exerciseId];
  if (!acceptedAtIso) return false;
  const acceptedAt = new Date(acceptedAtIso);
  const daysSinceAcceptance = Math.floor((now.getTime() - acceptedAt.getTime()) / 86_400_000);
  return daysSinceAcceptance < ALGO_V2.ROTATION_COOLDOWN_DAYS;
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
    cardioEntries: [],
  };
}

/**
 * Nettoyage irréversible appliqué uniquement à la clôture : un exercice
 * planifié mais jamais validé n'est ni une performance, ni un membre de
 * superset. Les groupes devenus solos sont dissous et tous les ordres sont
 * recalculés avant la persistance.
 */
export function pruneEmptyExercisesForFinish(session: WorkoutSession): WorkoutSession {
  const kept = [...session.exercises]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((exercise) => exercise.sets.some((set) => set.completed))
    .map((exercise, orderIndex) => ({ ...exercise, orderIndex }));
  const keptIds = new Set(kept.map((exercise) => exercise.id));

  const groups = session.supersetGroups
    .map((group) => ({
      ...group,
      memberOrder: group.memberOrder.filter((memberId) => keptIds.has(memberId)),
    }))
    .filter((group) => group.memberOrder.length >= 2)
    .map((group) => ({
      ...group,
      orderIndex: Math.min(
        ...group.memberOrder.map((memberId) => kept.find((exercise) => exercise.id === memberId)?.orderIndex ?? Infinity)
      ),
    }));
  const validGroupIds = new Set(groups.map((group) => group.id));

  let normalized: WorkoutSession = {
    ...session,
    exercises: kept.map((exercise) =>
      exercise.supersetGroupId !== null && validGroupIds.has(exercise.supersetGroupId)
        ? exercise
        : {
            ...exercise,
            supersetGroupId: null,
            sets: exercise.sets.map((set) =>
              set.supersetRoundIndex === null ? set : { ...set, supersetRoundIndex: null }
            ),
          }
    ),
    supersetGroups: groups,
  };
  for (const group of groups) normalized = recomputeSupersetRoundIndices(normalized, group.id);
  return normalized;
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
  const priorities = weeklyPriorities(history, catalog, goals);
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
  const priorities = weeklyPriorities(history, catalog, goals);
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
  // Une nuit longue après alcool n'est pas traitée comme un signal de bonne
  // récupération et ne déclenche jamais automatiquement une extension Beast.
  if (window.some((checkin) => checkin.hadAlcohol === true)) return false;
  const knownSleep = window
    .map((checkin) => checkin.sleepHours)
    .filter((hours): hours is number => hours !== null);
  if (knownSleep.length === 0) return false;
  const avgSleep = knownSleep.reduce((acc, hours) => acc + hours, 0) / knownSleep.length;
  const adherence = window.filter((c) => c.tookCreatine === true || c.proteinTargetMet === true).length;
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
      bodyWeights: [],

      active: null,
      activeMode: "normal",
      selectedStartMode: "normal",

      rest: null,
      undo: null,
      achievement: null,
      pendingFinisherPrompt: null,
      finisherPromptDeclined: [],
      levelUp: null,
      cardioIntent: false,
      armedSupersetExerciseId: null,
      justHitRecord: {},
      recordsCache: {},
      freshOverrides: new Set<string>(),
      pendingVariantSwitches: {},
      treatedVariantSuggestions: {},
      rotationAcceptedAt: {},

      hasHydratedStorage: false,
      setHasHydratedStorage: (value) => set({ hasHydratedStorage: value }),
      lastServerSnapshotAt: null,

      hydrate: (data) => set((state) => {
        const catalog = data.catalog.map(withKnownMuscleProfile);
        const history = sessionsNewestFirst(data.history);
        return {
          ...data,
          catalog,
          history,
          justHitRecord: state.active
            ? sanitizeActiveRecordMarks(history, state.active, catalog, state.justHitRecord)
            : state.justHitRecord,
        };
      }),

      setSettings: (settings) => set({ settings }),
      upsertExerciseInCatalog: (exercise) =>
        set((state) => {
          const catalogExercise = withKnownMuscleProfile(exercise);
          const exists = state.catalog.some((e) => e.id === catalogExercise.id);
          return {
            catalog: exists
              ? state.catalog.map((e) => (e.id === catalogExercise.id ? catalogExercise : e))
              : [...state.catalog, catalogExercise],
          };
        }),
      removeExerciseFromCatalog: (exerciseId) =>
        set((state) => ({ catalog: state.catalog.filter((e) => e.id !== exerciseId) })),

      // -----------------------------------------------------------------
      // Lifecycle
      // -----------------------------------------------------------------

      startEmpty: (mode) => {
        const state = get();
        const resolvedMode = mode ?? state.selectedStartMode;
        let session = seedSessionForMode(makeEmptySession(), resolvedMode, state);
        session = resolveSessionEquivalents(session, state.catalog, state.history);
        const { session: switched, consumedIds } = applyPendingVariantSwitches(session, state.catalog, state.pendingVariantSwitches);
        session = switched;
        set({
          active: session,
          activeMode: resolvedMode,
          recordsCache: {},
          justHitRecord: {},
          freshOverrides: new Set(),
          pendingFinisherPrompt: null,
          finisherPromptDeclined: [],
          pendingVariantSwitches: withoutKeys(state.pendingVariantSwitches, consumedIds),
        });
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
        session = resolveSessionEquivalents(session, state.catalog, state.history);
        const { session: switched, consumedIds } = applyPendingVariantSwitches(session, state.catalog, state.pendingVariantSwitches);
        session = switched;
        set({
          active: session,
          activeMode: resolvedMode,
          recordsCache: {},
          justHitRecord: {},
          freshOverrides: new Set(),
          pendingFinisherPrompt: null,
          finisherPromptDeclined: [],
          pendingVariantSwitches: withoutKeys(state.pendingVariantSwitches, consumedIds),
        });
      },

      repeatLast: (mode) => {
        const state = get();
        const lastSession = state.history[0];
        if (!lastSession) return;
        const resolvedMode = mode ?? state.selectedStartMode;
        const ordered = [...lastSession.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
        const exercises = ordered.map((e) => findExercise(state.catalog, e.exerciseId)).filter((e): e is Exercise => e !== undefined);
        let session = seedExercisesInto(makeEmptySession(lastSession.templateName), exercises);
        session = cloneSupersetTopology(lastSession, session, newId);
        session = applyModeOverlay(session, resolvedMode, state);
        session = resolveSessionEquivalents(session, state.catalog, state.history);
        const { session: switched, consumedIds } = applyPendingVariantSwitches(session, state.catalog, state.pendingVariantSwitches);
        session = switched;
        set({
          active: session,
          activeMode: resolvedMode,
          recordsCache: {},
          justHitRecord: {},
          freshOverrides: new Set(),
          pendingFinisherPrompt: null,
          finisherPromptDeclined: [],
          pendingVariantSwitches: withoutKeys(state.pendingVariantSwitches, consumedIds),
        });
      },

      finish: () => {
        const state = get();
        if (!state.active) return null;
        const normalized = pruneEmptyExercisesForFinish(state.active);
        const finishedSession: WorkoutSession = { ...normalized, isActive: false, endTime: new Date() };
        const validatedRecordMarks = sanitizeActiveRecordMarks(
          state.history,
          normalized,
          state.catalog,
          state.justHitRecord
        );
        const snapshot = buildFinishedWorkoutSnapshot({
          session: finishedSession,
          exercises: state.catalog,
          justHitRecord: validatedRecordMarks,
          finishedSessions: state.history,
          goals: state.goals,
        });
        set({
          active: null,
          activeMode: "normal",
          history: sessionsNewestFirst([finishedSession, ...state.history]),
          rest: null,
          justHitRecord: {},
          armedSupersetExerciseId: null,
          recordsCache: {},
          freshOverrides: new Set(),
          pendingFinisherPrompt: null,
          finisherPromptDeclined: [],
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
          pendingFinisherPrompt: null,
          finisherPromptDeclined: [],
        });
      },

      sessionReview: (session) => {
        const state = get();
        // VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — relit TOUJOURS la copie la plus fraîche de la
        // séance depuis `history` (par id), pas le paramètre `session` reçu (qui peut être une
        // référence gelée côté composant, cf. `PostWorkoutSheet.tsx`) : sans ça, une capture 1-tap
        // (`setPlateauWeakPoint`) qui vient de muter `history` ne serait jamais vue par un appel
        // `sessionReview(session)` fait avec l'ancienne référence — même piège de réactivité que
        // `treatedVariantSuggestions` déjà lu en direct via `get()` ci-dessous (note P1.6).
        const liveSession = state.history.find((s) => s.id === session.id) ?? session;
        // `history` ne doit jamais contenir `session` elle-même (voir doc `buildSessionReview`) :
        // filtre défensif au cas où l'appelant passe la séance juste finie (déjà en tête de `history`
        // après `finish()`).
        const history = state.history.filter((s) => s.id !== liveSession.id);
        const review = buildSessionReview(liveSession, history, state.catalog, state.goals, {
          // La phase déclarée conditionne la LECTURE du bilan, pas les suggestions.
          trainingPhase: state.settings.trainingPhase,
        });
        const now = new Date();
        // VARIATION_CYCLING_SPEC §8 — masque la carte de suggestion pour tout exercice déjà
        // accepté/refusé POUR CETTE séance (§8 "disparaît une fois traitée"). `buildSessionReview`
        // reste pur et la recalcule à chaque appel ; ce filtre est le SEUL endroit qui sait ce qui a
        // déjà été décidé (bookkeeping store, pas moteur).
        return {
          ...review,
          exercises: review.exercises.map((exerciseReview) => {
            const treated =
              exerciseReview.plateau.suggestedVariant !== null &&
              state.treatedVariantSuggestions[`${session.id}:${exerciseReview.exerciseId}`];
            // VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : cet exercice EST la variante adoptée
            // par une rotation récemment acceptée -> gèle la carte (ET la capture 1-tap, qui n'a
            // plus lieu d'être proposée si on ne va pas re-proposer de rotation dans l'immédiat).
            const cooling = isRotationCooldownActive(exerciseReview.exerciseId, state.rotationAcceptedAt, now);
            if (!treated && !cooling) return exerciseReview;
            return {
              ...exerciseReview,
              plateau: {
                ...exerciseReview.plateau,
                suggestedVariant: null,
                needsWeakPointCapture: cooling ? false : exerciseReview.plateau.needsWeakPointCapture,
              },
            };
          }),
        };
      },

      acceptVariantSwitch: (sessionId, oldExerciseId, newExerciseId) => {
        const state = get();
        const treatedKey = `${sessionId}:${oldExerciseId}`;
        // VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : horodate l'acceptation sur la variante
        // ADOPTÉE (`newExerciseId`), dans les DEUX branches ci-dessous (immédiate ET en attente).
        const acceptedAtIso = new Date().toISOString();
        // Cas où une nouvelle séance a déjà démarré (avant que ce bilan soit traité) ET contient
        // encore `oldExerciseId` sans set complété : applique tout de suite (comme `replaceExercise`,
        // sets vidés) plutôt que de laisser une bascule en attente inutile.
        const activeLoggedExercise = state.active?.exercises.find(
          (e) => e.exerciseId === oldExerciseId && !e.sets.some((s) => s.completed)
        );
        if (state.active && activeLoggedExercise) {
          const newExercise = findExercise(state.catalog, newExerciseId);
          if (newExercise) {
            set({
              active: {
                ...state.active,
                exercises: state.active.exercises.map((e) =>
                  e.id === activeLoggedExercise.id
                    ? { ...e, exerciseId: newExercise.id, exerciseName: newExercise.name, sets: [], plateauWeakPoint: null }
                    : e
                ),
              },
              treatedVariantSuggestions: { ...state.treatedVariantSuggestions, [treatedKey]: true },
              rotationAcceptedAt: { ...state.rotationAcceptedAt, [newExerciseId]: acceptedAtIso },
            });
            return;
          }
        }
        set({
          pendingVariantSwitches: { ...state.pendingVariantSwitches, [oldExerciseId]: newExerciseId },
          treatedVariantSuggestions: { ...state.treatedVariantSuggestions, [treatedKey]: true },
          rotationAcceptedAt: { ...state.rotationAcceptedAt, [newExerciseId]: acceptedAtIso },
        });
      },

      dismissVariantSwitch: (sessionId, oldExerciseId) => {
        const state = get();
        set({
          treatedVariantSuggestions: { ...state.treatedVariantSuggestions, [`${sessionId}:${oldExerciseId}`]: true },
        });
      },

      setPlateauWeakPoint: (sessionId, loggedExerciseId, weakPoint) => {
        const state = get();
        set({
          history: state.history.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  exercises: s.exercises.map((e) =>
                    e.id === loggedExerciseId ? { ...e, plateauWeakPoint: weakPoint } : e
                  ),
                }
              : s
          ),
        });
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
        const appended = { ...state.active, exercises: [...state.active.exercises, logged] };
        set({ active: applyReorderAfterValidate(appended, logged.id) });
      },

      replaceExercise: (loggedExerciseId, newExerciseId) => {
        const state = get();
        if (!state.active) return;
        const newExercise = findExercise(state.catalog, newExerciseId);
        if (!newExercise) return;
        const replaced = state.active.exercises.find((e) => e.id === loggedExerciseId);
        if (!replaced) return;
        set({
          // Les séries faites partent avec l'ancien exercice : sans filet, un mauvais choix dans le
          // sélecteur les effaçait pour de bon. Rien à annuler quand l'exercice était encore vide.
          ...(replaced.sets.length > 0
            ? { undo: { message: `${replaced.exerciseName} remplacé`, snapshot: state.active } }
            : {}),
          active: {
            ...state.active,
            exercises: state.active.exercises.map((e) =>
              e.id === loggedExerciseId
                ? { ...e, exerciseId: newExercise.id, exerciseName: newExercise.name, sets: [], plateauWeakPoint: null }
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
        const detached = detachFromSupersetGroupPure(state.active, loggedExerciseId);
        const remaining = detached.exercises
          .filter((e) => e.id !== loggedExerciseId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((e, i) => ({ ...e, orderIndex: i }));
        set({
          active: { ...detached, exercises: remaining },
          undo: { message: `${exerciseName} retiré de la séance`, snapshot },
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
          plateauWeakPoint: null,
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

        const requestedSetType = input.setType ?? SetType.work;
        const nextSlot = (orderedSets(loggedExercise).reduce((max, s) => Math.max(max, s.setSlotIndex), -1)) + 1;
        // Ordre strict même pour plusieurs validations dans la même milliseconde : les moteurs
        // de supersets/composites doivent pouvoir distinguer A→B→A sans égalité d'horloge.
        const latestSessionTimestamp = state.active.exercises.reduce(
          (latest, candidate) =>
            candidate.sets.reduce(
              (setLatest, set) => Math.max(setLatest, set.timestamp.getTime()),
              latest
            ),
          0
        );
        const timestamp = new Date(Math.max(Date.now(), latestSessionTimestamp + 1));
        // Le type demandé est toujours respecté : aucune série n'est requalifiée en
        // finisher sans un tap explicite (cf. `pendingFinisherPrompt` plus bas).
        //
        // `wouldCompleteSupersetPattern` n'est volontairement plus consulté ici : il ne
        // servait qu'à empêcher le reclassement AUTOMATIQUE de casser une détection de
        // superset en cours, et ce reclassement n'existe plus. L'utiliser pour taire la
        // proposition la rendrait muette exactement dans le cas qu'elle doit couvrir —
        // un retour A→B→A est mécaniquement le préfixe d'un second cycle de superset.
        // Les supersets déjà constitués restent exclus via `supersetGroupId`.
        const setType = requestedSetType;

        // Un finisher se reconnaît à sa position en fin de séance, pas à ses reps.
        // On se contente de PROPOSER, et jamais deux fois pour le même exercice.
        const promptReason =
          exercise && !state.finisherPromptDeclined.includes(loggedExerciseId)
            ? finisherPromptReason(state.active, loggedExercise, exercise, { reps: input.reps, timestamp }, requestedSetType)
            : null;

        const previousWorkSet = completedWorkSets(loggedExercise).at(-1);
        const provisionalSet: LoggedSet = {
          id: "pending",
          weight: input.weight,
          reps: input.reps,
          setType,
          timestamp,
          setSlotIndex: nextSlot,
          completed: true,
          supersetRoundIndex: previousWorkSet?.supersetRoundIndex ?? null,
        };
        const hasInterveningExercise = previousWorkSet
          ? hasInterveningExerciseSince(state.active, loggedExerciseId, previousWorkSet, timestamp)
          : false;
        const immediateKind =
          previousWorkSet && exercise && !hasInterveningExercise
            ? immediateCompositeKind(previousWorkSet, provisionalSet, {
                increment: exercise.smallestIncrement,
              })
            : null;
        const priorBlocks = exercise
          ? compositeSetBlocks(completedWorkSets(loggedExercise), {
              increment: exercise.smallestIncrement,
            })
          : [];
        const incompleteTail = priorBlocks.at(-1);
        const tailEndsAtPrevious =
          previousWorkSet !== undefined && incompleteTail?.sets.at(-1)?.id === previousWorkSet.id;
        const normalCandidate = setType !== SetType.warmup && setType !== SetType.finisher;
        // Une tentative sous le seuil de 8 reste une série logique ouverte. La prochaine
        // tentative de difficulté égale ou moindre la complète, sans dépendre du délai de saisie.
        // Rattachement d'une série COMPLÉMENTAIRE, aligné sur `compositeLinkKind` : enchaînée en
        // moins de 30 s après une série encore incomplète. La charge est libre — l'ancienne règle
        // exigeait qu'elle DESCENDE, si bien que 65×2 puis 72,5×7 restaient deux blocs à zéro.
        // Cette décision est prise ICI, au log : c'est elle qui fixe `logicalSetId`, et un id
        // distinct interdit ensuite toute fusion au recalcul.
        const secondsSincePrevious =
          previousWorkSet !== undefined
            ? (timestamp.getTime() - previousWorkSet.timestamp.getTime()) / 1000
            : null;
        const continuesLogicalSet = Boolean(
          exercise &&
            normalCandidate &&
            incompleteTail &&
            tailEndsAtPrevious &&
            incompleteTail.totalReps > 0 &&
            // C'est la BRIÈVETÉ de la série ajoutée qui en fait un complément : sous le minimum,
            // elle n'est pas une série de travail. Au-dessus, elle ouvre son propre bloc — même
            // enchaînée, même à charge plus basse.
            input.reps < SET_STRUCTURE.MIN_REPS_PER_SET &&
            previousWorkSet &&
            !hasInterveningExercise &&
            secondsSincePrevious !== null &&
            secondsSincePrevious >= 0 &&
            secondsSincePrevious <= SET_STRUCTURE.COMPLEMENT_MAX_GAP_SECONDS
        );
        const continuesPreviousRound = continuesLogicalSet || immediateKind !== null;
        const priorRecords =
          exercise && setType !== SetType.warmup && setType !== SetType.finisher && !continuesPreviousRound
            ? buildRecords(exercise, [
                ...collectExerciseHistory(state.history, exercise.id).sets.flat(),
                ...state.active.exercises
                  .filter((candidate) => candidate.exerciseId === exercise.id)
                  .flatMap((candidate) => orderedSets(candidate)),
              ])
            : EMPTY_RECORDS;
        const nextRoundIndex =
          orderedSets(loggedExercise).reduce(
            (max, loggedSet) => Math.max(max, loggedSet.supersetRoundIndex ?? 0),
            0
          ) + 1;
        const roundIndex =
          loggedExercise.supersetGroupId !== null
            ? continuesPreviousRound
              ? previousWorkSet?.supersetRoundIndex ?? Math.max(1, nextRoundIndex - 1)
              : nextRoundIndex
            : null;

        const setId = newId();
        const groupedWithPrevious = continuesLogicalSet || immediateKind !== null;
        const logicalSetId = normalCandidate
          ? groupedWithPrevious
            ? incompleteTail?.leadSet.logicalSetId ?? incompleteTail?.leadSet.id ?? setId
            : setId
          : null;
        const newSet: LoggedSet = {
          id: setId,
          weight: input.weight,
          reps: input.reps,
          setType,
          timestamp,
          setSlotIndex: nextSlot,
          completed: true,
          supersetRoundIndex: roundIndex,
          suggestedWeight: input.suggestedWeight ?? null,
          suggestedReps: input.suggestedReps ?? null,
          predictedRepsAtActualWeight: input.predictedRepsAtActualWeight ?? null,
          suggestedSetType: input.suggestedSetType ?? null,
          suggestionMode: input.suggestionMode ?? null,
          suggestionReasonCodes: [...(input.suggestionReasonCodes ?? [])],
          suggestionEngineVersion: input.suggestionEngineVersion ?? null,
          logicalSetId,
          // Une série sous 8 reps complétée ensuite est une seule série physiologique, même si
          // la baisse de charge ressemble mécaniquement à un drop-set. L'intention enregistrée
          // est donc `completion`; les vrais drop/rest-pause restent détectables séparément.
          setTechnique: continuesLogicalSet ? "completion" : immediateKind,
          reportedRir: input.reportedRir ?? null,
          stopReason: input.stopReason ?? null,
        };

        let session: WorkoutSession = {
          ...state.active,
          exercises: state.active.exercises.map((e) => (e.id === loggedExerciseId ? { ...e, sets: [...e.sets, newSet] } : e)),
        };

        session = autoDetectSupersetIfNeeded(session, loggedExerciseId, newId);
        const activeGroupId = findLoggedExercise(session, loggedExerciseId)?.supersetGroupId;
        if (activeGroupId) session = recomputeSupersetRoundIndices(session, activeGroupId);

        let justHitRecord = state.justHitRecord;
        // `get().records()` peut avoir rempli le cache après la capture de
        // `state` ci-dessus : repartir de la valeur fraîche évite de l'effacer.
        let recordsCache = get().recordsCache;
        let achievement = state.achievement;
        let createdAchievement = false;

        if (exercise && setType === SetType.finisher) {
          const historicalFinishers = collectExerciseHistory(state.history, exercise.id).sets.flat();
          const currentFinishers = state.active.exercises
            .filter((candidate) => candidate.exerciseId === exercise.id)
            .flatMap((candidate) => orderedSets(candidate));
          const kind = classifyFinisher(
            newSet,
            buildFinisherRecords([...historicalFinishers, ...currentFinishers])
          );
          if (kind) {
            justHitRecord = { ...justHitRecord, [newSet.id]: kind };
            achievement = {
              setId: newSet.id,
              kind,
              exerciseName: exercise.name,
              weight: newSet.weight,
              reps: newSet.reps,
            };
            createdAchievement = true;
          }
        } else if (exercise && setType !== SetType.warmup && !continuesPreviousRound) {
          const kind = classify(newSet, exercise, priorRecords);
          if (kind) {
            // Un seul record de CHAQUE type par exercice et par séance. En montant en charge
            // (45×12 puis 52,5×10), chaque série battait la précédente et gardait son étoile :
            // trois étoiles pour une seule vraie progression, et le signal perdait son sens.
            // La dernière série à décrocher un type est la meilleure — elle reprend l'étoile.
            const supersededIds = new Set(
              state.active.exercises
                .filter((candidate) => candidate.exerciseId === exercise.id)
                .flatMap((candidate) => candidate.sets)
                .filter((candidate) => justHitRecord[candidate.id] === kind)
                .map((candidate) => candidate.id)
            );
            if (supersededIds.size > 0) {
              justHitRecord = Object.fromEntries(
                Object.entries(justHitRecord).filter(([setId]) => !supersededIds.has(setId))
              );
            }
            justHitRecord = { ...justHitRecord, [newSet.id]: kind };
            achievement = {
              setId: newSet.id,
              kind,
              exerciseName: exercise.name,
              weight: newSet.weight,
              reps: newSet.reps,
              machineMaxed:
                kind === "heaviestWeight" &&
                !!exercise.maxLoad &&
                newSet.weight >= exercise.maxLoad - 1e-9 &&
                newSet.reps >= exercise.repTargetMin,
            };
            createdAchievement = true;

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

        justHitRecord = sanitizeActiveRecordMarks(
          state.history,
          session,
          state.catalog,
          justHitRecord
        );

        // Rest timer rules.
        const updatedLogged = findLoggedExercise(session, loggedExerciseId)!;
        let rest = state.rest;
        if (updatedLogged.supersetGroupId !== null) {
          rest = isSupersetRoundComplete(session, loggedExerciseId, newSet.id)
            ? {
                exerciseId: loggedExerciseId,
                startedAtMs: Date.now(),
                targetSeconds: state.settings.supersetRestSeconds,
              }
            : null;
        } else {
          rest = {
            exerciseId: loggedExerciseId,
            startedAtMs: Date.now(),
            targetSeconds: exercise?.suggestedRestSeconds ?? state.settings.defaultRestTimerSeconds,
          };
        }

        session = applyReorderAfterValidate(session, loggedExerciseId);
        if (state.activeMode === "monk") {
          session = applyMonkFatigueAwareOrdering(session, state.catalog, loggedExerciseId);
        }

        // Franchir un palier est plus rare qu'un record : calculé sur l'historique complet de
        // l'exercice, séance en cours comprise, pour comparer le niveau avant et après CETTE série.
        let levelUp = state.levelUp;
        if (exercise && setType !== SetType.warmup) {
          const priorSets = [
            ...collectExerciseHistory(state.history, exercise.id).sets.flat(),
            ...state.active.exercises
              .filter((candidate) => candidate.exerciseId === exercise.id)
              .flatMap((candidate) => orderedSets(candidate)),
          ];
          levelUp = detectLevelUp(exercise, priorSets, newSet, state.settings) ?? levelUp;
        }

        set({
          active: session,
          justHitRecord,
          recordsCache,
          achievement,
          levelUp,
          rest,
          // Proposer MÊME si la série vient de décrocher un record : un finisher à
          // hautes reps bat justement souvent un record de la piste NORMALE, et c'est
          // le cas qu'il faut pouvoir corriger. L'overlay de record s'efface au bout
          // de 2 s, la bande reste en bas de l'écran.
          pendingFinisherPrompt:
            promptReason && exercise
              ? { setId, loggedExerciseId, exerciseName: exercise.name, reason: promptReason }
              : state.pendingFinisherPrompt,
        });

        if (createdAchievement && achievement) {
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
        let loggedExerciseId: string | null = null;
        const exercises = state.active.exercises.map((e) => {
          if (!e.sets.some((s) => s.id === setId)) return e;
          exerciseId = e.exerciseId;
          loggedExerciseId = e.id;
          const editedSets = e.sets.map((s) =>
            s.id === setId
              ? {
                  ...s,
                  weight: input.weight,
                  reps: input.reps,
                  setType: input.setType ?? s.setType,
                  // La projection était attachée à l'ancien poids réel : ne jamais conserver
                  // une cible d'apprentissage devenue fausse après correction manuelle.
                  predictedRepsAtActualWeight: null,
                  reportedRir: input.reportedRir !== undefined ? input.reportedRir : s.reportedRir ?? null,
                  stopReason: input.stopReason !== undefined ? input.stopReason : s.stopReason ?? null,
                }
              : s
          );
          return {
            ...e,
            sets: normalizeLogicalSetLinks(editedSets, findExercise(state.catalog, e.exerciseId)),
          };
        });
        const justHitRecord = omitKey(state.justHitRecord, setId);
        const recordsCache = { ...state.recordsCache };
        if (exerciseId) delete recordsCache[exerciseId];
        let session = { ...state.active, exercises };
        const groupId = loggedExerciseId
          ? findLoggedExercise(session, loggedExerciseId)?.supersetGroupId
          : null;
        if (groupId) session = recomputeSupersetRoundIndices(session, groupId);
        set({ active: session, justHitRecord, recordsCache });
      },

      deleteSet: (loggedExerciseId, setId) => {
        const state = get();
        if (!state.active) return;
        const loggedExercise = findLoggedExercise(state.active, loggedExerciseId);
        if (!loggedExercise) return;
        const removedSet = loggedExercise.sets.find((s) => s.id === setId);
        const snapshot = state.active;

        const exercises = state.active.exercises.map((e) =>
          e.id === loggedExerciseId
            ? {
                ...e,
                sets: normalizeLogicalSetLinks(
                  e.sets.filter((s) => s.id !== setId),
                  findExercise(state.catalog, e.exerciseId)
                ),
              }
            : e
        );
        const justHitRecord = omitKey(state.justHitRecord, setId);
        const recordsCache = { ...state.recordsCache };
        delete recordsCache[loggedExercise.exerciseId];

        const message = removedSet
          ? `Série supprimée : ${removedSet.weight > 0 ? `${cleanWeight(removedSet.weight)} kg` : "PDC"} × ${removedSet.reps}`
          : "Série supprimée";

        let session = { ...state.active, exercises };
        if (loggedExercise.supersetGroupId) {
          session = recomputeSupersetRoundIndices(session, loggedExercise.supersetGroupId);
        }

        set({
          active: session,
          justHitRecord,
          recordsCache,
          undo: { message, snapshot },
          // Une proposition qui vise une série supprimée n'a plus de cible.
          pendingFinisherPrompt:
            state.pendingFinisherPrompt?.setId === setId ? null : state.pendingFinisherPrompt,
        });
      },

      undoLastAction: () => {
        const state = get();
        if (!state.undo) return;
        set({ active: state.undo.snapshot, undo: null });
      },

      dismissUndo: () => set({ undo: null }),
      dismissLevelUp: () => set({ levelUp: null }),

      startCardio: () => {
        get().startEmpty("normal");
        set({ cardioIntent: true });
      },
      consumeCardioIntent: () => set({ cardioIntent: false }),

      setBodyWeightEntry: (entry) => {
        const state = get();
        // Une pesée par jour civil : la nouvelle saisie remplace celle du jour.
        const sameDay = (a: Date, b: Date) =>
          a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
        const others = state.bodyWeights.filter((w) => !sameDay(w.measuredOn, entry.measuredOn));
        const bodyWeights = [entry, ...others].sort((a, b) => b.measuredOn.getTime() - a.measuredOn.getTime());
        set({
          bodyWeights,
          // Le moteur de repères et les exercices au poids du corps lisent encore une valeur
          // unique : la garder alignée sur la pesée la plus récente.
          settings: { ...state.settings, bodyWeightKg: bodyWeights[0]?.weightKg ?? state.settings.bodyWeightKg },
        });
      },

      removeBodyWeightEntry: (id) => {
        const state = get();
        const bodyWeights = state.bodyWeights.filter((w) => w.id !== id);
        set({
          bodyWeights,
          settings: { ...state.settings, bodyWeightKg: bodyWeights[0]?.weightKg ?? null },
        });
      },

      confirmFinisherPrompt: () => {
        const state = get();
        const prompt = state.pendingFinisherPrompt;
        if (!state.active || !prompt) return;
        const target = findLoggedExercise(state.active, prompt.loggedExerciseId);
        const original = target?.sets.find((s) => s.id === prompt.setId);
        if (!target || !original) {
          set({ pendingFinisherPrompt: null });
          return;
        }

        // Un finisher sort de la piste de prédiction normale : la série ne doit plus
        // traîner de rattachement logique ni de projection apprise sur son ancien rôle.
        const promoted: LoggedSet = {
          ...original,
          setType: SetType.finisher,
          logicalSetId: null,
          setTechnique: null,
          predictedRepsAtActualWeight: null,
        };
        const session: WorkoutSession = {
          ...state.active,
          exercises: state.active.exercises.map((e) =>
            e.id === prompt.loggedExerciseId
              ? { ...e, sets: e.sets.map((s) => (s.id === prompt.setId ? promoted : s)) }
              : e
          ),
        };

        // Une série requalifiée en finisher ne porte plus AUCUN record : elle quitte la piste
        // normale (son étoile disparaît, le cache se reconstruit depuis l'historique) et la piste
        // finisher n'en décerne pas — un record de finisher se battrait en baissant la charge.
        const justHitRecord = omitKey(state.justHitRecord, prompt.setId);
        const recordsCache = { ...state.recordsCache };
        delete recordsCache[target.exerciseId];
        const achievement = state.achievement?.setId === prompt.setId ? null : state.achievement;

        set({ active: session, pendingFinisherPrompt: null, justHitRecord, recordsCache, achievement });
      },

      dismissFinisherPrompt: () => {
        const state = get();
        const prompt = state.pendingFinisherPrompt;
        if (!prompt) return;
        set({
          pendingFinisherPrompt: null,
          finisherPromptDeclined: state.finisherPromptDeclined.includes(prompt.loggedExerciseId)
            ? state.finisherPromptDeclined
            : [...state.finisherPromptDeclined, prompt.loggedExerciseId],
        });
      },

      // -----------------------------------------------------------------
      // Cardio — séparé des LoggedSet pour ne jamais contaminer le volume.
      // -----------------------------------------------------------------

      addCardioEntry: (input) => {
        const state = get();
        if (!state.active) return;
        const existing = state.active.cardioEntries ?? [];
        const entry: CardioEntry = {
          id: newId(),
          activityType: input.activityType,
          activityName: input.activityName.trim() || "Cardio",
          machineName: input.machineName?.trim() || null,
          machineModel: input.machineModel?.trim() || null,
          durationSeconds: Math.max(0, Math.round(input.durationSeconds)),
          level: input.level == null ? null : Math.max(0, Math.round(input.level)),
          resistance:
            input.resistance == null ? null : Math.max(0, Math.round(input.resistance * 10) / 10),
          distanceKm:
            input.distanceKm == null ? null : Math.max(0, Math.round(input.distanceKm * 100) / 100),
          averageWatts:
            input.averageWatts == null ? null : Math.max(0, Math.round(input.averageWatts)),
          averageHeartRateBpm:
            input.averageHeartRateBpm == null
              ? null
              : Math.max(20, Math.min(260, Math.round(input.averageHeartRateBpm))),
          inclinePercent:
            input.inclinePercent == null ? null : Math.round(input.inclinePercent * 10) / 10,
          orderIndex: existing.length,
        };
        set({ active: { ...state.active, cardioEntries: [...existing, entry] } });
      },

      deleteCardioEntry: (entryId) => {
        const state = get();
        if (!state.active) return;
        const entries = (state.active.cardioEntries ?? [])
          .filter((entry) => entry.id !== entryId)
          .map((entry, index) => ({ ...entry, orderIndex: index }));
        set({ active: { ...state.active, cardioEntries: entries } });
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

        // Machines équivalentes : les séances faites sur une autre machine de la famille, converties
        // dans les unités de celle-ci, prolongent son historique. Seule la SUGGESTION les lit : les
        // records, le signal feu et les variations restent sur l'historique exact de la machine.
        const family = familyHistory(exercise, state.catalog, state.history);
        // Une série de travail se prédit sur des séances de travail : les occurrences en finisher
        // seul ne prennent pas de place dans la fenêtre. Exception : un exercice qui n'a JAMAIS
        // servi autrement garde son profil finisher dédié (patterns.ts, ISOLATION_FINISHER).
        const workContext = collectExerciseHistory(family.history, exercise.id, HISTORY_WINDOW, {
          skipFinisherOnlySessions: true,
        });
        const recentContext =
          workContext.sets.length > 0 ? workContext : collectExerciseHistory(family.history, exercise.id, HISTORY_WINDOW);
        const recentHistory = recentContext.sets;
        const currentSessionSets = orderedSets(loggedExercise).filter((s) => s.completed);
        const fatigueBaselines = buildFatigueBaselines(family.history, state.catalog, exercise.id);
        const transientLatestPrAt = completedWorkSets(loggedExercise)
          .filter((set) => state.justHitRecord[set.id] !== undefined)
          .reduce<Date | null>(
            (latest, set) => (!latest || set.timestamp > latest ? set.timestamp : latest),
            null
          );
        const derivedLatestPrAt = latestDerivedPrAt(state.history, loggedExercise, exercise);
        const latestPrAt =
          transientLatestPrAt && derivedLatestPrAt
            ? transientLatestPrAt > derivedLatestPrAt
              ? transientLatestPrAt
              : derivedLatestPrAt
            : transientLatestPrAt ?? derivedLatestPrAt;
        const anyPrAchievedToday = latestPrAt !== null;
        // Un PR invalide le contexte qui le précédait, pas la fatigue accumulée ensuite. Après
        // un PR, on repart donc d'un contexte incrémental sans baseline historique ; si aucun
        // autre bloc physiologique n'a suivi, le PR reste bien la preuve la plus récente.
        const sessionFatigue = latestPrAt
          ? buildSessionFatigueContext(state.active, state.catalog, loggedExerciseId, undefined, latestPrAt)
          : buildSessionFatigueContext(state.active, state.catalog, loggedExerciseId, fatigueBaselines);
        const prIsLatestEvidence = anyPrAchievedToday && sessionFatigue.priorLoads.length === 0;
        // WS4 — gap daté sur CE mouvement (pas de fusion de variantes ; une machine équivalente
        // convertie compte, le muscle a bien travaillé), et override "Je suis frais" éventuellement
        // armé par l'utilisateur pour cet exercice loggé.
        const gapDays = daysSinceLastExercise(family.history, exercise.id) ?? undefined;
        const gapLestDays = daysSinceLastWeightedExercise(family.history, exercise.id) ?? undefined;
        const freshOverride = state.freshOverrides.has(loggedExerciseId);

        const params: SuggestParams = {
          exercise,
          currentSetIndex: compositeSetBlocks(completedWorkSets(loggedExercise), {
            increment: exercise.smallestIncrement,
          }).length,
          recentHistory,
          historyPositions: recentContext.positions,
          currentSessionSets,
          sessionFatigue,
          gapDays,
          gapLestDays,
          freshOverride,
          // Le PR invalide toujours le diagnostic de cycle « slowing » et toute rotation de
          // variante. `prIsLatestEvidence` reste réservé au masquage de la fatigue apparue avant
          // ou après le PR (sémantique distincte).
          prAchievedToday: anyPrAchievedToday,
          prIsLatestEvidence,
          // ALGO_V2 §5.1 — poids de corps pour weighted/assisted bodyweight (predictReps).
          bodyweightKg: readBodyweightKg(state.settings),
          // VARIATION_CYCLING_SPEC §6/§8 — nécessaire pour résoudre `switchToVariantId` en
          // `Exercise.id` réel (§7.4/§9) et proposer une rotation de variation sur plateau daté (§2/§4).
          catalog: state.catalog,
          sessionHistory: state.history,
          goals: state.goals,
          // BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — profil StrengthLevel pour `readyForLevelUp`/
          // `nextLevelName` (signal feu). DISTINCT de `bodyweightKg` ci-dessus (celui-là a un défaut
          // algorithmique, PAS un vrai profil) : ici, `bodyWeightKg` non renseigné => `resolveStandard`
          // dégrade gracieusement (§9), jamais de valeur inventée pour peupler la jauge.
          profile: { bodyWeightKg: state.settings.bodyWeightKg, gender: state.settings.gender, ageYears: state.settings.ageYears },
        };
        let result = compositeCompletionSuggestion(loggedExercise, exercise) ?? suggest(params);

        // Première séance sur cette machine (aucun historique, même converti) : partir de la série
        // de tête de l'équivalente utilisée récemment plutôt que de 20 kg par défaut. Sans facteur
        // mesuré, c'est un ordre de grandeur annoncé comme tel, recalé dès la première série.
        if (recentContext.sets.length === 0 && currentSessionSets.length === 0 && result.weight > 0) {
          const start = startingPointFromEquivalent(exercise, state.catalog, state.history, new Date());
          if (start) {
            const increment = exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 2.5;
            const rounded = Math.max(increment, Math.round(start.set.weight / increment) * increment);
            const weight = exercise.maxLoad && exercise.maxLoad > 0 ? Math.min(rounded, exercise.maxLoad) : rounded;
            const reps = Math.min(exercise.repTargetMax, Math.max(exercise.repTargetMin, start.set.reps));
            result = {
              ...result,
              weight,
              reps,
              explanation: `Étalonnage · départ d'après ${start.exercise.name} (${cleanWeight(start.set.weight)} kg × ${start.set.reps}), charge à recaler`,
              reasonCodes: [...result.reasonCodes, "equivalent_starting_point"],
            };
          }
        }

        // La référence vient d'une autre machine : le dire, avec le facteur, pour qu'un écart de
        // calibrage se repère tout de suite. Dès la première série du jour, le moteur se recale sur
        // ce qui vient d'être fait ici.
        if (family.latestFrom && currentSessionSets.length === 0) {
          const ratio = family.latestFrom.ratio.toFixed(2).replace(".", ",");
          result = {
            ...result,
            explanation: `D'après ${family.latestFrom.exercise.name} (× ${ratio}) · ${result.explanation}`,
            reasonCodes: [...result.reasonCodes, "equivalent_conversion"],
          };
        }

        // VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : `exercise` EST la variante adoptée par
        // une rotation récemment acceptée -> masque l'indice live (`switchToVariantId`/reasonCodes)
        // ici, même si le moteur pur (`suggest()`, qui ne connaît pas `rotationAcceptedAt`) en a
        // posé un. Même filtre bookkeeping-store que `sessionReview()` ci-dessus, appliqué au chemin
        // "suggestion live" plutôt qu'au bilan.
        if (result.switchToVariantId && isRotationCooldownActive(exercise.id, state.rotationAcceptedAt, new Date())) {
          result = {
            ...result,
            switchToVariantId: null,
            reasonCodes: result.reasonCodes.filter((code) => code !== "variation" && code !== "variation_preemptive"),
          };
        }

        const currentSetIndex = compositeSetBlocks(completedWorkSets(loggedExercise), {
          increment: exercise.smallestIncrement,
        }).length;
        if (state.activeMode === "beast" && currentSetIndex === 1 && result.weight > 0 && result.mode !== "fallback_hypertrophy") {
          const bump = Math.max(1, exercise.smallestIncrement);
          const bumpedReps = result.mode === "plateau_break" ? result.reps : Math.max(exercise.repTargetMin, result.reps - 1);
          result = {
            ...result,
            weight: stepLoad(result.weight, bump, exercise.setPatternMode, true),
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
        if (
          orderedSets(loggedExercise).some(
            (set) => set.completed && set.setType !== SetType.warmup
          )
        ) return null;
        if (warmupSets(loggedExercise).some((s) => s.completed)) return null;
        if (exercise.setPatternMode !== "straight" && exercise.setPatternMode !== "top_set_backoff") return null;
        // Un échauffement prépare un mouvement polyarticulaire lourd (articulations, patron moteur).
        // La seule charge ne suffit pas : 85 kg sur une machine à abdos n'en demande aucun.
        if (!needsWarmup(exercise)) return null;

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

        // Les records sont all-time. Le moteur de suggestion garde, lui, sa
        // fenêtre récente séparée via HISTORY_WINDOW.
        const historicalSets = collectExerciseHistory(state.history, exerciseId).sets.flat();
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

      addRestSeconds: (delta) => {
        const rest = get().rest;
        if (!rest) return;
        set({ rest: { ...rest, targetSeconds: Math.max(5, rest.targetSeconds + delta) } });
      },

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
        selectedStartMode: state.selectedStartMode,
        lastServerSnapshotAt: state.lastServerSnapshotAt,
        rest: state.rest,
        justHitRecord: state.justHitRecord,
        armedSupersetExerciseId: state.armedSupersetExerciseId,
        // Un reload en pleine séance ne doit pas reposer une question déjà refusée.
        // (`pendingFinisherPrompt` reste volontairement éphémère, comme `freshOverrides`.)
        finisherPromptDeclined: state.finisherPromptDeclined,
        // VARIATION_CYCLING_SPEC §8 — l'acceptation d'une rotation de variation peut précéder de
        // plusieurs jours (et un reload) le début de la séance suivante qui la consommera.
        pendingVariantSwitches: state.pendingVariantSwitches,
        treatedVariantSuggestions: state.treatedVariantSuggestions,
        // VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : le cooldown (ROTATION_COOLDOWN_DAYS)
        // doit survivre à un reload, sinon il suffirait de rafraîchir la page pour le contourner.
        rotationAcceptedAt: state.rotationAcceptedAt,
        // OFFLINE_PWA_SPEC §2 (P4.1) — cache OFFLINE des données de référence. Neon reste la
        // source centrale, mais StoreHydrator préserve et réexpédie toute séance locale absente du
        // serveur avant d'appliquer son snapshot. Sans ce cache, un cold-start hors-ligne n'a ni catalogue ni historique ni
        // réglages -> `suggestion()` tomberait en fallback générique (20x10, poids de corps par
        // défaut) au lieu d'utiliser le poids de corps/historique réels de l'utilisateur.
        catalog: state.catalog,
        history: state.history,
        goals: state.goals,
        settings: state.settings,
        templates: state.templates,
        recoveryCheckins: state.recoveryCheckins,
        // Même statut que les autres données de référence : cache offline, jamais la vérité.
        bodyWeights: state.bodyWeights,
      }),
      // localStorage sérialise les Date en chaînes ISO : on les revit à la
      // réhydratation, sinon `session.startTime.getTime()` casse (string).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkoutState>;
        return {
          ...current,
          ...p,
          active: reviveSessionDates(p.active ?? null),
          // OFFLINE_PWA_SPEC §2 (P4.1) — mêmes garanties que `active` ci-dessus, étendues aux
          // données de référence désormais cachées : ne revivifier QUE si `p.<clé>` est bien
          // présent dans le cache persisté (sinon garder `current`, qui porte déjà les valeurs par
          // défaut du store à la construction — jamais de tableau vide écrasant une valeur utile).
          catalog: p.catalog ? reviveCatalogDates(p.catalog) : current.catalog,
          history: p.history ? reviveHistoryDates(p.history) : current.history,
          goals: p.goals ?? current.goals,
          templates: p.templates ? reviveTemplateDates(p.templates) : current.templates,
          recoveryCheckins: p.recoveryCheckins ? reviveRecoveryCheckinDates(p.recoveryCheckins) : current.recoveryCheckins,
          bodyWeights: p.bodyWeights ? reviveBodyWeightDates(p.bodyWeights) : current.bodyWeights,
          settings: p.settings
            ? { ...p.settings, trainingPhaseStartedAt: p.settings.trainingPhaseStartedAt ? toDate(p.settings.trainingPhaseStartedAt) : null }
            : current.settings,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydratedStorage(true);
      },
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors / helpers exposés pour l'UI
// ---------------------------------------------------------------------------

/** Secondes restantes du rest timer courant. Le store ne fait pas tourner de timer — l'UI recalcule via Date.now(). */
export function restRemainingSeconds(state: Pick<WorkoutState, "rest">): number {
  if (!state.rest) return 0;
  const elapsedSeconds = (Date.now() - state.rest.startedAtMs) / 1000;
  return Math.max(0, state.rest.targetSeconds - elapsedSeconds);
}
