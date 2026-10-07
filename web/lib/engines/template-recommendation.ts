import type { ParentMuscleProgress } from "@/lib/engines/effective-sets";
import {
  aggregateCoefficient,
  sessionsNewestFirst,
  type Exercise,
  type WorkoutSession,
  type WorkoutTemplate,
} from "@/lib/models/types";

const RECENT_SESSION_LIMIT = 6;

/**
 * Choisit un template à partir de deux signaux séparés : les déficits actuels
 * et les exercices réellement pratiqués dans les dernières séances. Le score
 * est normalisé par le volume du template : un ancien template ne gagne plus
 * mécaniquement parce qu'il contient davantage d'exercices.
 */
export function recommendTemplateId(
  templates: WorkoutTemplate[],
  catalog: Exercise[],
  priorities: Pick<ParentMuscleProgress, "parent" | "remaining">[],
  history: WorkoutSession[]
): string | null {
  if (templates.length === 0) return null;

  const exerciseByName = new Map(catalog.map((exercise) => [exercise.name, exercise]));
  const priorityWeight = new Map(
    priorities
      .slice(0, 6)
      .map((priority, index) => [priority.parent, priority.remaining * (6 - index)] as const)
  );
  const recentWeight = new Map<string, number>();
  sessionsNewestFirst(history)
    .filter((session) => !session.isActive)
    .slice(0, RECENT_SESSION_LIMIT)
    .forEach((session, sessionIndex) => {
      const sessionWeight = RECENT_SESSION_LIMIT - sessionIndex;
      for (const logged of session.exercises) {
        if (!logged.sets.some((set) => set.completed && set.reps > 0)) continue;
        recentWeight.set(
          logged.exerciseId,
          (recentWeight.get(logged.exerciseId) ?? 0) + sessionWeight
        );
      }
    });

  let best: { id: string; score: number; index: number } | null = null;
  for (const [index, template] of templates.entries()) {
    let deficitTotal = 0;
    let recentTotal = 0;
    let volume = 0;

    for (const templateExercise of template.exercises) {
      const exercise = exerciseByName.get(templateExercise.exerciseName);
      if (!exercise) continue;
      const targetSets = Math.max(1, templateExercise.targetSets);
      volume += targetSets;
      for (const [parent, weight] of priorityWeight) {
        deficitTotal += aggregateCoefficient(exercise, parent) * weight * targetSets;
      }
      recentTotal += (recentWeight.get(exercise.id) ?? 0) * targetSets;
    }

    if (volume === 0) continue;
    const deficitAverage = deficitTotal / volume;
    const recentAverage = recentTotal / volume;
    // La récence pèse fortement : plusieurs séances dans le nouveau format
    // doivent déplacer la recommandation sans attendre des mois d'historique.
    const score = deficitAverage + recentAverage * 2;
    if (!best || score > best.score || (score === best.score && index < best.index)) {
      best = { id: template.id, score, index };
    }
  }

  return best?.id ?? templates[0]?.id ?? null;
}

/** Séances récentes où un modèle doit avoir servi pour rester la proposition par défaut. */
export const TEMPLATE_IN_USE_MIN_SESSIONS = 2;

/**
 * Ce que l'accueil propose en premier. Un modèle ne passe devant la « Séance du jour » (bâtie sur
 * les habitudes récentes, `habitual-session.ts`) que s'il sert vraiment en ce moment : au moins 2
 * des 6 dernières séances démarrées depuis lui. Sinon c'est un vestige (le « Full Body » de
 * l'ancienne salle, plus utilisé depuis le 21/09/2026). Sans habitude lisible (moins de 3
 * séances récentes), le modèle recommandé reste la proposition, comme avant.
 */
export function defaultStartChoice(
  templates: WorkoutTemplate[],
  recommendedTemplateId: string | null,
  hasHabitualPlan: boolean,
  history: WorkoutSession[]
): { kind: "template"; templateId: string } | { kind: "habitual" } | null {
  const recommended = templates.find((template) => template.id === recommendedTemplateId) ?? null;
  if (!hasHabitualPlan) return recommended ? { kind: "template", templateId: recommended.id } : null;
  if (!recommended) return { kind: "habitual" };
  const recentUses = sessionsNewestFirst(history)
    .filter((session) => !session.isActive)
    .slice(0, RECENT_SESSION_LIMIT)
    .filter((session) => session.templateName === recommended.name).length;
  return recentUses >= TEMPLATE_IN_USE_MIN_SESSIONS ? { kind: "template", templateId: recommended.id } : { kind: "habitual" };
}
