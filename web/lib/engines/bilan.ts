/**
 * Bilan post-séance intelligent — recalcul PUR, aucune persistance.
 *
 * Remplace le proxy historique "nb PR / nb sets" (`snapshot.ts::progressionSignal`)
 * par une vraie lecture exercice-par-exercice puis globale, appuyée sur les
 * moteurs existants (progression / effective-sets / records). Répond aux
 * questions d'Evan :
 *   - Ai-je PERFORMÉ aujourd'hui ?
 *   - Ai-je débloqué / suis-je en train d'entrer en plateau ?
 *   - Un anti-plateau a-t-il échoué (à changer) ?
 *   - Ai-je été trop / pas assez ambitieux ?
 *   - (Global) séance efficace : couverture musculaire, records battus.
 *
 * Convention historique : `history` est trié du plus récent au plus ancien
 * (comme partout ailleurs dans le store), et ne contient JAMAIS la séance en
 * cours de revue — `session` est passée séparément, toujours exclue de
 * `history` par l'appelant (voir `sessionReview` dans `lib/store/workout.ts`).
 */

import { buildRecords, classify, displayedRecordSetIDs, type RecordKind } from "@/lib/engines/records";
import { deriveState, suggest, SuggestionMode, type SuggestionMode as SuggestionModeT } from "@/lib/engines/progression";
import { coverageStatusLabel, rolling7DayProgress, type ParentMuscleProgress } from "@/lib/engines/effective-sets";
import { HISTORY_WINDOW, RECORDS_HISTORY_WINDOW } from "@/lib/engines/constants";
import { setsForNormalPrediction } from "@/lib/engines/set-structure";
import { parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import {
  completedWorkSets,
  primaryParent,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";
import { recentWorkSetsForExercise } from "@/lib/store/workout";

// ---------------------------------------------------------------------------
// Helpers génériques
// ---------------------------------------------------------------------------

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

/** Effort effectif (mêmes règles que `progression.ts::effectiveLoad`) : assistedBodyweight inverse le signe. */
function effectiveEffort(exercise: Exercise, weight: number): number {
  return exercise.setPatternMode === "assisted_bodyweight" ? -weight : weight;
}

/**
 * "Meilleur" work set complété de la séance du jour pour un exercice donné :
 * le plus lourd (effort effectif) puis, à égalité, le plus de reps. Miroir
 * conceptuel de `classifyAnchor` (progression.ts) mais restreint aux sets
 * réellement complétés aujourd'hui — sert de référence de comparaison pour
 * "performed".
 */
function bestSetOfSession(logged: LoggedExercise, exercise: Exercise): LoggedSet | null {
  const sets = setsForNormalPrediction(completedWorkSets(logged), {
    increment: exercise.smallestIncrement,
  });
  if (sets.length === 0) return null;
  return sets.reduce((best, cur) => {
    const bestEffort = effectiveEffort(exercise, best.weight);
    const curEffort = effectiveEffort(exercise, cur.weight);
    if (curEffort !== bestEffort) return curEffort > bestEffort ? cur : best;
    return cur.reps > best.reps ? cur : best;
  });
}

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Libellé FR du signal de performance global. */
export type PerformanceLabel = "Bonne séance" | "En demi-teinte" | "Difficile";

export interface PlateauReview {
  /** true si l'exercice était considéré en plateau (>= 3 séances) avant la séance du jour. */
  wasInPlateau: boolean;
  /** Nombre de séances consécutives au plateau, mesuré sur l'historique HORS séance du jour. */
  plateauCounterBefore: number;
  /** true si la séance du jour a cassé le plateau (charge ou reps au-delà de l'ancre de plateau). */
  brokenToday: boolean;
  /** true si la séance du jour prolonge/installe un plateau (même charge, reps non améliorées). */
  enteringOrOngoing: boolean;
  /** Libellé FR prêt à afficher. */
  message: string | null;
}

export interface AmbitionReview {
  tooAmbitious: boolean;
  notAmbitiousEnough: boolean;
  /** Nombre de work sets sous repTargetMin (utilisé par tooAmbitious). */
  underMinCount: number;
  /** Nombre total de work sets complétés. */
  totalWorkSets: number;
}

export interface ExerciseReview {
  loggedExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  parent: MuscleParent | null;

  /** true si aucun work set complété aujourd'hui — le reste des champs est neutre. */
  noData: boolean;

  // -- Performé ? ------------------------------------------------------------
  performed: boolean;
  /** Suggestion de référence recalculée sans la séance du jour (charge/reps attendues). */
  referenceWeight: number;
  referenceReps: number;
  /** Meilleur set réellement réalisé aujourd'hui. */
  achievedWeight: number;
  achievedReps: number;
  /** Écart chiffré : kg si la charge diffère, sinon reps à charge égale. */
  gapKg: number;
  gapReps: number;
  performedMessage: string;

  // -- Plateau -----------------------------------------------------------------
  plateau: PlateauReview;

  // -- Ambition ------------------------------------------------------------------
  ambition: AmbitionReview;

  // -- Anti-plateau échoué ---------------------------------------------------------
  antiPlateauFailed: boolean;

  // -- Records de la séance pour cet exercice --------------------------------------
  recordKinds: RecordKind[];
}

export interface SessionReview {
  performanceSignal: number;
  performanceLabel: PerformanceLabel;

  exercises: ExerciseReview[];

  outperformed: string[];
  underperformed: string[];
  plateausBroken: string[];
  enteringPlateau: string[];
  tooAmbitious: string[];
  notAmbitiousEnough: string[];
  antiPlateauFailed: string[];

  coverage: SessionCoverage;
  records: SessionRecordHighlight[];
}

export interface SessionCoverage {
  /** Parents musculaires effectivement travaillés pendant CETTE séance (sets > 0). */
  workedParents: MuscleParent[];
  /** Couverture roulante 7 jours (historique + séance du jour), pour situer l'effort dans la semaine. */
  parentProgress: ParentMuscleProgress[];
  /** Parents avec statut "priority"/"toStrengthen" malgré la séance du jour. */
  stillNeedsWork: { parent: MuscleParent; label: string; remaining: number }[];
  message: string;
}

export interface SessionRecordHighlight {
  exerciseName: string;
  kind: RecordKind;
  weight: number;
  reps: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  heaviestWeight: "Nouveau poids max",
  estimated1RM: "Nouveau 1RM estimé",
  repsAtWeight: "Plus de reps à ce poids",
  bodyweightReps: "Plus de reps au poids du corps",
};

// ---------------------------------------------------------------------------
// Par exercice
// ---------------------------------------------------------------------------

function buildAmbitionReview(exercise: Exercise, workSets: LoggedSet[]): AmbitionReview {
  const underMinCount = workSets.filter((s) => s.reps < exercise.repTargetMin).length;
  const totalWorkSets = workSets.length;
  const tooAmbitious = underMinCount >= 2;
  const notAmbitiousEnough = totalWorkSets > 0 && workSets.every((s) => s.reps >= exercise.repTargetMax);
  return { tooAmbitious, notAmbitiousEnough, underMinCount, totalWorkSets };
}

function buildPlateauReview(
  exercise: Exercise,
  historyBeforeToday: LoggedSet[][],
  increment: number,
  bestToday: LoggedSet
): PlateauReview {
  const derivedBefore = deriveState(exercise, historyBeforeToday, increment);
  const wasInPlateau = derivedBefore.plateauCounter >= 3;

  const plateauLoad = derivedBefore.targetLoad;
  const plateauReps = derivedBefore.bestRepAtTarget;

  const todayEffort = effectiveEffort(exercise, bestToday.weight);
  const plateauEffort = effectiveEffort(exercise, plateauLoad);

  const brokenToday =
    wasInPlateau &&
    (todayEffort > plateauEffort + 0.01 || (Math.abs(todayEffort - plateauEffort) < 0.01 && bestToday.reps > plateauReps));

  const sameLoadNoImprovement =
    Math.abs(todayEffort - plateauEffort) < 0.01 && bestToday.reps <= plateauReps;
  const enteringOrOngoing = !brokenToday && (wasInPlateau || derivedBefore.plateauCounter >= 2) && sameLoadNoImprovement;

  let message: string | null = null;
  if (brokenToday) {
    message = `Plateau débloqué aujourd'hui (${derivedBefore.plateauCounter} séances bloquées à ${cleanWeight(plateauLoad)}kg×${plateauReps})`;
  } else if (wasInPlateau) {
    message = `Toujours en plateau depuis ${derivedBefore.plateauCounter} séances`;
  } else if (enteringOrOngoing) {
    message = `Entre en plateau (${derivedBefore.plateauCounter + 1} séances à charge égale)`;
  }

  return {
    wasInPlateau,
    plateauCounterBefore: derivedBefore.plateauCounter,
    brokenToday,
    enteringOrOngoing,
    message,
  };
}

/**
 * Recalcule le mode de suggestion qui aurait été proposé EN DÉBUT de la
 * séance précédente (history[0]), c'est-à-dire en excluant cette séance et
 * tout ce qui suit — utilisé uniquement pour détecter un anti-plateau
 * échoué. `history` doit être triée du plus récent au plus ancien.
 */
function previousSessionSuggestionMode(exercise: Exercise, history: LoggedSet[][], increment: number): SuggestionModeT | null {
  if (history.length === 0) return null;
  const priorToPrevious = history.slice(1);
  const suggestion = suggest({
    exercise,
    currentSetIndex: 0,
    recentHistory: priorToPrevious,
    currentSessionSets: [],
    smallestIncrement: increment,
  });
  return suggestion.mode;
}

function buildExerciseReview(
  logged: LoggedExercise,
  exercise: Exercise,
  fullHistory: WorkoutSession[],
  increment: number
): ExerciseReview | null {
  const workSetsToday = setsForNormalPrediction(completedWorkSets(logged), { increment });
  const parent = primaryParent(exercise);

  if (workSetsToday.length === 0) {
    return null;
  }

  const bestToday = bestSetOfSession(logged, exercise)!;

  // Historique HORS séance du jour, le plus récent en premier.
  const historyBeforeToday = recentWorkSetsForExercise(fullHistory, exercise.id, HISTORY_WINDOW);

  // -- Performé ? : suggestion de référence recalculée sans la séance du jour --------
  const reference = suggest({
    exercise,
    currentSetIndex: 0,
    recentHistory: historyBeforeToday,
    currentSessionSets: [],
    smallestIncrement: increment,
  });

  const referenceEffort = effectiveEffort(exercise, reference.weight);
  const achievedEffort = effectiveEffort(exercise, bestToday.weight);

  let performed: boolean;
  let gapKg = 0;
  let gapReps = 0;
  let performedMessage: string;

  if (Math.abs(achievedEffort - referenceEffort) < 0.01) {
    gapReps = bestToday.reps - reference.reps;
    performed = gapReps >= 0;
    performedMessage = performed
      ? gapReps > 0
        ? `Performé — ${cleanWeight(bestToday.weight)}kg×${bestToday.reps}, +${gapReps} reps vs attendu`
        : `Performé — objectif atteint (${cleanWeight(bestToday.weight)}kg×${bestToday.reps})`
      : `En dessous — ${cleanWeight(bestToday.weight)}kg×${bestToday.reps} au lieu de ×${reference.reps} attendu`;
  } else {
    gapKg = achievedEffort - referenceEffort;
    performed = gapKg > 0;
    performedMessage = performed
      ? `Performé — ${cleanWeight(bestToday.weight)}kg, +${cleanWeight(Math.abs(gapKg))}kg vs charge attendue`
      : `En dessous — ${cleanWeight(bestToday.weight)}kg au lieu de ${cleanWeight(reference.weight)}kg attendu`;
  }

  // -- Plateau -----------------------------------------------------------------------
  const plateau = buildPlateauReview(exercise, historyBeforeToday, increment, bestToday);

  // -- Ambition ------------------------------------------------------------------------
  const ambition = buildAmbitionReview(exercise, workSetsToday);

  // -- Anti-plateau échoué : la séance PRÉCÉDENTE était en mode plateauBreak, et l'ancre
  // d'aujourd'hui reste sous repMin -> la tentative de casser le plateau n'a pas tenu.
  const previousMode = previousSessionSuggestionMode(exercise, historyBeforeToday, increment);
  const antiPlateauFailed = previousMode === SuggestionMode.plateauBreak && bestToday.reps < exercise.repTargetMin;

  // -- Records de la séance ------------------------------------------------------------
  const recordsHistory = recentWorkSetsForExercise(fullHistory, exercise.id, RECORDS_HISTORY_WINDOW).flat();
  const priorRecords = buildRecords(exercise, recordsHistory);
  const displayedIds = displayedRecordSetIDs(logged, workSetsToday, exercise);
  const recordKinds: RecordKind[] = [];
  for (const s of workSetsToday) {
    if (!displayedIds.has(s.id)) continue;
    const kind = classify(s, exercise, priorRecords);
    if (kind) recordKinds.push(kind);
  }

  return {
    loggedExerciseId: logged.id,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    parent,
    noData: false,
    performed,
    referenceWeight: reference.weight,
    referenceReps: reference.reps,
    achievedWeight: bestToday.weight,
    achievedReps: bestToday.reps,
    gapKg,
    gapReps,
    performedMessage,
    plateau,
    ambition,
    antiPlateauFailed,
    recordKinds,
  };
}

// ---------------------------------------------------------------------------
// Couverture de séance
// ---------------------------------------------------------------------------

function buildCoverage(
  session: WorkoutSession,
  catalog: Exercise[],
  history: WorkoutSession[],
  goals: MuscleGoal[]
): SessionCoverage {
  const exerciseIndex = new Map(catalog.map((e) => [e.id, e]));
  const workedParents = new Set<MuscleParent>();
  for (const logged of session.exercises) {
    if (completedWorkSets(logged).length === 0) continue;
    const exercise = exerciseIndex.get(logged.exerciseId);
    const parent = exercise ? primaryParent(exercise) : null;
    if (parent) workedParents.add(parent);
  }

  const parentProgress = rolling7DayProgress(history, catalog, goals, session.date, session);

  const stillNeedsWork = parentProgress
    .filter((p) => p.status === "priority" || p.status === "toStrengthen")
    .sort((a, b) => b.remaining - a.remaining)
    .map((p) => ({ parent: p.parent, label: coverageStatusLabel[p.status], remaining: p.remaining }));

  const workedNames = [...workedParents].map((p) => parentDisplayName[p]).sort((a, b) => a.localeCompare(b));
  const message =
    workedNames.length === 0
      ? "Aucun groupe musculaire travaillé"
      : stillNeedsWork.length === 0
        ? `Groupes travaillés : ${workedNames.join(", ")} — couverture 7 jours au vert`
        : `Groupes travaillés : ${workedNames.join(", ")} — encore à renforcer : ${stillNeedsWork
            .slice(0, 2)
            .map((s) => parentDisplayName[s.parent].toLowerCase())
            .join(" et ")}`;

  return { workedParents: [...workedParents], parentProgress, stillNeedsWork, message };
}

// ---------------------------------------------------------------------------
// Records de la séance (résumé global)
// ---------------------------------------------------------------------------

function buildSessionRecords(exercises: ExerciseReview[]): SessionRecordHighlight[] {
  return exercises.flatMap((review) =>
    review.recordKinds.map((kind) => ({
      exerciseName: review.exerciseName,
      kind,
      weight: review.achievedWeight,
      reps: review.achievedReps,
      label: `${review.exerciseName} — ${RECORD_KIND_LABEL[kind]} (${
        review.achievedWeight > 0 ? `${cleanWeight(review.achievedWeight)}kg×${review.achievedReps}` : `BW×${review.achievedReps}`
      })`,
    }))
  );
}

// ---------------------------------------------------------------------------
// Point d'entrée principal
// ---------------------------------------------------------------------------

/**
 * Construit le bilan complet d'une séance. `history` NE DOIT PAS contenir
 * `session` elle-même (toujours la séance déjà retirée / pas encore ajoutée
 * à l'historique — voir `sessionReview` dans le store). `catalog` est la
 * liste complète des exercices, `goals` les objectifs hebdomadaires (facultatif,
 * défaut []).
 */
export function buildSessionReview(
  session: WorkoutSession,
  history: WorkoutSession[],
  catalog: Exercise[],
  goals: MuscleGoal[] = []
): SessionReview {
  const exerciseIndex = new Map(catalog.map((e) => [e.id, e]));
  const settingsIncrement = 2.5;

  const exercises: ExerciseReview[] = [];
  for (const logged of [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const exercise = exerciseIndex.get(logged.exerciseId);
    if (!exercise) continue;
    const increment = exercise.smallestIncrement || settingsIncrement;
    const review = buildExerciseReview(logged, exercise, history, increment);
    if (review) exercises.push(review);
  }

  const outperformed = exercises.filter((e) => e.performed).map((e) => e.exerciseName);
  const underperformed = exercises.filter((e) => !e.performed).map((e) => e.exerciseName);
  const plateausBroken = exercises.filter((e) => e.plateau.brokenToday).map((e) => e.exerciseName);
  const enteringPlateau = exercises
    .filter((e) => e.plateau.enteringOrOngoing || (e.plateau.wasInPlateau && !e.plateau.brokenToday))
    .map((e) => e.exerciseName);
  const tooAmbitious = exercises.filter((e) => e.ambition.tooAmbitious).map((e) => e.exerciseName);
  const notAmbitiousEnough = exercises.filter((e) => e.ambition.notAmbitiousEnough).map((e) => e.exerciseName);
  const antiPlateauFailed = exercises.filter((e) => e.antiPlateauFailed).map((e) => e.exerciseName);

  const performanceSignal = exercises.length > 0 ? Math.round((outperformed.length / exercises.length) * 100) : 0;
  const performanceLabel: PerformanceLabel =
    exercises.length === 0
      ? "Difficile"
      : performanceSignal >= 60
        ? "Bonne séance"
        : performanceSignal >= 35
          ? "En demi-teinte"
          : "Difficile";

  const coverage = buildCoverage(session, catalog, history, goals);
  const records = buildSessionRecords(exercises);

  return {
    performanceSignal,
    performanceLabel,
    exercises,
    outperformed,
    underperformed,
    plateausBroken,
    enteringPlateau,
    tooAmbitious,
    notAmbitiousEnough,
    antiPlateauFailed,
    coverage,
    records,
  };
}
