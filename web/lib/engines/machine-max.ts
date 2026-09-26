/**
 * « Maxer chaque machine » : un objectif d'Evan. Une machine est maxée dès qu'une vraie série de
 * travail atteint sa charge maximale (bout de pile, `Exercise.maxLoad`) avec au moins le minimum
 * de la fourchette de reps : soulever toute la pile pour 2 reps ne compte pas.
 *
 * Moteur pur : l'état se recalcule depuis l'historique, rien n'est persisté hormis la charge max
 * elle-même, saisie par l'utilisateur.
 */

import { normalRecordSets } from "@/lib/engines/records";
import { SetPatternMode } from "@/lib/models/enums";
import {
  orderedSets,
  sessionsNewestFirst,
  type Exercise,
  type LoggedSet,
  type WorkoutSession,
} from "@/lib/models/types";

/**
 * `Exercise.maxLoad` a trois états (Evan, 26/09/2026) : `null` = jamais renseigné (l'app pose la
 * question), `0` = « pas de max », une réponse donnée qui ne se repose pas (barre libre, haltères
 * sans limite utile), > 0 = bout de pile. Tout le code traite déjà 0 comme « aucune limite ».
 */
export const NO_MAX_LOAD = 0;

const BODYWEIGHT_PATTERNS: ReadonlySet<string> = new Set([
  SetPatternMode.bodyweight,
  SetPatternMode.weightedBodyweight,
  SetPatternMode.assistedBodyweight,
]);

/** L'app doit-elle demander la charge max ? Jamais pour un exercice au poids du corps (tractions, dips, HSPU). */
export function asksForMaxLoad(exercise: Pick<Exercise, "maxLoad" | "setPatternMode">): boolean {
  return (exercise.maxLoad === null || exercise.maxLoad === undefined) && !BODYWEIGHT_PATTERNS.has(exercise.setPatternMode);
}

export interface MachineMaxStatus {
  exercise: Exercise;
  maxLoad: number | null;
  /** Charge la plus lourde tenue sur une vraie série de travail (reps ≥ minimum de la fourchette). */
  bestLoad: number;
  /** Part de la pile atteinte (0..1), `null` sans charge max connue. */
  progress: number | null;
  maxed: boolean;
  lastUsed: Date | null;
}

export function machineMaxStatus(exercise: Exercise, sets: readonly LoggedSet[], lastUsed: Date | null = null): MachineMaxStatus {
  const valid = normalRecordSets([...sets], exercise).filter(
    (set) => set.weight > 0 && set.reps >= exercise.repTargetMin
  );
  const bestLoad = valid.reduce((max, set) => Math.max(max, set.weight), 0);
  const maxLoad = exercise.maxLoad && exercise.maxLoad > 0 ? exercise.maxLoad : null;
  return {
    exercise,
    maxLoad,
    bestLoad,
    progress: maxLoad ? Math.min(1, bestLoad / maxLoad) : null,
    maxed: maxLoad !== null && bestLoad >= maxLoad - 1e-9,
    lastUsed,
  };
}

export const MACHINE_TRACKING = {
  /** Les machines pratiquées dans cette fenêtre : celles de la salle du moment. */
  RECENT_DAYS: 56,
} as const;

/**
 * Exercices chargés pratiqués récemment, du plus récent au plus ancien : la liste où saisir et
 * suivre les charges max. Les exercices au poids du corps n'ont pas de pile à maxer.
 */
export function machinesForMaxTracking(
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[],
  now: Date
): MachineMaxStatus[] {
  const since = now.getTime() - MACHINE_TRACKING.RECENT_DAYS * 86_400_000;
  const setsById = new Map<string, LoggedSet[]>();
  const lastUsedById = new Map<string, Date>();
  for (const session of sessionsNewestFirst(history)) {
    if (session.isActive) continue;
    for (const logged of session.exercises) {
      const sets = orderedSets(logged).filter((set) => set.completed);
      if (sets.length === 0) continue;
      setsById.set(logged.exerciseId, [...(setsById.get(logged.exerciseId) ?? []), ...sets]);
      if (!lastUsedById.has(logged.exerciseId)) lastUsedById.set(logged.exerciseId, session.date);
    }
  }
  return catalog
    .filter((exercise) => {
      const lastUsed = lastUsedById.get(exercise.id);
      const loaded = (setsById.get(exercise.id) ?? []).some((set) => set.weight > 0);
      return loaded && lastUsed !== undefined && lastUsed.getTime() >= since;
    })
    .map((exercise) => machineMaxStatus(exercise, setsById.get(exercise.id) ?? [], lastUsedById.get(exercise.id) ?? null))
    .sort((a, b) => (b.lastUsed?.getTime() ?? 0) - (a.lastUsed?.getTime() ?? 0));
}
