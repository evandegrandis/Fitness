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

import {
  buildFinisherRecords,
  buildRecords,
  classify,
  classifyFinisher,
  displayedRecordSetIDs,
  type RecordKind,
} from "@/lib/engines/records";
import {
  deriveState,
  deriveStateV2,
  suggest,
  SuggestionMode,
  type SetSuggestion,
  type SuggestParams,
  type SuggestionMode as SuggestionModeT,
} from "@/lib/engines/progression";
import { coverageStatusLabel, rolling7DayProgress, type ParentMuscleProgress } from "@/lib/engines/effective-sets";
import { HISTORY_WINDOW } from "@/lib/engines/constants";
import { physiologicalSetUnits, setsForNormalPrediction } from "@/lib/engines/set-structure";
import { collectExerciseHistory, type HistoryPosition } from "@/lib/engines/patterns";
import { estimated1RM } from "@/lib/engines/e1rm";
import { selectAlternative } from "@/lib/engines/variation-select";
import type { SessionFatigueContext } from "@/lib/engines/session-fatigue";
import { SetType } from "@/lib/models/enums";
import type { PlateauWeakPoint } from "@/lib/models/enums";
import { parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import {
  completedWorkSets,
  orderedSets,
  primaryParent,
  sessionsNewestFirst,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Helpers génériques
// ---------------------------------------------------------------------------

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

function formatSet(weight: number, reps: number): string {
  return weight > 0 ? `${cleanWeight(weight)}kg×${reps}` : `BW×${reps}`;
}

/** Effort effectif (mêmes règles que `progression.ts::effectiveLoad`) : assistedBodyweight inverse le signe. */
function effectiveEffort(exercise: Exercise, weight: number): number {
  return exercise.setPatternMode === "assisted_bodyweight" ? -weight : weight;
}

/** VARIATION_CYCLING_SPEC §2/§8 — libellé FR "N jours" (+ rappel semaines au-delà du seuil de plateau). */
function plateauStalledLabel(days: number): string {
  const dayLabel = `${days} j${days > 1 ? "s" : ""}`;
  if (days < 14) return dayLabel;
  const weeks = Math.floor(days / 7);
  const weekLabel = weeks <= 1 ? "1 semaine" : `${weeks} semaines`;
  return `${dayLabel} (~${weekLabel})`;
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
  const qualifying = sets.filter((set) => set.reps >= exercise.repTargetMin);
  let pool = qualifying.length > 0 ? qualifying : sets;
  if (exercise.setPatternMode === "weighted_bodyweight" && pool.some((set) => set.weight > 0)) {
    pool = pool.filter((set) => set.weight > 0);
  }
  return pool.reduce((best, cur) => {
    if (exercise.setPatternMode !== "assisted_bodyweight" && best.weight > 0 && cur.weight > 0) {
      const bestStrength = estimated1RM(best.weight, best.reps);
      const currentStrength = estimated1RM(cur.weight, cur.reps);
      if (Math.abs(currentStrength - bestStrength) > 0.01) return currentStrength > bestStrength ? cur : best;
    }
    const bestEffort = effectiveEffort(exercise, best.weight);
    const curEffort = effectiveEffort(exercise, cur.weight);
    if (curEffort !== bestEffort) return curEffort > bestEffort ? cur : best;
    return cur.reps > best.reps ? cur : best;
  });
}

function daysSinceMatchingSession(
  history: WorkoutSession[],
  exerciseId: string,
  now: Date,
  predicate: (set: LoggedSet) => boolean
): number | undefined {
  for (const historicalSession of sessionsNewestFirst(history)) {
    const found = historicalSession.exercises.some(
      (logged) => logged.exerciseId === exerciseId && logged.sets.some((set) => set.completed && predicate(set))
    );
    if (found) {
      return Math.max(0, Math.floor((now.getTime() - historicalSession.date.getTime()) / 86_400_000));
    }
  }
  return undefined;
}

function mergeExerciseOccurrences(session: WorkoutSession): LoggedExercise[] {
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const grouped = new Map<string, LoggedExercise[]>();
  for (const logged of ordered) {
    const current = grouped.get(logged.exerciseId) ?? [];
    current.push(logged);
    grouped.set(logged.exerciseId, current);
  }

  return [...grouped.values()].map((occurrences) => {
    const first = occurrences[0];
    const sets = occurrences
      .flatMap((logged) => logged.sets.map((set) => ({ set, orderIndex: logged.orderIndex })))
      .sort(
        (a, b) =>
          a.set.timestamp.getTime() - b.set.timestamp.getTime() ||
          a.orderIndex - b.orderIndex ||
          a.set.setSlotIndex - b.set.setSlotIndex
      )
      .map(({ set }, setSlotIndex) => ({ ...set, setSlotIndex }));
    return {
      ...first,
      orderIndex: Math.min(...occurrences.map((logged) => logged.orderIndex)),
      sets,
    };
  });
}

function comparePerformance(
  exercise: Exercise,
  achieved: LoggedSet,
  reference: Pick<SetSuggestion, "weight" | "reps">
): { performed: boolean; gapKg: number; gapReps: number; message: string } {
  const referenceEffort = effectiveEffort(exercise, reference.weight);
  const achievedEffort = effectiveEffort(exercise, achieved.weight);
  const sameLoad = Math.abs(achievedEffort - referenceEffort) < 0.01;

  if (sameLoad) {
    const gapReps = achieved.reps - reference.reps;
    const performed = gapReps >= 0;
    return {
      performed,
      gapKg: 0,
      gapReps,
      message: performed
        ? gapReps > 0
          ? `Performé — ${formatSet(achieved.weight, achieved.reps)}, +${gapReps} reps vs attendu`
          : `Performé — objectif atteint (${formatSet(achieved.weight, achieved.reps)})`
        : `En dessous — ${formatSet(achieved.weight, achieved.reps)} au lieu de ×${reference.reps} attendu`,
    };
  }

  const gapKg = achievedEffort - referenceEffort;
  const repsQualify = achieved.reps >= exercise.repTargetMin;
  let performed = false;
  if (repsQualify && exercise.setPatternMode !== "assisted_bodyweight" && achieved.weight > 0 && reference.weight > 0) {
    performed = estimated1RM(achieved.weight, achieved.reps) >= estimated1RM(reference.weight, reference.reps);
  } else if (repsQualify) {
    performed = gapKg > 0;
  }

  return {
    performed,
    gapKg,
    gapReps: 0,
    message: performed
      ? `Performé — ${formatSet(achieved.weight, achieved.reps)}, effort équivalent ou supérieur`
      : `En dessous — ${formatSet(achieved.weight, achieved.reps)} vs ${formatSet(reference.weight, reference.reps)} attendu`,
  };
}

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Libellé FR du signal de performance global. */
export type PerformanceLabel = "Bonne séance" | "En demi-teinte" | "Difficile";

export interface PlateauReview {
  /**
   * true si l'exercice était considéré en plateau AVANT la séance du jour. VARIATION_CYCLING_SPEC
   * §2 : trigger officiel = `isPlateau` (date-based, 14j + >=2 séances) pour le chemin v2 ; le
   * chemin v1 (`assisted_bodyweight`/`ramping`, sans champs datés — voir §9, décision d'impl.
   * tracée en P1.3) reste sur l'ancien seuil `plateauCounter >= 3`.
   */
  wasInPlateau: boolean;
  /** Nombre de séances consécutives au plateau (valeur dérivée annexe, cf. spec §2 : "conservé si un site en dépend"), mesuré sur l'historique HORS séance du jour. */
  plateauCounterBefore: number;
  /** Jours depuis le dernier record (e1RM) sur le rôle dominant, HORS séance du jour. `null` pour le chemin v1 (pas de date-based en Phase 1). */
  plateauStalledDaysBefore: number | null;
  /** true si la séance du jour a cassé le plateau (charge ou reps au-delà de l'ancre de plateau). */
  brokenToday: boolean;
  /** true si la séance du jour prolonge/installe un plateau (même charge, reps non améliorées). */
  enteringOrOngoing: boolean;
  /** Libellé FR prêt à afficher. */
  message: string | null;
  /**
   * VARIATION_CYCLING_SPEC §8 — carte de suggestion (« accepter / refuser ») quand `wasInPlateau`
   * (chemin v2 uniquement, `isPlateau`) : variante candidate calculée par `selectAlternative` (§6).
   * `null` si pas de plateau v2, ou si `selectAlternative` n'a trouvé aucun pair valide (§9, pas de
   * crash — le fallback est alors le deload réactif existant). Le store (`sessionReview()`,
   * `lib/store/workout.ts`) masque ce champ une fois la suggestion acceptée/refusée pour CETTE
   * séance précise (carte non-permanente, §8 "disparaît une fois traitée").
   */
  suggestedVariant: { exerciseId: string; exerciseName: string; explanationFR: string } | null;
  /**
   * VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — point faible mesuré déjà capturé pour CETTE
   * occurrence (`logged.plateauWeakPoint`, lu tel quel — jamais dérivé ici). `null` = pas
   * encore répondu. Alimente `weakPointFit` dans `selectAlternative` (voir `suggestedVariant`
   * ci-dessus) : un `explanationFR` mentionnant "point faible" implique que ce champ n'était
   * PAS `null` au moment du calcul.
   */
  weakPoint: PlateauWeakPoint | null;
  /**
   * VARIATION_CYCLING_SPEC §8 — true ssi la capture 1-tap « où ça a calé ? » doit être proposée
   * MAINTENANT : uniquement à l'entrée en plateau (`wasInPlateau && !brokenToday`, chemin v2) ET
   * pas encore répondu (`weakPoint === null`). Contextuelle par construction : redevient `false`
   * dès que `weakPoint` est renseigné (le composant qui consomme ce champ doit alors cacher le
   * 1-tap, §8 "disparaît une fois traitée") ou dès que le plateau n'est plus actif.
   */
  needsWeakPointCapture: boolean;
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
  /** Records avec le set exact qui les a produits (source des libellés globaux). */
  recordAchievements: { kind: RecordKind; setId: string; weight: number; reps: number }[];
}

export interface SessionReviewOptions {
  bodyweightKg?: number;
  /** Contexte de fatigue réellement présent avant chaque exercice, indexé par LoggedExercise.id. */
  sessionFatigueByLoggedExerciseId?: Record<string, SessionFatigueContext>;
  /** Suggestion effectivement montrée en live ; prioritaire sur tout recalcul. */
  referenceSuggestionByLoggedExerciseId?: Record<string, SetSuggestion>;
  /** Extensions avancées du contexte de suggestion calculées par l'intégration. */
  suggestionContextForExercise?: (
    logged: LoggedExercise,
    exercise: Exercise
  ) => Partial<Omit<SuggestParams, "exercise" | "currentSetIndex" | "recentHistory" | "currentSessionSets">>;
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
  finisherReps: "Plus de reps en finisher",
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
  historyPositions: HistoryPosition[] | undefined,
  increment: number,
  bestToday: LoggedSet,
  catalog: Exercise[],
  fullHistory: WorkoutSession[],
  goals: MuscleGoal[],
  /**
   * VARIATION_CYCLING_SPEC §5.3/§8 (P2.1) — point faible déjà capturé pour l'occurrence en
   * cours de revue (`logged.plateauWeakPoint` de `buildExerciseReview`, lu tel quel, jamais
   * dérivé). `null` = pas encore répondu.
   */
  weakPoint: PlateauWeakPoint | null
): PlateauReview {
  const alwaysLegacy = exercise.setPatternMode === "assisted_bodyweight" || exercise.setPatternMode === "ramping";
  let plateauCounter: number;
  let plateauStalledDays: number | null;
  let plateauLoad: number;
  let plateauReps: number;
  let isPlateau: boolean;
  let approachingPlateau: boolean; // §3 "slowing" (v2) / heuristique legacy (v1)
  let stalledLabel: string;

  if (alwaysLegacy) {
    // VARIATION_CYCLING_SPEC §9 — décision d'impl. tracée (P1.3) : le chemin v1
    // (assisted_bodyweight/ramping) n'a pas de plateau daté — `deriveState` v1 ne calcule pas
    // isPlateau/lastProgressDate (réservé à `deriveStateV2`, cf. P1.2). Trigger officiel = isPlateau
    // pour le reste de l'app ; ce chemin garde l'ancien seuil par nb de séances, en attendant une
    // éventuelle extension v1 (non prévue en Phase 1, cf. spec §9).
    const legacy = deriveState(exercise, historyBeforeToday, increment);
    plateauCounter = legacy.plateauCounter;
    plateauStalledDays = null;
    plateauLoad = legacy.targetLoad;
    plateauReps = legacy.bestRepAtTarget;
    isPlateau = plateauCounter >= 3;
    approachingPlateau = plateauCounter >= 2;
    stalledLabel = `${plateauCounter} séance${plateauCounter > 1 ? "s" : ""}`;
  } else {
    const v2 = deriveStateV2(exercise, historyBeforeToday, increment, historyPositions, undefined);
    const usesTop = v2.pattern === "TOP_SET_BACKOFF" || v2.pattern === "WEIGHTED_BW_VARIABLE";
    const anchors = usesTop && v2.topHistory.length > 0 ? v2.topHistory : v2.amorceHistory;
    plateauCounter = v2.plateauCounter;
    plateauStalledDays = v2.plateauStalledDays;
    plateauLoad = anchors[0]?.weight ?? (usesTop ? (v2.topTarget ?? v2.amorceTarget) : v2.amorceTarget);
    plateauReps =
      anchors
        .filter((anchor) => Math.abs(anchor.weight - plateauLoad) < 0.01)
        .reduce((max, anchor) => Math.max(max, anchor.reps), 0) || exercise.repTargetMin;
    // Trigger officiel VARIATION_CYCLING_SPEC §2 : isPlateau (date-based), remplace plateauCounter >= 3.
    isPlateau = v2.isPlateau;
    // §3 : "slowing" = on se rapproche d'un plateau (préemptif), sans y être encore.
    approachingPlateau = v2.progressionState === "slowing";
    stalledLabel = plateauStalledLabel(plateauStalledDays ?? 0);
  }
  const wasInPlateau = isPlateau;

  const todayEffort = effectiveEffort(exercise, bestToday.weight);
  const plateauEffort = effectiveEffort(exercise, plateauLoad);

  const brokenToday =
    wasInPlateau &&
    (todayEffort > plateauEffort + 0.01 || (Math.abs(todayEffort - plateauEffort) < 0.01 && bestToday.reps > plateauReps));

  const sameLoadNoImprovement =
    Math.abs(todayEffort - plateauEffort) < 0.01 && bestToday.reps <= plateauReps;
  const enteringOrOngoing = !brokenToday && (wasInPlateau || approachingPlateau) && sameLoadNoImprovement;

  let message: string | null = null;
  if (brokenToday) {
    message = `Plateau débloqué aujourd'hui (bloqué depuis ${stalledLabel} à ${cleanWeight(plateauLoad)}kg×${plateauReps})`;
  } else if (wasInPlateau) {
    message = `Toujours en plateau depuis ${stalledLabel}`;
  } else if (enteringOrOngoing) {
    message = alwaysLegacy
      ? `Entre en plateau (${stalledLabel} à charge égale)`
      : `Progrès qui ralentit sur cet exercice — approche d'un plateau`;
  }

  // VARIATION_CYCLING_SPEC §8 — carte de suggestion : uniquement chemin v2 (`isPlateau`, décision
  // §9 tracée en P1.3 : pas de date-based v1), et uniquement si le plateau est TOUJOURS actif après
  // la séance du jour (`!brokenToday` — inutile de proposer une bascule sur un plateau qu'on vient
  // de casser). `selectAlternative` renvoie `null` sans crash si aucun pair valide (§9) : le fallback
  // reste alors le deload réactif existant (déjà géré ailleurs, `progression.ts::detectAntiPlateauActive`).
  const suggestedVariant =
    !alwaysLegacy && wasInPlateau && !brokenToday
      ? (() => {
          const alternative = selectAlternative(exercise, catalog, fullHistory, goals, weakPoint);
          if (!alternative) return null;
          const candidateExercise = catalog.find((e) => e.id === alternative.exerciseId);
          if (!candidateExercise) return null;
          return {
            exerciseId: alternative.exerciseId,
            exerciseName: candidateExercise.name,
            explanationFR: `Plateau sur ${exercise.name} depuis ${stalledLabel}. → ${alternative.explanationFR}`,
          };
        })()
      : null;

  // VARIATION_CYCLING_SPEC §8 — capture 1-tap CONTEXTUELLE : uniquement chemin v2, uniquement à
  // l'entrée en plateau toujours active (même garde que `suggestedVariant` ci-dessus) ET pas
  // encore répondue. Disparaît (`false`) dès que `weakPoint` est renseigné OU que le plateau
  // n'est plus actif (§8 "apparaît au bon moment, disparaît quand inutile").
  const needsWeakPointCapture = !alwaysLegacy && wasInPlateau && !brokenToday && weakPoint === null;

  return {
    wasInPlateau,
    plateauCounterBefore: plateauCounter,
    plateauStalledDaysBefore: plateauStalledDays,
    brokenToday,
    enteringOrOngoing,
    weakPoint,
    needsWeakPointCapture,
    suggestedVariant,
    message,
  };
}

/**
 * Recalcule le mode de suggestion qui aurait été proposé EN DÉBUT de la
 * séance précédente (history[0]), c'est-à-dire en excluant cette séance et
 * tout ce qui suit — utilisé uniquement pour détecter un anti-plateau
 * échoué. `history` doit être triée du plus récent au plus ancien.
 */
function previousSessionSuggestionMode(
  exercise: Exercise,
  history: LoggedSet[][],
  positions: HistoryPosition[] | undefined,
  increment: number
): SuggestionModeT | null {
  if (history.length === 0) return null;
  const priorToPrevious = history.slice(1);
  const suggestion = suggest({
    exercise,
    currentSetIndex: 0,
    recentHistory: priorToPrevious,
    historyPositions: positions?.slice(1),
    currentSessionSets: [],
    smallestIncrement: increment,
  });
  return suggestion.mode;
}

function buildExerciseReview(
  logged: LoggedExercise,
  exercise: Exercise,
  fullHistory: WorkoutSession[],
  increment: number,
  reviewDate: Date,
  options: SessionReviewOptions,
  catalog: Exercise[],
  goals: MuscleGoal[]
): ExerciseReview | null {
  const workSetsToday = setsForNormalPrediction(completedWorkSets(logged), { increment });
  const parent = primaryParent(exercise);

  if (workSetsToday.length === 0) {
    return null;
  }

  const bestToday = bestSetOfSession(logged, exercise)!;

  // Historique brut HORS séance du jour : warmups conservés pour P2, doublons
  // intra-séance fusionnés pour P5, positions alignées pour les finishers.
  const recentContext = collectExerciseHistory(fullHistory, exercise.id, HISTORY_WINDOW);
  const historyBeforeToday = recentContext.sets;
  const allHistory = collectExerciseHistory(fullHistory, exercise.id).sets.flat();
  const gapDays = daysSinceMatchingSession(
    fullHistory,
    exercise.id,
    reviewDate,
    (set) => set.setType !== SetType.warmup
  );
  const gapLestDays = daysSinceMatchingSession(
    fullHistory,
    exercise.id,
    reviewDate,
    (set) =>
      set.weight > 0 &&
      (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff)
  );

  // -- Performé ? : suggestion de référence recalculée sans la séance du jour --------
  const integrationContext = options.suggestionContextForExercise?.(logged, exercise) ?? {};
  const reference =
    options.referenceSuggestionByLoggedExerciseId?.[logged.id] ??
    suggest({
      exercise,
      currentSetIndex: 0,
      recentHistory: historyBeforeToday,
      historyPositions: recentContext.positions,
      currentSessionSets: [],
      smallestIncrement: increment,
      gapDays,
      gapLestDays,
      now: reviewDate,
      bodyweightKg: options.bodyweightKg,
      sessionFatigue: options.sessionFatigueByLoggedExerciseId?.[logged.id],
      ...integrationContext,
    });

  // -- Records all-time avec le set exact -------------------------------------------
  const priorRecords = buildRecords(exercise, allHistory);
  const displayedIds = displayedRecordSetIDs(logged, [...allHistory, ...workSetsToday], exercise);
  const achievementsByKind = new Map<
    RecordKind,
    { kind: RecordKind; setId: string; weight: number; reps: number }
  >();
  for (const set of workSetsToday) {
    if (!displayedIds.has(set.id)) continue;
    const kind = classify(set, exercise, priorRecords);
    if (kind) achievementsByKind.set(kind, { kind, setId: set.id, weight: set.weight, reps: set.reps });
  }
  const recordAchievements = [...achievementsByKind.values()];
  const recordKinds = recordAchievements.map((record) => record.kind);

  const comparison = comparePerformance(exercise, bestToday, reference);
  const performed = comparison.performed || recordAchievements.length > 0;
  const performedMessage =
    !comparison.performed && recordAchievements.length > 0
      ? `Performé — nouveau record (${formatSet(recordAchievements[0].weight, recordAchievements[0].reps)})`
      : comparison.message;

  // -- Plateau -----------------------------------------------------------------------
  // VARIATION_CYCLING_SPEC §5.3 (P2.1) — point faible déjà capturé pour CETTE occurrence (`logged`
  // est l'exercice loggé de la séance en cours de revue, jamais présent dans `fullHistory`, cf.
  // doc de tête). Lu tel quel, jamais dérivé : c'est la seule donnée utilisateur persistée.
  const plateau = buildPlateauReview(
    exercise,
    historyBeforeToday,
    recentContext.positions,
    increment,
    bestToday,
    catalog,
    fullHistory,
    goals,
    logged.plateauWeakPoint
  );

  // -- Ambition ------------------------------------------------------------------------
  const ambition = buildAmbitionReview(exercise, workSetsToday);

  // -- Anti-plateau échoué : la séance PRÉCÉDENTE était en mode plateauBreak, et l'ancre
  // d'aujourd'hui reste sous repMin -> la tentative de casser le plateau n'a pas tenu.
  const previousMode = previousSessionSuggestionMode(exercise, historyBeforeToday, recentContext.positions, increment);
  const antiPlateauFailed =
    recordAchievements.length === 0 &&
    previousMode === SuggestionMode.plateauBreak &&
    bestToday.reps < exercise.repTargetMin;

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
    gapKg: comparison.gapKg,
    gapReps: comparison.gapReps,
    performedMessage,
    plateau,
    ambition,
    antiPlateauFailed,
    recordKinds,
    recordAchievements,
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
    const exercise = exerciseIndex.get(logged.exerciseId);
    if (!exercise || physiologicalSetUnits(logged.sets, { increment: exercise.smallestIncrement }) <= 0) continue;
    const parent = primaryParent(exercise);
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
    review.recordAchievements.map((record) => ({
      exerciseName: review.exerciseName,
      kind: record.kind,
      weight: record.weight,
      reps: record.reps,
      label: `${review.exerciseName} — ${RECORD_KIND_LABEL[record.kind]} (${
        formatSet(record.weight, record.reps)
      })`,
    }))
  );
}

/**
 * Records de finishers de la séance, calculés sur leur piste dédiée. Ils sont
 * affichés dans le bilan global sans créer une fausse comparaison de
 * performance/plateau pour un exercice réalisé uniquement en finisher.
 */
function buildSessionFinisherRecords(
  session: WorkoutSession,
  history: WorkoutSession[],
  catalog: Exercise[]
): SessionRecordHighlight[] {
  const exerciseIndex = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const results: SessionRecordHighlight[] = [];

  for (const exerciseId of new Set(session.exercises.map((logged) => logged.exerciseId))) {
    const exercise = exerciseIndex.get(exerciseId);
    if (!exercise) continue;
    const finishersToday = session.exercises
      .filter((logged) => logged.exerciseId === exerciseId)
      .flatMap((logged) => orderedSets(logged))
      .filter((set) => set.completed && set.setType === SetType.finisher);
    if (finishersToday.length === 0) continue;

    const historicalSets = collectExerciseHistory(history, exerciseId).sets.flat();
    const prior = buildFinisherRecords(historicalSets);
    const bestByWeight = new Map<number, LoggedSet>();
    for (const set of finishersToday) {
      if (!classifyFinisher(set, prior)) continue;
      const current = bestByWeight.get(set.weight);
      if (!current || set.reps > current.reps) bestByWeight.set(set.weight, set);
    }

    for (const set of bestByWeight.values()) {
      results.push({
        exerciseName: exercise.name,
        kind: "finisherReps",
        weight: set.weight,
        reps: set.reps,
        label: `${exercise.name} — ${RECORD_KIND_LABEL.finisherReps} (${formatSet(set.weight, set.reps)})`,
      });
    }
  }

  return results;
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
  goals: MuscleGoal[] = [],
  options: SessionReviewOptions = {}
): SessionReview {
  const exerciseIndex = new Map(catalog.map((e) => [e.id, e]));
  const settingsIncrement = 2.5;

  const exercises: ExerciseReview[] = [];
  for (const logged of mergeExerciseOccurrences(session).sort((a, b) => a.orderIndex - b.orderIndex)) {
    const exercise = exerciseIndex.get(logged.exerciseId);
    if (!exercise) continue;
    const increment = exercise.smallestIncrement || settingsIncrement;
    const review = buildExerciseReview(logged, exercise, history, increment, session.date, options, catalog, goals);
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
  const records = [
    ...buildSessionRecords(exercises),
    ...buildSessionFinisherRecords(session, history, catalog),
  ];

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
