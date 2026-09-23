"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useWorkoutStore } from "@/lib/store/workout";
import { estimated1RM } from "@/lib/engines/e1rm";
import { buildRecords } from "@/lib/engines/records";
import { defaultEquivalent, equivalenceKey, familyHistory } from "@/lib/engines/equivalence";
import {
  benchmarkAxesFor,
  benchmarkPrimaryAxisFor,
  bestBenchmarkSets,
  exerciseBenchmarkForSets,
  personalProgress as computePersonalProgress,
} from "@/lib/engines/benchmark";
import { completedBenchmarkSets, type Exercise, type UserSettings, type WorkoutSession } from "@/lib/models/types";
import { cn } from "@/lib/utils";
import { formatWeight, formatDerivedWeight } from "@/components/progress/utils";
import { ExerciseLineChart, type ExercisePoint } from "@/components/progress/ExerciseLineChart";
import { BenchmarkGauge } from "@/components/progress/BenchmarkGauge";
import { MissingMusclesNotice } from "@/components/exercise/MissingMusclesNotice";
import { exerciseProgressAxis, trendBadge } from "@/components/progress/trend";

type SortMode = "recent" | "az";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Récents" },
  { value: "az", label: "A-Z" },
];

interface ExerciseHistory {
  exercise: Exercise;
  points: ExercisePoint[];
  lastDate: Date;
  /** Machines équivalentes dont les séances, converties, prolongent la courbe. */
  conversions: { exercise: Exercise; ratio: number }[];
}

/**
 * Meilleur set normal de la séance pour le chemin benchmark/niveau (finishers et warmups exclus).
 * Le classement suit l'axe réellement publié : reps brutes ou e1RM de charge.
 */
function bestSetOfSession(session: WorkoutSession, exercise: Exercise) {
  const sets = session.exercises.filter((e) => e.exerciseId === exercise.id).flatMap((e) => completedBenchmarkSets(e));
  const best = bestBenchmarkSets(exercise, sets);
  const axes = benchmarkAxesFor(exercise);
  for (const axis of axes) {
    if (best[axis]) return best[axis];
  }
  return axes.length === 0 ? best.load ?? best.reps : null;
}

export function ExercisesLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const settings = useWorkoutStore((s) => s.settings);

  const [sort, setSort] = useState<SortMode>("recent");
  const [expanded, setExpanded] = useState<string | null>(null);

  const exerciseHistories = useMemo<ExerciseHistory[]>(() => {
    const finished = history.filter((s) => !s.isActive).slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const byExercise = new Map<string, ExerciseHistory>();

    // Machines équivalentes : une seule courbe par mouvement, tracée dans les unités de la machine
    // utilisée en dernier. Les séances des autres machines y entrent converties, tant que leur
    // facteur a pu être mesuré ; sinon elles gardent leur propre carte.
    const absorbed = new Set<string>();
    const families = new Map<string, ReturnType<typeof familyHistory>>();
    const seenKeys = new Set<string>();
    for (const exercise of catalog) {
      const key = equivalenceKey(exercise);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const target = defaultEquivalent(exercise, catalog, finished);
      const family = familyHistory(target, catalog, finished);
      if (family.conversions.length === 0) continue;
      families.set(target.id, family);
      for (const conversion of family.conversions) absorbed.add(conversion.exercise.id);
    }

    const addPoint = (session: WorkoutSession, exercise: Exercise, conversions: ExerciseHistory["conversions"]) => {
      const best = bestSetOfSession(session, exercise);
      if (!best) return;
      const occurrences = session.exercises.filter((e) => e.exerciseId === exercise.id);
      const convertedFrom = occurrences.every((e) => e.id.endsWith(`~${exercise.id}`))
        ? occurrences[0]?.exerciseName
        : undefined;
      const entry = byExercise.get(exercise.id) ?? { exercise, points: [], lastDate: session.date, conversions };
      entry.points.push({
        date: session.date,
        weight: best.weight,
        reps: best.reps,
        e1rm: estimated1RM(best.weight, best.reps),
        convertedFrom,
      });
      entry.lastDate = session.date;
      byExercise.set(exercise.id, entry);
    };

    for (const session of finished) {
      const exerciseIdsInSession = new Set(session.exercises.map((e) => e.exerciseId));
      for (const exerciseId of exerciseIdsInSession) {
        if (absorbed.has(exerciseId) || families.has(exerciseId)) continue;
        const exercise = catalog.find((e) => e.id === exerciseId);
        if (!exercise) continue;
        addPoint(session, exercise, []);
      }
    }
    for (const [targetId, family] of families) {
      const target = catalog.find((e) => e.id === targetId);
      if (!target) continue;
      const ordered = family.history
        .filter((s) => !s.isActive)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const session of ordered) {
        if (session.exercises.some((e) => e.exerciseId === targetId)) addPoint(session, target, family.conversions);
      }
    }

    return [...byExercise.values()].map((entry) => {
      const axes = benchmarkAxesFor(entry.exercise);
      const comparablePoints =
        axes.length === 2 && entry.points.some((point) => point.weight > 0)
          ? entry.points.filter((point) => point.weight > 0)
          : entry.points;
      return {
        ...entry,
        points: comparablePoints,
        lastDate: comparablePoints.at(-1)?.date ?? entry.lastDate,
      };
    });
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
          benchmarkProfile={settings}
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
  benchmarkProfile,
}: {
  entry: ExerciseHistory;
  expanded: boolean;
  onToggle: () => void;
  history: WorkoutSession[];
  benchmarkProfile: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">;
}) {
  const { exercise, points } = entry;
  const last = points[points.length - 1];
  const increment = exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 0.5;
  const publishedAxes = benchmarkAxesFor(exercise);
  const primaryAxis = exerciseProgressAxis(
    points,
    publishedAxes.length === 1 ? benchmarkPrimaryAxisFor(exercise) : null
  );

  const historicalSets = useMemo(
    () =>
      history
        .filter((s) => !s.isActive)
        .flatMap((s) => s.exercises)
        .filter((e) => e.exerciseId === exercise.id)
        .flatMap((e) => e.sets),
    [history, exercise]
  );

  const benchmark = useMemo(
    () => exerciseBenchmarkForSets(exercise, historicalSets, benchmarkProfile),
    [exercise, historicalSets, benchmarkProfile]
  );

  const records = useMemo(() => buildRecords(exercise, historicalSets), [historicalSets, exercise]);

  /**
   * BENCHMARK_LEVEL_SPEC.md §2 (P3.2) — introduit "les deux" pour les machines (`isMachine`).
   * OFFLINE_PWA_SPEC §5 (P4.5) — élargi : calculé pour TOUT exercice (plus seulement les machines),
   * `personalProgress()` étant déjà une pure lecture de `historicalSets` qui dégrade gracieusement
   * (`hasData:false`) s'il n'y a pas assez d'historique chargé — aucun changement de signature ni
   * de coût de calcul significatif, juste un gate en moins. `BenchmarkGauge` décide ensuite QUAND
   * l'afficher (jauge StrengthLevel gated sur `hasBenchmark`, ce marqueur non).
   */
  const personalProgress = useMemo(
    () => computePersonalProgress(exercise, historicalSets),
    [exercise, historicalSets]
  );

  const trend = useMemo(
    () => trendBadge(points.map((p) => ({ date: p.date, value: primaryAxis === "reps" ? p.reps : p.weight }))),
    [points, primaryAxis]
  );

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
              Dernier <span className="tnum ml-1 text-[--color-fg]">{formatPerformance(last, primaryAxis)}</span>
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
              {exercise.muscleMappings.length === 0 && <MissingMusclesNotice exercise={exercise} />}
              <ExerciseLineChart
                points={points}
                primaryAxis={primaryAxis}
                showReps={primaryAxis === "load" && points.length > 1}
                smallestIncrement={increment}
              />
              {entry.conversions.length > 0 && (
                <p className="text-xs text-[--color-fg-faint]">
                  Points creux : {entry.conversions
                    .map((c) => `${c.exercise.name} × ${c.ratio.toFixed(2).replace(".", ",")}`)
                    .join(", ")}, convertis dans les charges de cette machine (fatigue corrigée). Records propres à chaque machine.
                </p>
              )}
              {/* OFFLINE_PWA_SPEC §5 (P4.5) — avant ce lot : gate `benchmark.hasBenchmark` seul, donc
                  un exercice sans standard fiable n'affichait RIEN (même avec de l'historique
                  exploitable pour la progression perso). `BenchmarkGauge` gère maintenant lui-même
                  le détail (jauge StrengthLevel gated sur hasBenchmark, progression perso non) —
                  ce gate d'appel élargi évite juste de monter le composant quand il n'a RIEN à
                  montrer dans les deux cas. */}
              {(benchmark.hasBenchmark || personalProgress.hasData) && (
                <BenchmarkGauge benchmark={benchmark} personalProgress={personalProgress} />
              )}
              <p className="text-xs text-[--color-fg-faint]">
                Dernière séance : {formatPerformance(last, primaryAxis)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function formatPerformance(point: Pick<ExercisePoint, "weight" | "reps">, axis: "load" | "reps"): string {
  if (axis === "reps" && point.weight <= 0) return `PDC × ${point.reps} reps`;
  return `${formatWeight(point.weight)}kg × ${point.reps} reps`;
}

/** "il y a 8 sem" / "cette semaine" — contexte temporel d'un record ancien. */
function weeksAgoLabel(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const weeks = Math.floor(days / 7);
  if (weeks <= 0) return "cette semaine";
  return `il y a ${weeks} sem`;
}
