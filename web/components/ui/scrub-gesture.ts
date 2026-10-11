/**
 * Glisser un chiffre au doigt sans voler le défilement de la page (Evan, 11/10/2026).
 *
 * Avant : la tuile POIDS captait tout glissé vertical (`touch-pan-x`). Un glissé de ~90 px pour
 * faire défiler la séance, parti du chiffre, réglait la charge de +4 crans (120 → 130 kg, reps
 * recalculées à 10) sans rien dire : les champs ne montraient plus la suggestion.
 *
 * Maintenant, au doigt : la page défile, sauf si le doigt reste posé `HOLD_MS` sans bouger ; la
 * tuile s'allume alors et le glissé règle la valeur (`PX_PER_STEP` par cran). À la souris, le
 * glissé règle tout de suite (pas de défilement à protéger). Machine à états pure, testée.
 */

export const SCRUB = {
  /** Appui tenu avant que le glissé règle la valeur (doigt). */
  HOLD_MS: 220,
  /** Mouvement toléré pendant l'appui : au-delà, c'est un défilement. */
  HOLD_SLOP_PX: 8,
  /** Zone morte d'un glissé à la souris. */
  MOUSE_DEAD_ZONE_PX: 12,
  /** Glissement par cran. */
  PX_PER_STEP: 18,
} as const;

export type ScrubPhase = "idle" | "holding" | "scrolling" | "scrubbing";

export interface ScrubGesture {
  phase: ScrubPhase;
  startY: number;
  startX: number;
  /** Ordonnée où le réglage a commencé (fin de l'appui ou de la zone morte). */
  anchorY: number;
  startedAt: number;
  pointer: "touch" | "mouse";
}

export function startScrub(y: number, x: number, at: number, pointer: "touch" | "mouse"): ScrubGesture {
  return { phase: "holding", startY: y, startX: x, anchorY: y, startedAt: at, pointer };
}

/** L'appui a assez duré : le glissé règle désormais la valeur (au doigt seulement). */
export function holdElapsed(gesture: ScrubGesture, at: number): ScrubGesture {
  if (gesture.phase !== "holding" || gesture.pointer !== "touch") return gesture;
  if (at - gesture.startedAt < SCRUB.HOLD_MS) return gesture;
  return { ...gesture, phase: "scrubbing", anchorY: gesture.startY };
}

/**
 * Un mouvement : renvoie le nouvel état et, en réglage, le nombre de crans depuis le début du
 * réglage (vers le haut = positif). En défilement, la page garde la main et rien ne change.
 */
export function moveScrub(gesture: ScrubGesture, y: number, x: number, at: number): { gesture: ScrubGesture; steps: number | null } {
  if (gesture.phase === "idle" || gesture.phase === "scrolling") return { gesture, steps: null };
  let next = gesture;
  if (next.phase === "holding") {
    if (next.pointer === "touch") {
      next = holdElapsed(next, at);
      if (next.phase === "holding") {
        const moved = Math.max(Math.abs(y - next.startY), Math.abs(x - next.startX));
        return moved > SCRUB.HOLD_SLOP_PX ? { gesture: { ...next, phase: "scrolling" }, steps: null } : { gesture: next, steps: null };
      }
    } else {
      const dy = next.startY - y;
      if (Math.abs(dy) < SCRUB.MOUSE_DEAD_ZONE_PX) return { gesture: next, steps: null };
      next = { ...next, phase: "scrubbing", anchorY: next.startY - Math.sign(dy) * SCRUB.MOUSE_DEAD_ZONE_PX };
    }
  }
  return { gesture: next, steps: Math.trunc((next.anchorY - y) / SCRUB.PX_PER_STEP) };
}
