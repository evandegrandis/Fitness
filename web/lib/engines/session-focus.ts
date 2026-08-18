/**
 * « Quoi faire maintenant ? » : priorités musculaires vivantes pendant la séance.
 *
 * Le besoin d'Evan : en cours de séance il perd le fil de ce qu'il a déjà couvert (six séries
 * d'épaules, zéro de triceps) et n'a aucun moyen de s'en rendre compte sans quitter l'écran.
 *
 * Le piège qu'il a lui-même identifié : un simple classement par déficit lui proposerait les
 * jambes à chaque ouverture, puisqu'il n'en fait pas en ce moment. Un muscle absent depuis des
 * semaines est un CHOIX de programmation, pas un oubli, et le répéter rendrait le panneau
 * inutile. D'où le filtre de pertinence ci-dessous.
 *
 * Moteur pur : aucune écriture, aucun état dérivé persisté (ALGO_SPEC_HARDENED §0.2).
 */

import { rolling7DayProgress, type ParentMuscleProgress } from "@/lib/engines/effective-sets";
import { parentSets } from "@/lib/engines/effective-sets";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";
import type { MuscleParent } from "@/lib/models/muscles";

export const SESSION_FOCUS = {
  /**
   * Un muscle sans une seule série sur cette période sort des suggestions. 28 jours laissent
   * passer un cycle complet, y compris une semaine sautée, sans faire réapparaître un groupe
   * volontairement mis de côté.
   */
  RELEVANCE_WINDOW_DAYS: 28,
  /** En deçà, le déficit est du bruit d'arrondi. */
  MIN_REMAINING: 0.5,
  /** Un panneau court se lit d'un coup d'œil entre deux séries. */
  MAX_ROWS: 5,
} as const;

export interface SessionFocusRow extends ParentMuscleProgress {
  /** Séries effectives déjà faites sur ce muscle DANS la séance en cours. */
  doneThisSession: number;
}

export interface SessionFocus {
  /** Muscles à viser, du plus en retard au moins. */
  priorities: SessionFocusRow[];
  /** Muscles travaillés aujourd'hui, pour montrer ce qui est déjà couvert. */
  workedToday: SessionFocusRow[];
  /**
   * Muscles écartés faute d'activité récente. Comptés mais jamais suggérés : les afficher
   * séparément évite de faire croire à un bug, sans polluer la liste utile.
   */
  dormantCount: number;
}

const DAY_MS = 86_400_000;

/** Muscles ayant reçu au moins une série sur la fenêtre de pertinence. */
function recentlyTrained(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  referenceDate: Date
): Set<MuscleParent> {
  const since = referenceDate.getTime() - SESSION_FOCUS.RELEVANCE_WINDOW_DAYS * DAY_MS;
  const index = new Map(exercises.map((e) => [e.id, e]));
  const seen = new Set<MuscleParent>();
  for (const session of sessions) {
    if (session.isActive || session.date.getTime() < since) continue;
    for (const logged of session.exercises) {
      for (const [parent, value] of parentSets(logged, index.get(logged.exerciseId))) {
        if (value > 0) seen.add(parent);
      }
    }
  }
  return seen;
}

function doneIn(session: WorkoutSession | null | undefined, exercises: Exercise[]): Map<MuscleParent, number> {
  const totals = new Map<MuscleParent, number>();
  if (!session) return totals;
  const index = new Map(exercises.map((e) => [e.id, e]));
  for (const logged of session.exercises) {
    for (const [parent, value] of parentSets(logged, index.get(logged.exerciseId))) {
      totals.set(parent, (totals.get(parent) ?? 0) + value);
    }
  }
  return totals;
}

export function sessionFocus(
  history: WorkoutSession[],
  exercises: Exercise[],
  goals: MuscleGoal[],
  liveSession: WorkoutSession | null,
  referenceDate: Date = new Date()
): SessionFocus {
  const progress = rolling7DayProgress(history, exercises, goals, referenceDate, liveSession);
  const relevant = recentlyTrained(history, exercises, referenceDate);
  const doneNow = doneIn(liveSession, exercises);

  const withSession = progress.map((p): SessionFocusRow => ({
    ...p,
    doneThisSession: Math.round((doneNow.get(p.parent) ?? 0) * 10) / 10,
  }));

  const priorities = withSession
    .filter((p) => p.goalSets > 0 && p.remaining >= SESSION_FOCUS.MIN_REMAINING && relevant.has(p.parent))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, SESSION_FOCUS.MAX_ROWS);

  const workedToday = withSession
    .filter((p) => p.doneThisSession > 0)
    .sort((a, b) => b.doneThisSession - a.doneThisSession);

  const dormantCount = withSession.filter(
    (p) => p.goalSets > 0 && p.remaining >= SESSION_FOCUS.MIN_REMAINING && !relevant.has(p.parent)
  ).length;

  return { priorities, workedToday, dormantCount };
}
