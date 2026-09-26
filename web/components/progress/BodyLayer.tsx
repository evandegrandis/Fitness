"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { GlassCard } from "@/components/ui/GlassCard";
import { CharacterCard } from "@/components/progress/CharacterCard";
import { StatueCard } from "@/components/progress/StatueCard";
import { WeightTrendCard } from "@/components/progress/WeightTrendCard";
import { useWorkoutStore } from "@/lib/store/workout";
import { CARDIO_GOAL, cardioNudge, cardioProgress } from "@/lib/engines/cardio";
import { currentWeekWindow } from "@/lib/engines/effective-sets";
import { formatDecimal } from "@/lib/format";
import type { RecoveryCheckin, WorkoutSession } from "@/lib/models/types";

const WEEKS = 12;

function cardioMinutes(session: WorkoutSession): number {
  return (session.cardioEntries ?? []).reduce((sum, entry) => sum + entry.durationSeconds, 0) / 60;
}

/**
 * Onglet « Corps » : la statue, la fiche de personnage, puis ce qui se mesure hors de la salle de muscu. Le
 * poids (balance connectée), le cardio de la semaine contre l'objectif, et la récupération de la
 * semaine quand le bilan a été rempli. Aucune corrélation affichée sans assez de données pour en
 * tirer quoi que ce soit.
 */
export function BodyLayer() {
  return (
    <div className="space-y-3">
      <StatueCard />
      <CharacterCard />
      <WeightTrendCard />
      <CardioCard />
      <RecoveryCard />
    </div>
  );
}

function CardioCard() {
  const history = useWorkoutStore((s) => s.history);
  const active = useWorkoutStore((s) => s.active);
  const goal = useWorkoutStore((s) => s.settings.weeklyCardioMinutesGoal) ?? CARDIO_GOAL.DEFAULT_WEEKLY_MINUTES;
  const now = useMemo(() => new Date(), []);
  const progress = useMemo(() => cardioProgress(history, goal, now, active), [history, goal, now, active]);

  const weeks = useMemo(() => {
    const start = currentWeekWindow(now).start;
    return Array.from({ length: WEEKS }, (_, index) => {
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() - 7 * (WEEKS - 1 - index));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const minutes = history
        .filter((s) => !s.isActive && s.date >= weekStart && s.date < weekEnd)
        .reduce((sum, s) => sum + cardioMinutes(s), 0);
      return { start: weekStart, minutes: index === WEEKS - 1 ? progress.minutes : Math.round(minutes) };
    });
  }, [history, now, progress.minutes]);
  const scale = Math.max(goal, ...weeks.map((week) => week.minutes));
  const HEIGHT = 56;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Cardio</p>
        <p className="tnum text-sm text-(--color-fg)">
          {progress.minutes}
          <span className="text-(--color-fg-muted)"> / {goal} min</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${Math.round(progress.ratio * 100)}%`, background: progress.ratio >= 1 ? "var(--color-success)" : "var(--accent)" }} />
      </div>
      <p className="mt-2 text-[0.72rem] text-(--color-fg-muted)">{cardioNudge(progress)}</p>

      <div className="relative mt-3" style={{ height: HEIGHT }}>
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-white/15" style={{ top: HEIGHT * (1 - goal / scale) }} />
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {weeks.map((week, index) => (
            <motion.span
              key={week.start.toISOString()}
              className="flex-1 rounded-[2px]"
              style={{
                background: week.minutes >= goal ? "var(--color-success)" : "var(--accent)",
                opacity: index === WEEKS - 1 ? 1 : 0.5,
              }}
              initial={{ height: 0 }}
              animate={{ height: week.minutes > 0 ? Math.max(2, (HEIGHT * week.minutes) / scale) : 1 }}
              transition={{ duration: 0.4, delay: index * 0.02 }}
            />
          ))}
        </div>
      </div>
      <p className="mt-1 text-[0.6rem] text-(--color-fg-faint)">{WEEKS} semaines · pointillé : objectif</p>
    </GlassCard>
  );
}

function share(checkins: RecoveryCheckin[], pick: (checkin: RecoveryCheckin) => boolean | null): { yes: number; known: number } {
  const known = checkins.filter((checkin) => pick(checkin) !== null);
  return { yes: known.filter((checkin) => pick(checkin) === true).length, known: known.length };
}

function RecoveryCard() {
  const checkins = useWorkoutStore((s) => s.recoveryCheckins);
  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => {
    const { start, end } = currentWeekWindow(now);
    return checkins.filter((checkin) => checkin.date >= start && checkin.date < end);
  }, [checkins, now]);
  if (week.length === 0) return null;

  const creatine = share(week, (c) => c.tookCreatine);
  const protein = share(week, (c) => c.proteinTargetMet);
  const alcohol = share(week, (c) => c.hadAlcohol);
  const sleeps = week.map((c) => c.sleepHours).filter((hours): hours is number => typeof hours === "number" && hours > 0);
  const sleep = sleeps.length > 0 ? sleeps.reduce((sum, hours) => sum + hours, 0) / sleeps.length : null;

  const tiles = [
    creatine.known > 0 && { label: "Créatine", value: `${creatine.yes}/${creatine.known} j` },
    protein.known > 0 && { label: "Protéines", value: `${protein.yes}/${protein.known} j` },
    sleep !== null && { label: "Sommeil", value: `${formatDecimal(sleep)} h` },
    alcohol.known > 0 && { label: "Alcool", value: `${alcohol.yes} j` },
  ].filter(Boolean) as { label: string; value: string }[];
  if (tiles.length === 0) return null;

  return (
    <GlassCard>
      <p className="eyebrow">Récupération · cette semaine</p>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0">
            <p className="tnum truncate text-sm text-(--color-fg)">{tile.value}</p>
            <p className="eyebrow mt-0.5 !text-[0.54rem] !tracking-[0.08em]">{tile.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.6rem] text-(--color-fg-faint)">D&apos;après les bilans remplis après les séances.</p>
    </GlassCard>
  );
}
