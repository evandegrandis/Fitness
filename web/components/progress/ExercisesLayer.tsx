"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useWorkoutStore } from "@/lib/store/workout";
import { estimated1RM } from "@/lib/engines/e1rm";
import { buildRecords } from "@/lib/engines/records";
import { completedWorkSets, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { cn } from "@/lib/utils";
import { formatWeight, formatDerivedWeight } from "@/components/progress/utils";
import { ExerciseLineChart, type ExercisePoint } from "@/components/progress/ExerciseLineChart";
import { trendBadge } from "@/components/progress/trend";

type SortMode = "recent" | "az";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Récents" },
  { value: "az", label: "A-Z" },
];

interface ExerciseHistory {
  exercise: Exercise;
  points: ExercisePoint[];
  lastDate: Date;
}

/** Meilleur set de travail d'un exercice pour une séance : poids le plus haut où reps >= repMin, sinon plus lourd tout court. */
function bestSetOfSession(session: WorkoutSession, exercise: Exercise) {
  const sets = session.exercises
    .filter((e) => e.exerciseId === exercise.id)
    .flatMap((e) => completedWorkSets(e))
    .filter((s) => s.weight > 0);
  if (sets.length === 0) return null;

  const validated = sets.filter((s) => s.reps >= exercise.repTargetMin);
  const pool = validated.length > 0 ? validated : sets;
  return pool.reduce((best, s) => (s.weight > best.weight ? s : best));
}

export function ExercisesLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);

  const [sort, setSort] = useState<SortMode>("recent");
  const [expanded, setExpanded] = useState<string | null>(null);

  const exerciseHistories = useMemo<ExerciseHistory[]>(() => {
    const finished = history.filter((s) => !s.isActive).slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const byExercise = new Map<string, ExerciseHistory>();

    for (const session of finished) {
      const exerciseIdsInSession = new Set(session.exercises.map((e) => e.exerciseId));
      for (const exerciseId of exerciseIdsInSession) {
        const exercise = catalog.find((e) => e.id === exerciseId);
        if (!exercise) continue;
        const best = bestSetOfSession(session, exercise);
        if (!best) continue;

        const entry = byExercise.get(exerciseId) ?? { exercise, points: [], lastDate: session.date };
        entry.points.push({
          date: session.date,
          weight: best.weight,
          reps: best.reps,
          e1rm: estimated1RM(best.weight, best.reps),
        });
        entry.lastDate = session.date;
        byExercise.set(exerciseId, entry);
      }
    }

    return [...byExercise.values()];
  }, [history, catalog]);

  const sorted = useMemo(() => {
    const copy = [...exerciseHistories];
    if (sort === "recent") {
      copy.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
    } else {
      copy.sort((a, b) => a.exercise.name.localeCompare(b.exercise.name, "fr"));
    }
    return copy;
  }, [exerciseHistories, sort]);

  if (sorted.length === 0) {
    return (
      <GlassCard className="text-center py-8">
        <p className="text-sm text-[--color-fg-muted]">Aucun historique d&apos;exercice pour l&apos;instant.</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} layoutId="exercises-sort" />

      {sorted.map((entry) => (
        <ExerciseCardRow
          key={entry.exercise.id}
          entry={entry}
          expanded={expanded === entry.exercise.id}
          onToggle={() => setExpanded((cur) => (cur === entry.exercise.id ? null : entry.exercise.id))}
          history={history}
        />
      ))}
    </div>
  );
}

function ExerciseCardRow({
  entry,
  expanded,
  onToggle,
  history,
}: {
  entry: ExerciseHistory;
  expanded: boolean;
  onToggle: () => void;
  history: WorkoutSession[];
}) {
  const { exercise, points } = entry;
  const last = points[points.length - 1];
  const increment = exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 0.5;

  const historicalSets = useMemo(
    () =>
      history
        .filter((s) => !s.isActive)
        .flatMap((s) => s.exercises)
        .filter((e) => e.exerciseId === exercise.id)
        .flatMap((e) => e.sets),
    [history, exercise]
  );

  const records = useMemo(() => buildRecords(exercise, historicalSets), [historicalSets, exercise]);

  const trend = useMemo(() => trendBadge(points.map((p) => ({ date: p.date, weight: p.weight }))), [points]);

  /** Date du set qui a établi le heaviestEver actuel — pour "record il y a X sem". */
  const heaviestRecordAgeLabel = useMemo(() => {
    if (records.heaviestEver <= 0) return null;
    const matching = historicalSets
      .filter((s) => s.completed && s.weight === records.heaviestEver)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
    if (!matching) return null;
    return weeksAgoLabel(matching.timestamp);
  }, [historicalSets, records.heaviestEver]);

  return (
    <GlassCard className="overflow-hidden !p-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-[--color-fg]">{exercise.name}</p>
            {trend && (
              <span
                className="pill shrink-0"
                style={{
                  color: trend.tone === "up" ? "var(--color-success)" : trend.tone === "down" ? "var(--color-danger)" : "var(--color-fg-muted)",
                }}
              >
                {trend.label}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="pill">
              Dernier <span className="tnum ml-1 text-[--color-fg]">{formatWeight(last.weight)}kg×{last.reps}</span>
            </span>
            {records.bestE1RM > 0 && (
              <span className="pill">
                e1RM <span className="tnum ml-1 text-[--color-fg]">{formatDerivedWeight(records.bestE1RM, increment)}kg</span>
              </span>
            )}
            {records.heaviestEver > 0 && (
              <span className="pill">
                Best <span className="tnum ml-1 text-[--color-fg]">{formatWeight(records.heaviestEver)}kg</span>
                {heaviestRecordAgeLabel && (
                  <span className="ml-1 text-[--color-fg-faint]">· {heaviestRecordAgeLabel}</span>
                )}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-[--color-fg-faint] transition-transform", expanded && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-white/8 px-4 pb-4 pt-3">
              <ExerciseLineChart
                points={points}
                benchmarkLow={exercise.benchmarkLow}
                benchmarkHigh={exercise.benchmarkHigh}
                showReps={points.length > 1}
                smallestIncrement={increment}
              />
              <p className="text-xs text-[--color-fg-faint]">
                Dernière séance : {formatWeight(last.weight)}kg × {last.reps} reps
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

/** "il y a 8 sem" / "cette semaine" — contexte temporel d'un record ancien. */
function weeksAgoLabel(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const weeks = Math.floor(days / 7);
  if (weeks <= 0) return "cette semaine";
  return `il y a ${weeks} sem`;
}
