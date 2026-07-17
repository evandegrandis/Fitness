/**
 * Positionnement d'Evan sur les bandeaux de référence force (`Exercise.benchmarkLow`
 * = niveau AVANCÉ, `Exercise.benchmarkHigh` = niveau ÉLITE, exprimés en kg).
 *
 * Evan n'est ni "avancé" ni "élite" au sens strict (standards powerlifting),
 * mais se compare volontairement à un pratiquant avancé (avantage force) —
 * d'où le choix d'exposer une position CONTINUE (peut sortir de [0,1]) plutôt
 * qu'un badge binaire "atteint / pas atteint". Moteur PUR, aucune dépendance
 * UI/couleur : le `tone` renvoyé est sémantique, le mapping vers une couleur
 * CSS se fait côté composant.
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import { effTotal, type LoadMode } from "@/lib/engines/predict";
import { SetPatternMode } from "@/lib/models/enums";
import type { Exercise } from "@/lib/models/types";

export type BenchmarkTone = "below" | "progressing" | "elite";

export interface BenchmarkLevel {
  /** Libellé FR prêt à afficher. */
  label: string;
  tone: BenchmarkTone;
}

export interface ExerciseBenchmark {
  /** false si l'exercice n'a pas (encore) de bandeau de référence renseigné. */
  hasBenchmark: boolean;
  /** Charge effective d'Evan (poids de corps + lest / − assistance selon le mode). */
  currentLoad: number;
  low: number | null;
  high: number | null;
  /** Position brute (peut être < 0 ou > 1) ; null si pas de benchmark. */
  position: number | null;
  level: BenchmarkLevel | null;
  /** kg restants pour atteindre le niveau avancé (0 si déjà atteint/dépassé, null si pas de benchmark). */
  gapToAdvanced: number | null;
  /** kg restants pour atteindre le niveau élite (0 si déjà atteint/dépassé, null si pas de benchmark). */
  gapToElite: number | null;
}

/** Mode de charge d'un exercice pour `effTotal` — miroir de `loadModeOf` (progression.ts, non exporté). */
function loadModeOfExercise(exercise: Pick<Exercise, "setPatternMode">): LoadMode {
  if (exercise.setPatternMode === SetPatternMode.weightedBodyweight) return "weighted_bodyweight";
  if (exercise.setPatternMode === SetPatternMode.assistedBodyweight) return "assisted_bodyweight";
  return "external";
}

/**
 * Position 0..1 d'une charge entre le seuil avancé (`low`, position 0) et
 * élite (`high`, position 1). Volontairement NON clampée : < 0 = sous
 * l'avancé, > 1 = au-dessus de l'élite. Le clamp est à la charge de
 * l'affichage (jauge). `high <= low` (donnée incohérente) → binaire 0/1.
 */
export function benchmarkPosition(currentLoad: number, low: number, high: number): number {
  if (high <= low) return currentLoad >= low ? 1 : 0;
  return (currentLoad - low) / (high - low);
}

/**
 * Libellé FR honnête à partir d'une position brute (peut être hors [0,1]).
 * Evan sait qu'il n'est pas powerlifter — le libellé "Avancé → Élite" en
 * dessous de 1 reste positif/actionnable, jamais "en échec".
 */
export function benchmarkLevel(pos: number): BenchmarkLevel {
  if (pos < 0) return { label: "Intermédiaire+", tone: "below" };
  if (pos >= 1) return { label: "Élite+", tone: "elite" };
  const pct = Math.round(pos * 100);
  return { label: `Avancé → Élite (${pct}%)`, tone: "progressing" };
}

/**
 * Combine le bandeau de référence brut de l'exercice avec la meilleure charge
 * actuelle d'Evan (`bestLoad`, poids EXTERNE tel que loggé — le lest ajouté
 * pour un exercice lesté, l'assistance pour un assisté, le poids de barre/
 * machine sinon) en un objet d'affichage prêt à consommer.
 *
 * Pour les exercices lestés/assistés au poids du corps, la charge comparée
 * au bandeau (déjà en charge TOTALE) est recalculée via `effTotal`, comme le
 * fait le moteur de suggestion (`lib/engines/predict.ts`).
 */
export function exerciseBenchmark(
  exercise: Pick<Exercise, "benchmarkLow" | "benchmarkHigh" | "setPatternMode">,
  bestLoad: number,
  bodyWeightKg?: number
): ExerciseBenchmark {
  const { benchmarkLow: low, benchmarkHigh: high } = exercise;
  const mode = loadModeOfExercise(exercise);
  const currentLoad = effTotal(bestLoad, mode, bodyWeightKg);

  if (low == null || high == null) {
    return {
      hasBenchmark: false,
      currentLoad,
      low: low ?? null,
      high: high ?? null,
      position: null,
      level: null,
      gapToAdvanced: null,
      gapToElite: null,
    };
  }

  const position = benchmarkPosition(currentLoad, low, high);
  const level = benchmarkLevel(position);

  return {
    hasBenchmark: true,
    currentLoad,
    low,
    high,
    position,
    level,
    gapToAdvanced: Math.max(0, low - currentLoad),
    gapToElite: Math.max(0, high - currentLoad),
  };
}

/**
 * Bornes du bandeau de référence converties dans l'unité de la charge
 * LOGGÉE (celle affichée sur `ExerciseLineChart`, i.e. avant `effTotal`) —
 * inverse de `effTotal` pour superposer correctement la bande avancé/élite
 * (exprimée en charge totale) sur une courbe qui trace le poids externe
 * ajouté/retiré. Exercices "external" : identité (déjà dans la même unité).
 * `null` si pas de benchmark.
 */
export function benchmarkBoundsForLoggedWeight(
  exercise: Pick<Exercise, "benchmarkLow" | "benchmarkHigh" | "setPatternMode">,
  bodyWeightKg?: number
): { low: number; high: number } | null {
  const { benchmarkLow: low, benchmarkHigh: high } = exercise;
  if (low == null || high == null) return null;

  const mode = loadModeOfExercise(exercise);
  if (mode === "external") return { low, high };

  const bwResolved = bodyWeightKg && bodyWeightKg > 0 ? bodyWeightKg : ALGO_V2.DEFAULT_BODYWEIGHT_KG;
  if (mode === "weighted_bodyweight") {
    // total = bw + P  =>  P = total - bw
    return { low: low - bwResolved, high: high - bwResolved };
  }

  // assisted_bodyweight : total = bw - P => P = bw - total ; la charge la
  // PLUS FAIBLE (moins d'assistance) correspond au niveau le PLUS HAUT, d'où
  // l'inversion des bornes pour garder low < high.
  return { low: bwResolved - high, high: bwResolved - low };
}
