import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { StreakFallback } from "./caption";
import { STREAK_SCENES, type StreakSceneDef } from "./index";
import { LAST_DESIGNED_STREAK } from "./milestones";

export { isStreakMilestone, LAST_DESIGNED_STREAK, nextStreakMilestone } from "./milestones";

type StreakComponent = ComponentType<{ count: number }>;

/**
 * La mise en scène d'un compte : la sienne de 1 à 50 ; au-delà, la « légende » tous les 5 et le
 * « maillon » entre deux. `null` sous 1.
 */
export function streakSceneDef(count: number): StreakSceneDef | null {
  if (!Number.isInteger(count) || count < 1) return null;
  if (count <= LAST_DESIGNED_STREAK) return STREAK_SCENES[count] ?? STREAK_SCENES[0];
  return count % 5 === 0 ? STREAK_SCENES[-1] : STREAK_SCENES[0];
}

const lazyScenes = new Map<StreakSceneDef, LazyExoticComponent<StreakComponent>>();

/**
 * Le composant d'une scène, chargé à la demande (aucune scène dans le paquet de l'accueil). Si le
 * fichier ne vient pas (hors réseau, jamais mis en cache), le compte s'affiche quand même.
 */
export function streakScene(count: number): { Component: LazyExoticComponent<StreakComponent>; duration: number } | null {
  const def = streakSceneDef(count);
  if (!def) return null;
  let Component = lazyScenes.get(def);
  if (!Component) {
    Component = lazy(() => def.load().catch(() => ({ default: StreakFallback })));
    lazyScenes.set(def, Component);
  }
  return { Component, duration: def.duration };
}

/** Va chercher le fichier d'une scène avant d'en avoir besoin (le service worker le garde ensuite). */
export function preloadStreakScene(count: number): void {
  streakSceneDef(count)
    ?.load()
    .catch(() => undefined);
}
