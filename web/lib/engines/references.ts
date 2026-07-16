/**
 * Références pondérées récence par RÔLE — voir `web/ALGO_SPEC_HARDENED.md` §4.
 *
 * `amorceRef` / `topRef` / `straightRef` / `lestRef` sont dérivées du cluster
 * actif (§3), fenêtre `HISTORY_WINDOW`, pondération de récence exponentielle
 * (α = RECENCY_ALPHA). Moteur PUR.
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import { roundToIncrement } from "@/lib/engines/patterns";
import { predictReps, type LoadMode, type RepSample } from "@/lib/engines/predict";
import { FATIGUE_CLASS_PROPERTIES, type FatigueClass } from "@/lib/models/enums";

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// ---------------------------------------------------------------------------
// §4.1 — Moyenne pondérée récence
// ---------------------------------------------------------------------------

/** `WM(loads)` : w_k = RECENCY_ALPHA^k, k=0 = séance la plus récente (index le plus bas). */
export function weightedMean(loadsByRecency: number[]): number {
  if (loadsByRecency.length === 0) return 0;
  let num = 0;
  let den = 0;
  let w = 1;
  for (const load of loadsByRecency) {
    num += w * load;
    den += w;
    w *= ALGO_V2.RECENCY_ALPHA;
  }
  return den > 0 ? num / den : 0;
}

// ---------------------------------------------------------------------------
// §4.2 — amorceRef (TOP_SET_BACKOFF) et straightRef (STRAIGHT / FINISHER)
// ---------------------------------------------------------------------------

export interface AnchorLoad {
  weight: number;
  reps: number;
}

export interface RoleRefParams {
  /** Ancres v2 valides du cluster actif (reps >= repTargetMin - 1), plus récentes en premier. */
  anchors: AnchorLoad[];
  /** Ancre de la séance la plus récente du cluster (même si non valide). */
  last: AnchorLoad | null;
  repTargetMin: number;
  increment: number;
  promotionGatePassed: boolean;
  /** Requis seulement pour TOP_SET_BACKOFF : plafonne amorceTarget <= topTarget - 1 incrément. */
  topTarget?: number;
}

/**
 * §4.2 — calcule `amorceRef`/`straightRef`. Toute la logique additive/soustractive est bornée
 * à +/-1 incrément par séance (garde-fou §10 "une seule séance ne peut jamais déplacer une
 * référence de plus de 1 incrément").
 */
export function computeRoleRef(params: RoleRefParams): number {
  const { anchors, last, repTargetMin, increment, promotionGatePassed, topTarget } = params;
  if (!last) return 0;

  const base = last.weight;
  let target: number;

  if (promotionGatePassed) {
    target = base + increment;
  } else if (last.reps < repTargetMin - ALGO_V2.DEMOTION_MARGIN) {
    target = base - increment;
  } else if (last.reps < repTargetMin) {
    // Mauvais jour, pas un effondrement : la référence ne bouge pas.
    target = base;
  } else {
    const wm = weightedMean(anchors.map((a) => a.weight));
    if (wm < base - 1.5 * increment) {
      target = base - increment; // régression multi-séances
    } else {
      target = base;
    }
  }

  // Garde-fou vieux record : +1 incrément / séance max.
  target = Math.min(target, base + increment);

  // Garde-fou amorce (TOP_SET_BACKOFF seulement).
  if (topTarget !== undefined) {
    target = Math.min(target, topTarget - increment);
  }

  return Math.max(0, target);
}

// ---------------------------------------------------------------------------
// §4.3 — topRef (TOP_SET_BACKOFF)
// ---------------------------------------------------------------------------

export interface TopRefParams {
  /** `top(session)` du cluster (fenêtre 10), plus récent en premier. */
  tops: AnchorLoad[];
  amorceTarget: number;
  increment: number;
  repTargetMin: number;
  repTargetMax: number;
  /** Charges d'overreach échoué (§8) — topTarget doit rester strictement en dessous du min. */
  failedOverreachLoads: number[];
}

export function computeTopRef(params: TopRefParams): number {
  const { tops, amorceTarget, increment, repTargetMin, repTargetMax, failedOverreachLoads } = params;

  let topTarget: number;
  if (tops.length === 0) {
    topTarget = amorceTarget + 2 * increment;
  } else {
    const lastTop = tops[0];
    const promotionThreshold = Math.min(ALGO_V2.PROMOTION_REPS, repTargetMax);
    if (lastTop.reps >= promotionThreshold) {
      topTarget = lastTop.weight + increment;
    } else if (lastTop.reps < repTargetMin - ALGO_V2.DEMOTION_MARGIN) {
      topTarget = lastTop.weight - increment;
    } else {
      const wm = weightedMean(tops.map((t) => t.weight));
      topTarget = Math.min(roundToIncrement(wm, increment), lastTop.weight + increment);
    }
  }

  if (failedOverreachLoads.length > 0) {
    const minFailed = Math.min(...failedOverreachLoads);
    if (topTarget >= minFailed) topTarget = minFailed - increment;
  }

  return Math.max(0, topTarget);
}

// ---------------------------------------------------------------------------
// §4.4 — Portillon de promotion par rôle
// ---------------------------------------------------------------------------

/**
 * Top set / STRAIGHT : réactif — 1 seule occurrence `reps >= min(9, repTargetMax)` sur la
 * dernière séance suffit.
 */
export function checkReactivePromotion(lastReps: number | undefined, repTargetMax: number): boolean {
  if (lastReps === undefined) return false;
  return lastReps >= Math.min(ALGO_V2.PROMOTION_REPS, repTargetMax);
}

/**
 * Amorce : stable — Heavy 2 des 3 dernières séances avec amorce À LA MÊME CHARGE que `last`
 * ET reps >= repTargetMax ; Medium/Light 1 des 2 dernières. `repTargetMax` est plafonné à
 * WORK_REP_CAP (10, invariant §0.6) : comme aucun set de travail n'est jamais suggéré au-delà
 * de ce cap, un exercice avec repTargetMax > 10 (ex. Leg extension 10-15) ne pourrait sinon
 * JAMAIS satisfaire le portillon (10x10 réel ne serait jamais >= 15). Cf. exemple chiffré §12
 * "Leg extension : amorce 80x10 >= cap -> promotion".
 */
export function checkAmorcePromotion(
  amorceHistory: AnchorLoad[], // plus récent en premier
  lastLoad: number,
  repTargetMax: number,
  fatigueClass: FatigueClass
): boolean {
  if (amorceHistory.length === 0) return false;
  const effectiveMax = Math.min(repTargetMax, ALGO_V2.WORK_REP_CAP);
  const strict = FATIGUE_CLASS_PROPERTIES[fatigueClass].usesStrictPromotion;
  const windowSize = strict ? 3 : 2;
  const required = strict ? 2 : 1;
  const qualifiers = amorceHistory
    .slice(0, windowSize)
    .filter((a) => Math.abs(a.weight - lastLoad) < 0.01 && a.reps >= effectiveMax).length;
  return qualifiers >= required;
}

// ---------------------------------------------------------------------------
// §4.5 — lestRef (WEIGHTED_BW_VARIABLE)
// ---------------------------------------------------------------------------

export interface LestRefParams {
  lastLest: AnchorLoad;
  gapLestDays: number | undefined;
  increment: number;
  repTargetMin: number;
  mode: LoadMode;
  bodyweightKg?: number;
  samples: RepSample[];
}

/** applyDeload minimal ré-implémenté ici pour éviter un cycle avec deload.ts sur le "top_lesté". */
function percentDeload(load: number, gapDays: number | undefined, increment: number): number {
  if (gapDays === undefined || gapDays <= 10) return load;
  const step = Math.max(increment, 1.25);
  let tier: number;
  if (gapDays <= 21) tier = 1;
  else if (gapDays <= 42) tier = 0.85; // ~15% down via ratio below, kept simple: use percent step
  else tier = 0.85;
  if (gapDays <= 21) return Math.max(0, roundToIncrement(load - step, step));
  return Math.max(0, roundToIncrement(load * tier, step));
}

export function computeLestRef(params: LestRefParams): number {
  const { lastLest, gapLestDays, increment, repTargetMin, mode, bodyweightKg, samples } = params;
  const step = Math.max(increment, 1.25);
  let base = percentDeload(lastLest.weight, gapLestDays, increment);

  let steps = 0;
  while (steps < ALGO_V2.LEST_DESCENT_MAX_STEPS) {
    const predicted = predictReps(base, "top", {
      mode,
      bodyweightKg,
      repTargetMin,
      repTargetMax: repTargetMin + 4,
      increment,
      samples,
    });
    if (predicted >= repTargetMin - 1) break;
    base -= Math.max(increment, ALGO_V2.LEST_DESCENT_STEP_KG);
    steps += 1;
  }

  return Math.max(0, roundToIncrement(base, step));
}

export { clampInt };
