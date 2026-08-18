/**
 * Détection d'un passage de palier StrengthLevel au moment où une série est loggée.
 *
 * La tentative de record motive déjà pendant la séance ; franchir un palier est plus rare et plus
 * marquant, donc mérite d'être annoncé pour ce que c'est. Le calcul reste purement dérivé de
 * l'historique : on compare le niveau AVANT la série au niveau APRÈS, rien n'est persisté.
 */

import { benchmarkLevel, exerciseBenchmarkForSets, strengthLevelRank, type StrengthLevelKey } from "@/lib/engines/benchmark";
import type { Exercise, LoggedSet, UserSettings } from "@/lib/models/types";

export interface LevelUp {
  exerciseId: string;
  exerciseName: string;
  setId: string;
  from: StrengthLevelKey | "below_beginner";
  to: StrengthLevelKey;
  /** 1 (débutant) à 5 (élite) : pilote l'intensité de la célébration. */
  rank: number;
}

/**
 * @param previousSets séries de CET exercice avant celle qui vient d'être loggée, historique inclus
 * @param newSet la série tout juste validée
 */
export function detectLevelUp(
  exercise: Exercise,
  previousSets: LoggedSet[],
  newSet: LoggedSet,
  profile: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">
): LevelUp | null {
  const before = exerciseBenchmarkForSets(exercise, previousSets, profile);
  const after = exerciseBenchmarkForSets(exercise, [...previousSets, newSet], profile);
  if (!after.hasBenchmark || !after.level || !after.thresholds) return null;

  // Sans repère avant (premier passage sur l'exercice), on compare au plancher : atteindre
  // directement « intermédiaire » reste un franchissement, mais partir de rien ne l'est pas.
  const beforeLevel = before.hasBenchmark && before.level
    ? before.level
    : benchmarkLevel(0, after.thresholds);

  const fromRank = strengthLevelRank(beforeLevel.key);
  const toRank = strengthLevelRank(after.level.key);
  if (toRank <= fromRank || after.level.key === "below_beginner") return null;

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    setId: newSet.id,
    from: beforeLevel.key,
    to: after.level.key,
    rank: toRank,
  };
}

/** Style de la célébration : plus le palier est haut, plus elle est marquée. */
export const LEVEL_STYLE: Record<StrengthLevelKey, { label: string; color: string; glow: string; particles: number }> = {
  beginner: { label: "Débutant", color: "#94a3b8", glow: "rgba(148,163,184,0.35)", particles: 8 },
  novice: { label: "Novice", color: "#6ee7b7", glow: "rgba(110,231,183,0.4)", particles: 14 },
  intermediate: { label: "Intermédiaire", color: "#60a5fa", glow: "rgba(96,165,250,0.45)", particles: 20 },
  advanced: { label: "Avancé", color: "#c084fc", glow: "rgba(192,132,252,0.5)", particles: 28 },
  elite: { label: "Élite", color: "#fbbf24", glow: "rgba(251,191,36,0.55)", particles: 40 },
};
