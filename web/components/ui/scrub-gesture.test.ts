import { describe, expect, it } from "vitest";
import { holdElapsed, moveScrub, SCRUB, startScrub, type ScrubGesture } from "./scrub-gesture";

/** Rejoue un glissé vertical : `dy` négatif = doigt vers le haut. */
function swipe(pointer: "touch" | "mouse", dy: number, { holdMs = 0, steps = 12, stepMs = 16 } = {}) {
  let gesture: ScrubGesture = startScrub(500, 100, 0, pointer);
  let t = holdMs;
  gesture = holdElapsed(gesture, t);
  let last: number | null = null;
  for (let k = 1; k <= steps; k += 1) {
    t += stepMs;
    const result = moveScrub(gesture, 500 + (dy * k) / steps, 100, t);
    gesture = result.gesture;
    if (result.steps !== null) last = result.steps;
  }
  return { phase: gesture.phase, steps: last };
}

describe("glisser le chiffre sans voler le défilement (11/10/2026)", () => {
  it("le geste de défilement d'Evan (≈ 92 px vers le haut, sans appui) ne règle plus la charge", () => {
    // Avant : zone morte de 12 px puis 18 px par cran, soit +4 crans = 120 → 130 kg.
    expect(swipe("touch", -92)).toEqual({ phase: "scrolling", steps: null });
  });

  it("un appui tenu puis un glissé règle la valeur, cran par cran", () => {
    const result = swipe("touch", -3 * SCRUB.PX_PER_STEP - 2, { holdMs: SCRUB.HOLD_MS + 10 });
    expect(result).toEqual({ phase: "scrubbing", steps: 3 });
    expect(swipe("touch", 2 * SCRUB.PX_PER_STEP + 2, { holdMs: SCRUB.HOLD_MS + 10 }).steps).toBe(-2);
  });

  it("un appui trop court reste un défilement, même lent", () => {
    expect(swipe("touch", -60, { holdMs: SCRUB.HOLD_MS - 100, stepMs: 4 }).phase).toBe("scrolling");
  });

  it("un léger tremblement pendant l'appui n'annule pas le réglage", () => {
    let gesture = startScrub(500, 100, 0, "touch");
    gesture = moveScrub(gesture, 503, 102, 50).gesture;
    expect(gesture.phase).toBe("holding");
    gesture = holdElapsed(gesture, SCRUB.HOLD_MS + 1);
    expect(gesture.phase).toBe("scrubbing");
  });

  it("à la souris, le glissé règle tout de suite après la zone morte", () => {
    expect(swipe("mouse", -(SCRUB.MOUSE_DEAD_ZONE_PX + 2 * SCRUB.PX_PER_STEP + 1)).steps).toBe(2);
    expect(swipe("mouse", -(SCRUB.MOUSE_DEAD_ZONE_PX - 2)).steps).toBeNull();
  });
});
