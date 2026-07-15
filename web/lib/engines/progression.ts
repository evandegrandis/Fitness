/**
 * Moteur de progression, miroir exact de `Jeera/Engines/ProgressionEngine.swift`.
 *
 * Algorithme de double progression :
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
 * RÈGLE ABSOLUE : prédire depuis le set logué AUJOURD'HUI, jamais rejouer la
 * dernière séance.
 */

import type { FatigueClass, ProgressionPolicy, SetPatternMode, SetType } from "@/lib/models/enums";
import { FATIGUE_CLASS_PROPERTIES, SetPatternMode as SPM, SetType as ST } from "@/lib/models/enums";
import type { Exercise, LoggedSet } from "@/lib/models/types";
import { primaryParent } from "@/lib/models/types";
import { SessionFatigueContext } from "@/lib/engines/session-fatigue";

export { estimated1RM, bestE1RM } from "@/lib/engines/e1rm";

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
}

function makeSuggestion(
  partial: Omit<SetSuggestion, "confidence" | "reasonCodes" | "mode" | "sessionFatigueWarning"> &
    Partial<Pick<SetSuggestion, "confidence" | "reasonCodes" | "mode" | "sessionFatigueWarning">>
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

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

function effectiveLoad(load: number, mode: SetPatternMode): number {
  if (mode === SPM.assistedBodyweight) return -load;
  return load;
}

function stepLoad(load: number, increment: number, mode: SetPatternMode, towardHarder: boolean): number {
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
  const completed = session.filter((s) => s.completed);
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
  for (let idx = anchors.length - 1; idx >= 1; idx--) {
    const cur = anchors[idx];
    const prev = anchors[idx - 1];
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

function deriveState(exercise: Exercise, history: LoggedSet[][], increment: number): DerivedExerciseState {
  const comparable = history.slice(0, 5);
  const anchors = comparable
    .map((session) => classifyAnchor(session, exercise))
    .filter((a): a is LoggedSet => a !== null);

  const validAnchors = anchors.filter((a) => a.reps >= exercise.repTargetMin);
  const targetLoad =
    validAnchors.length > 0
      ? Math.max(...validAnchors.map((a) => a.weight))
      : anchors.length > 0
        ? Math.max(...anchors.map((a) => a.weight))
        : defaultStartLoad(exercise);

  const recentWorkingFloor =
    validAnchors.length > 0 ? Math.min(...validAnchors.map((a) => a.weight)) : defaultStartLoad(exercise);

  const fallbackWeights: number[] = [];
  for (const session of comparable) {
    const anchor = classifyAnchor(session, exercise);
    if (!anchor) continue;
    const anchorEffort = effectiveLoad(anchor.weight, exercise.setPatternMode);
    const fallbacks = session.filter(
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
  const recentFallbackFloor =
    fallbackWeights.length > 0 ? Math.min(...fallbackWeights) : Math.max(0, recentWorkingFloor - increment * 2);

  const repsAtTarget = anchors.filter((a) => Math.abs(a.weight - targetLoad) < 0.01).map((a) => a.reps);
  const bestRep = repsAtTarget.length > 0 ? Math.max(...repsAtTarget) : exercise.repTargetMin;

  const plateauCounter = consecutiveAt(targetLoad, bestRep, anchors);
  const progressVelocity = progressVelocityScore(exercise, history.slice(0, 10));
  const promotionGatePassed = checkPromotionGate(exercise, comparable);

  let recentBestAnchorReps = exercise.repTargetMin;
  for (const session of comparable) {
    const anchor = classifyAnchor(session, exercise);
    if (!anchor) continue;
    if (Math.abs(anchor.weight - targetLoad) >= 0.01) continue;
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
// render
// ---------------------------------------------------------------------------

const MODE_LABEL_FR: Record<string, string> = {
  [SuggestionMode.recordAttempt]: "Tentative de record",
  [SuggestionMode.fallbackHypertrophy]: "Hypertrophie",
  [SuggestionMode.plateauBreak]: "Casser le plateau",
  [SuggestionMode.transitionMode]: "Montée en charge",
};

function render(candidate: Candidate, confidence: number, setTypeOverride?: SetType): SetSuggestion {
  const modeLabel = MODE_LABEL_FR[candidate.mode] ?? candidate.mode.replace(/_/g, " ");
  const loadLabel = candidate.load > 0 ? `${cleanWeight(candidate.load)} kg` : "PDC";
  return makeSuggestion({
    weight: candidate.load,
    reps: candidate.reps,
    setType: setTypeOverride ?? (candidate.mode === SuggestionMode.fallbackHypertrophy ? ST.backoff : ST.work),
    explanation: `${modeLabel} · ${loadLabel} × ${candidate.reps}`,
    confidence: Math.min(1, Math.max(0, confidence)),
    reasonCodes: candidate.reasonCodes,
    mode: candidate.mode,
  });
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
      explanation: "Maximum atteint — pensez à vous lester.",
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
  const predicted = roundHalfAwayFromZero(last.reps - effectiveDrop);
  const holdReps = clampInt(predicted, Math.max(1, exercise.repTargetMin - 1), exercise.repTargetMax);
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
    last.reps < exercise.repTargetMin &&
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
    if (last.reps >= exercise.repTargetMax + 4 && shouldStepLoad(exercise.setPatternMode, last.weight, true)) {
      const aggressiveRaise: Candidate = {
        load: harderLoad,
        reps: clampInt(last.reps - Math.trunc(Math.max(2.0, baseDrop)), exercise.repTargetMin, exercise.repTargetMax),
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

  let result: Candidate[] = [
    { load: last.weight, reps: holdReps, mode: SuggestionMode.recordAttempt, reasonCodes: ["predicted_drop_same_load"] },
    { load: easierLoad, reps: backoffReps, mode: SuggestionMode.fallbackHypertrophy, reasonCodes: ["fallback_down_one_step"] },
  ];

  if (shouldStepLoad(exercise.setPatternMode, last.weight, true) && last.reps >= exercise.repTargetMax + 2) {
    const raisedReps = clampInt(
      roundHalfAwayFromZero(last.reps - Math.max(1, baseDrop)),
      exercise.repTargetMin,
      exercise.repTargetMax
    );
    result.push({
      load: harderLoad,
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
    if (last.reps >= Math.max(exercise.repTargetMin, 7) && candidate.mode === SuggestionMode.fallbackHypertrophy) score += 6;
  }

  if (candidate.reps < 5) score -= 10;
  if (candidate.reps > 10 && candidate.mode !== SuggestionMode.fallbackHypertrophy) score -= 10;
  return score;
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
  } = params;

  const increment = smallestIncrement ?? exercise.smallestIncrement;

  // Sépare primers/warmups des vrais sets de travail.
  // doneToday ne contient que les sets sur lesquels le moteur doit raisonner pour prédire charge/reps.
  // hasPrimerToday indique aux branches qu'un primer a déjà été fait cette séance.
  const hasPrimerToday = currentSessionSets.some(
    (s) => s.completed && (s.setType === ST.warmup || (s.weight === 0 && exercise.setPatternMode === SPM.weightedBodyweight))
  );
  const doneToday = currentSessionSets.filter(
    (s) => s.completed && s.setType !== ST.warmup && !(s.weight === 0 && exercise.setPatternMode === SPM.weightedBodyweight)
  );

  const history = recentHistory.filter((session) => session.length > 0);
  const derived = deriveState(exercise, history, increment);

  const parent = primaryParent(exercise);
  // Fatigue confirmée si : chute intra-exercice détectée OU contexte de séance significatif
  const fatigueConfirmed = autoFatigueFlag(exercise, doneToday) || sessionFatigue.isSignificant(parent);

  if (exercise.setPatternMode === SPM.weightedBodyweight) {
    const bwSetsToday = currentSessionSets.filter((s) => s.completed && s.setType !== ST.warmup && s.weight === 0);
    return suggestWeightedBodyweight(exercise, doneToday, derived, fatigueConfirmed, hasPrimerToday, bwSetsToday);
  }

  if (exercise.setPatternMode === SPM.topSetBackoff) {
    return suggestTopSetBackoff(exercise, doneToday, derived, increment, fatigueConfirmed);
  }

  if (exercise.setPatternMode === SPM.ramping) {
    return suggestRamping(exercise, doneToday, derived, increment, fatigueConfirmed);
  }

  let result = suggestGeneric(exercise, doneToday, derived, increment, fatigueConfirmed);

  // Attache l'avertissement de fatigue de séance si pertinent (ne change pas la suggestion elle-même)
  const note = sessionFatigue.fatigueNote(parent);
  if (note !== null) {
    result = { ...result, sessionFatigueWarning: note };
  }

  return result;
}

// Exposé pour le store/tests.
export { deriveState, classifyAnchor, checkPromotionGate, progressVelocityScore, effectiveLoad };
