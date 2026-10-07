"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Star, Trophy } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { useWorkoutStore } from "@/lib/store/workout";
import {
  exercisesSummary,
  exerciseStats,
  isCurrentGym,
  recordEvents,
  type ExerciseStat,
  type ExerciseStatus,
} from "@/lib/engines/progress-stats";
import { exerciseBenchmarkForSets } from "@/lib/engines/benchmark";
import type { UserSettings, WorkoutSession } from "@/lib/models/types";
import { cleanWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExerciseLineChart, type ExercisePoint } from "@/components/progress/ExerciseLineChart";
import { BenchmarkGauge } from "@/components/progress/BenchmarkGauge";
import { MissingMusclesNotice } from "@/components/exercise/MissingMusclesNotice";
import { ExerciseRecords } from "@/components/progress/ExerciseRecords";
import { exerciseRecordSheet } from "@/lib/engines/exercise-records";
import type { RecordEvent } from "@/lib/engines/progress-stats";

const GOLD = "var(--color-warning)";
const DAY_MS = 86_400_000;

type Filter = "all" | "progress" | "plateau" | "new" | "decline";

const STATUS_STYLE: Record<ExerciseStatus, { color: string; label: (stat: ExerciseStat, now: Date) => string }> = {
  progress: { color: "var(--color-success)", label: (stat) => `+${Math.round((stat.delta ?? 0) * 100)} %` },
  decline: { color: "var(--color-danger)", label: (stat) => `−${Math.abs(Math.round((stat.delta ?? 0) * 100))} %` },
  stable: { color: "var(--color-fg-muted)", label: () => "Stable" },
  plateau: { color: GOLD, label: () => "Plateau" },
  maxed: { color: GOLD, label: () => "Maxée" },
  new: { color: "var(--accent)", label: () => "Étalonnage" },
  young: { color: "var(--color-fg-muted)", label: (stat) => `${stat.points.length} séances` },
  dormant: {
    color: "var(--color-fg-faint)",
    label: (stat, now) => `Pause · ${Math.floor((now.getTime() - stat.lastDate.getTime()) / (7 * DAY_MS))} sem`,
  },
};

/** En jours de calendrier : une séance d'avant-hier soir n'est pas « hier » le surlendemain à midi. */
function relativeDay(date: Date, now: Date): string {
  const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(date)) / DAY_MS);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 14) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / 7)} sem`;
}

function bestSetLabel(stat: ExerciseStat): string {
  const last = stat.points.at(-1)!;
  return last.weight > 0 ? `${cleanWeight(last.weight)} kg × ${last.reps}` : `PDC × ${last.reps}`;
}

/**
 * Onglet « Exercices » : la vue micro. Une carte par mouvement (machines équivalentes fusionnées,
 * vues depuis la machine du moment), sa courbe de capacité, un statut qui dit vraiment quelque
 * chose, et ses records. Les machines de l'ancienne salle se rangent à part.
 */
export function ExercisesLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const settings = useWorkoutStore((s) => s.settings);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const now = useMemo(() => new Date(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [showOld, setShowOld] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const bodyweightKg = useMemo(() => {
    const latest = [...bodyWeights].sort((a, b) => b.measuredOn.getTime() - a.measuredOn.getTime())[0];
    return latest?.weightKg ?? settings.bodyWeightKg ?? null;
  }, [bodyWeights, settings.bodyWeightKg]);
  const events = useMemo(() => recordEvents(history, catalog), [history, catalog]);
  const stats = useMemo(() => exerciseStats(history, catalog, now, bodyweightKg, events), [history, catalog, now, bodyweightKg, events]);
  const summary = useMemo(() => exercisesSummary(stats, events, now), [stats, events, now]);

  const current = stats.filter((stat) => isCurrentGym(stat, now));
  const old = stats.filter((stat) => !isCurrentGym(stat, now));
  const matches = (stat: ExerciseStat) =>
    filter === "all" ||
    stat.status === filter ||
    (filter === "plateau" && stat.status === "maxed");
  const visible = current.filter(matches);
  const declines = current.filter((stat) => stat.status === "decline").length;

  if (stats.length === 0) {
    return (
      <GlassCard className="py-8 text-center">
        <p className="text-sm text-(--color-fg-muted)">Aucun historique d&apos;exercice pour l&apos;instant.</p>
      </GlassCard>
    );
  }

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "Tous", count: current.length },
    { value: "progress", label: "En progrès", count: summary.progressing },
    { value: "plateau", label: "Plateaux", count: summary.plateaus + summary.maxed },
    { value: "new", label: "Étalonnage", count: summary.newMachines },
    { value: "decline", label: "En baisse", count: declines },
  ];

  return (
    <div className="space-y-3">
      <GlassCard strong>
        <div className="grid grid-cols-3 gap-2">
          <Headline value={summary.recentRecords} label="records · 30 j" icon={<Star size={13} fill={GOLD} style={{ color: GOLD }} />} />
          <Headline value={summary.progressing} label="en progrès" icon={<ArrowUpRight size={14} style={{ color: "var(--color-success)" }} />} />
          <Headline
            value={summary.withMaxLoad > 0 ? `${summary.maxed}/${summary.withMaxLoad}` : summary.maxed}
            label="maxées"
            icon={<Trophy size={13} style={{ color: GOLD }} />}
          />
        </div>
      </GlassCard>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters
          .filter((option) => option.value === "all" || option.count > 0)
          .map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn("pill shrink-0 transition active:scale-95", filter === option.value && "!border-(--color-fg) !text-(--color-fg)")}
            >
              {option.label} <span className="tnum">{option.count}</span>
            </button>
          ))}
      </div>

      {visible.map((stat) => (
        <ExerciseRow
          key={stat.exercise.id}
          stat={stat}
          now={now}
          history={history}
          settings={settings}
          events={events}
          expanded={expanded === stat.exercise.id}
          onToggle={() => setExpanded((cur) => (cur === stat.exercise.id ? null : stat.exercise.id))}
        />
      ))}
      {visible.length === 0 && <p className="py-4 text-center text-xs text-(--color-fg-faint)">Rien dans ce filtre.</p>}

      {old.length > 0 && filter === "all" && (
        <>
          <button
            type="button"
            onClick={() => setShowOld((value) => !value)}
            className="flex w-full items-center justify-center gap-1.5 py-2 text-[0.72rem] text-(--color-fg-muted)"
          >
            {showOld ? "Masquer" : "Voir"} les {old.length} exercices en pause
            <ChevronDown size={13} className={cn("transition-transform", showOld && "rotate-180")} />
          </button>
          {showOld &&
            old.map((stat) => (
              <ExerciseRow
                key={stat.exercise.id}
                stat={stat}
                now={now}
                history={history}
                settings={settings}
                events={events}
                expanded={expanded === stat.exercise.id}
                onToggle={() => setExpanded((cur) => (cur === stat.exercise.id ? null : stat.exercise.id))}
              />
            ))}
        </>
      )}
    </div>
  );
}

function Headline({ value, label, icon }: { value: number | string; label: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="tnum flex items-center gap-1 text-xl font-bold text-(--color-fg)">
        {icon}
        {value}
      </p>
      <p className="eyebrow mt-0.5 !text-[0.56rem] !tracking-[0.1em]">{label}</p>
    </div>
  );
}

/** Courbe de capacité miniature : points creux = machine équivalente convertie. */
function Sparkline({ stat, color }: { stat: ExerciseStat; color: string }) {
  const points = stat.points.slice(-12);
  const width = 84;
  const height = 26;
  if (points.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-end"><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} /></div>;
  }
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => 3 + (index / (points.length - 1)) * (width - 6);
  const y = (value: number) => 3 + (1 - (value - min) / span) * (height - 6);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      {points.map((point, index) =>
        point.records > 0 || index === points.length - 1 ? (
          <circle
            key={index}
            cx={x(index)}
            cy={y(point.value)}
            r={point.records > 0 ? 2.4 : 2}
            fill={point.convertedFrom ? "var(--bg-top)" : point.records > 0 ? GOLD : color}
            stroke={point.records > 0 ? GOLD : color}
            strokeWidth={1}
          />
        ) : null
      )}
    </svg>
  );
}

function ExerciseRow({
  stat,
  now,
  history,
  settings,
  events,
  expanded,
  onToggle,
}: {
  stat: ExerciseStat;
  now: Date;
  history: WorkoutSession[];
  settings: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">;
  events: readonly RecordEvent[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLE[stat.status];
  const Arrow = stat.status === "progress" ? ArrowUpRight : stat.status === "decline" ? ArrowDownRight : null;
  const sparkColor = stat.status === "progress" ? "var(--color-success)" : stat.status === "dormant" ? "var(--color-fg-faint)" : "var(--accent)";

  return (
    <GlassCard className={cn("overflow-hidden !p-0", stat.status === "dormant" && "opacity-70")}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="block w-full px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[0.92rem] font-semibold text-(--color-fg)">{stat.exercise.name}</p>
          <Sparkline stat={stat} color={sparkColor} />
        </div>
        <div>
          <div className="mt-1 flex items-center gap-2">
            <span className="pill shrink-0 !px-1.5 !py-0.5" style={{ color: style.color, borderColor: "currentColor" }}>
              {Arrow && <Arrow size={11} />}
              {style.label(stat, now)}
            </span>
            <p className="tnum flex min-w-0 items-center gap-2 truncate text-[0.72rem] text-(--color-fg-muted)">
              <span className="text-(--color-fg)">{bestSetLabel(stat)}</span>
              <span className="text-(--color-fg-faint)">{relativeDay(stat.lastDate, now)}</span>
              {stat.records > 0 && (
                <span className="flex items-center gap-0.5" style={{ color: GOLD }}>
                  <Star size={10} fill={GOLD} />
                  {stat.records}
                </span>
              )}
            </p>
          </div>
        </div>
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
            <ExerciseDetail stat={stat} now={now} history={history} settings={settings} events={events} />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

const STATUS_EXPLAINED: Record<ExerciseStatus, (stat: ExerciseStat) => string> = {
  progress: () => "Meilleure des 3 dernières séances contre les 3 d'avant, fatigue de la séance corrigée.",
  decline: () => "Meilleure des 3 dernières séances sous les 3 d'avant, fatigue de la séance corrigée.",
  stable: () => "Ni mieux ni moins bien que les 3 séances d'avant.",
  plateau: () => "Aucun record sur les 4 dernières séances.",
  maxed: (stat) => `Toute la pile (${cleanWeight(stat.maxStatus?.maxLoad ?? 0)} kg) : la progression passe par les reps.`,
  new: () => "Première séance sur cette machine : elle sert de référence, ni record ni comparaison.",
  young: () => "Encore trop peu de séances pour une tendance.",
  dormant: () => "Pas pratiqué depuis 4 semaines : pas de tendance.",
};

function ExerciseDetail({
  stat,
  now,
  history,
  settings,
  events,
}: {
  stat: ExerciseStat;
  now: Date;
  history: WorkoutSession[];
  settings: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">;
  events: readonly RecordEvent[];
}) {
  const { exercise } = stat;
  const ownSets = useMemo(
    () => history.filter((s) => !s.isActive).flatMap((s) => s.exercises).filter((e) => e.exerciseId === exercise.id).flatMap((e) => e.sets),
    [history, exercise.id]
  );
  const benchmark = useMemo(() => exerciseBenchmarkForSets(exercise, ownSets, settings), [exercise, ownSets, settings]);
  const records = useMemo(() => exerciseRecordSheet(exercise, history, events), [exercise, history, events]);
  const chartPoints: ExercisePoint[] = stat.points.map((point) => ({
    date: point.date,
    weight: point.weight,
    reps: point.reps,
    capacity: point.value,
    records: point.records,
    convertedFrom: point.convertedFrom ?? undefined,
  }));
  const max = stat.maxStatus;

  return (
    <div className="space-y-3 border-t border-white/[0.06] px-4 pb-4 pt-3">
      {exercise.muscleMappings.length === 0 && <MissingMusclesNotice exercise={exercise} />}
      <p className="text-[0.7rem] text-(--color-fg-muted)">{STATUS_EXPLAINED[stat.status](stat)}</p>
      {chartPoints.length > 1 && <ExerciseLineChart points={chartPoints} axis={stat.axis} />}
      {stat.conversions.length > 0 && (
        <p className="text-[0.68rem] text-(--color-fg-faint)">
          Points creux : {stat.conversions.map((c) => `${c.exercise.name} × ${c.ratio.toFixed(2).replace(".", ",")}`).join(", ")}, convertis dans les charges de cette machine. Records propres à chaque machine.
        </p>
      )}
      <ExerciseRecords sheet={records} />
      {max && max.maxLoad !== null && (
        <div>
          <div className="flex justify-between text-[0.7rem] text-(--color-fg-muted)">
            <span>Pile de la machine</span>
            <span className="tnum" style={max.maxed ? { color: GOLD } : undefined}>
              {max.maxed ? "maxée" : `${cleanWeight(max.bestLoad)} / ${cleanWeight(max.maxLoad)} kg`}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full" style={{ width: `${Math.round((max.progress ?? 0) * 100)}%`, background: max.maxed ? GOLD : "var(--accent)" }} />
          </div>
        </div>
      )}
      {/* Niveau de force (standards publiés) ; la courbe ci-dessus remplace le repère perso. */}
      {benchmark.hasBenchmark && <BenchmarkGauge benchmark={benchmark} />}
      <p className="tnum text-[0.68rem] text-(--color-fg-faint)">
        {stat.ownSessions} séance{stat.ownSessions > 1 ? "s" : ""} sur cette machine
        {stat.records > 0 && stat.lastRecordDate && ` · ${stat.records} record${stat.records > 1 ? "s" : ""}, le dernier ${relativeDay(stat.lastRecordDate, now)}`}
      </p>
    </div>
  );
}
