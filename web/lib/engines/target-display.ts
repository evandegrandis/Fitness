/**
 * Ce que la carte de saisie dit autour de la cible à battre : la cible, et rien d'autre (24/10/2026).
 *
 * Evan, 24/10 : « Si je suis prévenu, intra-séance, que le moteur me propose X et qu'en réalité il sait que je suis
 * censé être capable de faire Y (avec X > Y), ça va me démotiver, je vais avoir le réflexe de viser Y tout pile ou un
 * peu au dessus. » Et, sur « À 90 kg, cette cible vaut 10 reps » : « ça veut rien dire ça ».
 *
 * - Plus de prévision, d'habitude ni de capacité en séance : la prévision reste interne au moteur
 *   (`predictedRepsAtActualWeight`, pour l'apprentissage) ; « tu fais d'habitude N reps », « le moteur prévoit N »,
 *   « cette cible vaut N », « tu perds d'habitude N reps » ne sont plus dits. C'est le bilan qui lui dit où il se situe
 *   face à sa capacité du jour (`session-insights.ts`).
 * - Quand il change la charge, la cible elle-même est recalculée à cette charge (`targetAtLoad`, même règle que la cible
 *   du moteur, battue environ une fois sur trois) et dite simplement : « Cible à 90 kg : 10 reps », avec « Reprendre ».
 *   C'est cette cible qui est enregistrée avec la série et qui la juge.
 */
import type { SetSuggestion } from "@/lib/engines/progression";
import { suggestionReason } from "@/lib/engines/suggestion-reason";
import { targetAtLoad, type TodaySet } from "@/lib/engines/target";
import { effectiveEffort } from "@/lib/engines/versus";
import { formatLoad } from "@/lib/format";
import type { Exercise } from "@/lib/models/types";

export interface TargetPanel {
  /** La cible à la charge des champs : celle que l'écran dit, enregistrée avec la série si elle est validée. */
  target: { weight: number; reps: number };
  /** « 80 kg × 12 » à la charge proposée, « Cible à 90 kg : 10 reps » à une autre charge. */
  headline: string;
  /** Pourquoi le moteur propose cette série, seulement à la charge proposée (à une autre, elle ne s'applique plus). */
  reason: string | null;
  /** Les champs ne sont plus la proposition : « Reprendre » s'affiche. */
  modified: boolean;
  /** La charge des champs n'est plus celle proposée : la cible a été recalculée. */
  weightChanged: boolean;
}

function repsWord(reps: number): string {
  return `${reps} rep${reps > 1 ? "s" : ""}`;
}

/** La cible et ses mots, pour la charge et les reps des champs (`SetEntry`), et pour les invariants D2 à D4. */
export function targetPanel(
  suggestion: Pick<SetSuggestion, "weight" | "reps" | "reasonCodes" | "explanation"> & Partial<Pick<SetSuggestion, "prediction" | "ambition" | "repDrop">>,
  exercise: Exercise,
  fields: { weight: number; reps: number },
  today: readonly TodaySet[],
  bodyweightKg: number | undefined
): TargetPanel {
  const weightChanged = Math.abs(effectiveEffort(exercise, fields.weight) - effectiveEffort(exercise, suggestion.weight)) > 1e-9;
  const target = weightChanged
    ? targetAtLoad(suggestion, exercise, fields.weight, today, exercise.smallestIncrement, bodyweightKg)
    : { weight: suggestion.weight, reps: suggestion.reps };
  return {
    target,
    headline: weightChanged
      ? `Cible ${target.weight > 0 ? `à ${formatLoad(target.weight)}` : "au poids du corps"} : ${repsWord(target.reps)}`
      : `${formatLoad(suggestion.weight)} × ${suggestion.reps}`,
    reason: weightChanged ? null : suggestionReason(suggestion) ?? suggestion.explanation,
    modified: weightChanged || fields.reps !== suggestion.reps,
    weightChanged,
  };
}
