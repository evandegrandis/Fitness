/**
 * Grille de charges d'un exercice : les seules charges qui existent sur la machine (15/10/2026).
 *
 * Evan, au tirage horizontal poulie basse : « c'est sur une poulie qui monte de 6 en 6 » (60, 66, 72, 78), alors que
 * le moteur proposait 72,5. La grille vient de l'exercice, jamais d'une règle globale : un pas (`smallestIncrement`) et,
 * si la machine ne part pas de zéro, un décalage (`loadOffset`, par exemple 29, 31, 33 : pas 2, décalage 1). Une cible
 * ne propose jamais une charge hors de la grille (invariant I10, `target-invariants.ts`) ; la charge max d'une machine
 * (`maxLoad`, bout de pile) est toujours une charge valide.
 *
 * Charge comparée : la charge saisie (lest ajouté pour un lesté, assistance pour un assisté). Poids du corps pur : 0.
 */

export interface GridExercise {
  setPatternMode: string;
  smallestIncrement: number;
  loadOffset?: number | null;
  maxLoad?: number | null;
}

const EPS = 1e-6;

export interface LoadGrid {
  /** Pas de la grille (0 : pas de grille connue, toute charge est acceptée). */
  step: number;
  /** Décalage : les charges valent `offset + k × step`. */
  offset: number;
}

export function loadGrid(exercise: GridExercise): LoadGrid {
  const step = Number.isFinite(exercise.smallestIncrement) && exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 0;
  const raw = exercise.loadOffset ?? 0;
  const offset = step > 0 && Number.isFinite(raw) ? ((raw % step) + step) % step : 0;
  return { step, offset };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** La charge existe sur la machine (sur la grille, à 0 près pour le poids du corps, ou à la charge max). */
export function isOnGrid(load: number, exercise: GridExercise): boolean {
  if (exercise.setPatternMode === "bodyweight") return Math.abs(load) < EPS;
  if (exercise.setPatternMode !== "straight" && exercise.setPatternMode !== "top_set_backoff" && exercise.setPatternMode !== "ramping" && Math.abs(load) < EPS) return true;
  if (exercise.maxLoad && exercise.maxLoad > 0 && Math.abs(load - exercise.maxLoad) < EPS) return true;
  const { step, offset } = loadGrid(exercise);
  if (step === 0) return true;
  const k = (load - offset) / step;
  return Math.abs(k - Math.round(k)) < EPS;
}

/**
 * Charge de la grille la plus proche de `load` dans la direction demandée (`down` : jamais au-dessus, `up` : jamais en
 * dessous, `nearest`). Jamais sous 0, jamais au-delà de la charge max.
 */
export function snapToGrid(load: number, exercise: GridExercise, direction: "down" | "up" | "nearest" = "nearest"): number {
  if (exercise.setPatternMode === "bodyweight") return 0;
  const max = exercise.maxLoad && exercise.maxLoad > 0 && exercise.setPatternMode !== "assisted_bodyweight" ? exercise.maxLoad : null;
  if (max !== null && load >= max - EPS) return max;
  const { step, offset } = loadGrid(exercise);
  if (step === 0) return Math.max(0, round(load));
  const k = (load - offset) / step;
  const kk = direction === "down" ? Math.floor(k + EPS) : direction === "up" ? Math.ceil(k - EPS) : Math.round(k);
  let snapped = round(offset + kk * step);
  if (snapped < -EPS) {
    // Lesté ou assisté : 0 (sans lest, sans assistance) est toujours possible ; sinon la plus petite charge de la grille.
    const external = exercise.setPatternMode === "straight" || exercise.setPatternMode === "top_set_backoff" || exercise.setPatternMode === "ramping";
    snapped = external ? round(offset + Math.ceil((0 - offset) / step - EPS) * step) : 0;
  }
  if (snapped < 0) snapped = 0;
  if (max !== null && snapped > max + EPS) snapped = max;
  return snapped;
}

/** Charge suivante sur la grille, plus lourde (`up`) ou plus légère, depuis une charge sur la grille ou non. */
export function nextGridLoad(load: number, exercise: GridExercise, up: boolean): number {
  const { step } = loadGrid(exercise);
  const unit = step > 0 ? step : 0.5;
  if (up) {
    const snapped = snapToGrid(load + EPS, exercise, "up");
    return snapped > load + EPS ? snapped : snapToGrid(load + unit, exercise, "up");
  }
  const snapped = snapToGrid(load - EPS, exercise, "down");
  return snapped < load - EPS ? snapped : Math.max(0, snapToGrid(load - unit, exercise, "down"));
}
