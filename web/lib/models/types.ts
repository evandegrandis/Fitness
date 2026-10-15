/**
 * Interfaces du domaine Jeera — miroir des `@Model` SwiftData, sans les
 * annotations SwiftData et sans relations inverses circulaires. Les relations
 * sont modélisées par ID + tableaux imbriqués, à l'image de l'export JSON
 * (`DataExporter.swift`). Les dates sont des `Date` natifs (converties depuis
 * l'ISO 8601 du backup par `lib/models/backup.ts`).
 */

import type {
  BenchmarkUnit,
  FatigueClass,
  MovementPattern,
  PlateauWeakPoint,
  ProgressionPolicy,
  ResistanceProfile,
  SetPatternMode,
  SetType,
  TrainingPhase,
  StopReason,
} from "./enums";
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

/**
 * Origine d'un profil musculaire, de la moins sûre à la plus sûre : `legacy` (profils antérieurs
 * au suivi), `known_profile` (copié d'une machine connue), `donor` (copié d'un exercice ressemblant
 * d'un tap), `barbis` (recherche automatique), `user` (réglé à la main, prioritaire sur tout).
 */
export type ProfileSource = "legacy" | "known_profile" | "donor" | "barbis" | "user";

export const PROFILE_SOURCE_RANK: Record<ProfileSource, number> = {
  legacy: 1,
  known_profile: 2,
  donor: 3,
  barbis: 4,
  user: 5,
};

/** Rang d'une origine de profil ; un exercice sans profil vérifié vaut 0. */
export function profileSourceRank(source: ProfileSource | null | undefined): number {
  return source ? PROFILE_SOURCE_RANK[source] ?? 0 : 0;
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
  /**
   * Charge maximale réelle de la machine (bout de pile), saisie par l'utilisateur. Au-delà, rien
   * n'existe : une fois ce poids atteint, la progression passe par les reps, au-delà de la
   * fourchette s'il le faut pour rejoindre l'échec. `null`/absent = pas de limite connue.
   */
  maxLoad?: number | null;
  /**
   * Décalage de la grille de charges de la machine (`lib/engines/load-grid.ts`) : les charges valent
   * `loadOffset + k × smallestIncrement`. `null`/absent = 0 (la grille part de zéro : 60, 66, 72 pour un pas de 6).
   * Exemple : une pile qui monte 29, 31, 33 a un pas de 2 et un décalage de 1.
   */
  loadOffset?: number | null;
  /**
   * D'où vient le profil musculaire. Décide qui peut le remplacer : un réglage fait à la main
   * (`user`) n'est jamais écrasé, Barbis complète ce que l'app a seulement copié ou deviné.
   * `null`/absent = aucun profil vérifié (exercice créé en salle, à faire cartographier).
   */
  profileSource?: ProfileSource | null;
  /**
   * Famille d'équivalence explicite (machine d'une autre salle pour le même mouvement), posée par
   * Barbis ou à la main. Prime sur la famille déduite du nom (lib/engines/equivalence.ts).
   */
  equivalenceKey?: string | null;
  muscleMappings: MuscleMapping[];
  lastUsed: Date | null;
  /**
   * VARIATION_CYCLING_SPEC §5 — clé de carry-over pour la rotation de variation (§6). `null` si
   * non tagué (exercice créé avant P1.4, ou jamais renseigné) : dégradation gracieuse, la sélection
   * de variante retombe alors sur le recouvrement musculaire seul (§9), jamais de crash.
   */
  movementPattern: MovementPattern | null;
  /**
   * VARIATION_CYCLING_SPEC §5.2 — où l'exercice est le plus dur (cible du point faible
   * mesuré, §6 `weakPointFit`). `null` si non tagué : dégradation gracieuse, `weakPointFit`
   * reste neutre (§9), jamais de crash.
   */
  resistanceProfile: ResistanceProfile | null;
  /**
   * BENCHMARK_LEVEL_SPEC.md §1 — clé dans `data/strength_standards_corrected.json::standards`
   * (le nom d'affichage FR utilisé comme clé JSON, PAS le `slSlug` strengthlevel.com interne
   * à l'entrée). `null` = pas encore de table sourcée pour cet exercice : `lib/engines/benchmark.ts`
   * dégrade gracieusement (`hasBenchmark:false`), jamais de crash — s'active automatiquement dès
   * que le JSON gagne l'entrée correspondante (aucun code à changer).
   */
  strengthStandardKey: string | null;
  /**
   * BENCHMARK_LEVEL_SPEC.md §1 — miroir dénormalisé de `standards[strengthStandardKey].unit`
   * (tenu à jour par `ExerciseEditorSheet.tsx`/le script de peuplement, PAS relu par le moteur
   * qui fait toujours confiance à l'entrée JSON elle-même). Sert aussi de fallback pour
   * interpréter `benchmarkLow`/`benchmarkHigh` (legacy, §1) quand `strengthStandardKey` est
   * `null` et qu'un repère manuel a été saisi. `null` si non renseigné.
   */
  benchmarkUnit: BenchmarkUnit | null;
}

// ---------------------------------------------------------------------------
// LoggedSet / LoggedExercise
// ---------------------------------------------------------------------------

/**
 * Technique qui relie plusieurs lignes loggées à une seule série physiologique.
 * `completion` couvre notamment une mini-série complétée à charge réduite ;
 * les deux autres valeurs conservent l'intention explicite d'une technique
 * d'intensification. Le regroupement lui-même est porté par `logicalSetId`.
 */
export const SET_TECHNIQUES = ["completion", "drop_set", "rest_pause"] as const;
export type SetTechnique = (typeof SET_TECHNIQUES)[number];

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
  /**
   * Snapshot de la recommandation affichée au moment du log. Les propriétés
   * restent optionnelles pour hydrater sans casse les anciens caches
   * localStorage ; les frontières DB/backup les normalisent en `null` / `[]`.
   */
  suggestedWeight?: number | null;
  suggestedReps?: number | null;
  predictedRepsAtActualWeight?: number | null;
  suggestedSetType?: SetType | null;
  suggestionMode?: string | null;
  suggestionReasonCodes?: string[];
  suggestionEngineVersion?: string | null;
  /** ID commun aux lignes qui forment une seule série physiologique. */
  logicalSetId?: string | null;
  /** Technique de regroupement, null pour une série standalone classique. */
  setTechnique?: SetTechnique | null;
  /**
   * RIR rapporté par l'utilisateur (0..4 ; 4 = « 4+ »). `null`/absent = non rapporté.
   * Input brut (pas un état dérivé), facultatif et éditable — oui.rtf #1/#2.
   */
  reportedRir?: number | null;
  /**
   * Raison d'arrêt si la série ne s'est pas terminée à l'échec musculaire visé.
   * `null`/absent = arrêt normal. `pain`/`equipment` excluent la série des baselines
   * de performance (oui.rtf #7, nerf ulnaire).
   */
  stopReason?: StopReason | null;
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
  /**
   * VARIATION_CYCLING_SPEC §5.3/§8 — point faible mesuré, capturé 1-tap à l'entrée en
   * plateau (« où ça a calé ? »). SEULE donnée utilisateur réellement nouvelle persistée par
   * cette feature (input brut, pas un état dérivé). `null` = pas encore répondu (ou plateau
   * jamais atteint sur cette occurrence) : `weakPointFit` reste neutre côté moteur (§9).
   */
  plateauWeakPoint: PlateauWeakPoint | null;
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
// CardioEntry / WorkoutSession
// ---------------------------------------------------------------------------

export const CARDIO_ACTIVITY_TYPES = [
  "running",
  "rowing",
  "cycling",
  "swimming",
  "elliptical",
  "stairs",
  "other",
] as const;

export type CardioActivityType = (typeof CARDIO_ACTIVITY_TYPES)[number];

export interface CardioEntry {
  id: string;
  /** Modalité canonique pour les analyses; `activityName` reste le libellé affiché. */
  activityType: CardioActivityType;
  activityName: string;
  machineName: string | null;
  machineModel: string | null;
  durationSeconds: number;
  level: number | null;
  resistance: number | null;
  distanceKm: number | null;
  averageWatts: number | null;
  averageHeartRateBpm: number | null;
  inclinePercent: number | null;
  orderIndex: number;
}

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
  /**
   * Optionnel uniquement pour tolérer les anciennes séances déjà sérialisées
   * dans localStorage / les backups antérieurs à l'ajout du cardio. Toutes les
   * lectures DB et toutes les nouvelles séances normalisent ce champ à `[]`.
   */
  cardioEntries?: CardioEntry[];
}

/**
 * Copie triée selon l'invariant global du store : séance la plus récente en premier.
 * Le départage par heure puis par id rend le résultat déterministe pour deux imports
 * portant la même date civile.
 */
export function sessionsNewestFirst(sessions: readonly WorkoutSession[]): WorkoutSession[] {
  return [...sessions].sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      b.startTime.getTime() - a.startTime.getTime() ||
      a.id.localeCompare(b.id)
  );
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
  /** Profil utilisé pour contextualiser les repères; null signifie non renseigné. */
  gender: "male" | "female" | null;
  ageYears: number | null;
  /**
   * Phase déclarée. Ne modifie AUCUNE suggestion de charge : elle change la lecture du résultat
   * (en `cut`, tenir sa charge est une réussite et non un plateau à casser).
   */
  trainingPhase: TrainingPhase | null;
  /** Origine du calcul de variation de poids. */
  trainingPhaseStartedAt: Date | null;
  /** Objectif cardio hebdomadaire en minutes ; `null` retombe sur les 150 min du moteur. */
  weeklyCardioMinutesGoal: number | null;
}

/** Pesée datée. Une par jour civil — le poids varie trop dans la journée pour aller plus fin. */
export interface BodyWeightEntry {
  id: string;
  measuredOn: Date;
  weightKg: number;
}

export interface RecoveryCheckin {
  id: string;
  date: Date;
  /** null = inconnu/non confirmé; false et true sont des réponses explicites. */
  tookCreatine: boolean | null;
  proteinTargetMet: boolean | null;
  sleepHours: number | null;
  hadAlcohol: boolean | null;
}

export type RecoveryCheckinInput = RecoveryCheckin;

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

/**
 * Sets éligibles au repère StrengthLevel : uniquement `work`, `topSet`, `backoff` complétés.
 * Les warmups ET finishers sont exclus : les finishers gardent leur piste de record séparée et ne
 * doivent jamais gonfler un niveau, une tendance ou une prédiction normale.
 */
export function completedBenchmarkSets(exercise: LoggedExercise): LoggedSet[] {
  return completedWorkSets(exercise);
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
