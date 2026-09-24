"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cardioNudge, cardioProgress } from "@/lib/engines/cardio";
import { Settings } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import { weeklyProgress } from "@/lib/engines/effective-sets";
import { recentAchievements } from "@/lib/engines/achievements";
import { recommendTemplateId } from "@/lib/engines/template-recommendation";
import { WeeklyPriority } from "./WeeklyPriority";
import { QuickActions } from "./QuickActions";
import { RecentAchievements } from "./RecentAchievements";

/** Écran d'accueil affiché quand aucune séance n'est active. */
export function QuickStart() {
  const catalog = useWorkoutStore((s) => s.catalog);
  const history = useWorkoutStore((s) => s.history);
  const goals = useWorkoutStore((s) => s.goals);
  const settings = useWorkoutStore((s) => s.settings);
  const templates = useWorkoutStore((s) => s.templates);
  const repeatLast = useWorkoutStore((s) => s.repeatLast);
  const startFromTemplate = useWorkoutStore((s) => s.startFromTemplate);
  const startEmpty = useWorkoutStore((s) => s.startEmpty);
  const startCardio = useWorkoutStore((s) => s.startCardio);

  // Miroir du filtre de `weeklyPriorities` (effective-sets.ts) — on garde ici
  // l'objet `ParentMuscleProgress` complet (coverage %, goalSets) pour l'affichage
  // en relevé, plutôt que le tuple [parent, remaining] appauvri.
  const priorities = useMemo(
    () =>
      weeklyProgress(history, catalog, goals)
        .filter((p) => p.goalSets > 0 && p.remaining >= 0.5)
        .sort((a, b) => b.remaining - a.remaining),
    [history, catalog, goals]
  );
  const achievements = useMemo(() => recentAchievements(history, catalog), [history, catalog]);
  // Le rappel cardio vit sur le bouton de démarrage : c'est là qu'Evan décide de sa séance, pas
  // dans un écran de statistiques qu'il ouvrirait après coup.
  const cardio = useMemo(
    () => cardioProgress(history, settings.weeklyCardioMinutesGoal ?? undefined),
    [history, settings.weeklyCardioMinutesGoal]
  );
  const cardioHint = useMemo(() => cardioNudge(cardio), [cardio]);

  const recommendedTemplateId = useMemo(() => {
    return recommendTemplateId(templates, catalog, priorities, history);
  }, [templates, priorities, catalog, history]);

  const greetingName = settings.userName ? `, ${settings.userName}` : "";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-(--color-fg-muted)">Bonjour{greetingName}</p>
          <h1 className="font-display text-2xl font-bold text-accent-gradient">Séance</h1>
        </div>
        <Link
          href="/reglages"
          aria-label="Réglages"
          className="glass grid h-10 w-10 place-items-center rounded-full active:scale-90 transition"
        >
          <Settings size={18} />
        </Link>
      </header>

      <WeeklyPriority priorities={priorities} cardio={cardio} />

      <QuickActions
        lastSession={history[0]}
        templates={templates}
        recommendedTemplateId={recommendedTemplateId}
        onRepeatLast={repeatLast}
        onStartTemplate={startFromTemplate}
        onStartEmpty={startEmpty}
        onStartCardio={startCardio}
        cardioHint={cardioHint}
      />

      <RecentAchievements achievements={achievements} />
    </main>
  );
}
