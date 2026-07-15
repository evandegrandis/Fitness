"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { completedWorkSets, type WorkoutSession } from "@/lib/models/types";

function durationLabel(session: WorkoutSession): string | null {
  if (!session.endTime) return null;
  const minutes = Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/** En-tête du détail de séance : jour + heure + sets + durée. */
export function SessionDetailHeader({ session }: { session: WorkoutSession }) {
  const totalSets = session.exercises.reduce((acc, e) => acc + completedWorkSets(e).length, 0);
  const duration = durationLabel(session);

  return (
    <div className="glass glass-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
        {format(session.date, "EEEE d MMMM yyyy", { locale: fr })}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-[--color-fg]">
        {format(session.startTime, "HH:mm")}
        {session.endTime && ` – ${format(session.endTime, "HH:mm")}`}
      </p>
      <p className="mt-1.5 text-sm text-[--color-fg-muted]">
        {totalSets} sets{duration ? ` · ${duration}` : ""} · {session.exercises.length} exercice
        {session.exercises.length > 1 ? "s" : ""}
      </p>
      {session.templateName && (
        <span className="pill mt-2 inline-flex bg-white/8">{session.templateName}</span>
      )}
    </div>
  );
}
