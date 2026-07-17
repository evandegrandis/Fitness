"use client";

import { useMemo } from "react";
import { TrendingUp, AlertTriangle } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { useWorkoutStore } from "@/lib/store/workout";
import { rollingPriorities } from "@/lib/engines/effective-sets";
import { exerciseBenchmark, type BenchmarkTone, type ExerciseBenchmark } from "@/lib/engines/benchmark";
import { parentDisplayName } from "@/lib/models/muscles";
import { completedWorkSets, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { formatDerivedWeight } from "@/components/progress/utils";

const TONE_COLOR: Record<BenchmarkTone, string> = {
  below: "var(--color-warning)",
  progressing: "var(--color-success)",
  elite: "var(--accent)",
};

const MUSCLE_DEFICIT_COLOR = "var(--color-danger)";

interface Insight {
  key: string;
  text: string;
  color: string;
}

/**
 * Meilleur set qualifiant (reps >= repMin, sinon le plus lourd) de la séance
 * la plus récente où cet exercice a été loggé — "où en est Evan MAINTENANT"
 * sur cet exercice, pour comparaison au bandeau de référence.
 */
function latestBestLoad(history: WorkoutSession[], exercise: Exercise): number | null {
  const finished = history.filter((s) => !s.isActive).slice().sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const session of finished) {
    const sets = session.exercises
      .filter((e) => e.exerciseId === exercise.id)
      .flatMap((e) => completedWorkSets(e))
      .filter((s) => s.weight > 0);
    if (sets.length === 0) continue;
    const validated = sets.filter((s) => s.reps >= exercise.repTargetMin);
    const pool = validated.length > 0 ? validated : sets;
    return pool.reduce((best, s) => (s.weight > best.weight ? s : best)).weight;
  }
  return null;
}

/**
 * Encart « prise de recul » en tête de l'onglet Progrès (rendu dans la
 * couche Muscles, onglet par défaut) : 1-2 muscles les plus en déficit sur
 * la fenêtre roulante 7j + le repère de force (bandeau avancé/élite) le plus
 * proche et le plus loin d'être franchi. Rien de nouveau côté données —
 * relit `rolling7DayProgress`/`rollingPriorities` et `benchmark.ts`.
 */
export function ProgressInsights() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const active = useWorkoutStore((s) => s.active);
  const bodyWeightKg = useWorkoutStore((s) => s.settings.bodyWeightKg ?? undefined);

  const muscleInsights = useMemo<Insight[]>(() => {
    const priorities = rollingPriorities(history, catalog, goals, new Date(), active);
    return priorities.slice(0, 2).map(([parent, remaining]) => ({
      key: `muscle-${parent}`,
      text: `${parentDisplayName[parent]} : ${Math.ceil(remaining)} série${Math.ceil(remaining) > 1 ? "s" : ""} sous l'objectif 7j`,
      color: MUSCLE_DEFICIT_COLOR,
    }));
  }, [history, catalog, goals, active]);

  const benchmarkInsights = useMemo<Insight[]>(() => {
    const entries = catalog
      .filter((e) => e.benchmarkLow != null && e.benchmarkHigh != null)
      .map((exercise) => {
        const bestLoad = latestBestLoad(history, exercise);
        if (bestLoad == null) return null;
        const benchmark = exerciseBenchmark(exercise, bestLoad, bodyWeightKg);
        if (!benchmark.hasBenchmark || !benchmark.level || benchmark.position == null) return null;
        return { exercise, benchmark };
      })
      .filter((e): e is { exercise: Exercise; benchmark: ExerciseBenchmark } => e !== null);

    if (entries.length === 0) return [];

    const notYetElite = entries.filter((e) => e.benchmark.level!.tone !== "elite");
    const insights: Insight[] = [];

    if (notYetElite.length > 0) {
      // Le plus proche du prochain palier : plus petit écart restant (avancé ou élite selon le ton).
      const closest = notYetElite.reduce((best, cur) => {
        const gapBest = best.benchmark.level!.tone === "below" ? best.benchmark.gapToAdvanced! : best.benchmark.gapToElite!;
        const gapCur = cur.benchmark.level!.tone === "below" ? cur.benchmark.gapToAdvanced! : cur.benchmark.gapToElite!;
        return gapCur < gapBest ? cur : best;
      });
      const tone = closest.benchmark.level!.tone;
      const text =
        tone === "below"
          ? `${closest.exercise.name} : encore ${formatDerivedWeight(closest.benchmark.gapToAdvanced!, closest.exercise.smallestIncrement)}kg avant l'avancé`
          : `${closest.exercise.name} : à ${Math.round((closest.benchmark.position ?? 0) * 100)}% du chemin avancé → élite`;
      insights.push({ key: `bench-closest-${closest.exercise.id}`, text, color: TONE_COLOR[tone] });

      // Le plus loin de l'avancé (uniquement si franchement sous le niveau, distinct du précédent).
      const belowOnly = notYetElite.filter((e) => e.benchmark.level!.tone === "below" && e.exercise.id !== closest.exercise.id);
      if (belowOnly.length > 0) {
        const farthest = belowOnly.reduce((worst, cur) => (cur.benchmark.gapToAdvanced! > worst.benchmark.gapToAdvanced! ? cur : worst));
        insights.push({
          key: `bench-farthest-${farthest.exercise.id}`,
          text: `${farthest.exercise.name} : encore ${formatDerivedWeight(farthest.benchmark.gapToAdvanced!, farthest.exercise.smallestIncrement)}kg avant l'avancé`,
          color: TONE_COLOR.below,
        });
      }
    }

    return insights.slice(0, 2);
  }, [history, catalog, bodyWeightKg]);

  const insights = [...muscleInsights, ...benchmarkInsights];

  if (insights.length === 0) return null;

  return (
    <GlassCard className="mb-3">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[--color-fg-faint]">Prise de recul</p>
      <div className="space-y-2">
        {insights.map((insight) => (
          <div key={insight.key} className="flex items-start gap-2 text-sm">
            {insight.color === MUSCLE_DEFICIT_COLOR ? (
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: insight.color }} />
            ) : (
              <TrendingUp size={14} className="mt-0.5 shrink-0" style={{ color: insight.color }} />
            )}
            <span className="text-[--color-fg-muted]">{insight.text}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
