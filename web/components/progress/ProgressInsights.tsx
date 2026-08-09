"use client";

import { useMemo } from "react";
import { TrendingUp, AlertTriangle } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { useWorkoutStore } from "@/lib/store/workout";
import { rollingPriorities } from "@/lib/engines/effective-sets";
import {
  bestBenchmarkSets,
  exerciseBenchmarkForSets,
  normalizedDistanceToNext,
  strengthLevelLabel,
  supportsStrengthLevelBenchmark,
  type BenchmarkTone,
  type ExerciseBenchmark,
} from "@/lib/engines/benchmark";
import { parentDisplayName } from "@/lib/models/muscles";
import { completedBenchmarkSets, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { formatDerivedWeight, formatWeight } from "@/components/progress/utils";

const TONE_COLOR: Record<BenchmarkTone, string> = {
  below: "var(--color-warning)",
  beginner: "var(--color-warning)",
  novice: "#eab308",
  intermediate: "#84cc16",
  advanced: "var(--color-success)",
  elite: "var(--accent)",
};

const MUSCLE_DEFICIT_COLOR = "var(--color-danger)";

interface Insight {
  key: string;
  text: string;
  color: string;
}

/**
 * Meilleur set normal repère (warmup/finisher exclus) dans la séance la plus récente où
 * l'exercice a été loggé. Pour un standard en reps, le set au plus grand nombre de reps gagne ;
 * pour un standard en charge, on utilise l'e1RM StrengthLevel.
 */
function latestBenchmarkSets(history: WorkoutSession[], exercise: Exercise) {
  const finished = history.filter((s) => !s.isActive).slice().sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const session of finished) {
    const sets = session.exercises.filter((e) => e.exerciseId === exercise.id).flatMap((e) => completedBenchmarkSets(e));
    const best = bestBenchmarkSets(exercise, sets);
    if (best.load || best.reps) return sets;
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
  const settings = useWorkoutStore((s) => s.settings);

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
      .filter(supportsStrengthLevelBenchmark)
      .map((exercise) => {
        const latestSets = latestBenchmarkSets(history, exercise);
        if (latestSets == null) return null;
        const benchmark = exerciseBenchmarkForSets(exercise, latestSets, settings);
        if (!benchmark.hasBenchmark || !benchmark.level || benchmark.position == null) return null;
        const normalizedDistance = normalizedDistanceToNext({
          position: benchmark.position,
          nextLevel: benchmark.nextLevel,
        });
        return { exercise, benchmark, normalizedDistance };
      })
      .filter(
        (e): e is { exercise: Exercise; benchmark: ExerciseBenchmark; normalizedDistance: number | null } =>
          e !== null
      );

    if (entries.length === 0) return [];

    const notYetElite = entries.filter(
      (e): e is typeof e & { normalizedDistance: number } => e.normalizedDistance !== null
    );
    const insights: Insight[] = [];

    if (notYetElite.length > 0) {
      const closest = notYetElite.reduce((best, cur) =>
        cur.normalizedDistance < best.normalizedDistance ? cur : best
      );
      const tone = closest.benchmark.level!.tone;
      const axis = closest.benchmark.primaryAxis!;
      const current =
        axis === "load"
          ? `e1RM estimé ${formatDerivedWeight(closest.benchmark.currentE1RM, 0.1)}kg`
          : `${formatWeight(closest.benchmark.currentE1RM)} reps`;
      const gap =
        axis === "load"
          ? `${formatDerivedWeight(closest.benchmark.gapToNext!, 0.1)}kg`
          : `${formatWeight(closest.benchmark.gapToNext!)} reps`;
      const text = `${closest.exercise.name} : ${current}, encore ${gap} → ${strengthLevelLabel(closest.benchmark.nextLevel!).toLowerCase()}`;
      insights.push({ key: `bench-closest-${closest.exercise.id}`, text, color: TONE_COLOR[tone] });

      // Conserve le second signal historique de l'encart (le repère le plus éloigné), mais
      // choisit lui aussi sur la distance de jauge sans unité : jamais 1 rep comparée à 1 kg.
      const otherEntries = notYetElite.filter((entry) => entry.exercise.id !== closest.exercise.id);
      if (otherEntries.length > 0) {
        const farthest = otherEntries.reduce((worst, cur) =>
          cur.normalizedDistance > worst.normalizedDistance ? cur : worst
        );
        const farthestTone = farthest.benchmark.level!.tone;
        const farthestAxis = farthest.benchmark.primaryAxis!;
        const farthestCurrent =
          farthestAxis === "load"
            ? `e1RM estimé ${formatDerivedWeight(farthest.benchmark.currentE1RM, 0.1)}kg`
            : `${formatWeight(farthest.benchmark.currentE1RM)} reps`;
        const farthestGap =
          farthestAxis === "load"
            ? `${formatDerivedWeight(farthest.benchmark.gapToNext!, 0.1)}kg`
            : `${formatWeight(farthest.benchmark.gapToNext!)} reps`;
        insights.push({
          key: `bench-farthest-${farthest.exercise.id}`,
          text: `${farthest.exercise.name} : ${farthestCurrent}, encore ${farthestGap} → ${strengthLevelLabel(farthest.benchmark.nextLevel!).toLowerCase()}`,
          color: TONE_COLOR[farthestTone],
        });
      }
    }

    return insights.slice(0, 2);
  }, [history, catalog, settings]);

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
