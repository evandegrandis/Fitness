/**
 * Détection d'un finisher *proposé* (jamais imposé).
 *
 * Constat d'Evan (17/08/2026) : un finisher se définit par sa POSITION en fin de
 * séance, pas par un nombre de reps élevé. Son HSPU de fin de séance à 3 reps
 * était un vrai finisher et l'ancienne règle (`reps >= max(15, repTargetMax)`)
 * le ratait complètement, tout en reclassant en douce des séries qui n'en
 * étaient pas.
 *
 * Ce module ne renvoie donc qu'une INTENTION à confirmer : le store propose,
 * l'utilisateur tranche (cf. `pendingFinisherPrompt`). Aucune série n'est
 * reclassée sans un tap explicite.
 *
 * Deux étages, pour ne pas demander à chaque série de fin de séance :
 *   1. une PORTE de position — on est effectivement en fin de séance ;
 *   2. un SIGNAL de rupture — cette série-ci sort du bloc de travail normal.
 * Les deux sont requis.
 */

import { effectiveSetUnits } from "@/lib/engines/set-structure";
import { SetType } from "@/lib/models/enums";
import { completedWorkSets, type Exercise, type LoggedExercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";

export const FINISHER_PROMPT = {
  /** Fin de séance : au moins 10 séries effectives cumulées… (règle donnée par Evan) */
  MIN_EFFECTIVE_SETS: 10,
  /** …ou 40 minutes écoulées depuis le début de la séance. */
  MIN_SESSION_MINUTES: 40,
} as const;

/**
 * Pourquoi cette série ressemble à un finisher — sert aussi de libellé UI.
 * - `late_return` : retour sur un exercice déjà clos (le cas HSPU d'Evan) ;
 * - `late_addition` : exercice ajouté une fois la séance déjà bien avancée ;
 * - `high_reps` : série à hautes reps typique d'un burnout final.
 */
export type FinisherPromptReason = "late_return" | "late_addition" | "high_reps";

/** Série candidate au moment du log (pas encore persistée). */
export interface FinisherCandidate {
  reps: number;
  timestamp: Date;
}

function completedWorkSetsOf(session: WorkoutSession): LoggedSet[] {
  return session.exercises.flatMap((logged) => completedWorkSets(logged));
}

/** La séance est-elle assez avancée pour qu'un finisher ait du sens ? */
export function isLateInSession(session: WorkoutSession, at: Date): boolean {
  const elapsedMinutes = (at.getTime() - session.startTime.getTime()) / 60_000;
  if (elapsedMinutes >= FINISHER_PROMPT.MIN_SESSION_MINUTES) return true;
  return effectiveSetUnits(completedWorkSetsOf(session)) >= FINISHER_PROMPT.MIN_EFFECTIVE_SETS;
}

/**
 * Renvoie la raison de proposer un finisher, ou `null` s'il n'y a rien à demander.
 *
 * Volontairement muet dans les cas où la question n'a pas de sens : échauffement,
 * finisher déjà demandé explicitement, membre de superset (l'alternance explique
 * déjà la forme des séries).
 */
export function finisherPromptReason(
  session: WorkoutSession,
  loggedExercise: LoggedExercise,
  exercise: Exercise,
  candidate: FinisherCandidate,
  requestedSetType: SetType
): FinisherPromptReason | null {
  if (requestedSetType === SetType.warmup || requestedSetType === SetType.finisher) return null;
  if (loggedExercise.supersetGroupId !== null) return null;
  if (!isLateInSession(session, candidate.timestamp)) return null;

  const ownSets = completedWorkSets(loggedExercise);

  // 1. Retour tardif : on avait déjà travaillé cet exercice, on est passé à autre
  //    chose, puis on y revient. C'est le signal le plus franc d'un finisher.
  if (ownSets.length > 0) {
    const lastOwn = Math.max(...ownSets.map((set) => set.timestamp.getTime()));
    const workedElsewhereSince = session.exercises.some(
      (other) =>
        other.id !== loggedExercise.id &&
        completedWorkSets(other).some((set) => set.timestamp.getTime() > lastOwn)
    );
    if (workedElsewhereSince) return "late_return";
  }

  // 2. Exercice ajouté alors que la séance était déjà lancée, et dont c'est la
  //    première série : un bloc court greffé en fin de séance.
  if (ownSets.length === 0 && session.exercises.some((other) => other.id !== loggedExercise.id && completedWorkSets(other).length > 0)) {
    return "late_addition";
  }

  // 3. Burnout à hautes reps — l'ancien signal, conservé mais désormais soumis à
  //    la porte de position (il ne suffit plus à lui seul).
  if (candidate.reps >= Math.max(15, exercise.repTargetMax)) return "high_reps";

  return null;
}

/** Court par nécessité : la bande n'a qu'une ligne sur un écran de 375 px. */
export const finisherPromptLabel: Record<FinisherPromptReason, string> = {
  late_return: "Retour tardif sur l'exercice",
  late_addition: "Ajouté en fin de séance",
  high_reps: "Hautes reps, fin de séance",
};
