/**
 * `predictReps(P, role, ctx)` — voir `web/ALGO_SPEC_HARDENED.md` §5.
 *
 * Prédit les reps attendues à une charge P donnée pour un rôle de set donné,
 * à partir du profil empirique (fenêtre du cluster actif) + corrections du
 * jour (forme, fatigue, gap, drop intra-exercice). Moteur PUR.
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import type { SetRole } from "@/lib/engines/patterns";
import { median } from "@/lib/engines/patterns";
import type { DeloadTier } from "@/lib/engines/deload";
import { FATIGUE_CLASS_PROPERTIES, type FatigueClass } from "@/lib/models/enums";

function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// ---------------------------------------------------------------------------
// §5.1 — Charge effective
// ---------------------------------------------------------------------------

export type LoadMode = "external" | "weighted_bodyweight" | "assisted_bodyweight";

export function effTotal(P: number, mode: LoadMode, bodyweightKg?: number): number {
  const bw = bodyweightKg ?? ALGO_V2.DEFAULT_BODYWEIGHT_KG;
  switch (mode) {
    case "weighted_bodyweight":
      return bw + P;
    case "assisted_bodyweight":
      return bw - P;
    default:
      return P;
  }
}

// ---------------------------------------------------------------------------
// §5.2 — Base empirique
// ---------------------------------------------------------------------------

/** Un échantillon empirique : charge + reps + rôle, provenant du cluster actif. */
export interface RepSample {
  role: SetRole | number; // number = position du set (1,2,3+) pour STRAIGHT/FINISHER
  weight: number;
  reps: number;
}

export interface PredictContext {
  mode: LoadMode;
  bodyweightKg?: number;
  repTargetMin: number;
  repTargetMax: number;
  increment: number;
  /** Samples empiriques du cluster actif (fenêtre 10, post P1-P5). */
  samples: RepSample[];
  /** Fatigue graduée du jour (0..MAX_FATIGUE_REP_PENALTY), déjà calculée (§6.1). */
  fatiguePenalty?: number;
  /** Tier de deload appliqué à la charge de référence (§6.3/§5.3.3). */
  gapTier?: DeloadTier;
  /** formDelta déjà calculé pour la séance en cours (§5.3.1), 0 si non applicable. */
  formDelta?: number;
  /**
   * true si ce set suit >= 1 set de travail du même exercice aujourd'hui ET qu'aucun
   * échantillon empirique n'existe pour ce rôle/charge (fallback pur) : applique le drop
   * baseRepDrop en plus (§5.3.4). Si false, aucun ajustement supplémentaire de fatigue
   * intra-exercice n'est fait ici (déjà dans la médiane empirique).
   */
  appliesIntraExerciseDrop?: boolean;
  fatigueClass?: FatigueClass;
}

function samplesForRole(samples: RepSample[], role: SetRole | number, weight: number): RepSample[] {
  return samples.filter((s) => s.role === role && Math.abs(s.weight - weight) < 1e-9);
}

/**
 * Rôles jugés "incompatibles" avec `role` pour le pool "tous rôles confondus" (§5.2, dernier
 * recours). `backoff` est systématiquement plus fatigué qu'`amorce`/`top` à charge égale (c'est
 * un set de fin de séance après l'effort principal) : les mélanger à la même charge produirait
 * une médiane illusoire (ex: amorce 80x10 + backoff raté 80x6 -> "8" alors qu'aucun des deux
 * rôles n'a de signal fiable individuellement). `bw` est exclu de tout mélange (charge externe
 * vs poids de corps, pas comparable).
 */
function incompatibleRoles(role: SetRole | number): Set<SetRole | number> {
  if (role === "amorce" || role === "top") return new Set(["backoff", "bw"]);
  if (role === "backoff") return new Set(["amorce", "top", "bw"]);
  return new Set(["bw"]);
}

function nearestWithMinSamples(
  samples: RepSample[],
  role: SetRole | number,
  weight: number,
  sameRoleOnly: boolean
): { weight: number; median: number; count: number } | null {
  const pool = sameRoleOnly ? samples.filter((s) => s.role === role) : samples.filter((s) => !incompatibleRoles(role).has(s.role));
  if (pool.length === 0) return null;
  const byWeight = new Map<number, number[]>();
  for (const s of pool) {
    const arr = byWeight.get(s.weight) ?? [];
    arr.push(s.reps);
    byWeight.set(s.weight, arr);
  }
  let best: { weight: number; median: number; count: number } | null = null;
  let bestDist = Infinity;
  for (const [w, reps] of byWeight.entries()) {
    if (reps.length < 2) continue;
    const dist = Math.abs(w - weight);
    if (dist < bestDist) {
      bestDist = dist;
      best = { weight: w, median: median(reps), count: reps.length };
    }
  }
  return best;
}

/**
 * §5.2 — Base empirique (avant corrections du jour). Renvoie aussi si le résultat provient
 * d'échantillons directs au même (role, weight) avec >= 2 points — sert à §5.3.4 (ne pas
 * double-compter le drop de fatigue si déjà dans la médiane).
 */
export function empiricalBase(
  ctx: PredictContext,
  role: SetRole | number,
  P: number
): { base: number; fromDirectSamples: boolean } {
  const direct = samplesForRole(ctx.samples, role, P);
  if (direct.length >= 2) {
    return { base: median(direct.map((s) => s.reps)), fromDirectSamples: true };
  }

  const sameRole = nearestWithMinSamples(ctx.samples, role, P, true);
  const nearest = sameRole ?? nearestWithMinSamples(ctx.samples, role, P, false);

  if (!nearest) {
    // Cold start : pas de donnée exploitable, milieu de la fourchette de reps.
    return { base: Math.ceil((ctx.repTargetMin + ctx.repTargetMax) / 2), fromDirectSamples: false };
  }

  const kgPerRep = Math.max(ctx.increment, ALGO_V2.REP_SLOPE_PCT * effTotal(nearest.weight, ctx.mode, ctx.bodyweightKg));
  const base = nearest.median - (effTotal(P, ctx.mode, ctx.bodyweightKg) - effTotal(nearest.weight, ctx.mode, ctx.bodyweightKg)) / kgPerRep;
  return { base, fromDirectSamples: false };
}

// ---------------------------------------------------------------------------
// §5.3 — Corrections du jour + §5.4 bornes
// ---------------------------------------------------------------------------

/**
 * `predictReps` — point d'entrée principal. `role` peut être un `SetRole` (amorce/top/backoff/bw)
 * ou une position numérique (1,2,3+) pour STRAIGHT/FINISHER, voir §5.2.
 * `extendedCapForBWPlateau` — cap étendu (max(repTargetMax, lastReps+2)) pour BW_REP en plateau
 * et burnout finisher (§5.4) ; sinon cap standard min(repTargetMax, WORK_REP_CAP).
 */
export function predictReps(
  P: number,
  role: SetRole | number,
  ctx: PredictContext,
  opts?: { extendedCap?: number }
): number {
  const { base: empirical, fromDirectSamples } = empiricalBase(ctx, role, P);
  let base = empirical;

  // 1. formDelta (§5.3.1) — additif, déjà clampé par l'appelant à [FORM_DELTA_MIN, FORM_DELTA_MAX].
  const formDelta = ctx.formDelta ?? 0;
  base += formDelta;

  // 2. fatiguePenalty (§5.3.2) — soustrait, 0..MAX_FATIGUE_REP_PENALTY.
  const fatiguePenalty = clampInt(ctx.fatiguePenalty ?? 0, 0, ALGO_V2.MAX_FATIGUE_REP_PENALTY);
  base -= fatiguePenalty;

  // 3. gapPenalty (§5.3.3).
  if (ctx.gapTier === "increment" || ctx.gapTier === "percent10" || ctx.gapTier === "percent15") {
    base -= 1;
  }

  // 4. drop intra-exercice (§5.3.4) : seulement si base non-empirique directe ET signalé par l'appelant.
  if (!fromDirectSamples && ctx.appliesIntraExerciseDrop && ctx.fatigueClass) {
    const drop = ctx.fatigueClass ? Math.min(FATIGUE_CLASS_PROPERTIES[ctx.fatigueClass].baseRepDrop, 2.0) : 0;
    base -= drop;
  }

  // §5.4 — bornes.
  const cap = opts?.extendedCap ?? Math.min(ctx.repTargetMax, ALGO_V2.WORK_REP_CAP);
  return clampInt(roundHalfAwayFromZero(base), 1, Math.max(1, cap));
}
