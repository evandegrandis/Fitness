"use client";

import { useEffect, useState } from "react";

/**
 * Où poser un bandeau flottant de la séance (toast « Annuler », question du finisher, bandeau
 * superset), mesuré le 15/10/2026 :
 * - la barre d'onglets est une pilule de 68 px posée sur max(0,75rem, encoche) : un bandeau se pose
 *   8 px au-dessus (ils étaient à 4,5rem, 8 px DESSOUS, et la barre, peinte après eux, les masquait) ;
 * - pendant le repos, 8 px au-dessus du minuteur, posé à 6,25rem + encoche, dont la hauteur dépend
 *   de la largeur (86 px à 390 px, 118 px à 320 px) : elle est mesurée ;
 * - puis au-dessus des bandeaux déjà affichés plus bas, eux aussi mesurés (un message de deux lignes
 *   est plus haut qu'un message d'une ligne).
 */
const TAB_BAR_TOP = "max(0.75rem, env(safe-area-inset-bottom)) + 4.25rem";
const REST_TIMER_BOTTOM = "env(safe-area-inset-bottom) + 6.25rem";
const GAP_PX = 8;

/** Repères posés sur les éléments mesurés. */
export const FLOATING = {
  restTimer: "[data-rest-timer]",
  undoToast: "[data-undo-toast]",
  finisherPrompt: "[data-finisher-prompt]",
} as const;

/** Hauteurs de repli, le temps de la première mesure (à 390 px). */
export const FLOATING_FALLBACK_HEIGHT = { restTimer: 86, banner: 58 } as const;

/**
 * `bottom` CSS d'un bandeau : au-dessus du minuteur de repos s'il est là (`restTimerHeight`), sinon
 * de la barre d'onglets, puis au-dessus des bandeaux `below` (hauteurs en px).
 */
export function floatingBottom(restTimerHeight: number | null, below: readonly number[] = []): string {
  const base = restTimerHeight === null ? TAB_BAR_TOP : `${REST_TIMER_BOTTOM} + ${restTimerHeight}px`;
  const stacked = below.reduce((sum, height) => sum + height + GAP_PX, 0);
  return `calc(${base} + ${GAP_PX + stacked}px)`;
}

/**
 * Hauteur de mise en page (sans transformation, donc sans l'animation d'entrée) d'un élément
 * flottant, suivie s'il change. `null` tant qu'il n'est pas affiché ou pas encore mesuré.
 */
export function useFloatingHeight(selector: string, present: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!present) return;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    // Un ResizeObserver notifie aussi à l'observation : la première mesure arrive sans attendre.
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [selector, present]);
  return present ? height : null;
}
