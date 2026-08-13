"use client";

import { format, isSameWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { AnimatePresence } from "framer-motion";
import { coverageForWeek, parentsWorkedInWeek } from "@/lib/engines/effective-sets";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";
import { SessionRow } from "@/components/history/SessionRow";

function weekLabel(weekStart: Date): string {
  if (isSameWeek(weekStart, new Date(), { weekStartsOn: 1 })) return "Cette semaine";
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const start = format(weekStart, sameMonth ? "d" : "d MMM", { locale: fr });
  const end = format(weekEnd, "d MMM", { locale: fr });
  return `${start} – ${end}`;
}

function coverageTone(coverage: number): string {
  if (coverage >= 1) return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (coverage >= 0.7) return "border-sky-400/40 bg-sky-400/10 text-sky-300";
  if (coverage >= 0.4) return "border-amber-400/40 bg-amber-400/10 text-amber-300";
  return "border-rose-400/40 bg-rose-400/10 text-rose-300";
}

/**
 * Groupe hebdomadaire (semaine ISO) : en-tête avec libellé, badge de
 * couverture (`coverageForWeek`) et nombre de parents travaillés
 * (`parentsWorkedInWeek`), suivi des lignes de séance de la semaine.
 */
export function WeekGroup({
  weekStart,
  sessions,
  allSessions,
  exercises,
  goals,
  prCountBySessionId,
  onDeleteSession,
}: {
  weekStart: Date;
  sessions: WorkoutSession[];
  allSessions: WorkoutSession[];
  exercises: Exercise[];
  goals: MuscleGoal[];
  prCountBySessionId: Map<string, number>;
  onDeleteSession: (id: string) => void;
}) {
  const coverage = coverageForWeek(allSessions, exercises, goals, weekStart);
  const parentsWorked = parentsWorkedInWeek(allSessions, exercises, weekStart);
  const pct = Math.round(coverage * 100);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-[--color-fg]">{weekLabel(weekStart)}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-[--color-fg-faint]">{parentsWorked} muscles</span>
          <span className={`pill border ${coverageTone(coverage)}`}>{pct}%</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              exercises={exercises}
              prCount={prCountBySessionId.get(session.id) ?? 0}
              onDelete={onDeleteSession}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
