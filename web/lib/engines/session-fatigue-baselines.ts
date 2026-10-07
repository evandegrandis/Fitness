/**
 * Fatigue « habituelle » d'un exercice et fatigue réellement présente avant lui dans une séance.
 * Fonctions pures extraites du store (07/10/2026) pour que la suggestion en direct et le bilan
 * (relu aussi dans l'Historique) lisent la même définition. Aucun changement de comportement.
 */

import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { SessionFatigueContext, type PriorLoad } from "@/lib/engines/session-fatigue";
import { FATIGUE_CLASS_PROPERTIES, SetType } from "@/lib/models/enums";
import type { MuscleParent } from "@/lib/models/muscles";
import {
  primaryParent,
  sessionsNewestFirst,
  type Exercise,
  type LoggedExercise,
  type WorkoutSession,
} from "@/lib/models/types";

function findExercise(catalog: Exercise[], exerciseId: string): Exercise | undefined {
  return catalog.find((e) => e.id === exerciseId);
}

/**
 * ALGO_V2 §6.1 — baselines de fatigue "habituelle" pour cet exercice : médiane du coût
 * systémique / des sets sur le même parent, mesurés AVANT cet exercice, sur ses 5 dernières
 * occurrences historiques. Sert à ne pénaliser que l'EXCÈS de fatigue (le profil empirique de
 * `predictReps` intègre déjà la fatigue habituelle). Le contexte est reconstruit par chronologie
 * réelle : seuls les sets des autres exercices terminés avant le dernier set de la cible comptent.
 */
export function buildFatigueBaselines(
  history: WorkoutSession[],
  catalog: Exercise[],
  exerciseId: string
): { baselineSystemicCost: number; baselineSameParentSets: number } | undefined {
  const targetExercise = findExercise(catalog, exerciseId);
  const parent = targetExercise ? primaryParent(targetExercise) : null;
  const samples: { systemicCost: number; sameParentSets: number }[] = [];

  for (const session of sessionsNewestFirst(history)) {
    const sample = fatigueBeforeOccurrence(session, catalog, parent, (logged) => logged.exerciseId === exerciseId);
    if (!sample) continue;
    samples.push(sample);
    if (samples.length >= 5) break;
  }
  if (samples.length > 0) return medianBaselines(samples);

  // Exercice jamais fait : sans habitude propre, la fatigue du moment était comparée à ZÉRO et
  // tout exercice découvert en milieu de séance déclenchait « fatigue systémique ». À défaut,
  // l'habitude se lit sur les exercices du même muscle principal (5 dernières séances).
  // Les exercices du même muscle ET du même type de mouvement occupent la même place dans les
  // séances (un développé suit le pec deck) : ce sont eux qui disent l'habitude. À défaut, le
  // même muscle seulement.
  if (!parent) return undefined;
  const recent = sessionsNewestFirst(history).slice(0, 5);
  const collect = (matches: (exercise: Exercise) => boolean) => {
    const found: { systemicCost: number; sameParentSets: number }[] = [];
    for (const session of recent) {
      for (const logged of session.exercises) {
        const exercise = findExercise(catalog, logged.exerciseId);
        if (!exercise || exercise.id === exerciseId || primaryParent(exercise) !== parent || !matches(exercise)) continue;
        const sample = fatigueBeforeOccurrence(session, catalog, parent, (candidate) => candidate.id === logged.id);
        if (sample) found.push(sample);
      }
    }
    return found;
  };
  const pattern = targetExercise?.movementPattern ?? null;
  const samePattern = pattern ? collect((exercise) => exercise.movementPattern === pattern) : [];
  const fallback = samePattern.length > 0 ? samePattern : collect(() => true);
  return fallback.length > 0 ? medianBaselines(fallback) : undefined;
}

/**
 * Coût systémique et séries sur le même muscle faits AVANT une occurrence (chronologie réelle :
 * seuls les sets des autres exercices terminés avant le dernier set de la cible comptent).
 * `null` si l'occurrence n'a aucun set de travail complété.
 */
export function fatigueBeforeOccurrence(
  session: WorkoutSession,
  catalog: Exercise[],
  parent: MuscleParent | null,
  isTarget: (logged: LoggedExercise) => boolean
): { systemicCost: number; sameParentSets: number } | null {
  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const targets = ordered.filter(isTarget);
  const targetSets = targets.flatMap((logged) =>
    logged.sets.filter(
      (set) =>
        set.completed &&
        (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff)
    )
  );
  if (targetSets.length === 0) return null;

  let systemicCost = 0;
  let sameParentSets = 0;
  const cutoff = targetSets.reduce(
    (latest, set) => (set.timestamp > latest ? set.timestamp : latest),
    targetSets[0].timestamp
  );
  const targetIds = new Set(targets.map((target) => target.id));
  for (const prior of ordered) {
    if (targetIds.has(prior.id)) continue;
    const exercise = findExercise(catalog, prior.exerciseId);
    if (!exercise) continue;
    const workSetsCompleted = physiologicalSetUnits(
      prior.sets.filter((set) => set.timestamp <= cutoff),
      { increment: exercise.smallestIncrement }
    );
    if (workSetsCompleted <= 0) continue;
    systemicCost += workSetsCompleted * FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
    if (parent && primaryParent(exercise) === parent) sameParentSets += workSetsCompleted;
  }
  return { systemicCost, sameParentSets };
}

function medianBaselines(
  samples: { systemicCost: number; sameParentSets: number }[]
): { baselineSystemicCost: number; baselineSameParentSets: number } {
  const medianOf = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  return {
    baselineSystemicCost: medianOf(samples.map((sample) => sample.systemicCost)),
    baselineSameParentSets: medianOf(samples.map((sample) => sample.sameParentSets)),
  };
}


/**
 * Fatigue présente au début d'un exercice dans une séance terminée, telle que la suggestion de sa
 * première série l'a vue : séries des AUTRES exercices complétées avant la première série de
 * travail de la cible (chronologie réelle, supersets compris), comparées à l'habitude de
 * l'exercice (`baselineHistory` : les séances d'AVANT celle-ci). Une séance relue des semaines plus
 * tard dans l'Historique donne le même résultat que le soir même.
 */
export function fatigueContextAtExerciseStart(
  session: WorkoutSession,
  catalog: Exercise[],
  exerciseId: string,
  baselineHistory: WorkoutSession[]
): SessionFatigueContext {
  const targets = session.exercises.filter((logged) => logged.exerciseId === exerciseId);
  const targetIds = new Set(targets.map((logged) => logged.id));
  const firstWork = targets
    .flatMap((logged) => logged.sets)
    .filter(
      (set) =>
        set.completed &&
        (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff)
    )
    .reduce<Date | null>((first, set) => (!first || set.timestamp < first ? set.timestamp : first), null);
  if (!firstWork) return SessionFatigueContext.empty;

  const priorLoads: PriorLoad[] = [];
  for (const prior of [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (targetIds.has(prior.id)) continue;
    const exercise = findExercise(catalog, prior.exerciseId);
    if (!exercise) continue;
    const parent = primaryParent(exercise);
    if (!parent) continue;
    const workSetsCompleted = physiologicalSetUnits(
      prior.sets.filter((set) => set.timestamp < firstWork),
      { increment: exercise.smallestIncrement }
    );
    if (workSetsCompleted <= 0) continue;
    priorLoads.push({ primaryParent: parent, workSetsCompleted, fatigueClass: exercise.fatigueClass, exerciseName: exercise.name });
  }
  return new SessionFatigueContext(priorLoads, buildFatigueBaselines(baselineHistory, catalog, exerciseId));
}
