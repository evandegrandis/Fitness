"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Settings } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import { rollingPriorities } from "@/lib/engines/effective-sets";
import { recentAchievements } from "@/lib/engines/achievements";
import { WeeklyPriority } from "./WeeklyPriority";
import { ModePicker } from "./ModePicker";
import { QuickActions } from "./QuickActions";
import { RecentAchievements } from "./RecentAchievements";

/** Écran d'accueil affiché quand aucune séance n'est active. */
export function QuickStart() {
  const catalog = useWorkoutStore((s) => s.catalog);
  const history = useWorkoutStore((s) => s.history);
  const goals = useWorkoutStore((s) => s.goals);
  const settings = useWorkoutStore((s) => s.settings);
  const templates = useWorkoutStore((s) => s.templates);
  const selectedStartMode = useWorkoutStore((s) => s.selectedStartMode);
  const setSelectedStartMode = useWorkoutStore((s) => s.setSelectedStartMode);
  const repeatLast = useWorkoutStore((s) => s.repeatLast);
  const startFromTemplate = useWorkoutStore((s) => s.startFromTemplate);
  const startEmpty = useWorkoutStore((s) => s.startEmpty);

  const priorities = useMemo(() => rollingPriorities(history, catalog, goals), [history, catalog, goals]);
  const achievements = useMemo(() => recentAchievements(history, catalog), [history, catalog]);

  const recommendedTemplateId = useMemo(() => {
    if (templates.length === 0) return null;
    const priorityParents = new Set(priorities.slice(0, 3).map(([p]) => p));
    if (priorityParents.size === 0) return templates[0]?.id ?? null;
    const exerciseByName = new Map(catalog.map((e) => [e.name, e]));
    let best: { id: string; score: number } | null = null;
    for (const t of templates) {
      let score = 0;
      for (const te of t.exercises) {
        const exercise = exerciseByName.get(te.exerciseName);
        if (!exercise) continue;
        for (const mapping of exercise.muscleMappings) {
          score += mapping.coefficient;
        }
      }
      if (!best || score > best.score) best = { id: t.id, score };
    }
    return best?.id ?? null;
  }, [templates, priorities, catalog]);

  const greetingName = settings.userName ? `, ${settings.userName}` : "";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[--color-fg-muted]">Bonjour{greetingName}</p>
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

      <WeeklyPriority priorities={priorities} />

      <ModePicker value={selectedStartMode} onChange={setSelectedStartMode} />

      <QuickActions
        lastSession={history[0]}
        templates={templates}
        recommendedTemplateId={recommendedTemplateId}
        mode={selectedStartMode}
        onRepeatLast={repeatLast}
        onStartTemplate={startFromTemplate}
        onStartEmpty={startEmpty}
      />

      <RecentAchievements achievements={achievements} />
    </main>
  );
}
