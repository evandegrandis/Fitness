"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { WorkoutSession } from "@/lib/models/types";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { sessionDurationLabel } from "./historyHelpers";

/** En-tête du détail de séance : jour + heure + sets + durée. */
export function SessionDetailHeader({ session }: { session: WorkoutSession }) {
  const totalSets = Math.round(
    session.exercises.reduce((acc, exercise) => acc + physiologicalSetUnits(exercise.sets), 0) * 10
  ) / 10;
  const completedExerciseCount = session.exercises.filter(
    (exercise) => physiologicalSetUnits(exercise.sets) > 0
  ).length;
  const duration = sessionDurationLabel(session);

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
        {totalSets} sets{duration ? ` · ${duration}` : ""} · {completedExerciseCount} exercice
        {completedExerciseCount > 1 ? "s" : ""}
        {(session.cardioEntries?.length ?? 0) > 0 ? ` · ${session.cardioEntries?.length} cardio` : ""}
      </p>
      {session.templateName && (
        <span className="pill mt-2 inline-flex bg-white/8">{session.templateName}</span>
      )}
    </div>
  );
}
