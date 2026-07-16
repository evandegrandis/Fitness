/**
 * Deload daté / absence — WS4.
 *
 * Quand Evan reprend un exercice après une coupure, l'ancre historique
 * (`targetLoad`) reste calculée sur ses dernières séances AVANT la pause,
 * qui ne reflètent plus sa forme actuelle (ex: pause de plusieurs semaines
 * -> PEC en baisse -> l'algo doit proposer plus bas que l'ancienne charge).
 *
 * Barème conservateur, appliqué à `targetLoad` selon le nombre de jours
 * depuis la DERNIÈRE séance ayant au moins un work set complété sur CET
 * exercice exact (pas de fusion de variantes) :
 *   - <= 10 jours  : aucun ajustement (fréquence d'entraînement normale)
 *   - 11-21 jours  : -1 incrément (`smallestIncrement`)
 *   - 22-42 jours  : -10%
 *   - > 42 jours   : -15%
 * Le résultat est toujours arrondi au `smallestIncrement` le plus proche
 * (jamais en dessous de 0).
 *
 * `gapDays === undefined` (pas de date connue) => AUCUN ajustement, pour
 * garantir la non-régression du comportement par défaut de `suggest()`.
 */

export type DeloadTier = "none" | "increment" | "percent10" | "percent15";

export function deloadTierForGap(gapDays: number | undefined): DeloadTier {
  if (gapDays === undefined || gapDays <= 10) return "none";
  if (gapDays <= 21) return "increment";
  if (gapDays <= 42) return "percent10";
  return "percent15";
}

function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return Math.max(0, value);
  return Math.max(0, Math.round(value / increment) * increment);
}

export interface DeloadResult {
  load: number;
  applied: boolean;
  tier: DeloadTier;
}

/**
 * Applique le barème de deload à `load` (typiquement `targetLoad`).
 * Ne fait rien pour les exercices bodyweight pur (load == 0, rien à réduire) :
 * l'appelant garde la responsabilité de ne pas appeler cette fonction pour
 * `SetPatternMode.bodyweight` si non pertinent, mais la fonction est sûre
 * (0 * (1 - x) = 0, round(0)=0) dans tous les cas.
 */
export function applyDeload(load: number, gapDays: number | undefined, increment: number): DeloadResult {
  const tier = deloadTierForGap(gapDays);
  if (tier === "none" || load <= 0) {
    return { load, applied: false, tier: "none" };
  }

  let adjusted: number;
  switch (tier) {
    case "increment":
      adjusted = load - increment;
      break;
    case "percent10":
      adjusted = load * 0.9;
      break;
    case "percent15":
      adjusted = load * 0.85;
      break;
  }

  return { load: roundToIncrement(adjusted, increment), applied: true, tier };
}

/** Nombre de semaines entières (arrondi bas) pour le message FR. */
export function gapWeeksLabel(gapDays: number): number {
  return Math.floor(gapDays / 7);
}

export function deloadMessage(gapDays: number): string {
  const weeks = gapWeeksLabel(gapDays);
  const weekLabel = weeks <= 1 ? "1 semaine" : `${weeks} semaines`;
  return `Reprise après ${weekLabel} — charge ajustée`;
}
