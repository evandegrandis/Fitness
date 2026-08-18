/**
 * Suivi du cardio sur 7 jours glissants.
 *
 * Objectif par défaut : 150 min/semaine. C'est le seuil où la méta-analyse dose-réponse de
 * référence situe le passage à des effets cliniquement significatifs sur le tour de taille et
 * l'adiposité — au-dessous, l'effet existe mais reste marginal. Monter vers 180 ne se décide
 * qu'une fois la récupération et la progression en salle constatées stables.
 *
 * La RÉPARTITION compte autant que le volume : l'effet d'une séance sur la sensibilité à
 * l'insuline retombe en quelques jours. Trois séances étalées valent mieux que trois d'affilée,
 * d'où `longestGapDays` — un volume atteint en bloc n'est pas le même stimulus.
 *
 * Moteur pur : aucune écriture, aucun état dérivé persisté (ALGO_SPEC_HARDENED §0.2).
 */

import type { WorkoutSession } from "@/lib/models/types";

export const CARDIO_GOAL = {
  /** Minutes hebdomadaires par défaut. */
  DEFAULT_WEEKLY_MINUTES: 150,
  /** Fenêtre glissante, alignée sur celle des objectifs musculaires. */
  WINDOW_DAYS: 7,
  /** Au-delà, le bénéfice métabolique de la dernière séance s'est largement dissipé. */
  MAX_GAP_DAYS_BEFORE_STALE: 4,
} as const;

export interface CardioProgress {
  /** Minutes cumulées sur la fenêtre. */
  minutes: number;
  goalMinutes: number;
  /** Part de l'objectif atteinte, bornée à 1 pour l'affichage. */
  ratio: number;
  remainingMinutes: number;
  sessionCount: number;
  /** Jours depuis la dernière séance cardio, `null` si aucune dans la fenêtre. */
  daysSinceLast: number | null;
  /** Plus long trou entre deux séances de la fenêtre (bornes incluses). */
  longestGapDays: number | null;
}

const DAY_MS = 86_400_000;

function cardioMinutes(session: WorkoutSession): number {
  return (session.cardioEntries ?? []).reduce((sum, entry) => sum + entry.durationSeconds, 0) / 60;
}

/**
 * @param sessions historique (les séances actives sont ignorées : leur cardio n'est pas figé)
 * @param liveSession séance en cours, comptée en direct pour que la barre bouge pendant la séance
 */
export function cardioProgress(
  sessions: WorkoutSession[],
  goalMinutes: number = CARDIO_GOAL.DEFAULT_WEEKLY_MINUTES,
  referenceDate: Date = new Date(),
  liveSession?: WorkoutSession | null
): CardioProgress {
  const windowEnd = referenceDate.getTime();
  const windowStart = windowEnd - CARDIO_GOAL.WINDOW_DAYS * DAY_MS;

  const inWindow = sessions.filter(
    (s) => !s.isActive && s.date.getTime() >= windowStart && s.date.getTime() <= windowEnd && cardioMinutes(s) > 0
  );
  if (liveSession && cardioMinutes(liveSession) > 0) inWindow.push(liveSession);

  const minutes = Math.round(inWindow.reduce((sum, s) => sum + cardioMinutes(s), 0));
  const dates = inWindow.map((s) => s.date.getTime()).sort((a, b) => a - b);

  const daysSinceLast =
    dates.length === 0 ? null : Math.floor((windowEnd - dates[dates.length - 1]) / DAY_MS);

  let longestGapDays: number | null = null;
  if (dates.length > 0) {
    // Le trou courant (depuis la dernière séance) compte autant qu'un trou passé : c'est lui
    // qui détermine si le bénéfice de la dernière séance est en train de se dissiper.
    let longest = (windowEnd - dates[dates.length - 1]) / DAY_MS;
    for (let i = 1; i < dates.length; i += 1) {
      longest = Math.max(longest, (dates[i] - dates[i - 1]) / DAY_MS);
    }
    longestGapDays = Math.floor(longest);
  }

  const safeGoal = goalMinutes > 0 ? goalMinutes : CARDIO_GOAL.DEFAULT_WEEKLY_MINUTES;
  return {
    minutes,
    goalMinutes: safeGoal,
    ratio: Math.min(1, minutes / safeGoal),
    remainingMinutes: Math.max(0, Math.round(safeGoal - minutes)),
    sessionCount: inWindow.length,
    daysSinceLast,
    longestGapDays,
  };
}

/**
 * Message contextuel — rappelle POURQUOI, pas seulement combien. Evan fait ce cardio pour sa
 * fréquence cardiaque au repos et sa santé cardiovasculaire ; un compteur nu ne le lui rappelle pas.
 */
export function cardioNudge(progress: CardioProgress): string {
  if (progress.sessionCount === 0) {
    return "Aucun cardio cette semaine — c'est le levier n°1 sur ta fréquence cardiaque au repos.";
  }
  if (progress.daysSinceLast !== null && progress.daysSinceLast >= CARDIO_GOAL.MAX_GAP_DAYS_BEFORE_STALE) {
    return `${progress.daysSinceLast} jours sans cardio : le bénéfice de la dernière séance s'est dissipé.`;
  }
  if (progress.remainingMinutes > 0) {
    return `Encore ${progress.remainingMinutes} min cette semaine pour ta santé cardiovasculaire.`;
  }
  return "Objectif cardio atteint cette semaine.";
}
