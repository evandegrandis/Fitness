/**
 * Moteur de progression v2, extension de `Jeera/Engines/ProgressionEngine.swift`.
 * Spec normative : `web/ALGO_SPEC_HARDENED.md` (autorité), `web/ALGO_SPEC.md`,
 * `web/ANTI_PLATEAU_SCIENCE.md`.
 *
 * v1 (conservé, fallback < 3 séances ou pattern figé non détectable) :
 *   - Premier set de travail : charge ancre + portillon de promotion (strict
 *     pour Heavy, normal pour Medium/Light).
 *   - Sets suivants : prédits depuis le set JUSTE FAIT aujourd'hui, jamais
 *     rejoué tel quel depuis la séance précédente. predicted = prev.reps −
 *     base_drop. Si predicted >= repMin on garde la charge, sinon on recule
 *     d'un incrément et on vise le milieu de la fourchette de reps.
 *   - Les modes de charge (externe / bodyweight+externe / assistance) sont
 *     déduits de `setPatternMode` pour que la direction d'affichage et de
 *     promotion soit correcte.
 *
 * v2 (§2 ALGO_SPEC_HARDENED, dès que l'historique détecté a >= MIN_SESSIONS_FOR_PATTERN
 * séances) : le PATTERN RÉEL (détecté depuis l'historique, §2) prime sur `setPatternMode`
 * figé pour TOP_SET_BACKOFF / STRAIGHT / ISOLATION_FINISHER / BW_REP / WEIGHTED_BW_VARIABLE.
 * Références par rôle pondérées récence (§4), `predictReps` (§5), clusters de charge par
 * machine (§3), fatigue graduée sur l'excès (§6), escalade anti-plateau (§8, ANTI_PLATEAU_SCIENCE).
 *
 * RÈGLE ABSOLUE (inchangée) : prédire depuis le set logué AUJOURD'HUI, jamais rejouer la
 * dernière séance. Moteur PUR : rien n'est persisté, tout est recalculé depuis l'historique.
 */

import type { ProgressionPolicy, SetPatternMode, SetType } from "@/lib/models/enums";
import { FATIGUE_CLASS_PROPERTIES, SetPatternMode as SPM, SetType as ST } from "@/lib/models/enums";
import type { Exercise, LoggedSet, MuscleGoal, UserSettings, WorkoutSession } from "@/lib/models/types";
import { primaryParent } from "@/lib/models/types";
import { buildFinisherRecords, buildRecords, classify, classifyFinisher, isCalibrating, normalRecordSets, recordCalibration } from "@/lib/engines/records";
import {
  benchmarkLevel,
  resolveStandard,
  strengthLevelLabel,
  strengthLevelRank,
  strengthStandardAxisSupportsSet,
  strengthStandardValueForSet,
  type ResolvedStandard,
} from "@/lib/engines/benchmark";
import { SessionFatigueContext } from "@/lib/engines/session-fatigue";
import type { SessionFatigueEvidence } from "@/lib/engines/session-fatigue";
import { applyDeload, deloadMessage } from "@/lib/engines/deload";
import { ALGO_V2, HISTORY_WINDOW } from "@/lib/engines/constants";
import { estimated1RM } from "@/lib/engines/e1rm";
import {
  clusterLoads,
  activeCluster,
  clusterContaining,
  detectPattern as detectPatternPure,
  preprocessHistory,
  roundToIncrement as roundToIncrementV2,
  median,
  type DetectedPattern,
  type HistoryPosition,
  type ProcessedSession,
  type SetRole,
} from "@/lib/engines/patterns";
import {
  checkAmorcePromotion,
  checkReactivePromotion,
  computeLestRef,
  computeRoleRef,
  computeTopRef,
  type AnchorLoad,
} from "@/lib/engines/references";
import {
  effTotal,
  predictReps as predictRepsPure,
  type LoadMode,
  type PredictContext,
  type RepSample,
} from "@/lib/engines/predict";
import { setsForNormalPrediction } from "@/lib/engines/set-structure";
import { easierVariantName } from "@/lib/engines/variants";
import { mostRecentPlateauWeakPoint, selectAlternative } from "@/lib/engines/variation-select";
import { cleanWeight } from "@/lib/format";

export { estimated1RM, bestE1RM } from "@/lib/engines/e1rm";
export { applyDeload, deloadTierForGap, deloadMessage } from "@/lib/engines/deload";
export { detectPattern, type DetectedPattern, type HistoryPosition } from "@/lib/engines/patterns";
export { predictReps } from "@/lib/engines/predict";

// ---------------------------------------------------------------------------
// SuggestionMode
// ---------------------------------------------------------------------------

export const SuggestionMode = {
  recordAttempt: "record_attempt",
  fallbackHypertrophy: "fallback_hypertrophy",
  plateauBreak: "plateau_break",
  transitionMode: "transition_mode",
} as const;

export type SuggestionMode = (typeof SuggestionMode)[keyof typeof SuggestionMode];

/** Persisted with suggestion/actual snapshots so later model tuning can segment engine eras. */
export const SUGGESTION_ENGINE_VERSION = "web-v2.2-2026-08-30";

// ---------------------------------------------------------------------------
// SetSuggestion
// ---------------------------------------------------------------------------

export interface SetSuggestion {
  weight: number;
  reps: number;
  setType: SetType;
  explanation: string;
  confidence: number;
  reasonCodes: string[];
  mode: SuggestionMode;
  /** Non-null quand une fatigue de séance a été détectée avant cet exercice. */
  sessionFatigueWarning: string | null;
  /** Preuve dérivée affichable au clic; jamais persistée. */
  sessionFatigueEvidence?: SessionFatigueEvidence | null;
  /** ALGO_V2 §0/§11 — rôle du set suggéré (dérivé, jamais persisté). */
  role?: SetRole;
  /**
   * VARIATION_CYCLING_SPEC §8 — `Exercise.id` RÉEL d'une variante vers laquelle basculer, null si
   * aucune bascule proposée. Deux sources possibles, TOUJOURS résolues en id par `suggest()` (plus
   * jamais un nom, fin du code mort — §8) :
   *   - §7.4/§9 (BW_REP, plancher de reps) : nom `VARIANT_LINKS` (`lib/engines/variants.ts`) résolu
   *     dans `catalog` (`SuggestParams.catalog`) ; `null` si `catalog` absent ou nom introuvable.
   *   - §2/§4/§6 (plateau daté, `isPlateau`) : `selectAlternative()` (`lib/engines/variation-select.ts`),
   *     déjà un id ; `reasonCodes` porte alors `"variation"`.
   *   - §3/§4.2 (P2.3, rotation PRÉEMPTIVE sur `progressionState === "slowing"`, PAS encore
   *     `isPlateau`) : même `selectAlternative()`, mais `reasonCodes` porte `"variation_preemptive"`
   *     à la place (mutuellement exclusif avec `"variation"` — `progressionState` ne peut jamais
   *     être `"plateaued"` ET `"slowing"` en même temps, `deriveStateV2`).
   * VARIATION_CYCLING_SPEC §8 (P2.3) — anti-thrash : ce champ peut être masqué a posteriori par le
   * store (`lib/store/workout.ts::suggestion()`) si `exercise` est la cible d'une rotation acceptée
   * il y a moins de `ALGO_V2.ROTATION_COOLDOWN_DAYS` jours — `suggest()` lui-même ne connaît pas
   * `rotationAcceptedAt` (bookkeeping store, pas moteur pur).
   */
  switchToVariantId?: string | null;
  /**
   * ALGO_V2 §8 (historique) — technique d'intensité appliquée sur ce set. VARIATION_CYCLING_SPEC
   * décision #3 : plus AUCUNE technique d'intensité n'est prescrite par l'app (rest-pause retiré
   * avec `plateauEscalation()`, voir §4) — ce champ reste TOUJOURS `null` désormais. Conservé pour
   * compat de type (consommateurs existants), pas retiré (décision d'impl. tracée, P1.6).
   */
  intensityTechnique?: "rest_pause" | null;
  /**
   * VARIATION_CYCLING_SPEC §3/§8 — état à 3 niveaux (`DeriveStateV2Result.progressionState`), pour
   * l'indice discret UI (`ExerciseCard.tsx`, "progrès qui ralentit" sur `slowing`, rien sur
   * `progressing`/`plateaued` — le plateau a sa propre carte dans le bilan, §8). `undefined` sur le
   * chemin v1 (`deriveState`, pas de calcul date-based — §9) : l'UI doit traiter `undefined` comme
   * "pas d'indice", jamais comme `slowing`.
   */
  progressionState?: "progressing" | "slowing" | "plateaued";
  /**
   * BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — signal feu intra-séance : si le poids proposé ci-dessus est
   * atteint aux reps ci-dessus, l'e1RM résultant franchirait le palier StrengthLevel suivant.
   * `undefined`/`false` si pas de `strengthStandardKey`/`profile` fournis (§9, dégradation gracieuse
   * — jamais calculé à partir de rien). Mutuellement compatible avec `readyForPR` (les deux peuvent
   * être vrais en même temps, ex. un nouveau max qui franchit aussi Avancé).
   */
  readyForLevelUp?: boolean;
  /**
   * BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — le poids proposé, aux reps ciblées ET si `reps >=
   * exercise.repTargetMin` (même garde que `RecordsEngine.classify`, pour ne jamais promettre un feu
   * qui ne se matérialiserait pas en vraie étoile de record une fois loggé), battrait le record e1RM
   * de l'exercice (`RecordsEngine.buildRecords(exercise, historicalSets).bestE1RM`, marge anti-flapping
   * 2% identique à `records.ts`). Ne dépend PAS de `profile`/`strengthStandardKey` — fonctionne pour
   * tout exercice avec de l'historique, benchmark StrengthLevel ou pas.
   */
  readyForPR?: boolean;
  /** Nom FR du palier StrengthLevel franchi si `readyForLevelUp` (ex. "Avancé") ; `undefined` sinon. */
  nextLevelName?: string;
}

function makeSuggestion(
  partial: Omit<SetSuggestion, "confidence" | "reasonCodes" | "mode" | "sessionFatigueWarning"> &
    Partial<Pick<SetSuggestion, "confidence" | "reasonCodes" | "mode" | "sessionFatigueWarning" | "role" | "switchToVariantId" | "intensityTechnique">>
): SetSuggestion {
  return {
    weight: partial.weight,
    reps: partial.reps,
    setType: partial.setType,
    explanation: partial.explanation,
    confidence: partial.confidence ?? 0.8,
    reasonCodes: partial.reasonCodes ?? [],
    mode: partial.mode ?? SuggestionMode.recordAttempt,
    sessionFatigueWarning: partial.sessionFatigueWarning ?? null,
    role: partial.role,
    switchToVariantId: partial.switchToVariantId ?? null,
    intensityTechnique: partial.intensityTechnique ?? null,
  };
}

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

interface Candidate {
  load: number;
  reps: number;
  mode: SuggestionMode;
  reasonCodes: string[];
}

export interface DerivedExerciseState {
  targetLoad: number;
  bestRepAtTarget: number;
  plateauCounter: number;
  progressVelocity: number;
  promotionGatePassed: boolean;
  /** Reps du set ancre (au targetLoad) dans la séance valide la plus récente. */
  recentBestAnchorReps: number;
  /** Charge minimale d'ancre valide sur les séances récentes. */
  recentWorkingFloor: number;
  /** Charge minimale des sets de fallback/backoff légitimes récents. */
  recentFallbackFloor: number;
  /** true si un deload d'absence (WS4) a réduit targetLoad. */
  deloadApplied: boolean;
  /** Nombre de jours depuis la dernière séance de cet exercice, si connu. */
  gapDays?: number;
  /** ALGO_V2 §2 — pattern détecté (prime sur setPatternMode dès S >= MIN_SESSIONS_FOR_PATTERN). */
  pattern: DetectedPattern;
  /** ALGO_V2 §4.2 — amorceRef (TOP_SET_BACKOFF) ou straightRef (STRAIGHT/FINISHER), 0 si N/A. */
  amorceLoad: number;
  /** ALGO_V2 §4.3 — topRef (TOP_SET_BACKOFF uniquement), null sinon. */
  topLoad: number | null;
  /** ALGO_V2 §3 — charges d'amorce du cluster actif. */
  activeClusterLoads: number[];
  /** ALGO_V2 §8 — charges d'overreach échoué (fenêtre 10), topTarget reste strictement en dessous. */
  failedOverreachLoads: number[];
}

// ---------------------------------------------------------------------------
// Helpers génériques
// ---------------------------------------------------------------------------

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Arrondi "banker's rounding" évité : Swift `.rounded()` = arrondi classique au plus proche (ties away from zero for .5). */
function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

/** Miroir de `Double.rounded(.up)` Swift = ceil. */
function roundUp(value: number): number {
  return Math.ceil(value);
}

function effectiveLoad(load: number, mode: SetPatternMode): number {
  if (mode === SPM.assistedBodyweight) return -load;
  return load;
}

export function stepLoad(load: number, increment: number, mode: SetPatternMode, towardHarder: boolean): number {
  if (mode === SPM.assistedBodyweight) {
    return towardHarder ? Math.max(0, load - increment) : load + increment;
  }
  return towardHarder ? load + increment : Math.max(0, load - increment);
}

function shouldStepLoad(mode: SetPatternMode, load: number, towardHarder: boolean): boolean {
  if (mode === SPM.assistedBodyweight) {
    return towardHarder ? load > 0 : true;
  }
  if (mode === SPM.bodyweight) {
    return false;
  }
  return towardHarder ? load > 0 : true;
}

function rampStartLoad(targetLoad: number, increment: number, exercise: Exercise): number {
  const steps = exercise.fatigueClass === "heavy" ? 2.0 : 1.0;
  const start = stepLoad(targetLoad, increment * steps, exercise.setPatternMode, false);
  return Math.max(0, start);
}

function minHarderStepTowardTarget(
  currentLoad: number,
  target: number,
  increment: number,
  mode: SetPatternMode
): number {
  const stepped = stepLoad(currentLoad, increment, mode, true);
  const steppedEffort = effectiveLoad(stepped, mode);
  const targetEffort = effectiveLoad(target, mode);
  if (steppedEffort > targetEffort) return target;
  return stepped;
}

function defaultStartLoad(exercise: Exercise): number {
  switch (exercise.setPatternMode) {
    case SPM.bodyweight:
      return 0;
    case SPM.assistedBodyweight:
      return 20;
    default:
      return 20;
  }
}

function effectiveProgressionPolicy(exercise: Exercise): ProgressionPolicy {
  return exercise.progressionPolicy ?? "generic";
}

// ---------------------------------------------------------------------------
// classifyAnchor / deriveState / promotion / velocity
// ---------------------------------------------------------------------------

/**
 * Set ancre représentatif d'une séance : le set le plus lourd qui n'était pas
 * un échec net. Les primers (sets BW sur exercices weightedBodyweight, sets
 * warmup explicites) sont exclus avant classification pour ne pas fausser
 * targetLoad.
 */
function classifyAnchor(session: LoggedSet[], exercise: Exercise): LoggedSet | null {
  const completed = setsForNormalPrediction(session, {
    increment: exercise.smallestIncrement,
  });
  if (completed.length === 0) return null;

  const workSetsOnly = completed.filter(
    (s) => s.setType !== ST.warmup && !(s.weight === 0 && exercise.setPatternMode === SPM.weightedBodyweight)
  );

  if (workSetsOnly.length === 0) {
    // Séance tout-BW (ex: HSPU avant lestage) : renvoie le set avec le plus de reps.
    const candidates = completed.filter((s) => s.setType !== ST.warmup);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, cur) => (cur.reps > best.reps ? cur : best));
  }

  // Ancre = set le plus lourd qui n'était pas un échec net (reps >= repMin - 1)
  const validCandidates = workSetsOnly.filter((s) => s.reps >= Math.max(1, exercise.repTargetMin - 1));
  if (validCandidates.length > 0) {
    return validCandidates.reduce((best, cur) => (cur.weight > best.weight ? cur : best));
  }

  // Tous les sets de travail étaient des échecs (séance overreach) → le plus lourd comme référence
  return workSetsOnly.reduce((best, cur) => (cur.weight > best.weight ? cur : best));
}

function progressVelocityScore(exercise: Exercise, history: LoggedSet[][]): number {
  const anchors = history
    .map((session) => classifyAnchor(session, exercise))
    .filter((a): a is LoggedSet => a !== null);
  if (anchors.length < 2) return 0;
  let velocity = 0;
  let alpha = 1.0;
  // `history`/`anchors` sont plus récents en premier. Chaque transition compare donc
  // `anchors[idx]` (ancien) à `anchors[idx - 1]` (nouveau), et la transition la plus récente
  // reçoit le poids maximal. L'ancienne boucle faisait exactement l'inverse : une progression
  // récente était notée comme une régression et les événements les plus vieux dominaient.
  for (let idx = 1; idx < anchors.length; idx++) {
    const cur = anchors[idx - 1];
    const prev = anchors[idx];
    let event = 0.0;
    if (cur.weight > prev.weight && cur.reps >= prev.reps) event = 1.5;
    else if (Math.abs(cur.weight - prev.weight) < 0.01 && cur.reps > prev.reps) event = 1.0;
    else if (cur.reps === prev.reps && Math.abs(cur.weight - prev.weight) < 0.01) event = 0.0;
    else if (cur.reps + 1 < prev.reps) event = -0.5;
    velocity += event * alpha;
    alpha *= 0.84;
  }
  return velocity / Math.max(1, anchors.length - 1);
}

function consecutiveAt(load: number, reps: number, anchors: LoggedSet[]): number {
  let count = 0;
  for (const anchor of anchors) {
    if (Math.abs(anchor.weight - load) < 0.01 && anchor.reps <= reps) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Portillon de promotion : renvoie true quand le set ancre (pas le premier
 * set) justifie d'augmenter targetLoad d'un incrément la prochaine séance.
 * Heavy : 2 des 3 dernières séances ancre >= repMax.
 * Medium/Light : 1 des 2 dernières séances ancre >= repMax.
 * Garde-fou : l'ancre la plus récente doit être strictement au-dessus de repMin.
 */
function checkPromotionGate(exercise: Exercise, history: LoggedSet[][]): boolean {
  if (history.length === 0) return false;
  const mostRecentAnchorReps = classifyAnchor(history[0], exercise)?.reps ?? 0;
  if (!(mostRecentAnchorReps > exercise.repTargetMin)) return false;
  const strict = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].usesStrictPromotion;
  const windowSize = strict ? 3 : 2;
  const required = strict ? 2 : 1;
  const qualifiers = history
    .slice(0, windowSize)
    .filter((session) => (classifyAnchor(session, exercise)?.reps ?? 0) >= exercise.repTargetMax).length;
  return qualifiers >= required;
}

/**
 * "Niveau connu" (WS4) : max des charges d'ancre valides (reps >= repMin) sur
 * la fenêtre `HISTORY_WINDOW` (10 séances). Sert de référence pour la
 * remontée rapide après un deload dû à une absence — pas de mémoire d'état
 * persistante, uniquement recalculé depuis l'historique à chaque appel.
 */
function knownLevel(exercise: Exercise, history: LoggedSet[][]): number {
  const anchors = history
    .slice(0, HISTORY_WINDOW)
    .map((session) => classifyAnchor(session, exercise))
    .filter((a): a is LoggedSet => a !== null && a.reps >= exercise.repTargetMin);
  if (anchors.length === 0) return 0;
  return Math.max(...anchors.map((a) => a.weight));
}

/**
 * Portillon de promotion ASSOUPLI (WS4) : tant que la charge courante
 * (post-deload) est strictement inférieure au "niveau connu" (le max
 * atteint sur les 10 dernières séances), une seule séance récente >= repMax
 * suffit à re-promouvoir — au lieu de la règle stricte 2/3 (Heavy) ou 1/2
 * (Medium/Light). Objectif : remonter vite vers le niveau déjà prouvé sans
 * revalider aussi lentement qu'une vraie progression au-delà du record.
 * Garde-fou identique : l'ancre la plus récente doit être strictement
 * au-dessus de repMin.
 */
function checkPromotionGateWithRecovery(
  exercise: Exercise,
  comparable: LoggedSet[][],
  currentLoad: number,
  fullHistory: LoggedSet[][]
): boolean {
  const level = knownLevel(exercise, fullHistory);
  const isRecovering = level > 0 && currentLoad + 0.01 < level;
  if (!isRecovering) return checkPromotionGate(exercise, comparable);

  if (comparable.length === 0) return false;
  const mostRecentAnchorReps = classifyAnchor(comparable[0], exercise)?.reps ?? 0;
  if (!(mostRecentAnchorReps > exercise.repTargetMin)) return false;
  // Portillon assoupli : 1 séance qualifiante suffit (au lieu de 2/3 ou 1/2).
  return mostRecentAnchorReps >= exercise.repTargetMax;
}

function deriveState(
  exercise: Exercise,
  history: LoggedSet[][],
  increment: number,
  gapDays?: number
): DerivedExerciseState {
  // Fenêtre de DÉCISION (targetLoad, plateauCounter, promotionGate, floors) : 5 séances.
  // Volontairement plus courte que HISTORY_WINDOW (10, voir constants.ts) — la décision de
  // charge doit rester réactive à ce que l'utilisateur a fait récemment, pas lissée sur
  // 10 séances (qui peuvent couvrir plusieurs mois avec un entraînement irrégulier).
  const comparable = history.slice(0, 5);
  const anchors = comparable
    .map((session) => classifyAnchor(session, exercise))
    .filter((a): a is LoggedSet => a !== null);

  const validAnchors = anchors.filter((a) => a.reps >= exercise.repTargetMin);
  const rawTargetLoad =
    validAnchors.length > 0
      ? Math.max(...validAnchors.map((a) => a.weight))
      : anchors.length > 0
        ? Math.max(...anchors.map((a) => a.weight))
        : defaultStartLoad(exercise);

  // WS4 — deload daté / absence : réduit targetLoad (et les planchers dérivés, ci-dessous)
  // selon le nombre de jours depuis la dernière séance de CET exercice. `gapDays === undefined`
  // (comportement par défaut, appelant qui ne fournit pas de date) => aucun ajustement, la
  // charge de référence reste `rawTargetLoad` exactement comme avant WS4 (non-régression).
  const deload = applyDeload(rawTargetLoad, gapDays, increment);
  const targetLoad = deload.load;
  const deloadShift = rawTargetLoad - targetLoad;

  const rawWorkingFloor =
    validAnchors.length > 0 ? Math.min(...validAnchors.map((a) => a.weight)) : defaultStartLoad(exercise);
  // Décale le plancher de travail du même montant que targetLoad : sinon le deload abaisse la
  // charge cible mais le floor filtering (buildCandidates) rejette la suggestion parce qu'elle
  // tombe sous un plancher basé sur l'historique pré-pause.
  const recentWorkingFloor = Math.max(0, rawWorkingFloor - deloadShift);

  const fallbackWeights: number[] = [];
  for (const session of comparable) {
    const predictionSession = setsForNormalPrediction(session, {
      increment,
    });
    const anchor = classifyAnchor(predictionSession, exercise);
    if (!anchor) continue;
    const anchorEffort = effectiveLoad(anchor.weight, exercise.setPatternMode);
    const fallbacks = predictionSession.filter(
      (s) =>
        s.completed &&
        s.setType !== ST.warmup &&
        !(s.weight === 0 && exercise.setPatternMode === SPM.weightedBodyweight) &&
        effectiveLoad(s.weight, exercise.setPatternMode) < anchorEffort - 0.01 &&
        s.reps >= Math.max(1, exercise.repTargetMin - 1)
    );
    if (fallbacks.length > 0) {
      fallbackWeights.push(Math.max(...fallbacks.map((s) => s.weight)));
    }
  }
  const rawFallbackFloor =
    fallbackWeights.length > 0 ? Math.min(...fallbackWeights) : Math.max(0, rawWorkingFloor - increment * 2);
  // Même raisonnement que recentWorkingFloor : décalé du même montant que le deload pour ne pas
  // filtrer les candidats fallback légitimes post-reprise.
  const recentFallbackFloor = Math.max(0, rawFallbackFloor - deloadShift);

  // repsAtTarget/bestRep/plateauCounter utilisent le targetLoad RAW (pré-deload) : le plateau se
  // mesure sur ce que l'utilisateur a réellement répété avant la pause, pas sur la charge
  // ajustée. Un deload ne doit pas artificiellement "casser" un plateau détecté.
  const repsAtTarget = anchors.filter((a) => Math.abs(a.weight - rawTargetLoad) < 0.01).map((a) => a.reps);
  const bestRep = repsAtTarget.length > 0 ? Math.max(...repsAtTarget) : exercise.repTargetMin;

  const plateauCounter = consecutiveAt(rawTargetLoad, bestRep, anchors);
  // Fenêtre de VÉLOCITÉ : jusqu'à 10 séances (= HISTORY_WINDOW, le maximum que le store
  // fournit désormais). Une fenêtre plus longue que la fenêtre de décision (5) est voulue ici :
  // la vélocité mesure une TENDANCE (progression/stagnation/régression sur plusieurs séances),
  // elle a besoin de plus de points que la décision instantanée de charge pour ne pas être
  // bruitée par une seule bonne ou mauvaise séance.
  const progressVelocity = progressVelocityScore(exercise, history.slice(0, 10));
  // WS4 — remontée rapide : portillon assoupli tant que targetLoad (post-deload) < niveau connu.
  const promotionGatePassed = checkPromotionGateWithRecovery(exercise, comparable, targetLoad, history);

  let recentBestAnchorReps = exercise.repTargetMin;
  for (const session of comparable) {
    const anchor = classifyAnchor(session, exercise);
    if (!anchor) continue;
    if (Math.abs(anchor.weight - rawTargetLoad) >= 0.01) continue;
    if (anchor.reps >= exercise.repTargetMin) {
      recentBestAnchorReps = anchor.reps;
      break;
    }
  }

  return {
    targetLoad,
    bestRepAtTarget: bestRep,
    plateauCounter,
    progressVelocity,
    promotionGatePassed,
    recentBestAnchorReps,
    recentWorkingFloor,
    recentFallbackFloor,
    deloadApplied: deload.applied,
    gapDays,
    // ALGO_V2 — deriveState() reste le calcul v1 (targetLoad = max ancres 5 séances), consommé
    // tel quel par `bilan.ts`. Les champs v2 (pattern/amorceLoad/topLoad/clusters/overreach) sont
    // calculés séparément par `deriveStateV2` (voir plus bas) et ne remplacent PAS deriveState :
    // ils portent des valeurs neutres ici pour que le type reste cohérent.
    pattern: "STRAIGHT",
    amorceLoad: targetLoad,
    topLoad: null,
    activeClusterLoads: [],
    failedOverreachLoads: [],
  };
}

function autoFatigueFlag(exercise: Exercise, currentSessionSets: LoggedSet[]): boolean {
  if (currentSessionSets.length < 2) return false;
  const avgReps =
    currentSessionSets.reduce((acc, s) => acc + s.reps, 0) / currentSessionSets.length;
  const underPerformance = avgReps < exercise.repTargetMin;
  const lastTwo = currentSessionSets.slice(-2);
  const repeatedLow = lastTwo.every((s) => s.reps <= Math.max(1, exercise.repTargetMin - 1));
  return underPerformance && repeatedLow;
}

// ---------------------------------------------------------------------------
// ALGO_V2 — couche pattern/cluster/référence/predict (§1-§8 ALGO_SPEC_HARDENED)
// ---------------------------------------------------------------------------

function loadModeOf(exercise: Exercise): LoadMode {
  if (exercise.setPatternMode === SPM.weightedBodyweight) return "weighted_bodyweight";
  if (exercise.setPatternMode === SPM.assistedBodyweight) return "assisted_bodyweight";
  return "external";
}

/** Ancre v2 d'une séance déjà traitée (P1-P5) : amorce pour TOP_SET_BACKOFF, sinon le set le plus lourd non-échec. */
function v2AnchorOf(processed: ProcessedSession, pattern: DetectedPattern, exercise: Exercise): LoggedSet | null {
  if (processed.workSets.length === 0) return null;
  if (pattern === "TOP_SET_BACKOFF" && processed.amorce) {
    return processed.amorce;
  }
  const validCandidates = processed.workSets.filter((s) => s.reps >= Math.max(1, exercise.repTargetMin - 1));
  const pool = validCandidates.length > 0 ? validCandidates : processed.workSets;
  const best = pool.reduce((b, c) => (c.weight > b.weight ? c : b));
  return best;
}

/** §8 — failedOverreachLoads : weight >= topRef(à l'époque)+1incr ET reps < repMin-2, approximé par weight >= (amorce+2incr) comme proxy de "tentative overreach". */
function computeFailedOverreachLoads(processedHistory: ProcessedSession[], exercise: Exercise, increment: number): number[] {
  const loads: number[] = [];
  for (const p of processedHistory) {
    if (!p.amorce) continue;
    for (const s of p.workSets) {
      if (s.weight >= p.amorce.weight + increment - 1e-9 && s.reps < exercise.repTargetMin - ALGO_V2.DEMOTION_MARGIN && s.reps < 3) {
        loads.push(s.weight);
      }
    }
  }
  return loads;
}

export interface DeriveStateV2Result {
  pattern: DetectedPattern;
  processedHistory: ProcessedSession[]; // fenêtre HISTORY_WINDOW, plus récent en premier, cluster non filtré
  activeClusterLoads: number[];
  amorceTarget: number;
  topTarget: number | null;
  amorceHistory: AnchorLoad[]; // cluster actif uniquement, plus récent en premier
  topHistory: AnchorLoad[]; // cluster actif uniquement
  failedOverreachLoads: number[];
  repSamples: RepSample[]; // cluster actif, pour predictReps
  plateauCounter: number;
  /**
   * VARIATION_CYCLING_SPEC §2 — date (LoggedSet.timestamp) de la dernière ancre du rôle dominant
   * (top pour TOP_SET_BACKOFF/WEIGHTED_BW_VARIABLE, amorce sinon) ayant établi un nouveau max de
   * P (e1RM, `estimated1RM`) sur la fenêtre. `null` si aucune ancre du rôle dominant.
   */
  lastProgressDate: Date | null;
  /** VARIATION_CYCLING_SPEC §2 — jours entre la séance la plus récente (rôle dominant) et `lastProgressDate`. `null` si aucune ancre. */
  plateauStalledDays: number | null;
  /** VARIATION_CYCLING_SPEC §2 — nb d'ancres du rôle dominant dans les 14 jours précédant la séance la plus récente (anti faux-positif d'absence). */
  sessionsInWindow: number;
  /** VARIATION_CYCLING_SPEC §2 — trigger officiel de plateau en dates : `plateauStalledDays >= PLATEAU_STALL_DAYS && sessionsInWindow >= PLATEAU_MIN_SESSIONS`. Remplace `plateauCounter >= PLATEAU_THRESHOLD` (voir P1.3, blast radius §2). */
  isPlateau: boolean;
  /** VARIATION_CYCLING_SPEC §3 — état à 3 niveaux : `plateaued` (isPlateau) / `slowing` (préemptif) / `progressing`, dérivé de `progressVelocityScore` existant. */
  progressionState: "progressing" | "slowing" | "plateaued";
  reasonCodes: string[]; // ex: "machine_cluster_switch"
}

/** Ancre datée (rôle dominant), pour la détection de plateau en dates (VARIATION_CYCLING_SPEC §2). */
interface DatedAnchor {
  weight: number;
  reps: number;
  timestamp: Date;
}

/** Nombre de jours (entier, tronqué) entre deux dates — même convention que `suggest()` (gapDays, ligne ~1754). */
function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

export interface PlateauDateState {
  lastProgressDate: Date | null;
  plateauStalledDays: number | null;
  sessionsInWindow: number;
  isPlateau: boolean;
}

/**
 * VARIATION_CYCLING_SPEC §2 — détection de plateau en DATES, pure (aucun état persisté).
 * `anchorsMostRecentFirst` = ancres du rôle dominant (top ou amorce selon `usesTopAsPlateauRef`),
 * PLUS RÉCENTE EN PREMIER (même ordre que `amorceHistory`/`topHistory`).
 *
 * - `lastSessionDate` (référence interne) = date de l'ancre la plus récente — PAS `now`/horloge
 *   système : le calcul reste une fonction pure de l'historique fourni (cf. §0.2 pureté), testable
 *   sans horloge injectée. `suggest()` gère séparément la fraîcheur "aujourd'hui" via `gapDays`.
 * - Anti-bruit (§2) : un gain de e1RM ne "bat" le record courant que s'il est >= au max(1% du
 *   record, +1 rep à charge constante) — sinon `lastProgressDate` ne bouge pas (bruit de mesure).
 * - Absence (§9) : si `sessionsInWindow < PLATEAU_MIN_SESSIONS`, jamais de plateau (c'est un gap,
 *   géré par le deload d'absence existant `deload.ts`).
 */
function derivePlateauDateState(exercise: Exercise, anchorsMostRecentFirst: DatedAnchor[]): PlateauDateState {
  if (anchorsMostRecentFirst.length === 0) {
    return { lastProgressDate: null, plateauStalledDays: null, sessionsInWindow: 0, isPlateau: false };
  }

  const lastSessionDate = anchorsMostRecentFirst[0].timestamp;
  const sessionsInWindow = anchorsMostRecentFirst.filter(
    (a) => daysBetween(lastSessionDate, a.timestamp) <= ALGO_V2.PLATEAU_STALL_DAYS
  ).length;

  // Chronologique (plus ancien -> plus récent) pour suivre le record de P (e1RM) au fil du temps.
  const chrono = [...anchorsMostRecentFirst].reverse();
  // Pour un exercice strictement au poids du corps, `estimated1RM(0, reps)` vaut toujours zéro :
  // une hausse de reps n'était donc jamais reconnue comme un progrès. Dans ce cas homogène, la
  // performance pertinente est simplement le record de répétitions. Les historiques lestés
  // conservent l'e1RM existant.
  const repsOnly = chrono.every((anchor) => Math.abs(anchor.weight) < 0.01);
  const performance = (anchor: DatedAnchor) =>
    repsOnly ? anchor.reps : estimated1RM(anchor.weight, anchor.reps);
  let recordPerformance = performance(chrono[0]);
  let lastProgressDate = chrono[0].timestamp;
  for (let i = 1; i < chrono.length; i++) {
    const anchor = chrono[i];
    const currentPerformance = performance(anchor);
    const gain = currentPerformance - recordPerformance;
    const noiseFloor = repsOnly
      ? 1
      : Math.max(
          0.01 * recordPerformance,
          estimated1RM(anchor.weight, exercise.repTargetMin + 1) -
            estimated1RM(anchor.weight, exercise.repTargetMin)
        );
    // Epsilon (même convention que le reste du moteur, ex. progression.ts ligne ~530) : sans lui,
    // un gain mathématiquement égal au seuil (ex. exactement +1 rep) peut se retrouver infinitésimalement
    // sous `noiseFloor` par arrondi flottant (deux soustractions différentes du même écart réel) et
    // manquer d'être compté comme progrès.
    if (gain > 0 && gain >= noiseFloor - 1e-9) {
      recordPerformance = currentPerformance;
      lastProgressDate = anchor.timestamp;
    }
  }

  const plateauStalledDays = daysBetween(lastSessionDate, lastProgressDate);
  const isPlateau = plateauStalledDays >= ALGO_V2.PLATEAU_STALL_DAYS && sessionsInWindow >= ALGO_V2.PLATEAU_MIN_SESSIONS;
  return { lastProgressDate, plateauStalledDays, sessionsInWindow, isPlateau };
}

/**
 * Fenêtre du run courant : une reprise après plus de 21 jours ne doit pas réutiliser l'ancien
 * bloc pour conclure immédiatement à un ralentissement. La prédiction peut toujours exploiter
 * l'historique antérieur ; seuls les signaux de cycle (`velocity`/plateau) sont segmentés ici.
 */
function currentRunHistory(historyMostRecentFirst: LoggedSet[][]): LoggedSet[][] {
  if (historyMostRecentFirst.length === 0) return [];
  const latestCompletedAt = (sets: LoggedSet[]): Date | null => {
    const completed = sets.filter((set) => set.completed);
    if (completed.length === 0) return null;
    return completed.reduce(
      (latest, set) => (set.timestamp > latest ? set.timestamp : latest),
      completed[0].timestamp
    );
  };

  const run: LoggedSet[][] = [historyMostRecentFirst[0]];
  let newerDate = latestCompletedAt(historyMostRecentFirst[0]);
  for (let index = 1; index < historyMostRecentFirst.length; index += 1) {
    const olderDate = latestCompletedAt(historyMostRecentFirst[index]);
    if (!newerDate || !olderDate) break;
    if (daysBetween(newerDate, olderDate) > ALGO_V2.LIFECYCLE_RUN_GAP_DAYS) break;
    run.push(historyMostRecentFirst[index]);
    newerDate = olderDate;
  }
  return run;
}

/**
 * Calcule le pattern + les références par rôle + le profil empirique du cluster actif.
 * `rawHistory` = fenêtre HISTORY_WINDOW de LoggedSet[][] (plus récent en premier), NON pré-traité.
 * `todayFirstLoad` sert au re-ancrage §3.4 (écart >= 20% -> re-dérive depuis le cluster contenant
 * cette charge).
 */
function deriveStateV2(
  exercise: Exercise,
  rawHistory: LoggedSet[][],
  increment: number,
  positions: HistoryPosition[] | undefined,
  todayFirstLoad: number | undefined
): DeriveStateV2Result {
  const pattern = detectPatternPure(exercise, rawHistory, positions);
  const processedHistory = preprocessHistory(rawHistory, exercise, increment, {
    positions,
    // Les données d'un exercice ISOLATION_FINISHER restent son profil dédié ; elles ne sont
    // jamais réinjectées dans une ancre STRAIGHT/TOP_SET_BACKOFF normale.
    preserveDedicatedFinishers: pattern === "ISOLATION_FINISHER",
  });

  const reasonCodes: string[] = [];

  // §3 — clusters de charge, uniquement pertinent pour les patterns non-BW à charge externe.
  const isClusterable = pattern === "TOP_SET_BACKOFF" || pattern === "STRAIGHT" || pattern === "ISOLATION_FINISHER";
  let activeClusterLoads: number[] = [];
  let clusterSessionIdx = new Set<number>(processedHistory.map((_, i) => i)); // par défaut : tout l'historique

  if (isClusterable) {
    const entries = processedHistory
      .map((p, idx) => {
        const anchor = v2AnchorOf(p, pattern, exercise);
        return anchor ? { load: anchor.weight, sessionIndex: idx } : null;
      })
      .filter((e): e is { load: number; sessionIndex: number } => e !== null);

    const clusters = clusterLoads(entries, increment);
    let selected = activeCluster(clusters);

    // §3.4 — re-ancrage en séance : si le set du jour s'écarte >= 20% de amorceTarget provisoire.
    if (selected && todayFirstLoad !== undefined) {
      const provisionalAmorce = median(selected.loads);
      if (provisionalAmorce > 0 && Math.abs(todayFirstLoad - provisionalAmorce) / provisionalAmorce >= 0.2) {
        const reAnchored = clusterContaining(clusters, todayFirstLoad, increment);
        if (reAnchored) {
          selected = reAnchored;
          reasonCodes.push("machine_cluster_switch");
        }
      }
    }

    if (selected) {
      activeClusterLoads = selected.loads;
      clusterSessionIdx = new Set(selected.sessionIndices);
    }
  }

  const clusterSessions = processedHistory.filter((_, idx) => clusterSessionIdx.has(idx));

  // Historiques d'ancre/top du cluster actif (plus récent en premier, dans l'ordre de processedHistory).
  const amorceHistory: AnchorLoad[] = [];
  const topHistory: AnchorLoad[] = [];
  const repSamples: RepSample[] = [];
  processedHistory.forEach((p, index) => {
    const inCluster = clusterSessionIdx.has(index);
    const sessionAmorce =
      pattern === "STRAIGHT" || pattern === "ISOLATION_FINISHER"
        ? v2AnchorOf(p, pattern, exercise)
        : p.amorce;
    if (sessionAmorce && (inCluster || !isClusterable)) {
      amorceHistory.push({ weight: sessionAmorce.weight, reps: sessionAmorce.reps });
    }
    if (p.top && (inCluster || !isClusterable)) topHistory.push({ weight: p.top.weight, reps: p.top.reps });
    if (inCluster || !isClusterable) {
      p.workSets.forEach((s, i) => {
        // §5.2 : pour STRAIGHT/FINISHER, le rôle indexé est la POSITION du set (1,2,3+) — pas le
        // triplet amorce/top/backoff (qui n'a pas de sens hors TOP_SET_BACKOFF). Un seul type
        // d'entrée par set physique : les mélanger ferait compter le même set deux fois dans le
        // pool "tous rôles confondus" de `empiricalBase` (nearestWithMinSamples sameRoleOnly=false).
        if (pattern === "STRAIGHT" || pattern === "ISOLATION_FINISHER" || pattern === "BW_REP") {
          const position = Math.min(i + 1, 3);
          repSamples.push({ role: position, weight: s.weight, reps: s.reps });
        } else {
          const role = p.roles[i];
          repSamples.push({ role, weight: s.weight, reps: s.reps });
        }
      });
    }
  });

  // VARIATION_CYCLING_SPEC §2 — mêmes ancres que amorceHistory/topHistory (même filtre cluster),
  // mais avec leur date réelle (`LoggedSet.timestamp`) : `AnchorLoad` (ci-dessus) ne porte pas la
  // date, donc dupliqué ici depuis `p.amorce`/`p.top` (les LoggedSet originaux, pas dépouillés).
  const amorceHistoryDated: DatedAnchor[] = [];
  const topHistoryDated: DatedAnchor[] = [];
  processedHistory.forEach((p, idx) => {
    const inCluster = clusterSessionIdx.has(idx);
    const sessionAmorce =
      pattern === "STRAIGHT" || pattern === "ISOLATION_FINISHER"
        ? v2AnchorOf(p, pattern, exercise)
        : p.amorce;
    if (sessionAmorce && (inCluster || !isClusterable)) {
      amorceHistoryDated.push({
        weight: sessionAmorce.weight,
        reps: sessionAmorce.reps,
        timestamp: sessionAmorce.timestamp,
      });
    }
    if (p.top && (inCluster || !isClusterable)) {
      topHistoryDated.push({ weight: p.top.weight, reps: p.top.reps, timestamp: p.top.timestamp });
    }
  });

  const validAmorceAnchors = amorceHistory.filter((a) => a.reps >= exercise.repTargetMin - 1);
  const lastAmorce = amorceHistory[0] ?? null;

  const failedOverreachLoads = computeFailedOverreachLoads(clusterSessions.length > 0 ? clusterSessions : processedHistory, exercise, increment);

  let topTarget: number | null = null;
  let amorceTarget = 0;

  if (pattern === "TOP_SET_BACKOFF") {
    // topTarget d'abord (amorceTarget en dépend via le garde-fou §4.2).
    topTarget = computeTopRef({
      tops: topHistory,
      amorceTarget: lastAmorce?.weight ?? defaultStartLoad(exercise),
      increment,
      repTargetMin: exercise.repTargetMin,
      repTargetMax: exercise.repTargetMax,
      failedOverreachLoads,
    });

    const promotionGatePassed = lastAmorce
      ? checkAmorcePromotion(amorceHistory, lastAmorce.weight, exercise.repTargetMax, exercise.fatigueClass)
      : false;

    amorceTarget = lastAmorce
      ? computeRoleRef({
          anchors: validAmorceAnchors,
          last: lastAmorce,
          repTargetMin: exercise.repTargetMin,
          increment,
          promotionGatePassed,
          topTarget,
        })
      : defaultStartLoad(exercise);
  } else if (pattern === "STRAIGHT" || pattern === "ISOLATION_FINISHER") {
    const promotionGatePassed = checkReactivePromotion(lastAmorce?.reps, exercise.repTargetMax);
    amorceTarget = lastAmorce
      ? computeRoleRef({
          anchors: validAmorceAnchors,
          last: lastAmorce,
          repTargetMin: exercise.repTargetMin,
          increment,
          promotionGatePassed,
        })
      : defaultStartLoad(exercise);
  }

  // Plateau mesuré sur la charge HISTORIQUE la plus récente (pré-promotion, pré-deload) : un
  // portillon de promotion qui vient de pousser la cible ne doit pas artificiellement "casser" un
  // plateau qui existe déjà sur ce que l'utilisateur a réellement répété (même raisonnement que
  // `deriveState` v1 avec `rawTargetLoad`, voir ligne ~430). Rôle dominant : top pour
  // TOP_SET_BACKOFF et WEIGHTED_BW_VARIABLE (le lest est la variable qui progresse ; l'amorce
  // BW y est structurellement fixe à 0 et ne porte aucun signal de plateau exploitable), amorce
  // sinon.
  const usesTopAsPlateauRef = pattern === "TOP_SET_BACKOFF" || pattern === "WEIGHTED_BW_VARIABLE";
  const plateauReference = usesTopAsPlateauRef && topHistory.length > 0 ? topHistory : amorceHistory;
  const plateauLoad = plateauReference[0]?.weight ?? (pattern === "TOP_SET_BACKOFF" ? (topTarget ?? amorceTarget) : amorceTarget);
  const plateauBestRep =
    plateauReference.filter((a) => Math.abs(a.weight - plateauLoad) < 0.01).reduce((max, a) => Math.max(max, a.reps), 0) ||
    exercise.repTargetMin;
  let plateauCounter = 0;
  for (const a of plateauReference) {
    if (Math.abs(a.weight - plateauLoad) < 0.01 && a.reps <= plateauBestRep) plateauCounter += 1;
    else break;
  }

  // VARIATION_CYCLING_SPEC §2/§3 — trigger officiel en dates (remplace plateauCounter>=3, voir
  // P1.3 pour le blast radius des sites appelants). Même rôle dominant que `plateauReference`
  // ci-dessus, mais avec les dates réelles (`amorceHistoryDated`/`topHistoryDated`).
  const plateauReferenceDatedAll = usesTopAsPlateauRef && topHistoryDated.length > 0 ? topHistoryDated : amorceHistoryDated;
  const plateauReferenceDated: DatedAnchor[] = [];
  for (const anchor of plateauReferenceDatedAll) {
    const previous = plateauReferenceDated.at(-1);
    if (
      previous &&
      daysBetween(previous.timestamp, anchor.timestamp) > ALGO_V2.LIFECYCLE_RUN_GAP_DAYS
    ) {
      break;
    }
    plateauReferenceDated.push(anchor);
  }
  const plateauDateState = derivePlateauDateState(exercise, plateauReferenceDated);
  const velocity = progressVelocityScore(exercise, currentRunHistory(rawHistory));
  const progressionState: "progressing" | "slowing" | "plateaued" = plateauDateState.isPlateau
    ? "plateaued"
    : plateauDateState.sessionsInWindow >= ALGO_V2.PLATEAU_MIN_SESSIONS &&
        velocity <= ALGO_V2.SLOWING_VELOCITY &&
        (plateauDateState.plateauStalledDays ?? 0) >= ALGO_V2.SLOWING_STALL_DAYS
      ? "slowing"
      : "progressing";

  return {
    pattern,
    processedHistory,
    activeClusterLoads,
    amorceTarget,
    topTarget,
    amorceHistory,
    topHistory,
    failedOverreachLoads,
    repSamples,
    plateauCounter,
    lastProgressDate: plateauDateState.lastProgressDate,
    plateauStalledDays: plateauDateState.plateauStalledDays,
    sessionsInWindow: plateauDateState.sessionsInWindow,
    isPlateau: plateauDateState.isPlateau,
    progressionState,
    reasonCodes,
  };
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

/** Libellé d'une série qui pose la référence d'un exercice (règle d'étalonnage, records.ts). */
const CALIBRATION_LABEL_FR = "Étalonnage";

/** Réservé aux suggestions qui battraient réellement un record (`readyForPR`). */
const RECORD_ATTEMPT_LABEL_FR = "Tentative de record";

const MODE_LABEL_FR: Record<string, string> = {
  [SuggestionMode.recordAttempt]: "Cible",
  [SuggestionMode.fallbackHypertrophy]: "Hypertrophie",
  [SuggestionMode.plateauBreak]: "Casser le plateau",
  [SuggestionMode.transitionMode]: "Montée en charge",
};

function render(candidate: Candidate, confidence: number, setTypeOverride?: SetType, role?: SetRole): SetSuggestion {
  const modeLabel = MODE_LABEL_FR[candidate.mode] ?? candidate.mode.replace(/_/g, " ");
  const loadLabel = candidate.load > 0 ? `${cleanWeight(candidate.load)} kg` : "PDC";
  return makeSuggestion({
    weight: candidate.load,
    reps: candidate.reps,
    setType: setTypeOverride ?? (candidate.mode === SuggestionMode.fallbackHypertrophy ? ST.backoff : ST.work),
    explanation: `${modeLabel} · ${loadLabel} × ${candidate.reps}`,
    confidence: Math.min(1, Math.max(0, confidence)),
    reasonCodes: candidate.reasonCodes,
    role,
    mode: candidate.mode,
  });
}

/**
 * Reprojects only the expected repetitions when the user manually changes the suggested load.
 * The suggestion remains the immutable reference point: editing reps in the UI must never call
 * this helper (and therefore can never move the load in the opposite direction).
 *
 * `bodyweightKg` is optional for the same reason as in `predictReps`: the engine's documented
 * default is used when the profile is unavailable. Assistance is expressed as a positive weight,
 * so increasing it lowers effective load and raises the projected repetitions.
 */
export function reprojectSuggestionAtWeight(
  suggestion: SetSuggestion,
  exercise: Exercise,
  requestedWeight: number,
  bodyweightKg?: number
): SetSuggestion {
  const weight = Math.max(0, requestedWeight);
  const mode = loadModeOf(exercise);
  const fromEffectiveLoad = effTotal(suggestion.weight, mode, bodyweightKg);
  const toEffectiveLoad = effTotal(weight, mode, bodyweightKg);
  const kgPerRep = Math.max(
    exercise.smallestIncrement,
    ALGO_V2.REP_SLOPE_PCT * Math.max(1, fromEffectiveLoad)
  );
  const projected = roundHalfAwayFromZero(
    suggestion.reps - (toEffectiveLoad - fromEffectiveLoad) / kgPerRep
  );
  const standardCap = exercise.repTargetMax;
  const cap =
    exercise.setPatternMode === SPM.bodyweight && suggestion.mode === SuggestionMode.plateauBreak
      ? Math.max(standardCap, suggestion.reps)
      : standardCap;
  const reps = clampInt(projected, 1, Math.max(1, cap));
  const modeLabel = MODE_LABEL_FR[suggestion.mode] ?? suggestion.mode.replace(/_/g, " ");
  const loadLabel = weight > 0 ? `${cleanWeight(weight)} kg` : "PDC";

  return {
    ...suggestion,
    weight,
    reps,
    explanation: `${modeLabel} · ${loadLabel} × ${reps}`,
  };
}

/**
 * Correction empirique bornée du biais « prédit à la charge réellement choisie » → performance
 * obtenue. Trois observations amorcent seulement un cran ; six permettent au maximum ±2 reps.
 * Les continuations, finishers et séries volontairement plafonnées sont exclues pour ne pas
 * apprendre sur une mesure censurée ou sur deux lignes d'une même série physiologique.
 */
function learnedPredictionOffset(history: LoggedSet[][], exercise: Exercise): number {
  const residuals = history
    .flatMap((session) => session)
    .filter(
      (set) =>
        set.completed &&
        set.reps > 0 &&
        set.predictedRepsAtActualWeight !== null &&
        set.predictedRepsAtActualWeight !== undefined &&
        set.setType !== ST.warmup &&
        set.setType !== ST.finisher &&
        set.setTechnique == null &&
        (set.logicalSetId == null || set.logicalSetId === set.id) &&
        !(exercise.voluntaryRepCap > 0 && set.reps >= exercise.voluntaryRepCap)
    )
    .slice(0, 12)
    .map((set) => clampInt(set.reps - set.predictedRepsAtActualWeight!, -3, 3));
  if (residuals.length < 3) return 0;
  const shrinkage = Math.min(1, residuals.length / 6);
  return clampInt(roundHalfAwayFromZero(median(residuals) * shrinkage), -2, 2);
}

// ---------------------------------------------------------------------------
// suggestWeightedBodyweight
// ---------------------------------------------------------------------------

function suggestWeightedBodyweight(
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  fatigueConfirmed: boolean,
  hasPrimerToday: boolean,
  bwSetsToday: LoggedSet[]
): SetSuggestion {
  // Mode BW-uniquement : targetLoad==0 signifie aucun historique lesté.
  // Traite chaque set BW comme un set de travail avec progression normale des reps,
  // en ignorant complètement la séparation primer/set lesté.
  if (derived.targetLoad === 0) {
    if (bwSetsToday.length === 0) {
      const base = fatigueConfirmed ? derived.recentBestAnchorReps : derived.recentBestAnchorReps + 1;
      const cap = Math.max(exercise.repTargetMax, derived.recentBestAnchorReps);
      const suggestedReps = clampInt(base, exercise.repTargetMin, cap);
      const mode: SuggestionMode = fatigueConfirmed ? SuggestionMode.fallbackHypertrophy : SuggestionMode.recordAttempt;
      return render(
        { load: 0, reps: suggestedReps, mode, reasonCodes: ["bw_only_wbw_first_set"] },
        0.9
      );
    }
    const lastBW = bwSetsToday[bwSetsToday.length - 1];
    const drop = Math.min(FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop, 2.0);
    const predicted = roundHalfAwayFromZero(lastBW.reps - drop);
    const cap = Math.max(exercise.repTargetMax, lastBW.reps);
    const bwReps = clampInt(predicted, Math.max(1, exercise.repTargetMin), cap);
    return render(
      { load: 0, reps: bwReps, mode: SuggestionMode.recordAttempt, reasonCodes: ["bw_only_wbw_predicted_drop"] },
      0.85
    );
  }

  if (doneToday.length === 0) {
    if (hasPrimerToday) {
      // Primer fait — suggère maintenant le premier set de travail
      if (derived.plateauCounter >= 3 && !fatigueConfirmed) {
        const plateau: Candidate = {
          load: derived.targetLoad + 5,
          reps: 5,
          mode: SuggestionMode.plateauBreak,
          reasonCodes: ["plateau_break_overreach_jump"],
        };
        return render(plateau, 0.82);
      }
      const target: Candidate = {
        load: derived.targetLoad,
        reps: exercise.repTargetMin,
        mode: SuggestionMode.recordAttempt,
        reasonCodes: ["post_primer_main_target"],
      };
      return render(target, fatigueConfirmed ? 0.7 : 0.92);
    }
    // Pas encore de primer — suggère le set primer BW
    const primer: Candidate = {
      load: 0,
      reps: 10,
      mode: SuggestionMode.recordAttempt,
      reasonCodes: ["primer_before_weighted_attempt"],
    };
    return render(primer, 0.95);
  }

  if (doneToday.length === 1) {
    const first = doneToday[0];
    if (first.weight > 0) {
      const drop = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
      const predictedReps = roundHalfAwayFromZero(first.reps - drop);
      const holdReps = clampInt(predictedReps, Math.max(4, exercise.repTargetMin - 1), exercise.repTargetMax);

      if (first.reps >= exercise.repTargetMin) {
        const sameLoad: Candidate = {
          load: first.weight,
          reps: holdReps,
          mode: SuggestionMode.recordAttempt,
          reasonCodes: ["adapt_from_first_weighted_set"],
        };
        return render(sameLoad, fatigueConfirmed ? 0.74 : 0.9);
      }

      const lighter: Candidate = {
        load: Math.max(0, first.weight - Math.max(1.25, exercise.smallestIncrement)),
        reps: Math.max(exercise.repTargetMin, holdReps + 1),
        mode: SuggestionMode.fallbackHypertrophy,
        reasonCodes: ["first_weighted_set_under_target", "lighter_followup"],
      };
      return render(lighter, 0.84);
    }

    if (derived.plateauCounter >= 3 && !fatigueConfirmed) {
      const plateau: Candidate = {
        load: derived.targetLoad + 5,
        reps: 5,
        mode: SuggestionMode.plateauBreak,
        reasonCodes: ["plateau_break_overreach_jump"],
      };
      return render(plateau, 0.82);
    }
    const target: Candidate = {
      load: derived.targetLoad,
      reps: exercise.repTargetMin,
      mode: SuggestionMode.recordAttempt,
      reasonCodes: ["main_target_attempt"],
    };
    return render(target, fatigueConfirmed ? 0.7 : 0.92);
  }

  const last = doneToday[doneToday.length - 1];
  if (last.reps <= Math.max(1, exercise.repTargetMin - 2)) {
    return render(
      {
        load: 0,
        reps: 10,
        mode: SuggestionMode.fallbackHypertrophy,
        reasonCodes: ["hard_fail_threshold_reached", "fallback_to_bodyweight"],
      },
      0.9
    );
  }

  if (last.weight > 0) {
    const drop = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
    const predictedReps = roundHalfAwayFromZero(last.reps - drop);
    const holdReps = clampInt(predictedReps, Math.max(4, exercise.repTargetMin - 2), exercise.repTargetMax);
    return render(
      {
        load: last.weight,
        reps: holdReps,
        mode: SuggestionMode.fallbackHypertrophy,
        reasonCodes: ["weighted_followup_from_last_set"],
      },
      0.82
    );
  }

  return render(
    {
      load: Math.max(0, derived.targetLoad - 5),
      reps: exercise.repTargetMin,
      mode: SuggestionMode.fallbackHypertrophy,
      reasonCodes: ["intermediate_fallback"],
    },
    0.86
  );
}

// ---------------------------------------------------------------------------
// suggestTopSetBackoff
// ---------------------------------------------------------------------------

function suggestTopSetBackoff(
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  increment: number,
  fatigueConfirmed: boolean
): SetSuggestion {
  if (doneToday.length === 0) {
    const topSet: Candidate = {
      load: derived.targetLoad,
      reps: exercise.repTargetMin,
      mode: SuggestionMode.recordAttempt,
      reasonCodes: ["top_set_anchor"],
    };
    return render(topSet, fatigueConfirmed ? 0.72 : 0.92, ST.topSet);
  }

  const last = doneToday[doneToday.length - 1];
  if (!last) {
    return render(
      { load: derived.targetLoad, reps: exercise.repTargetMin, mode: SuggestionMode.recordAttempt, reasonCodes: ["top_set_fallback"] },
      0.7,
      ST.topSet
    );
  }

  const isFirstFollowup = doneToday.length === 1;
  const dropSteps = last.reps <= Math.max(1, exercise.repTargetMin - 2) ? 2.0 : 1.0;
  const baseBackoffLoad = Math.max(0, last.weight - increment * dropSteps);
  const baseBackoffReps = clampInt(
    Math.max(last.reps + 1, roundUp((exercise.repTargetMin + exercise.repTargetMax) / 2.0)),
    exercise.repTargetMin,
    exercise.repTargetMax
  );

  if (isFirstFollowup) {
    const firstBackoff: Candidate = {
      load: baseBackoffLoad,
      reps: baseBackoffReps,
      mode: SuggestionMode.fallbackHypertrophy,
      reasonCodes: ["top_set_to_backoff_transition"],
    };
    return render(firstBackoff, 0.9, ST.backoff);
  }

  const baseDrop = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
  const predictedReps = clampInt(
    roundHalfAwayFromZero(last.reps - Math.max(1.0, baseDrop - 0.5)),
    exercise.repTargetMin,
    exercise.repTargetMax
  );

  const keepBackoff: Candidate = {
    load: last.weight,
    reps: predictedReps,
    mode: SuggestionMode.fallbackHypertrophy,
    reasonCodes: ["backoff_same_load_prediction"],
  };

  if (last.reps >= exercise.repTargetMax + 2) {
    const heavierBackoff: Candidate = {
      load: stepLoad(last.weight, increment, exercise.setPatternMode, true),
      reps: clampInt(predictedReps - 1, exercise.repTargetMin, exercise.repTargetMax),
      mode: SuggestionMode.transitionMode,
      reasonCodes: ["backoff_overshot_raise_load"],
    };
    return render(heavierBackoff, 0.84, ST.backoff);
  }

  if (last.reps <= Math.max(1, exercise.repTargetMin - 2)) {
    const lighterBackoff: Candidate = {
      load: stepLoad(last.weight, increment, exercise.setPatternMode, false),
      reps: clampInt(last.reps + 2, exercise.repTargetMin, exercise.repTargetMax),
      mode: SuggestionMode.fallbackHypertrophy,
      reasonCodes: ["backoff_under_target_drop_load"],
    };
    return render(lighterBackoff, 0.88, ST.backoff);
  }

  return render(keepBackoff, 0.82, ST.backoff);
}

// ---------------------------------------------------------------------------
// suggestRamping
// ---------------------------------------------------------------------------

function suggestRamping(
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  increment: number,
  fatigueConfirmed: boolean
): SetSuggestion {
  const targetLoad = derived.targetLoad;
  const firstRampLoad = rampStartLoad(targetLoad, increment, exercise);

  if (doneToday.length === 0) {
    const opener: Candidate = {
      load: firstRampLoad,
      reps: exercise.repTargetMax,
      mode: SuggestionMode.recordAttempt,
      reasonCodes: ["ramp_opener"],
    };
    return render(opener, fatigueConfirmed ? 0.74 : 0.9);
  }

  const last = doneToday[doneToday.length - 1];
  if (!last) {
    return render(
      { load: firstRampLoad, reps: exercise.repTargetMax, mode: SuggestionMode.recordAttempt, reasonCodes: ["ramp_fallback"] },
      0.65
    );
  }

  const currentEffort = effectiveLoad(last.weight, exercise.setPatternMode);
  const targetEffort = effectiveLoad(targetLoad, exercise.setPatternMode);
  const belowTarget = currentEffort + 0.01 < targetEffort;

  if (belowTarget) {
    const nextRampLoad = minHarderStepTowardTarget(last.weight, targetLoad, increment, exercise.setPatternMode);

    if (last.reps >= exercise.repTargetMax) {
      const rampUp: Candidate = {
        load: nextRampLoad,
        reps: Math.max(exercise.repTargetMin, exercise.repTargetMax - 1),
        mode: SuggestionMode.transitionMode,
        reasonCodes: ["ramp_up_after_easy_set"],
      };
      return render(rampUp, 0.88);
    }

    if (last.reps >= exercise.repTargetMin + 1) {
      const gentleRamp: Candidate = {
        load: nextRampLoad,
        reps: clampInt(last.reps - 1, exercise.repTargetMin, exercise.repTargetMax),
        mode: SuggestionMode.transitionMode,
        reasonCodes: ["ramp_up_after_solid_set"],
      };
      return render(gentleRamp, 0.83);
    }

    const holdRamp: Candidate = {
      load: last.weight,
      reps: clampInt(last.reps, exercise.repTargetMin, exercise.repTargetMax),
      mode: SuggestionMode.fallbackHypertrophy,
      reasonCodes: ["hold_ramp_until_target_ready"],
    };
    return render(holdRamp, 0.78);
  }

  return suggestGeneric(exercise, doneToday, derived, increment, fatigueConfirmed);
}

// ---------------------------------------------------------------------------
// suggestGeneric + buildCandidates + scoreCandidate
// ---------------------------------------------------------------------------

function suggestGeneric(
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  increment: number,
  fatigueConfirmed: boolean
): SetSuggestion {
  // Bodyweight au repMax : suggère à l'utilisateur d'envisager de se lester
  if (exercise.setPatternMode === SPM.bodyweight && doneToday.length === 0 && derived.recentBestAnchorReps >= exercise.repTargetMax) {
    return makeSuggestion({
      weight: 0,
      reps: exercise.repTargetMax,
      setType: ST.work,
      explanation: "Maximum atteint : pense à te lester.",
      confidence: 0.95,
      reasonCodes: ["bw_at_max_suggest_weight"],
      mode: SuggestionMode.transitionMode,
    });
  }

  const candidates = buildCandidates(exercise, doneToday, derived, increment, fatigueConfirmed);

  if (candidates.length === 0) {
    return makeSuggestion({
      weight: 20,
      reps: exercise.repTargetMin,
      setType: ST.work,
      explanation: "Point de départ",
      confidence: 0.4,
      reasonCodes: ["fallback"],
      mode: SuggestionMode.fallbackHypertrophy,
    });
  }

  let best = candidates[0];
  let bestScore = scoreCandidate(best, exercise, doneToday, derived, fatigueConfirmed);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreCandidate(candidates[i], exercise, doneToday, derived, fatigueConfirmed);
    // Swift `max(by:)` : garde le dernier élément qui n'est PAS strictement inférieur
    // (i.e. remplace sur >=), donc en cas d'égalité le dernier candidat gagne.
    if (!(score < bestScore)) {
      best = candidates[i];
      bestScore = score;
    }
  }

  const confidence = Math.min(0.98, Math.max(0.5, candidates.length / 5.0 + (fatigueConfirmed ? -0.1 : 0.15)));
  return render(best, confidence);
}

/**
 * RIR visé par les suggestions de séries de travail : 1, soit dans la zone où une série compte
 * pleinement (RIR 0 à 2, set-structure.ts). Même cible que la série de tête (`repsAtTargetRir`).
 */
const SUGGESTION_TARGET_RIR = 1;

/**
 * Reps que la série aurait données au RIR visé, dans les DEUX sens : une série à RIR 2 valait
 * une rep de plus, une série à l'échec (RIR 0) une de moins. Sans RIR rapporté, les reps faites.
 */
function repsAtSuggestionRir(set: LoggedSet): number {
  const reported = set.reportedRir;
  if (reported === null || reported === undefined || !Number.isFinite(reported)) return set.reps;
  return set.reps + Math.max(0, Math.min(4, Math.round(reported))) - SUGGESTION_TARGET_RIR;
}

/**
 * Charge qui donnerait `reps` au RIR visé pour une capacité (e1RM Epley) donnée, arrondie à
 * l'incrément inférieur : on vise la fourchette, pas au-dessus.
 */
function loadForRepsAtTargetRir(e1rm: number, reps: number, increment: number): number {
  const raw = e1rm / (1 + (reps + SUGGESTION_TARGET_RIR) / 30);
  if (!(increment > 0)) return raw;
  return Math.floor(raw / increment + 1e-9) * increment;
}

/**
 * Charge de la série suivante quand la précédente a dépassé la fourchette : calculée depuis la
 * capacité qu'elle révèle (e1RM sur les reps au RIR visé, fatigue intra-exercice déduite) pour
 * viser le haut-milieu de la fourchette, jamais moins d'un cran. Un seul cran après 65 × 12 à
 * RIR 2 restait loin des 72,5 × 10 réellement faits ensuite.
 */
function raisedLoadFrom(
  last: LoggedSet,
  predictedRepsAtTargetRir: number,
  exercise: Exercise,
  increment: number,
  oneStepHarder: number
): number {
  if (exercise.setPatternMode !== SPM.straight || !(last.weight > 0)) return oneStepHarder;
  const capacity = estimated1RM(last.weight, predictedRepsAtTargetRir + SUGGESTION_TARGET_RIR);
  const targetReps = clampInt(exercise.repTargetMax - 2, exercise.repTargetMin, exercise.repTargetMax);
  return Math.max(oneStepHarder, loadForRepsAtTargetRir(capacity, targetReps, increment));
}

/** En deçà, la série du jour ne démontre pas le niveau d'avant la pause (bruit de mesure admis). */
const GAP_REFUTATION_RATIO = 0.97;

/**
 * Capacité démontrée par une série : e1RM Epley sur les reps jusqu'à l'échec (reps + RIR rapporté)
 * pour une charge externe, reps jusqu'à l'échec au poids du corps.
 */
function demonstratedCapacity(set: LoggedSet): number {
  const repsToFailure = set.reps + Math.max(0, Math.min(4, set.reportedRir ?? 0));
  return set.weight > 0 ? estimated1RM(set.weight, repsToFailure) : repsToFailure;
}

function gapRefutedByToday(doneToday: LoggedSet[], lastSession: LoggedSet[]): boolean {
  const reference = lastSession.filter((set) => set.completed).map(demonstratedCapacity);
  if (reference.length === 0) return false;
  const today = Math.max(...doneToday.map(demonstratedCapacity));
  return today >= Math.max(...reference) * GAP_REFUTATION_RATIO;
}

/**
 * Charge maximale de la machine (bout de pile, saisi par l'utilisateur). Au-delà, la charge
 * n'existe pas : proposer 87,5 kg sur une machine qui s'arrête à 85 ne servait à rien. À ce
 * poids, la progression passe par les reps, au-delà de la fourchette si c'est ce qu'il faut pour
 * rejoindre le RIR visé : les reps viennent de ce que les séries à cette charge démontrent.
 */
function applyMachineMaxLoad(
  result: SetSuggestion,
  exercise: Exercise,
  doneToday: LoggedSet[],
  historyNewestFirst: LoggedSet[][]
): SetSuggestion {
  const maxLoad = exercise.maxLoad;
  if (!maxLoad || !(maxLoad > 0) || !(result.weight > 0) || result.weight < maxLoad - 1e-9) return result;

  const atMax = (set: LoggedSet) => set.completed && Math.abs(set.weight - maxLoad) < 1e-9;
  let reps: number | null = null;
  const lastToday = doneToday[doneToday.length - 1];
  if (lastToday && atMax(lastToday)) {
    const drop = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
    reps = roundHalfAwayFromZero(repsAtSuggestionRir(lastToday) - drop);
  } else if (doneToday.length === 0) {
    // Première série : ce que la série de tête à cette charge a donné récemment (au RIR visé).
    const firstSetsAtMax = historyNewestFirst
      .map((session) => session.find(atMax))
      .filter((set): set is LoggedSet => set !== undefined)
      .slice(0, 3)
      .map(repsAtSuggestionRir);
    if (firstSetsAtMax.length > 0) {
      const weighted = firstSetsAtMax.reduce(
        (acc, value, index) => ({ sum: acc.sum + value * Math.pow(ALGO_V2.RECENCY_ALPHA, index), weight: acc.weight + Math.pow(ALGO_V2.RECENCY_ALPHA, index) }),
        { sum: 0, weight: 0 }
      );
      reps = roundHalfAwayFromZero(weighted.sum / weighted.weight);
    }
  }
  if (reps === null) {
    // Aucune série à cette charge : même effort que la suggestion, reprojeté au poids maximal.
    reps = result.weight > maxLoad + 1e-9
      ? roundHalfAwayFromZero((estimated1RM(result.weight, result.reps) / maxLoad - 1) * 30)
      : result.reps;
  }
  const finalReps = Math.max(1, reps);
  return {
    ...result,
    weight: maxLoad,
    reps: finalReps,
    explanation: `Charge max de la machine · ${cleanWeight(maxLoad)} kg × ${finalReps}`,
    reasonCodes: [...result.reasonCodes, "machine_max_load"],
  };
}

function buildCandidates(
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  increment: number,
  fatigueConfirmed: boolean
): Candidate[] {
  if (doneToday.length === 0) {
    if (exercise.setPatternMode === SPM.bodyweight) {
      const base = fatigueConfirmed ? derived.recentBestAnchorReps : derived.recentBestAnchorReps + 1;
      const bwCap = Math.max(exercise.repTargetMax, derived.recentBestAnchorReps);
      const suggestedReps = clampInt(base, exercise.repTargetMin, bwCap);
      const mode: SuggestionMode = fatigueConfirmed ? SuggestionMode.fallbackHypertrophy : SuggestionMode.recordAttempt;
      return [{ load: 0, reps: suggestedReps, mode, reasonCodes: ["bw_anchor_reps_plus_one"] }];
    }
    // Pas de promotion un jour de fatigue — ne pas chasser une nouvelle charge quand le corps est déjà sollicité
    if (derived.promotionGatePassed && !fatigueConfirmed) {
      const promotedReps = Math.min(exercise.repTargetMax, exercise.repTargetMin + 2);
      return [
        {
          load: stepLoad(derived.targetLoad, increment, exercise.setPatternMode, true),
          reps: promotedReps,
          mode: SuggestionMode.transitionMode,
          reasonCodes: ["promotion_gate_passed"],
        },
      ];
    }
    // Fatigue : cible de reps et charge légèrement plus basses (rester au plancher, pas au pic)
    const base = fatigueConfirmed
      ? Math.max(exercise.repTargetMin, derived.recentBestAnchorReps - 1)
      : Math.min(exercise.repTargetMax, derived.recentBestAnchorReps + 1);
    let suggestedReps = clampInt(base, exercise.repTargetMin, exercise.repTargetMax);
    if (effectiveProgressionPolicy(exercise) === "voluntaryCap" && exercise.voluntaryRepCap > 0) {
      suggestedReps = Math.min(suggestedReps, exercise.voluntaryRepCap);
    }
    const mode: SuggestionMode = fatigueConfirmed ? SuggestionMode.fallbackHypertrophy : SuggestionMode.recordAttempt;
    const load = fatigueConfirmed
      ? Math.max(derived.recentWorkingFloor, derived.targetLoad - increment)
      : derived.targetLoad;
    return [
      {
        load,
        reps: suggestedReps,
        mode,
        reasonCodes: fatigueConfirmed ? ["first_set_session_fatigue"] : ["generic_first_anchor"],
      },
    ];
  }

  const last = doneToday[doneToday.length - 1];
  if (!last) return [];

  const baseDrop = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
  // Les exercices bodyweight plafonnent la chute de reps à 2 : la fatigue accumulée est la
  // seule variable et une chute brutale (ex: 10 → 5) est presque toujours un artefact de
  // scoring, pas une vraie fatigue.
  const effectiveDrop = exercise.setPatternMode === SPM.bodyweight ? Math.min(baseDrop, 2.0) : baseDrop;
  // Le RIR rapporté dit ce que la série valait vraiment : 12 reps à RIR 2 n'annoncent pas la même
  // série suivante que 12 reps à l'échec. Sans RIR, les reps faites (comportement historique).
  const rirReported = last.reportedRir !== null && last.reportedRir !== undefined;
  const lastAtTargetRir = repsAtSuggestionRir(last);
  const predicted = roundHalfAwayFromZero(lastAtTargetRir - effectiveDrop);
  const holdReps = clampInt(predicted, Math.max(1, exercise.repTargetMin - 1), exercise.repTargetMax);
  // Avec un RIR rapporté, dépasser le haut de la fourchette d'une rep suffit à monter : la marge
  // de 2 reps ne servait qu'à absorber l'incertitude d'une série sans RIR.
  const overshootMargin = rirReported ? 1 : 2;
  const backoffReps = roundUp((exercise.repTargetMin + exercise.repTargetMax) / 2);
  const harderLoad = stepLoad(last.weight, increment, exercise.setPatternMode, true);
  const easierLoad = stepLoad(last.weight, increment, exercise.setPatternMode, false);

  // Bodyweight : la charge est fixée à 0, seules les reps varient.
  // Renvoie un seul candidat pour éviter les artefacts de scoring (plateauBreak score 18
  // ne battrait jamais recordAttempt score 35 dans le scorer générique).
  if (exercise.setPatternMode === SPM.bodyweight) {
    if (derived.plateauCounter >= 3) {
      const bwPlateauCap = Math.max(exercise.repTargetMax, last.reps) + 2;
      const targetReps = clampInt(last.reps + 1, exercise.repTargetMin, bwPlateauCap);
      return [{ load: 0, reps: targetReps, mode: SuggestionMode.plateauBreak, reasonCodes: ["bw_plateau_rep_target"] }];
    }
    const bwDropCap = Math.max(exercise.repTargetMax, last.reps);
    const bwDrop = clampInt(predicted, Math.max(1, exercise.repTargetMin), bwDropCap);
    return [{ load: 0, reps: bwDrop, mode: SuggestionMode.recordAttempt, reasonCodes: ["bw_predicted_drop"] }];
  }

  // Récupération post-overreach : l'utilisateur a tenté une charge au-dessus de l'ancre
  // établie mais a raté le minimum de reps. Redescendre incrément par incrément (easierLoad)
  // gaspille des sets ; on saute directement à l'ancre pour que la séance reste productive.
  if (
    last.weight > derived.targetLoad + increment * 0.5 &&
    last.reps < exercise.repTargetMin - ALGO_V2.DEMOTION_MARGIN &&
    exercise.setPatternMode !== SPM.assistedBodyweight
  ) {
    const recoveryReps = clampInt(backoffReps, exercise.repTargetMin, exercise.repTargetMax);
    return [
      {
        load: derived.targetLoad,
        reps: recoveryReps,
        mode: SuggestionMode.fallbackHypertrophy,
        reasonCodes: ["post_overreach_return_to_anchor"],
      },
    ];
  }

  if (doneToday.length === 1) {
    if (lastAtTargetRir >= exercise.repTargetMax + 4 && shouldStepLoad(exercise.setPatternMode, last.weight, true)) {
      const aggressiveRaise: Candidate = {
        load: raisedLoadFrom(last, predicted, exercise, increment, harderLoad),
        reps: clampInt(lastAtTargetRir - Math.trunc(Math.max(2.0, baseDrop)), exercise.repTargetMin, exercise.repTargetMax),
        mode: SuggestionMode.transitionMode,
        reasonCodes: ["first_set_far_overshoot_raise_now"],
      };
      return [aggressiveRaise];
    }

    if (last.reps <= Math.max(1, exercise.repTargetMin - 3) && shouldStepLoad(exercise.setPatternMode, last.weight, false)) {
      const aggressiveDrop: Candidate = {
        load: easierLoad,
        reps: clampInt(last.reps + 2, exercise.repTargetMin, exercise.repTargetMax),
        mode: SuggestionMode.fallbackHypertrophy,
        reasonCodes: ["first_set_far_undershoot_drop_now"],
      };
      return [aggressiveDrop];
    }
  }

  // Redescendre d'un cran n'a de sens que si la même charge ne tient plus la fourchette, ou si la
  // fatigue de séance est avérée. Après 65 × 12 à RIR 2, proposer 62,5 kg contredisait la série.
  // À l'inverse, quand le RIR annonce une série sous le minimum à la même charge, c'est la
  // descente qui s'impose : garder la charge proposerait une série hors fourchette.
  const holdFitsRange = predicted >= exercise.repTargetMin;
  const canEase = shouldStepLoad(exercise.setPatternMode, last.weight, false);
  // Double progression : une série qui dépasse le haut de la fourchette au RIR visé appelle une
  // charge plus lourde. Garder la charge gagnait toujours la notation (65 × 12 à RIR 2 donnait
  // encore 65 kg), si bien que la montée n'arrivait jamais en cours de séance.
  const overshot =
    shouldStepLoad(exercise.setPatternMode, last.weight, true) &&
    lastAtTargetRir >= exercise.repTargetMax + overshootMargin;
  let result: Candidate[] = [];
  if (!overshot && (holdFitsRange || !canEase || !rirReported)) {
    result.push({ load: last.weight, reps: holdReps, mode: SuggestionMode.recordAttempt, reasonCodes: ["predicted_drop_same_load"] });
  }
  if (!holdFitsRange || fatigueConfirmed) {
    result.push({ load: easierLoad, reps: backoffReps, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["fallback_down_one_step"] });
  }

  if (overshot) {
    const raisedReps = clampInt(
      Math.min(roundHalfAwayFromZero(lastAtTargetRir - Math.max(1, baseDrop)), exercise.repTargetMax - 2),
      exercise.repTargetMin,
      exercise.repTargetMax
    );
    result.push({
      load: raisedLoadFrom(last, predicted, exercise, increment, harderLoad),
      reps: raisedReps,
      mode: SuggestionMode.transitionMode,
      reasonCodes: ["overshot_target_raise_load_next_set"],
    });
  }

  if (shouldStepLoad(exercise.setPatternMode, last.weight, false) && last.reps <= Math.max(1, exercise.repTargetMin - 2)) {
    result.push({
      load: easierLoad,
      reps: Math.max(exercise.repTargetMin, last.reps + 1),
      mode: SuggestionMode.fallbackHypertrophy,
      reasonCodes: ["undershot_target_drop_load_next_set"],
    });
  }

  // Policy testThenPromote : sur le set 2, remplace les candidats standards par un test plus lourd.
  // Si le test passe (reps >= repMin), checkPromotionGate promouvra à la prochaine séance.
  if (
    effectiveProgressionPolicy(exercise) === "testThenPromote" &&
    doneToday.length === 1 &&
    shouldStepLoad(exercise.setPatternMode, last.weight, true)
  ) {
    const testLoad = stepLoad(derived.targetLoad, increment, exercise.setPatternMode, true);
    return [
      {
        load: testLoad,
        reps: exercise.repTargetMin,
        mode: SuggestionMode.transitionMode,
        reasonCodes: ["test_then_promote_set2_test"],
      },
    ];
  }

  // Gestion du plateau : overreachJump ignore le scoring et renvoie un seul candidat lourd.
  // Generic laisse tomber vers le candidat de plateau standard.
  if (derived.plateauCounter >= 3) {
    if (effectiveProgressionPolicy(exercise) === "overreachJump") {
      return [
        {
          load: harderLoad,
          reps: Math.max(5, exercise.repTargetMin - 1),
          mode: SuggestionMode.plateauBreak,
          reasonCodes: ["overreach_jump_policy"],
        },
      ];
    }
    result.push({
      load: harderLoad,
      reps: Math.max(5, exercise.repTargetMin - 1),
      mode: SuggestionMode.plateauBreak,
      reasonCodes: ["plateau_policy_test_heavier"],
    });
  }

  // Policy voluntaryCap : plafonne les reps sur tous les candidats.
  if (effectiveProgressionPolicy(exercise) === "voluntaryCap" && exercise.voluntaryRepCap > 0) {
    result = result.map((c) => ({
      ...c,
      reps: Math.min(c.reps, exercise.voluntaryRepCap),
      reasonCodes: [...c.reasonCodes, "voluntary_cap"],
    }));
  }

  // Planchers séparés : les candidats ancre utilisent le plancher d'ancre, les candidats
  // fallback utilisent le plancher de fallback (plus bas). Évite de bloquer des sets de
  // récupération légitimes tout en gardant une garde contre des suggestions d'ancre absurdes.
  result = result.filter((candidate) => {
    const floor =
      candidate.mode === SuggestionMode.fallbackHypertrophy
        ? derived.recentFallbackFloor - increment
        : derived.recentWorkingFloor - increment;
    return candidate.load >= floor;
  });

  return result;
}

function scoreCandidate(
  candidate: Candidate,
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  fatigueConfirmed: boolean
): number {
  let score = 0;
  switch (candidate.mode) {
    case SuggestionMode.recordAttempt:
      score += 35;
      break;
    case SuggestionMode.fallbackHypertrophy:
      score += 22;
      break;
    case SuggestionMode.plateauBreak:
      score += 18;
      break;
    case SuggestionMode.transitionMode:
      score += 30;
      break;
  }

  const candidateEffort = effectiveLoad(candidate.load, exercise.setPatternMode);
  const targetEffort = effectiveLoad(derived.targetLoad, exercise.setPatternMode);

  if (Math.abs(candidateEffort - targetEffort) < 0.01) score += 15;
  if (candidateEffort > targetEffort) score += 8;
  if (candidateEffort < targetEffort) score -= 5;

  if (fatigueConfirmed && candidate.mode === SuggestionMode.recordAttempt) score -= 18;
  if (fatigueConfirmed && candidate.mode === SuggestionMode.fallbackHypertrophy) score += 12;

  if (derived.progressVelocity > 0.75 && candidateEffort > targetEffort) score += 5;
  if (derived.progressVelocity < 0.25 && candidateEffort > targetEffort) score -= 6;

  const last = doneToday[doneToday.length - 1];
  if (last) {
    if (last.reps <= Math.max(1, exercise.repTargetMin - 2) && candidate.mode === SuggestionMode.recordAttempt) score -= 20;
    // Le candidat « redescendre » n'existe plus que s'il est justifié (fourchette non tenue ou
    // fatigue avérée) : après une série correcte, il reste alors le choix raisonnable.
    if (last.reps >= Math.max(exercise.repTargetMin, 7) && candidate.mode === SuggestionMode.fallbackHypertrophy) score += 6;
  }

  if (candidate.reps < 5) score -= 10;
  // Au-delà du haut de la fourchette de CET exercice, pas d'un seuil fixe de 10 reps : une
  // fourchette 8-12 rendait 11 reps « trop » et poussait à baisser la charge.
  if (candidate.reps > exercise.repTargetMax && candidate.mode !== SuggestionMode.fallbackHypertrophy) score -= 10;
  return score;
}

// ---------------------------------------------------------------------------
// ALGO_V2 — §7 suggest() set par set, §8 plateau/anti-plateau/techniques
// ---------------------------------------------------------------------------

function roundHalfAwayFromZeroV2(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

/**
 * §8 — anti-plateau échoué : la séance k-1 contenait une tentative `plateau_break` dont les
 * reps < repMin-2 -> pour k et k+1 (ANTIPLATEAU_SESSIONS), toutes les refs de charge sont
 * multipliées par ANTIPLATEAU_FACTOR (arrondi incrément), promotion gelée. Détection stateless :
 * on relit l'historique du rôle dominant pour trouver une tentative "overreach" récente ratée.
 */
function detectAntiPlateauActive(
  plateauReference: AnchorLoad[], // rôle dominant, plus récent en premier
  exercise: Exercise,
  increment: number
): boolean {
  // Une "tentative de surcharge plateau_break" ratée = un bond net (>= 1 incrément au-dessus du
  // set PRÉCÉDENT le plus lourd du rôle dominant, cf. §8 "top set +1 incrément, ~5 reps") suivi
  // d'un échec NET (reps < 3, même seuil que `failedOverreachLoads` §8 — un simple "top set un
  // peu difficile, 4-7 reps" fait PARTIE du pattern top/backoff normal et ne doit jamais être
  // confondu avec une tentative d'anti-plateau ratée, sous peine de déclencher un deload -10%
  // sur du bruit ordinaire). Ne regarde que les ANTIPLATEAU_SESSIONS dernières séances.
  for (let k = 0; k < Math.min(plateauReference.length - 1, ALGO_V2.ANTIPLATEAU_SESSIONS); k++) {
    const attempt = plateauReference[k];
    const priorMax = Math.max(...plateauReference.slice(k + 1).map((a) => a.weight));
    if (!attempt || !Number.isFinite(priorMax)) continue;
    if (attempt.weight >= priorMax + increment - 1e-9 && attempt.reps < 3) {
      return true;
    }
  }
  return false;
}

// VARIATION_CYCLING_SPEC §4 décision #3 (P1.6) — `plateauEscalation()` (surcharge +1 incrément /
// rest-pause en alternance) est RETIRÉE : aucune technique d'intensité n'est plus prescrite par
// l'app. Son site d'invocation (ex-§8, ci-dessous dans `suggest()`) pose désormais le signal de
// rotation de variation (`selectAlternative`, §6) au lieu de muter weight/reps/mode. Cf. note P1.6
// dans `VARIATION_CYCLING_IMPL.md` pour le détail du retrait.

/**
 * §7.1 — TOP_SET_BACKOFF v2. `sfContext`/`gapTier` alimentent `predictReps` (§5.3).
 */
function suggestTopSetBackoffV2(
  exercise: Exercise,
  doneToday: LoggedSet[],
  v2: DeriveStateV2Result,
  increment: number,
  fatigueConfirmed: boolean,
  predictCtx: Omit<PredictContext, "samples">,
  antiPlateauActive: boolean
): SetSuggestion {
  const { amorceTarget } = v2;
  const topTarget = v2.topTarget ?? amorceTarget + 2 * increment;
  const lastTop = v2.topHistory[0] ?? null;

  const antiPlateauMul = antiPlateauActive ? ALGO_V2.ANTIPLATEAU_FACTOR : 1;
  const amorceAdj = antiPlateauActive ? roundToIncrementV2(amorceTarget * antiPlateauMul, increment) : amorceTarget;
  const topAdj0 = antiPlateauActive ? roundToIncrementV2(topTarget * antiPlateauMul, increment) : topTarget;

  const baseCtx: PredictContext = { ...predictCtx, samples: v2.repSamples };

  if (doneToday.length === 0) {
    const reps = predictRepsPure(amorceAdj, "amorce", baseCtx);
    return render(
      { load: amorceAdj, reps, mode: SuggestionMode.recordAttempt, reasonCodes: antiPlateauActive ? ["antiplateau_deload"] : ["top_set_anchor_v2"] },
      fatigueConfirmed ? 0.72 : 0.92,
      ST.work,
      "amorce"
    );
  }

  const set1 = doneToday[0];
  const inversion = set1.weight >= topAdj0 - increment - 1e-9;

  if (doneToday.length === 1) {
    if (inversion) {
      const reps = predictRepsPure(amorceAdj, "amorce", baseCtx);
      return render(
        { load: amorceAdj, reps, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["top_set_done_first"] },
        0.85,
        ST.work,
        "amorce"
      );
    }

    const expected0 = predictRepsPure(amorceAdj, "amorce", { ...baseCtx, formDelta: 0, fatiguePenalty: 0, gapTier: undefined });
    // Le RIR est une observation de capacité du JOUR. 80x10 à RIR3 ne doit pas être traité comme
    // un 10RM et mener à une proposition arbitraire de 3 reps. On ramène prudemment vers RIR1
    // (maximum +3 reps puisque l'UI borne RIR à 4+) avant de calculer le delta de forme.
    const rirAdjustedSet1Reps = repsAtTargetRir(set1, 1);
    const formDelta = clampFormDelta(rirAdjustedSet1Reps - expected0);

    let topAdj = topAdj0;
    let candidateMode: SuggestionMode = topAdj > (lastTop?.weight ?? 0) ? SuggestionMode.recordAttempt : SuggestionMode.transitionMode;
    if (formDelta <= -2) {
      topAdj = Math.min(topAdj0, (lastTop?.weight ?? topAdj0) - increment);
      candidateMode = SuggestionMode.fallbackHypertrophy;
    }

    const reps = clampInt(
      predictRepsPure(topAdj, "top", { ...baseCtx, formDelta }),
      exercise.repTargetMin,
      exercise.repTargetMax
    );
    return render({ load: Math.max(0, topAdj), reps, mode: candidateMode, reasonCodes: ["top_set_v2"] }, 0.88, ST.topSet, "top");
  }

  // set 3+ : BACKOFF
  const topDone = doneToday.reduce((best, cur) => (cur.weight > best.weight ? cur : best));
  // Un backoff se calibre depuis le TOP réellement fait aujourd'hui, pas depuis l'amorce. Avec
  // 80x10 puis 100x8, revenir à 82.5 effaçait l'information la plus récente et la plus forte.
  // Deux incréments donnent un retrait modéré (100 -> 95 ici), tout en gardant l'amorce comme
  // plancher si le top était un overreach beaucoup plus haut.
  const backoffSteps = topDone.reps < exercise.repTargetMin ? 3 : 2;
  const backLoad = Math.max(amorceAdj, topDone.weight - backoffSteps * increment);

  if (doneToday.length >= ALGO_V2.MAX_WORK_SETS_SUGGESTED) {
    const reps = clampInt(roundUp((exercise.repTargetMin + exercise.repTargetMax) / 2), exercise.repTargetMin, exercise.repTargetMax);
    return render(
      { load: Math.max(0, amorceAdj - increment), reps, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["backoff_max_sets_reached"] },
      0.5,
      ST.backoff,
      "backoff"
    );
  }

  const loadDropInReps = Math.max(
    0,
    (topDone.weight - backLoad) /
      Math.max(increment, ALGO_V2.REP_SLOPE_PCT * Math.max(1, topDone.weight))
  );
  const sameSessionDrop = Math.min(
    FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop,
    2
  );
  const repsFromActualTop = roundHalfAwayFromZeroV2(
    repsAtTargetRir(topDone, 1) + loadDropInReps - sameSessionDrop
  );
  const reps = clampInt(
    repsFromActualTop,
    exercise.repTargetMin,
    exercise.repTargetMax
  );
  return render(
    { load: backLoad, reps, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["backoff_v2"] },
    0.86,
    ST.backoff,
    "backoff"
  );
}

/** Reps observées ramenées vers un effort cible, sans inventer de décimales de RIR. */
function repsAtTargetRir(set: LoggedSet, targetRir: number): number {
  const reported = set.reportedRir;
  if (reported === null || reported === undefined || !Number.isFinite(reported)) return set.reps;
  return set.reps + Math.max(0, Math.min(4, Math.round(reported)) - targetRir);
}

function clampFormDelta(raw: number): number {
  return clampInt(raw, ALGO_V2.FORM_DELTA_MIN, ALGO_V2.FORM_DELTA_MAX);
}

/**
 * §7.4 — BW_REP v2. Gère la bascule de variante (§9, Ab roller debout -> genoux), la
 * progression par reps puis sets, et le plateau BW (cap étendu).
 */
function suggestBWRepV2(
  exercise: Exercise,
  doneToday: LoggedSet[],
  v2: DeriveStateV2Result,
  predictCtx: Omit<PredictContext, "samples">,
  fatigueConfirmed: boolean,
  prAchievedToday: boolean
): SetSuggestion {
  const ctx: PredictContext = { ...predictCtx, samples: v2.repSamples };
  const cap = exercise.repTargetMax;

  if (doneToday.length === 0) {
    // Au poids du corps, les reps sont la SEULE progression : la série de tête suit ce que les
    // dernières séries de tête ont démontré (au RIR visé), au-delà de la fourchette s'il le faut.
    // Plafonner à la fourchette proposait 10 HSPU à quelqu'un qui en faisait 14 à 17.
    const set1Reps = v2.processedHistory
      .slice(0, 3)
      .map((p) => p.workSets[0])
      .filter((set): set is LoggedSet => set !== undefined)
      .map(repsAtSuggestionRir);
    const target = set1Reps.length > 0 ? median(set1Reps) : exercise.repTargetMin;
    const reps = clampInt(roundHalfAwayFromZeroV2(target), 1, Math.max(cap, roundHalfAwayFromZeroV2(target)));
    return render({ load: 0, reps, mode: SuggestionMode.recordAttempt, reasonCodes: ["bw_rep_v2_first_set"] }, fatigueConfirmed ? 0.72 : 0.92, ST.work, "bw");
  }

  const last = doneToday[doneToday.length - 1];
  const easierVariant = easierVariantName(exercise.name);

  if (!prAchievedToday && last.reps < ALGO_V2.VARIANT_SWITCH_FLOOR && easierVariant) {
    return makeSuggestion({
      weight: 0,
      reps: 10,
      setType: ST.work,
      explanation: "Variante facile : finir le volume (3 × 10)",
      confidence: 0.9,
      reasonCodes: ["variant_switch_easier"],
      mode: SuggestionMode.fallbackHypertrophy,
      switchToVariantId: easierVariant,
      role: "bw",
    });
  }

  // VARIATION_CYCLING_SPEC §2 (P1.3) : trigger officiel = isPlateau (date-based), remplace
  // plateauCounter >= PLATEAU_THRESHOLD (session-count v2). Ce n'est pas la branche
  // plateauEscalation() (rest-pause/overreach) visée par le retrait §4/décision #3 — juste
  // l'extension du cap de reps BW quand plateau ; trigger seul migré ici.
  if (v2.isPlateau) {
    const extendedCap = Math.max(exercise.repTargetMax, last.reps) + 2;
    const reps = clampInt(last.reps + 1, exercise.repTargetMin, extendedCap);
    return render({ load: 0, reps, mode: SuggestionMode.plateauBreak, reasonCodes: ["bw_plateau_rep_target_v2"] }, 0.82, ST.work, "bw");
  }

  const rawPrediction = predictRepsPure(0, doneToday.length + 1 > 3 ? 3 : doneToday.length + 1, ctx);
  // Sans signal de fatigue, ne jamais annoncer immédiatement moins que le set qui vient d'être
  // validé. Le plafond propre à l'exercice reste prioritaire (HSPU : BW×10 reste BW×10, jamais 8).
  const pred = fatigueConfirmed ? rawPrediction : Math.max(rawPrediction, Math.min(last.reps, cap));

  // Ajout de set (progression par sets) : les 2 dernières séances toutes au cap ET on est à la
  // position habituelle -> suggérer un set de plus.
  const last2 = v2.processedHistory.slice(0, 2);
  const bothFullAtCap =
    last2.length === 2 && last2.every((p) => p.workSets.length > 0 && p.workSets.every((s) => s.reps >= cap));
  const medSets = median(v2.processedHistory.slice(0, 5).map((p) => p.workSets.length));
  if (bothFullAtCap && doneToday.length === Math.round(medSets) && doneToday.every((s) => s.reps >= cap) && doneToday.length < ALGO_V2.MAX_WORK_SETS_SUGGESTED) {
    return render({ load: 0, reps: cap, mode: SuggestionMode.transitionMode, reasonCodes: ["bw_add_set"] }, 0.85, ST.work, "bw");
  }

  return render({ load: 0, reps: pred, mode: SuggestionMode.recordAttempt, reasonCodes: ["bw_rep_v2_predicted"] }, 0.85, ST.work, "bw");
}

/** §7.5 — WEIGHTED_BW_VARIABLE v2 (Tractions SN). */
function suggestWeightedBWVariableV2(
  exercise: Exercise,
  doneToday: LoggedSet[],
  currentSessionSets: LoggedSet[],
  v2: DeriveStateV2Result,
  increment: number,
  predictCtx: Omit<PredictContext, "samples">,
  gapExerciseDays: number | undefined,
  gapLestDays: number | undefined,
  sessionFatigue: SessionFatigueContext,
  parent: ReturnType<typeof primaryParent>
): SetSuggestion {
  const ctx: PredictContext = { ...predictCtx, samples: v2.repSamples };
  const bwSetsToday = currentSessionSets.filter(
    (s) => s.completed && s.setType !== ST.warmup && s.setType !== ST.finisher && s.weight === 0
  );
  const weightedSetsToday = doneToday.filter((s) => s.weight > 0);

  if (bwSetsToday.length === 0 && weightedSetsToday.length === 0) {
    return render({ load: 0, reps: 10, mode: SuggestionMode.recordAttempt, reasonCodes: ["wbw_v2_primer"] }, 0.95, ST.work, "bw");
  }

  const set1BW = bwSetsToday[0];

  if (weightedSetsToday.length === 0) {
    // set 1 (BW primer) déjà fait — décide lest vs 3xBW.
    const gapExerciseOk = gapExerciseDays === undefined || gapExerciseDays <= 10;
    const localCount = parent ? sessionFatigue.sameParentSets(parent) : 0;
    // VARIATION_CYCLING_SPEC §2 (P1.3) : trigger officiel = isPlateau (date-based), remplace
    // plateauCounter < PLATEAU_THRESHOLD. Gate d'escalade (pas la branche plateauEscalation) :
    // ne pas ajouter de lest tant que l'exo est en plateau (rester sur le BW en premier).
    const lestAllowed =
      (set1BW?.reps ?? 0) >= 10 &&
      gapExerciseOk &&
      localCount < 3 &&
      sessionFatigue.totalSystemicCost <= ALGO_V2.FRESH_SYSTEMIC_MAX &&
      !v2.isPlateau;

    if (lestAllowed && v2.topHistory.length > 0) {
      const lastLest = v2.topHistory[0];
      const lestTarget = computeLestRef({
        lastLest,
        gapLestDays,
        increment,
        repTargetMin: exercise.repTargetMin,
        mode: "weighted_bodyweight",
        bodyweightKg: predictCtx.bodyweightKg,
        samples: v2.repSamples,
      });
      const reps = predictRepsPure(lestTarget, "top", ctx);
      return render({ load: lestTarget, reps, mode: SuggestionMode.recordAttempt, reasonCodes: ["wbw_v2_lest"] }, 0.85, ST.topSet, "top");
    }

    const pred = predictRepsPure(0, 2, ctx);
    return render({ load: 0, reps: pred, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["bw_day_fatigue_or_gap"] }, 0.8, ST.work, "bw");
  }

  // Après le set lesté : retour BW.
  const lastWeighted = weightedSetsToday[weightedSetsToday.length - 1];
  if (lastWeighted.reps <= Math.max(1, exercise.repTargetMin - 2)) {
    return render({ load: 0, reps: 10, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["hard_fail_threshold_reached", "fallback_to_bodyweight"] }, 0.9, ST.work, "bw");
  }
  const pred = predictRepsPure(0, "backoff", ctx);
  return render({ load: 0, reps: pred, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["wbw_v2_backoff_bw"] }, 0.82, ST.backoff, "backoff");
}

/**
 * §7.2/§7.3 — STRAIGHT/ISOLATION_FINISHER v2 : réutilise `suggestGeneric` (candidats +
 * scoring, floors, policies) mais avec `derived.targetLoad = straightRef` (§4.2, cluster actif)
 * et un cap de reps garanti sur le résultat final (invariant 6, plus jamais 11 reps).
 */
function suggestStraightV2(
  exercise: Exercise,
  doneToday: LoggedSet[],
  derived: DerivedExerciseState,
  v2: DeriveStateV2Result,
  increment: number,
  fatigueConfirmed: boolean,
  predictCtxBase: Omit<PredictContext, "samples">
): SetSuggestion {
  const cap = exercise.repTargetMax;

  // Premier set de la séance : la référence + la décision de promotion (§4.2/§4.4) sont déjà
  // entièrement résolues dans `v2.amorceTarget` (computeRoleRef, réactif §4.4). On émet
  // directement la suggestion ici plutôt que de laisser `suggestGeneric` recalculer SA PROPRE
  // décision de promotion v1 (fenêtre stricte Heavy 2/3, etc.) par-dessus une cible déjà promue
  // (double-incrémentation). `suggestGeneric` reste le chemin pour set 2+ (fatigue intra-séance,
  // floors, policies), qui ne repose pas sur le portillon de promotion.
  if (doneToday.length === 0 && v2.amorceTarget > 0) {
    const lastAmorce = v2.amorceHistory[0] ?? null;
    const promoted = lastAmorce !== null && v2.amorceTarget > lastAmorce.weight + 0.01;
    const ctx: PredictContext = { ...predictCtxBase, samples: v2.repSamples };
    const reps = clampInt(predictRepsPure(v2.amorceTarget, 1, ctx, { extendedCap: cap }), exercise.repTargetMin, cap);
    return render(
      {
        load: v2.amorceTarget,
        reps,
        mode: promoted ? SuggestionMode.transitionMode : SuggestionMode.recordAttempt,
        reasonCodes: promoted ? ["promotion_gate_passed"] : ["straight_ref_v2"],
      },
      fatigueConfirmed ? 0.7 : 0.92,
      undefined,
      "straight"
    );
  }

  const derivedV2: DerivedExerciseState = { ...derived, targetLoad: v2.amorceTarget || derived.targetLoad };
  const result = suggestGeneric(exercise, doneToday, derivedV2, increment, fatigueConfirmed);
  if (result.reps > cap && result.mode !== SuggestionMode.plateauBreak) {
    const modeLabel = MODE_LABEL_FR[result.mode] ?? result.mode.replace(/_/g, " ");
    const loadLabel = result.weight > 0 ? `${cleanWeight(result.weight)} kg` : "PDC";
    return {
      ...result,
      reps: cap,
      explanation: `${modeLabel} · ${loadLabel} × ${cap}`,
      reasonCodes: [...result.reasonCodes, "rep_cap_v2"],
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Point d'entrée principal
// ---------------------------------------------------------------------------

export interface SuggestParams {
  exercise: Exercise;
  currentSetIndex: number;
  recentHistory?: LoggedSet[][];
  currentSessionSets?: LoggedSet[];
  smallestIncrement?: number;
  sessionFatigue?: SessionFatigueContext;
  /**
   * WS4 — nombre de jours écoulés depuis la dernière séance ayant loggé au
   * moins un work set COMPLÉTÉ de CET exercice exact (même id, le store ne
   * fusionne pas les variantes). `undefined` => comportement identique à
   * avant WS4 (aucun deload appliqué). Prioritaire sur `lastSessionDate` si
   * les deux sont fournis.
   */
  gapDays?: number;
  /** Alternative à `gapDays` : date de la dernière séance, converti en jours par rapport à `now` (ou `new Date()`). */
  lastSessionDate?: Date;
  /** Horloge injectable pour les tests ; par défaut `new Date()`. */
  now?: Date;
  /**
   * WS4 — override "Je suis frais" : quand true, annule tout deload pour cet
   * appel (la charge de référence redevient `rawTargetLoad`, comme si
   * `gapDays` était `undefined`). Le store expose `freshOverrides` /
   * `setFreshOverride` pour piloter ce flag par `loggedExerciseId` — voir
   * `lib/store/workout.ts`.
   */
  freshOverride?: boolean;
  /** ALGO_V2 §5.1 — poids de corps pour les modes weighted/assisted bodyweight. Défaut 75 (DEFAULT_BODYWEIGHT_KG). */
  bodyweightKg?: number;
  /** ALGO_V2 §2.6 — position de l'exercice dans chaque séance historique, aligné sur `recentHistory` (ISOLATION_FINISHER). */
  historyPositions?: HistoryPosition[];
  /** ALGO_V2 §6.3 — jours depuis la dernière séance contenant un set LESTÉ (WEIGHTED_BW_VARIABLE, §4.5), distinct de `gapDays` (gap de l'exercice). */
  gapLestDays?: number;
  /** Un PR déjà réalisé aujourd'hui masque au minimum l'alerte de fatigue contradictoire. */
  prAchievedToday?: boolean;
  /** Un PR est encore la preuve la plus récente : masque aussi l'alerte de fatigue. */
  prIsLatestEvidence?: boolean;
  /**
   * VARIATION_CYCLING_SPEC §6/§8 — catalogue complet des exercices, nécessaire pour :
   *   (1) résoudre en `Exercise.id` réel le nom `VARIANT_LINKS` (§7.4/§9, bascule BW facile) ;
   *   (2) alimenter `selectAlternative` (rotation de variation sur plateau daté, §2/§4).
   * `undefined` => dégradation gracieuse (§9) : `switchToVariantId` reste `null`, jamais de crash.
   */
  catalog?: Exercise[];
  /**
   * VARIATION_CYCLING_SPEC §6 — historique brut MULTI-exercices (`WorkoutSession[]`, plus récent en
   * premier), distinct de `recentHistory` (mono-exercice, `LoggedSet[][]`) : nécessaire à
   * `selectAlternative` (`collectExerciseHistory`/`weeklyPriorities` regardent d'autres exercices
   * que celui-ci). `undefined` => pas de proposition de rotation (§9, dégradation gracieuse).
   */
  sessionHistory?: WorkoutSession[];
  /** VARIATION_CYCLING_SPEC §6 — objectifs musculaires courants (`goalFit` de `selectAlternative`). Défaut `[]`. */
  goals?: MuscleGoal[];
  /**
   * BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — profil StrengthLevel (gender/ageYears/bodyWeightKg), requis
   * pour `readyForLevelUp`/`nextLevelName` (`resolveStandard`, mêmes règles de garde que
   * `exerciseBenchmark` : 25-40 ans, genre homme, poids de corps connu). DISTINCT de `bodyweightKg`
   * ci-dessus (celui-ci a un défaut algorithmique `ALGO_V2.DEFAULT_BODYWEIGHT_KG` pour les modes
   * bodyweight/assisted — pas un vrai profil, ne doit pas alimenter une jauge StrengthLevel).
   * `undefined` => `readyForLevelUp`/`nextLevelName` restent `undefined` (§9, dégradation gracieuse ;
   * `readyForPR` n'en dépend PAS, cf. note du champ).
   */
  profile?: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">;
}

/**
 * Point d'entrée principal, miroir de `ProgressionEngine.suggest` (Swift).
 *
 * Note de parité : en Swift, `previousSets` (la dernière séance) et
 * `recentHistory` (jusqu'à 5 séances supplémentaires) sont deux paramètres
 * distincts concaténés en interne (`[previousSets] + recentHistory`). Côté
 * TS, on ne garde que `recentHistory` (le store fournit déjà les séances
 * dans l'ordre du plus récent au plus ancien, `previousSets` = recentHistory[0]).
 * `deriveState` prend toujours `recentHistory.slice(0, 5)` en interne — c'est
 * donc à l'appelant de garantir que `recentHistory[0]` est la dernière séance.
 */
export function suggest(params: SuggestParams): SetSuggestion {
  const {
    exercise,
    recentHistory = [],
    currentSessionSets = [],
    smallestIncrement,
    sessionFatigue = SessionFatigueContext.empty,
    gapDays: explicitGapDays,
    lastSessionDate,
    now = new Date(),
    freshOverride = false,
    bodyweightKg,
    historyPositions,
    gapLestDays,
    prAchievedToday = false,
    prIsLatestEvidence = prAchievedToday,
    catalog,
    sessionHistory,
    goals = [],
    profile,
  } = params;

  const increment = smallestIncrement ?? exercise.smallestIncrement;

  // WS4 — résout le gap en jours : `gapDays` explicite prioritaire sur `lastSessionDate`.
  // `freshOverride` (action "Je suis frais" côté store) annule tout deload pour cet appel.
  // Ni l'un ni l'autre fourni => undefined => deriveState n'applique aucun ajustement
  // (comportement strictement identique à avant WS4).
  const derivedGapDays =
    explicitGapDays ?? (lastSessionDate ? Math.floor((now.getTime() - lastSessionDate.getTime()) / 86_400_000) : undefined);
  let effectiveGapDays = freshOverride ? undefined : derivedGapDays;
  let effectiveGapLestDays = freshOverride ? undefined : gapLestDays;

  // Sépare primers/warmups des vrais sets de travail.
  // doneToday ne contient que les sets sur lesquels le moteur doit raisonner pour prédire charge/reps.
  // hasPrimerToday indique aux branches qu'un primer a déjà été fait cette séance.
  const hasPrimerToday = currentSessionSets.some(
    (s) =>
      s.completed &&
      (s.setType === ST.warmup ||
        (s.setType !== ST.finisher && s.weight === 0 && exercise.setPatternMode === SPM.weightedBodyweight))
  );
  const completedNonWarmupToday = currentSessionSets.filter(
    (set) => set.completed && set.setType !== ST.warmup
  );

  // ALGO_V2 §2 — détecte le pattern réel. `assisted_bodyweight` et `ramping` restent TOUJOURS
  // sur le chemin v1 (verrou §2 étape 1, et ramping n'est jamais détecté §2 étape 2/11).
  // On conserve l'alignement position/historique même si l'appelant a fourni une séance vide.
  const historyEntries = recentHistory
    .map((session, index) => ({ session, position: historyPositions?.[index] }))
    .filter((entry) => entry.session.length > 0);
  const rawHistory = historyEntries.map((entry) => entry.session);
  const alignedPositions =
    historyPositions && historyEntries.every((entry) => entry.position !== undefined)
      ? historyEntries.map((entry) => entry.position as HistoryPosition)
      : undefined;

  const alwaysLegacy = exercise.setPatternMode === SPM.assistedBodyweight || exercise.setPatternMode === SPM.ramping;
  const rawPattern = alwaysLegacy ? null : detectPatternPure(exercise, rawHistory, alignedPositions);
  const hasExplicitFinisherProfile =
    rawPattern === "ISOLATION_FINISHER" &&
    rawHistory.some((session) => session.some((set) => set.completed && set.setType === ST.finisher));
  const preserveDedicatedFinisher = rawPattern === "ISOLATION_FINISHER";
  const history = rawHistory
    .map((session) =>
      setsForNormalPrediction(
        preserveDedicatedFinisher
          ? session.map((set) => (set.setType === ST.finisher ? { ...set, setType: ST.work } : set))
          : session,
        {
          increment,
          preserveDedicatedFinisher,
        }
      )
    )
    .filter((session) => session.length > 0);

  // Un profil finisher EXPLICITEMENT persisté garde sa piste dédiée, mais les
  // sets sont temporairement recastés en work pour réutiliser le prédicteur de
  // charge/reps. Hors de ce profil, les finishers restent exclus comme avant.
  const rawDoneToday = completedNonWarmupToday.filter((set) =>
    hasExplicitFinisherProfile
      ? set.setType === ST.finisher
      : set.setType !== ST.finisher &&
        !(set.weight === 0 && exercise.setPatternMode === SPM.weightedBodyweight)
  );
  const doneToday = setsForNormalPrediction(
    hasExplicitFinisherProfile
      ? rawDoneToday.map((set) => ({ ...set, setType: ST.work }))
      : rawDoneToday,
    {
    increment,
    excludeFinishers: false,
    }
  );
  // Une première série du jour au niveau d'avant la pause réfute le deload d'absence : il protège
  // d'un déconditionnement supposé, pas d'un déconditionnement démenti. Après 80 × 15 à RIR 2,
  // « Reprise après 2 semaines, charge ajustée » continuait d'abaisser la suite de la séance.
  if (effectiveGapDays !== undefined && doneToday.length > 0 && gapRefutedByToday(doneToday, history[0] ?? [])) {
    effectiveGapDays = undefined;
    effectiveGapLestDays = undefined;
  }
  const derived = deriveState(exercise, history, increment, effectiveGapDays);

  const parent = primaryParent(exercise);
  // Un PR obtenu sur cet exercice est une preuve directe que la fatigue contextuelle n'a pas
  // invalidé sa performance du jour. On conserve la fatigue intra-exercice réellement observée
  // (`autoFatigueFlag`) mais on n'abaisse plus artificiellement la suite à cause du seul contexte.
  const sessionFatiguePenalty = prIsLatestEvidence ? 0 : sessionFatigue.fatiguePenalty(parent);
  // La fatigue contextuelle est confirmée sur l'excès (pénalité >= 2), pas sur
  // le coût brut déjà absorbé par le profil historique.
  const fatigueConfirmed = autoFatigueFlag(exercise, doneToday) || sessionFatiguePenalty >= 2;

  const sessionsWithData = rawHistory.filter((s) => s.some((set) => set.completed)).length;
  const useV2 =
    !alwaysLegacy &&
    rawPattern !== null &&
    (sessionsWithData >= ALGO_V2.MIN_SESSIONS_FOR_PATTERN || hasExplicitFinisherProfile);

  let result: SetSuggestion;

  if (!useV2) {
    // ------------------------------------------------------------------
    // Chemin v1 (inchangé) — historique insuffisant pour détecter un pattern fiable, ou
    // pattern figé toujours applicable (assisted_bodyweight, ramping).
    // ------------------------------------------------------------------
    if (exercise.setPatternMode === SPM.weightedBodyweight) {
      const bwSetsToday = currentSessionSets.filter(
        (s) => s.completed && s.setType !== ST.warmup && s.setType !== ST.finisher && s.weight === 0
      );
      result = suggestWeightedBodyweight(exercise, doneToday, derived, fatigueConfirmed, hasPrimerToday, bwSetsToday);
    } else if (exercise.setPatternMode === SPM.topSetBackoff) {
      result = suggestTopSetBackoff(exercise, doneToday, derived, increment, fatigueConfirmed);
    } else if (exercise.setPatternMode === SPM.ramping) {
      result = suggestRamping(exercise, doneToday, derived, increment, fatigueConfirmed);
    } else {
      result = suggestGeneric(exercise, doneToday, derived, increment, fatigueConfirmed);
    }
  } else {
    // ------------------------------------------------------------------
    // Chemin v2 (§7 ALGO_SPEC_HARDENED) — pattern détecté, références par rôle, predictReps.
    // ------------------------------------------------------------------
    const todayFirstLoad = doneToday[0]?.weight;
    const v2Raw = deriveStateV2(exercise, rawHistory, increment, alignedPositions, todayFirstLoad);

    // §6.3 — deload daté (WS4, barème `deload.ts`) s'applique à amorceTarget/straightRef/topTarget
    // (même décalage), exactement comme pour `deriveState` v1. `effectiveGapDays` intègre déjà
    // `freshOverride` (annule le deload si armé).
    const fatiguePenalty = sessionFatiguePenalty;
    const amorceDeload = applyDeload(v2Raw.amorceTarget, effectiveGapDays, increment);
    const topDeload = v2Raw.topTarget !== null ? applyDeload(v2Raw.topTarget, effectiveGapDays, increment) : null;
    const reduceFirstLoadForFatigue = doneToday.length === 0 && fatiguePenalty >= 2 && amorceDeload.load > 0;
    const v2: DeriveStateV2Result = {
      ...v2Raw,
      amorceTarget: reduceFirstLoadForFatigue
        ? roundToIncrementV2(Math.max(0, amorceDeload.load - increment), increment)
        : amorceDeload.load,
      topTarget: topDeload ? topDeload.load : v2Raw.topTarget,
    };

    // Tier de deload pour predictReps (§5.3.3) — même barème que `deload.ts::deloadTierForGap`,
    // redérivé ici pour éviter un import circulaire (progression.ts exporte déjà deload.ts).
    const derivedTier =
      effectiveGapDays === undefined || effectiveGapDays <= 14
        ? "none"
        : effectiveGapDays <= 27
          ? "increment"
          : effectiveGapDays <= 42
            ? "percent10"
            : "percent15";

    const predictCtxBase: Omit<PredictContext, "samples"> = {
      mode: loadModeOf(exercise),
      bodyweightKg,
      repTargetMin: exercise.repTargetMin,
      repTargetMax: exercise.repTargetMax,
      increment,
      fatiguePenalty,
      gapTier: derivedTier as PredictContext["gapTier"],
      fatigueClass: exercise.fatigueClass,
      appliesIntraExerciseDrop: doneToday.length > 0,
    };

    const antiPlateauActive =
      v2.pattern === "TOP_SET_BACKOFF"
        ? detectAntiPlateauActive(v2.topHistory.length > 0 ? v2.topHistory : v2.amorceHistory, exercise, increment)
        : detectAntiPlateauActive(v2.amorceHistory, exercise, increment);

    switch (v2.pattern) {
      case "TOP_SET_BACKOFF":
        result = suggestTopSetBackoffV2(exercise, doneToday, v2, increment, fatigueConfirmed, predictCtxBase, antiPlateauActive);
        break;
      case "BW_REP":
        result = suggestBWRepV2(exercise, doneToday, v2, predictCtxBase, fatigueConfirmed, prAchievedToday);
        break;
      case "WEIGHTED_BW_VARIABLE":
        result = suggestWeightedBWVariableV2(
          exercise,
          doneToday,
          currentSessionSets,
          v2,
          increment,
          predictCtxBase,
          effectiveGapDays,
          effectiveGapLestDays,
          sessionFatigue,
          parent
        );
        break;
      case "STRAIGHT":
      case "ISOLATION_FINISHER": {
        // Amendement §7.2 (1) : targetLoad = straightRef (cluster actif, §4.2), au lieu de
        // max(ancres 5 séances).
        result = suggestStraightV2(exercise, doneToday, derived, v2, increment, fatigueConfirmed, predictCtxBase);
        if (v2.pattern === "ISOLATION_FINISHER" && hasExplicitFinisherProfile) {
          result = { ...result, setType: ST.finisher };
        }
        break;
      }
      default:
        result = suggestGeneric(exercise, doneToday, derived, increment, fatigueConfirmed);
    }

    // VARIATION_CYCLING_SPEC §7.4/§9/§8 — `switchToVariantId` ne doit JAMAIS porter un nom
    // d'exercice (fin du code mort, §8) : la seule branche qui en pose un aujourd'hui est le
    // plancher BW (§7.4, `easierVariantName` ci-dessus dans `suggestBWRepV2`, role "bw") ; on le
    // résout ici en `Exercise.id` réel via `catalog`. `catalog` absent ou nom introuvable => `null`
    // (dégradation gracieuse §9), jamais un nom qui fuiterait vers l'UI/le store.
    if (result.switchToVariantId) {
      const resolved = catalog?.find((e) => e.name === result.switchToVariantId);
      result = { ...result, switchToVariantId: resolved ? resolved.id : null };
    }

    // VARIATION_CYCLING_SPEC §2/§4/§8 (remplace l'escalade d'intensité rest-pause/overreach,
    // RETIRÉE — décision #3, cf. `plateauEscalation()` ci-dessus) : si un plateau DATÉ (`isPlateau`,
    // trigger officiel depuis P1.3) EST DÉJÀ installé, OU si on s'en approche seulement
    // (`progressionState === "slowing"`, §3/§4.2, P2.3 — rotation PRÉEMPTIVE : "préparer" un
    // candidat avant même le plateau, cf. spec §4 étape 2 "slowing → préparer une variation") — sur
    // le rôle dominant, et qu'aucune branche ci-dessus n'a déjà posé sa propre bascule (role "bw",
    // §7.4) ni déjà cassé/dépassé le plateau (plateauBreak/transitionMode), cherche une variante
    // candidate (`selectAlternative`, §6) et l'attache en PURES métadonnées (`switchToVariantId` +
    // `reasonCodes`) — à la différence de l'ancienne escalade, AUCUNE mutation de weight/reps/mode :
    // la bascule ne prend effet qu'à la prochaine séance (§8, non destructif via
    // `replaceExercise()`, jamais en pleine séance). JAMAIS sur le premier set de la séance (même
    // garde qu'avant, `doneToday.length > 0` + `role !== "amorce"` : pour STRAIGHT le 1er set porte
    // `role:"straight"`, pas "amorce" — voir `suggestStraightV2`). `catalog`/`sessionHistory` non
    // fournis => aucune proposition, jamais de crash (§9, dégradation gracieuse).
    const isSlowingPreemptive = v2.progressionState === "slowing";
    if (
      (v2.isPlateau || isSlowingPreemptive) &&
      doneToday.length > 0 &&
      result.mode !== SuggestionMode.plateauBreak &&
      result.mode !== SuggestionMode.transitionMode &&
      result.role !== "amorce" &&
      result.role !== "bw" &&
      !antiPlateauActive &&
      catalog &&
      sessionHistory
    ) {
      // VARIATION_CYCLING_SPEC §5.3/§6 (P2.1) — point faible mesuré le plus récemment capturé
      // (1-tap, `LoggedExercise.plateauWeakPoint`) pour CET exercice, dérivé à la volée depuis
      // `sessionHistory` (jamais persisté ici). `null` si jamais capturé -> `weakPointFit` neutre.
      const weakPoint = mostRecentPlateauWeakPoint(exercise.id, sessionHistory);
      const alternative = selectAlternative(exercise, catalog, sessionHistory, goals, weakPoint);
      if (alternative) {
        // `progressionState` est un état à 3 niveaux MUTUELLEMENT EXCLUSIFS (deriveStateV2, §3) :
        // `isPlateau` implique toujours `"plateaued"`, jamais `"slowing"` simultanément — le
        // reasonCode distingue donc sans ambiguïté "déjà en plateau" de "préemptif" pour l'UI/tests
        // (P2.3 : `SetEntry.tsx` affiche le même indice discret dans les deux cas, la distinction
        // sert surtout à la testabilité et à un éventuel affinage UI futur).
        result = {
          ...result,
          switchToVariantId: alternative.exerciseId,
          reasonCodes: [...result.reasonCodes, v2.isPlateau ? "variation" : "variation_preemptive"],
        };
      }
    }

    if (v2.reasonCodes.length > 0) {
      result = { ...result, reasonCodes: [...result.reasonCodes, ...v2.reasonCodes] };
    }
    // VARIATION_CYCLING_SPEC §3/§8 — expose l'état à 3 niveaux pour l'indice UI `slowing`
    // (`ExerciseCard.tsx`). Additif, ne change ni weight/reps/mode ni aucun test existant qui ne
    // regarde pas ce champ.
    result = { ...result, progressionState: v2.progressionState };
    if (reduceFirstLoadForFatigue) {
      result = {
        ...result,
        reasonCodes: [...result.reasonCodes, "session_fatigue_load_reduction"],
      };
    }
  }

  // A record established today is stronger evidence than a stale cycle-state estimate. It also
  // makes every exercise-switch proposal contradictory, whether it came from a dated plateau or
  // the BW easier-variant branch.
  if (prAchievedToday) {
    result = {
      ...result,
      progressionState: "progressing",
      switchToVariantId: null,
      reasonCodes: result.reasonCodes.filter(
        (code) =>
          code !== "variation" &&
          code !== "variation_preemptive" &&
          code !== "variant_switch_easier"
      ),
    };
  }

  const learnedOffset = learnedPredictionOffset(rawHistory, exercise);
  if (
    learnedOffset !== 0 &&
    result.mode === SuggestionMode.recordAttempt &&
    result.switchToVariantId == null
  ) {
    const cap = exercise.repTargetMax;
    const currentBwFloor =
      exercise.setPatternMode === SPM.bodyweight && !fatigueConfirmed && doneToday.length > 0
        ? Math.min(doneToday.at(-1)!.reps, cap)
        : 1;
    const calibratedReps = clampInt(result.reps + learnedOffset, currentBwFloor, Math.max(1, cap));
    if (calibratedReps !== result.reps) {
      const modeLabel = MODE_LABEL_FR[result.mode] ?? result.mode.replace(/_/g, " ");
      const loadLabel = result.weight > 0 ? `${cleanWeight(result.weight)} kg` : "PDC";
      result = {
        ...result,
        reps: calibratedReps,
        explanation: `${modeLabel} · ${loadLabel} × ${calibratedReps}`,
        reasonCodes: [...result.reasonCodes, "prediction_bias_calibrated"],
      };
    }
  }

  // Attache l'avertissement de fatigue de séance si pertinent (ne change pas la suggestion elle-même)
  const note = prIsLatestEvidence ? null : sessionFatigue.fatigueNote(parent);
  if (note !== null) {
    result = {
      ...result,
      sessionFatigueWarning: note,
      sessionFatigueEvidence: sessionFatigue.fatigueEvidence(parent),
    };
  }

  result = applyMachineMaxLoad(result, exercise, doneToday, history);

  // WS4 — signale le deload d'absence sans changer weight/reps déjà calculés par les branches
  // ci-dessus (elles utilisent déjà `derived.targetLoad` post-deload). Uniquement informatif :
  // reasonCode + explanation préfixée pour que l'UI puisse l'afficher.
  if (derived.deloadApplied && effectiveGapDays !== undefined) {
    result = {
      ...result,
      reasonCodes: [...result.reasonCodes, "deload_after_gap"],
      explanation: `${deloadMessage(effectiveGapDays)} · ${result.explanation}`,
    };
  }

  // BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — signal feu : calculé sur le poids/reps PROPOSÉS
  // (`result`), jamais encore loggés. §9 : `sessionHistory` absent => les deux flags restent
  // `undefined` (jamais calculés à partir de rien) ; `profile`/`strengthStandardKey` absents =>
  // `readyForLevelUp`/`nextLevelName` seuls restent `undefined` (`readyForPR` n'en dépend pas).
  if (sessionHistory) {
    const historicalSetsForExercise = sessionHistory
      .flatMap((session) => session.exercises)
      .filter((logged) => logged.exerciseId === exercise.id)
      .flatMap((logged) => logged.sets);
    // La séance active n'est pas encore dans `sessionHistory`, mais ses sets déjà validés sont
    // désormais des faits. Les ignorer pouvait rallumer immédiatement « PR possible » ou annoncer
    // le même passage de niveau juste après l'avoir atteint.
    const knownSetsForExercise = [...historicalSetsForExercise, ...currentSessionSets];

    // Étalonnage (records.ts) : tant que l'exercice pose sa référence, aucun feu ne doit promettre
    // un record ou un palier que la série ne pourra pas décrocher, et le libellé non plus :
    // « Tentative de record » sur une machine découverte contredirait la règle.
    if (isCalibrating(recordCalibration(knownSetsForExercise, exercise), now)) {
      return result.mode === SuggestionMode.recordAttempt
        ? {
            ...result,
            explanation: result.explanation.replace(MODE_LABEL_FR[SuggestionMode.recordAttempt], CALIBRATION_LABEL_FR),
          }
        : result;
    }

    // readyForPR — indépendant du profil StrengthLevel : la série proposée est soumise à
    // `classify`, la fonction même qui décerne l'étoile, pour que le feu ne promette jamais un PR
    // qui ne se matérialiserait pas une fois la série loggée.
    if (result.setType === ST.finisher) {
      const proposedFinisher: LoggedSet = {
        id: "suggested-finisher",
        weight: result.weight,
        reps: result.reps,
        setType: ST.finisher,
        timestamp: now,
        setSlotIndex: currentSessionSets.length,
        completed: true,
        supersetRoundIndex: null,
      };
      if (classifyFinisher(proposedFinisher, buildFinisherRecords(knownSetsForExercise))) {
        result = { ...result, readyForPR: true };
      }
    } else if (result.reps > 0) {
      // La série proposée passe par EXACTEMENT la fonction qui décerne l'étoile une fois loggée
      // (`classify`) : même marge e1RM, même frontière de Pareto, même piste poids du corps. Le feu
      // ne peut plus promettre un record que l'étoile refuserait, ni l'oublier sur un exercice PDC.
      const proposed: LoggedSet = {
        id: "suggested-set",
        weight: result.weight,
        reps: result.reps,
        setType: result.setType,
        timestamp: now,
        setSlotIndex: currentSessionSets.length,
        completed: true,
        supersetRoundIndex: null,
      };
      if (classify(proposed, exercise, buildRecords(exercise, knownSetsForExercise)) !== null) {
        result = { ...result, readyForPR: true };
      }
    }

    // readyForLevelUp — nécessite un profil StrengthLevel valide (mêmes gardes que `exerciseBenchmark`
    // : `resolveStandard` renvoie `null` si pas de `strengthStandardKey`/profil hors plage 25-40 ans/
    // genre non homme/poids de corps manquant, §9). Pour un standard à deux axes, chacun est testé :
    // une série au poids du corps peut ainsi franchir le palier reps sans être bloquée par l'axe lest.
    if (profile && result.setType !== ST.finisher) {
      const resolved = resolveStandard(exercise, profile);
      if (resolved) {
        const axes = [
          { axis: resolved.primaryAxis, thresholds: resolved.primaryThresholds },
          ...(resolved.secondaryAxis && resolved.secondaryThresholds
            ? [{ axis: resolved.secondaryAxis, thresholds: resolved.secondaryThresholds }]
            : []),
        ];
        let bestCrossedRank = 0;
        let bestCrossedName: string | undefined;
        for (const { axis, thresholds } of axes) {
          if (!strengthStandardAxisSupportsSet(exercise, result, axis)) continue;
          const proposedValue = strengthStandardValueForSet(resolved, result, axis);
          if (proposedValue <= 0) continue;
          const currentBestValue = currentBestOnAxis(knownSetsForExercise, axis, exercise, resolved);
          const proposedLevel = benchmarkLevel(proposedValue, thresholds);
          const currentRank = strengthLevelRank(benchmarkLevel(currentBestValue, thresholds).key);
          const proposedRank = strengthLevelRank(proposedLevel.key);
          if (
            proposedRank > currentRank &&
            proposedRank > bestCrossedRank &&
            proposedLevel.key !== "below_beginner"
          ) {
            bestCrossedRank = proposedRank;
            bestCrossedName = strengthLevelLabel(proposedLevel.key);
          }
        }
        if (bestCrossedName) {
          result = { ...result, readyForLevelUp: true, nextLevelName: bestCrossedName };
        }
      }
    }
  }

  // Le mode « record_attempt » n'est que le calcul par défaut : il ne dit « Tentative de record »
  // que si la série proposée en serait vraiment un. Sinon, « Cible » : 12 × 10 affiché comme une
  // tentative de record alors que 12 × 11 existe déjà faisait douter de tout le reste.
  if (result.readyForPR && result.mode === SuggestionMode.recordAttempt) {
    result = {
      ...result,
      explanation: result.explanation.replace(MODE_LABEL_FR[SuggestionMode.recordAttempt], RECORD_ATTEMPT_LABEL_FR),
    };
  }
  return result;
}

/**
 * BENCHMARK_LEVEL_SPEC.md §3 (P3.3) — meilleure valeur historique sur l'axe donné, parmi les sets
 * de travail complétés (work/top_set/backoff — même périmètre que `RecordsEngine`). Axe "load" :
 * `strengthStandardValueForSet` centralise formule et convention de charge (dont Plate ×2).
 * Axe "reps" : reps brutes. `0` si aucun set éligible (jamais de crash).
 */
function currentBestOnAxis(
  sets: LoggedSet[],
  axis: "load" | "reps",
  exercise: Exercise,
  resolved: ResolvedStandard
): number {
  const workSets = normalRecordSets(sets, exercise);
  const eligible = workSets.filter((set) => strengthStandardAxisSupportsSet(exercise, set, axis));
  if (eligible.length === 0) return 0;
  return Math.max(...eligible.map((set) => strengthStandardValueForSet(resolved, set, axis)));
}

// Exposé pour le store/tests.
export { deriveState, deriveStateV2, classifyAnchor, checkPromotionGate, progressVelocityScore, effectiveLoad };
