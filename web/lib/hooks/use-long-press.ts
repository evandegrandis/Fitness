"use client";

import { useCallback, useRef } from "react";

/** Durée d'appui avant déclenchement : assez longue pour ne pas gêner un tap, assez courte en salle. */
const LONG_PRESS_MS = 500;
/** Au-delà de ce déplacement, c'est un défilement ou un balayage, pas un appui. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Appui long au doigt comme à la souris. Annulé dès que le doigt bouge (défilement, balayage de la
 * carte), et le clic qui suit un appui long est « consommé » pour ne pas déclencher en plus
 * l'action du tap (déplier la carte).
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        if (typeof navigator !== "undefined") navigator.vibrate?.(12);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };

  /** Vrai une seule fois après un appui long : le clic de relâchement doit être ignoré. */
  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return { handlers, consumeClick };
}
