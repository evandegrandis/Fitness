"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Flame, Star, Trophy } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { useWorkoutStore } from "@/lib/store/workout";
import { currentWeekWindow, parentSets, weeklyProgress, weeklyTrackedVolume } from "@/lib/engines/effective-sets";
import { weekSessionPlan } from "@/lib/engines/session-focus";
import {
  isBehindPace,
  nextWeekTier,
  PROGRESS_STATS,
  recordEvents,
  weekStreak,
  setsToNextTier,
  WEEK_TIERS,
  weekPace,
  weekStats,
  weekTier,
  type WeekStat,
} from "@/lib/engines/progress-stats";
import { NO_TIER_COLOR, TIER_COLORS, TIER_LABELS } from "@/lib/theme/tiers";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { parentDisplayName, parentShortName, type MuscleParent } from "@/lib/models/muscles";
import { sessionsNewestFirst, type Exercise, type WorkoutSession } from "@/lib/models/types";
import { formatDecimal } from "@/lib/format";

const GOLD = "var(--color-warning)";
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const dayMonth = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;
const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * Onglet « Semaine » : la vue macro. Où en est la semaine (score, rythme, série de semaines),
 * quels muscles sont en retard sur le rythme, et comment les semaines se suivent.
 */
export function WeekLayer() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const active = useWorkoutStore((s) => s.active);
  const now = useMemo(() => new Date(), []);

  const events = useMemo(() => recordEvents(history, catalog), [history, catalog]);
  const weeks = useMemo(
    () => weekStats(history, catalog, goals, now, PROGRESS_STATS.WEEKS_FOR_STREAK, events),
    [history, catalog, goals, now, events]
  );
  const streak = useMemo(() => weekStreak(weeks), [weeks]);
  const shown = weeks.slice(-PROGRESS_STATS.WEEKS_SHOWN);
  const best = weeks.find((week) => week.best) ?? null;

  const rows = useMemo(() => weeklyProgress(history, catalog, goals, now, active), [history, catalog, goals, now, active]);
  const plan = useMemo(() => weekSessionPlan(history, now), [history, now]);
  const sessionsDone = plan.sessionsDoneThisWeek + (active ? 1 : 0);
  const pace = weekPace(sessionsDone, plan.habitualSessionsPerWeek);

  const goalRows = rows.filter((row) => row.goalSets > 0);
  const goalTotal = goalRows.reduce((sum, row) => sum + row.goalSets, 0);
  const score = goalTotal > 0 ? goalRows.reduce((sum, row) => sum + Math.min(row.effectiveSets, row.goalSets), 0) / goalTotal : 0;
  const recordsThisWeek = shown.at(-1)?.records ?? 0;
  const setsThisWeek = shown.at(-1)?.sets ?? 0;

  const untracked = useMemo(() => {
    const noGoal = rows.filter((row) => row.goalSets <= 0 && row.effectiveSets > 0).map((row) => ({ parent: row.parent, sets: row.effectiveSets }));
    const tracked = weeklyTrackedVolume(history, catalog, now, active).map((row) => ({ parent: row.parent, sets: row.effectiveSets }));
    return [...noGoal, ...tracked].sort((a, b) => b.sets - a.sets);
  }, [rows, history, catalog, now, active]);

  return (
    <div className="space-y-3">
      <WeekHero
        score={score}
        goalTotal={goalTotal}
        sets={setsThisWeek}
        records={recordsThisWeek}
        streak={streak}
        best={best}
        weekStart={currentWeekWindow(now).start}
      />
      <MuscleBoard
        rows={goalRows}
        pace={pace}
        untracked={untracked}
        history={history}
        catalog={catalog}
        active={active}
        now={now}
      />
      <WeeksHistory weeks={shown} history={history} catalog={catalog} events={events} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// En-tête : score, rythme, série
// ---------------------------------------------------------------------------

function WeekHero({
  score,
  goalTotal,
  sets,
  records,
  streak,
  best,
  weekStart,
}: {
  score: number;
  goalTotal: number;
  sets: number;
  records: number;
  streak: ReturnType<typeof weekStreak>;
  best: WeekStat | null;
  weekStart: Date;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const tier = weekTier(score);
  const next = nextWeekTier(score);
  const missingSets = setsToNextTier(score, goalTotal);
  const ringColor = tier ? TIER_COLORS[tier] : "var(--accent)";
  const newBest = best !== null && score > best.score;

  return (
    <GlassCard strong>
      <p className="eyebrow">Semaine du {dayMonth(weekStart)}</p>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative grid h-[84px] w-[84px] shrink-0 place-items-center">
          <svg viewBox="0 0 84 84" className="h-full w-full">
            <circle cx="42" cy="42" r={radius} fill="none" stroke="rgba(236,230,216,0.08)" strokeWidth="7" />
            <motion.circle
              cx="42"
              cy="42"
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              transform="rotate(-90 42 42)"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * (1 - Math.min(1, score)), stroke: ringColor }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
            {/* Les seuils des paliers : une fine entaille dans l'anneau, sans légende. */}
            {WEEK_TIERS.map((entry) => {
              const angle = entry.min * 2 * Math.PI - Math.PI / 2;
              return (
                <line
                  key={entry.tier}
                  x1={42 + (radius - 4.5) * Math.cos(angle)}
                  y1={42 + (radius - 4.5) * Math.sin(angle)}
                  x2={42 + (radius + 4.5) * Math.cos(angle)}
                  y2={42 + (radius + 4.5) * Math.sin(angle)}
                  stroke="rgba(11,11,12,0.92)"
                  strokeWidth="1.6"
                />
              );
            })}
          </svg>
          <span className="tnum absolute text-lg font-bold text-(--color-fg)">
            {Math.round(score * 100)}
            <span className="text-[0.6rem] font-normal text-(--color-fg-muted)"> %</span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Un fondu à chaque changement de palier, sans attendre la sortie de l'ancien titre :
              une sortie suspendue (app en arrière-plan) ne doit jamais laisser le titre vide. */}
          <motion.p
            key={tier ?? "aucun"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="font-display text-lg font-semibold leading-tight"
            style={{ color: tier ? TIER_COLORS[tier] : "var(--color-fg)" }}
          >
            {tier ? `Semaine ${TIER_LABELS[tier]}` : "Vers le bronze"}
          </motion.p>
          <p className="tnum mt-1 text-[0.72rem] leading-snug text-(--color-fg-muted)">
            {next && missingSets !== null
              ? `${next.label} à ${Math.round(next.min * 100)} % · encore ${missingSets} série${missingSets > 1 ? "s" : ""}`
              : "Le plus haut palier de la semaine"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
        <HeroStat label="Séries" value={formatDecimal(sets)} />
        <HeroStat label="Records" value={String(records)} icon={records > 0 ? <Star size={11} style={{ color: GOLD }} fill={GOLD} /> : null} />
        <HeroStat
          label="D'affilée"
          value={`${streak.capped ? `${streak.weeks}+` : streak.weeks} sem.`}
          icon={streak.weeks > 0 ? <Flame size={11} style={{ color: streak.currentCounted ? "var(--accent)" : "var(--color-fg-faint)" }} /> : null}
          muted={!streak.currentCounted}
        />
      </div>

      {best && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-(--color-fg-faint)">
          <Trophy size={12} style={{ color: best.tier ? TIER_COLORS[best.tier] : GOLD }} />
          {newBest
            ? `Nouvelle meilleure semaine, au-dessus des ${percent(best.score)} du ${dayMonth(best.start)}`
            : `Meilleure semaine : ${percent(best.score)} (${dayMonth(best.start)})`}
        </p>
      )}
    </GlassCard>
  );
}

function HeroStat({ label, value, icon, muted }: { label: string; value: string; icon?: React.ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow !text-[0.58rem]">{label}</p>
      <p className={`tnum mt-0.5 flex items-center gap-1 truncate text-sm ${muted ? "text-(--color-fg-muted)" : "text-(--color-fg)"}`}>
        {icon}
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Muscles : une ligne par objectif, le trait du rythme
// ---------------------------------------------------------------------------

type GoalRow = ReturnType<typeof weeklyProgress>[number];

function MuscleBoard({
  rows,
  pace,
  untracked,
  history,
  catalog,
  active,
  now,
}: {
  rows: GoalRow[];
  pace: number;
  untracked: { parent: MuscleParent; sets: number }[];
  history: WorkoutSession[];
  catalog: Exercise[];
  active: WorkoutSession | null;
  now: Date;
}) {
  const [open, setOpen] = useState<MuscleParent | null>(null);
  // Le plus en retard sur le rythme d'abord ; les objectifs atteints à la fin.
  const sorted = [...rows].sort((a, b) => {
    const gap = (row: GoalRow) => (row.effectiveSets >= row.goalSets ? Infinity : row.effectiveSets / row.goalSets - pace);
    return gap(a) - gap(b);
  });
  const met = rows.filter((row) => row.effectiveSets >= row.goalSets - 1e-9).length;
  const behind = rows.filter((row) => isBehindPace(row.effectiveSets, row.goalSets, pace)).length;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Muscles</p>
        <p className="tnum text-[0.68rem] text-(--color-fg-faint)">
          {met}/{rows.length} atteints{behind > 0 ? ` · ${behind} en retard` : ""}
        </p>
      </div>
      <div className="mt-2">
        {sorted.map((row, index) => (
          <MuscleRow
            key={row.parent}
            row={row}
            pace={pace}
            isLast={index === sorted.length - 1}
            open={open === row.parent}
            onToggle={() => setOpen((current) => (current === row.parent ? null : row.parent))}
            history={history}
            catalog={catalog}
            active={active}
            now={now}
          />
        ))}
      </div>
      {untracked.length > 0 && (
        <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[0.68rem] leading-relaxed text-(--color-fg-faint)">
          <span className="eyebrow !text-[0.58rem]">Sans objectif</span>{" "}
          {untracked.map((row) => `${parentShortName[row.parent]} ${formatDecimal(row.sets)}`).join(" · ")}
        </p>
      )}
    </GlassCard>
  );
}

function MuscleRow({
  row,
  pace,
  isLast,
  open,
  onToggle,
  history,
  catalog,
  active,
  now,
}: {
  row: GoalRow;
  pace: number;
  isLast: boolean;
  open: boolean;
  onToggle: () => void;
  history: WorkoutSession[];
  catalog: Exercise[];
  active: WorkoutSession | null;
  now: Date;
}) {
  const done = row.effectiveSets >= row.goalSets - 1e-9;
  const behind = isBehindPace(row.effectiveSets, row.goalSets, pace);
  // Or = records et meilleures semaines ; le retard se lit au trait du rythme, pas à une couleur d'alerte.
  const fill = done ? "var(--color-success)" : "var(--accent)";
  const width = Math.min(100, (row.effectiveSets / row.goalSets) * 100);

  return (
    <div className={isLast ? "" : "border-b border-white/[0.06]"}>
      <button type="button" onClick={onToggle} className="w-full py-2.5 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[0.8rem] text-(--color-fg)">
            {parentDisplayName[row.parent]}
            {done && <Check size={12} style={{ color: "var(--color-success)" }} />}
          </span>
          <span className="tnum text-[0.72rem] text-(--color-fg-muted)">
            <span className="text-(--color-fg)">{formatDecimal(row.effectiveSets)}</span> / {row.goalSets}
          </span>
        </div>
        <div className="relative mt-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: fill, opacity: behind ? 0.55 : 1 }}
              initial={{ width: 0 }}
              animate={{ width: `${width}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          {!done && pace > 0 && pace < 1 && (
            <span
              aria-hidden
              className="absolute -top-[3px] h-3 w-[2px] -translate-x-1/2 rounded-full"
              style={{ left: `${pace * 100}%`, background: "var(--color-fg)" }}
            />
          )}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <MuscleContributions parent={row.parent} remaining={row.remaining} history={history} catalog={catalog} active={active} now={now} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Ce qui a nourri le muscle cette semaine, exercice par exercice. */
function MuscleContributions({
  parent,
  remaining,
  history,
  catalog,
  active,
  now,
}: {
  parent: MuscleParent;
  remaining: number;
  history: WorkoutSession[];
  catalog: Exercise[];
  active: WorkoutSession | null;
  now: Date;
}) {
  const { start, end } = currentWeekWindow(now);
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const sessions = [...history.filter((s) => !s.isActive), ...(active ? [active] : [])].filter((s) => s.date >= start && s.date < end);
  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const logged of session.exercises) {
      const value = parentSets(logged, byId.get(logged.exerciseId)).get(parent) ?? 0;
      if (value > 0) totals.set(logged.exerciseName, (totals.get(logged.exerciseName) ?? 0) + value);
    }
  }
  const list = [...totals].sort((a, b) => b[1] - a[1]);
  return (
    <div className="pb-3 text-[0.72rem] text-(--color-fg-muted)">
      {list.length === 0 ? (
        <p>Rien cette semaine.</p>
      ) : (
        <ul className="space-y-1">
          {list.map(([name, sets]) => (
            <li key={name} className="flex justify-between gap-2">
              <span className="truncate">{name}</span>
              <span className="tnum shrink-0">{formatDecimal(sets)}</span>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && <p className="mt-1.5 text-(--color-fg-faint)">Reste {formatDecimal(remaining)} série{remaining > 1 ? "s" : ""}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semaines : score, records, et le détail d'une semaine
// ---------------------------------------------------------------------------

function WeeksHistory({
  weeks,
  history,
  catalog,
  events,
}: {
  weeks: WeekStat[];
  history: WorkoutSession[];
  catalog: Exercise[];
  events: ReturnType<typeof recordEvents>;
}) {
  const [selected, setSelected] = useState(weeks.length - 1);
  const week = weeks[selected];
  const completed = weeks.filter((w) => !w.inProgress && w.sessions > 0);
  const average = completed.length > 0 ? completed.reduce((sum, w) => sum + w.score, 0) / completed.length : 0;
  const CHART = 96;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{weeks.length} semaines</p>
        {completed.length > 0 && <p className="tnum text-[0.68rem] text-(--color-fg-faint)">moyenne {percent(average)}</p>}
      </div>

      <div className="relative mt-4" style={{ height: CHART + 30 }}>
        {completed.length > 0 && (
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-white/15"
            style={{ top: 14 + CHART * (1 - average) }}
          />
        )}
        <div className="absolute inset-x-0 top-0 flex items-end gap-[3px]" style={{ height: CHART + 14 }}>
          {weeks.map((w, index) => {
            const color = w.tier ? TIER_COLORS[w.tier] : NO_TIER_COLOR;
            return (
              <button
                key={w.start.toISOString()}
                type="button"
                onClick={() => setSelected(index)}
                className="flex h-full flex-1 flex-col items-center justify-end"
                aria-label={`Semaine du ${dayMonth(w.start)} : ${percent(w.score)}`}
              >
                <span className="tnum mb-0.5 h-3 text-[0.55rem]" style={{ color: GOLD }}>
                  {w.records > 0 ? `★${w.records}` : ""}
                </span>
                <motion.span
                  className="w-full rounded-[3px]"
                  style={{
                    background: color,
                    opacity: selected === index ? 1 : w.inProgress ? 0.45 : 0.7,
                    outline: selected === index ? "1px solid var(--color-fg)" : "none",
                    outlineOffset: 1,
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: Math.max(2, CHART * Math.min(1, w.score)) }}
                  transition={{ duration: 0.4, delay: index * 0.02 }}
                />
              </button>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex gap-[3px]">
          {weeks.map((w, index) => (
            <span key={w.start.toISOString()} className="tnum flex-1 text-center text-[0.52rem] text-(--color-fg-faint)">
              {index % 3 === (weeks.length - 1) % 3 ? `${w.start.getDate()}/${w.start.getMonth() + 1}` : ""}
            </span>
          ))}
        </div>
      </div>

      {week && <WeekDetail week={week} history={history} catalog={catalog} events={events} />}
    </GlassCard>
  );
}

function WeekDetail({
  week,
  history,
  catalog,
  events,
}: {
  week: WeekStat;
  history: WorkoutSession[];
  catalog: Exercise[];
  events: ReturnType<typeof recordEvents>;
}) {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const sessions = sessionsNewestFirst(history.filter((s) => !s.isActive && s.date >= week.start && s.date < week.end)).reverse();

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-(--color-fg)">
          Semaine du {dayMonth(week.start)}
          {week.inProgress && <span className="text-(--color-fg-faint)"> · en cours</span>}
        </p>
        <p className="tnum text-sm" style={{ color: week.tier ? TIER_COLORS[week.tier] : "var(--color-fg)" }}>
          {week.tier && <span className="mr-1.5 text-[0.7rem]">{TIER_LABELS[week.tier]}</span>}
          {percent(week.score)}
        </p>
      </div>
      <p className="tnum mt-1 text-[0.7rem] text-(--color-fg-muted)">
        {formatDecimal(week.sets)} séries · {week.sessions} séance{week.sessions > 1 ? "s" : ""} · {week.records} record{week.records > 1 ? "s" : ""}
      </p>
      {sessions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {sessions.map((session) => {
            const sets = session.exercises.reduce(
              (sum, logged) => sum + physiologicalSetUnits(logged.sets, { increment: byId.get(logged.exerciseId)?.smallestIncrement }),
              0
            );
            const stars = events.filter((event) => event.sessionId === session.id).length;
            return (
              <li key={session.id}>
                <Link
                  href={`/historique/${session.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg py-1 text-[0.72rem] text-(--color-fg-muted) active:opacity-70"
                >
                  <span className="text-(--color-fg)">
                    {DAYS[session.date.getDay()]} {session.date.getDate()}
                  </span>
                  <span className="tnum flex items-center gap-2">
                    {formatDecimal(Math.round(sets * 10) / 10)} séries
                    {stars > 0 && (
                      <span className="flex items-center gap-0.5" style={{ color: GOLD }}>
                        <Star size={10} fill={GOLD} />
                        {stars}
                      </span>
                    )}
                    <ChevronRight size={12} className="text-(--color-fg-faint)" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
