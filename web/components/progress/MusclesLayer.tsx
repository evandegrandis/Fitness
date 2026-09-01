"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useWorkoutStore } from "@/lib/store/workout";
import {
  coverageStatusAccent,
  coverageStatusLabel,
  parentTotals,
  weeklyLeafBreakdown,
  weeklyProgress,
  type ParentMuscleProgress,
} from "@/lib/engines/effective-sets";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { leafShortName, parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import { aggregateCoefficient, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { cn } from "@/lib/utils";
import { buildWeekBuckets, type WeekBucket } from "@/components/progress/utils";
import { WeeklyBarChart, type WeekDatum } from "@/components/progress/WeeklyBarChart";
import { ProgressInsights } from "@/components/progress/ProgressInsights";

type SortMode = "deficit" | "completion" | "az";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "deficit", label: "Déficit" },
  { value: "completion", label: "Complétion" },
  { value: "az", label: "A-Z" },
];

/**
 * `--color-cyan` n'existe plus depuis le re-skin monochrome (globals.css) —
 * "onTrack" (bleu) est remappé sur l'accent crème du thème pour rester
 * visible et cohérent avec la palette éditoriale (au lieu de retomber sur
 * la couleur de texte par défaut via une variable CSS inexistante).
 */
const ACCENT_COLOR: Record<string, string> = {
  green: "var(--color-success)",
  blue: "var(--accent)",
  orange: "var(--color-warning)",
  red: "var(--color-danger)",
};

export function MusclesLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const active = useWorkoutStore((s) => s.active);

  const [sort, setSort] = useState<SortMode>("deficit");
  const [expanded, setExpanded] = useState<MuscleParent | null>(null);

  const progress = useMemo(
    () => weeklyProgress(history, catalog, goals, new Date(), active),
    [history, catalog, goals, active]
  );

  const sorted = useMemo(() => {
    const copy = [...progress];
    if (sort === "deficit") {
      copy.sort((a, b) => b.remaining - a.remaining);
    } else if (sort === "completion") {
      copy.sort((a, b) => b.coverage - a.coverage);
    } else {
      copy.sort((a, b) => parentDisplayName[a.parent].localeCompare(parentDisplayName[b.parent], "fr"));
    }
    return copy;
  }, [progress, sort]);

  if (progress.length === 0) {
    return (
      <div>
        <ProgressInsights />
        <GlassCard className="text-center py-8">
          <p className="text-sm text-[--color-fg-muted]">
            Pas encore d&apos;objectifs configurés ou pas assez d&apos;historique.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div>
      <ProgressInsights />
      <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} layoutId="muscles-sort" className="mb-4" />

      <div className="space-y-3">
      {sorted.map((p) => (
        <MuscleCard
          key={p.parent}
          progress={p}
          expanded={expanded === p.parent}
          onToggle={() => setExpanded((cur) => (cur === p.parent ? null : p.parent))}
          history={history}
          catalog={catalog}
          active={active}
        />
      ))}
      </div>
    </div>
  );
}

function MuscleCard({
  progress,
  expanded,
  onToggle,
  history,
  catalog,
  active,
}: {
  progress: ParentMuscleProgress;
  expanded: boolean;
  onToggle: () => void;
  history: WorkoutSession[];
  catalog: Exercise[];
  active: WorkoutSession | null;
}) {
  const accentColor = ACCENT_COLOR[coverageStatusAccent[progress.status]];

  return (
    <GlassCard className="overflow-hidden !p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[--color-fg]">{parentDisplayName[progress.parent]}</p>
            <span
              className="pill"
              style={{ color: accentColor, borderColor: `${accentColor}44`, background: `${accentColor}14` }}
            >
              {coverageStatusLabel[progress.status]}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={progress.coverage} tone={accentColor} className="flex-1" />
            <span className="tnum shrink-0 text-xs text-[--color-fg-muted]">{progress.percentDisplay}%</span>
          </div>
        </div>
        <div className="text-right">
          <p className="tnum text-xl font-bold">{Math.round(progress.effectiveSets * 10) / 10}</p>
          <p className="text-[0.65rem] text-[--color-fg-muted]">
            {progress.remaining > 0 ? `${Math.ceil(progress.remaining)} restants` : "Couvert"}
          </p>
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
            <MuscleDetail parent={progress.parent} history={history} catalog={catalog} active={active} />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function MuscleDetail({
  parent,
  history,
  catalog,
  active,
}: {
  parent: MuscleParent;
  history: WorkoutSession[];
  catalog: Exercise[];
  active: WorkoutSession | null;
}) {
  const leafBreakdown = useMemo(
    () => weeklyLeafBreakdown(history, catalog, parent, new Date(), active),
    [history, catalog, parent, active]
  );
  const maxLeaf = Math.max(1, ...leafBreakdown.map((l) => l.sets));

  const buckets = useMemo(() => buildWeekBuckets(new Date(), 8), []);
  const [selectedKey, setSelectedKey] = useState<string>(buckets[buckets.length - 1]?.label ?? "");

  const weekData: WeekDatum[] = useMemo(
    () =>
      buckets.map((b) => {
        const totals = parentTotals(history, catalog, b.start, b.end);
        return { key: b.label, label: b.label, value: Math.round((totals.get(parent) ?? 0) * 10) / 10 };
      }),
    [buckets, history, catalog, parent]
  );

  const selectedBucket = buckets.find((b) => b.label === selectedKey) ?? buckets[buckets.length - 1];

  const topExercises = useMemo(
    () => topContributingExercises(history, catalog, parent, selectedBucket),
    [history, catalog, parent, selectedBucket]
  );

  return (
    <div className="space-y-4 border-t border-white/8 px-4 pb-4 pt-3">
      {/* Sous-groupes */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-faint]">Sous-groupes (semaine)</p>
        {leafBreakdown
          .filter((l) => l.sets > 0)
          .map((l) => (
            <div key={l.leaf} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-[--color-fg-muted]">{leafShortName[l.leaf]}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(l.sets / maxLeaf) * 100}%`,
                    background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                  }}
                />
              </div>
              <span className="tnum w-8 shrink-0 text-right text-xs text-[--color-fg-muted]">
                {Math.round(l.sets * 10) / 10}
              </span>
            </div>
          ))}
        {leafBreakdown.every((l) => l.sets === 0) && (
          <p className="text-xs text-[--color-fg-faint]">Aucun set sur les 7 derniers jours.</p>
        )}
      </div>

      {/* Historique 8 semaines */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[--color-fg-faint]">
          Historique 8 semaines
        </p>
        <WeeklyBarChart
          data={weekData}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          unit="sets effectifs"
          gradientId={`muscleBar-${parent}`}
        />
      </div>

      {/* Top exercices de la semaine sélectionnée */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-faint]">
          Top exercices — {selectedBucket?.label}
        </p>
        {topExercises.length === 0 ? (
          <p className="text-xs text-[--color-fg-faint]">Aucun exercice cette semaine-là.</p>
        ) : (
          topExercises.map((t, i) => (
            <div key={t.name} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-[--color-fg-muted]">
                <span className="tnum text-xs text-[--color-fg-faint]">{i + 1}</span>
                {t.name}
              </span>
              <span className="tnum text-xs text-[--color-fg]">{Math.round(t.sets * 10) / 10} sets</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function topContributingExercises(
  history: WorkoutSession[],
  catalog: Exercise[],
  parent: MuscleParent,
  bucket: WeekBucket | undefined
): { name: string; sets: number }[] {
  if (!bucket) return [];
  const exerciseIndex = new Map(catalog.map((e) => [e.id, e]));
  const totals = new Map<string, number>();

  const inRange = history.filter((s) => !s.isActive && s.date >= bucket.start && s.date < bucket.end);
  for (const session of inRange) {
    for (const logged of session.exercises) {
      const exercise = exerciseIndex.get(logged.exerciseId);
      if (!exercise) continue;
      const coeff = aggregateCoefficient(exercise, parent);
      if (coeff <= 0) continue;
      const completed = physiologicalSetUnits(logged.sets, {
        increment: exercise.smallestIncrement,
      });
      if (completed <= 0) continue;
      const key = logged.exerciseName;
      totals.set(key, (totals.get(key) ?? 0) + completed * coeff);
    }
  }

  return [...totals.entries()]
    .map(([name, sets]) => ({ name, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 5);
}
