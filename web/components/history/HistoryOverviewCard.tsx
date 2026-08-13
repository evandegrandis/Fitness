"use client";

import { StatTile } from "@/components/ui/StatTile";
import type { Exercise, WorkoutSession } from "@/lib/models/types";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { sessionDurationMinutes } from "./historyHelpers";

/**
 * Carte d'aperçu sticky de l'onglet Historique — totaux RÉELS sur tout
 * l'historique (Séances, Sets, PR, Heures), pas une fenêtre arbitraire.
 */
export function HistoryOverviewCard({
  sessions,
  exercises,
  prCountBySessionId,
}: {
  sessions: WorkoutSession[];
  exercises: Exercise[];
  /** Nombre de sets record par session (calculé par la page via `displayedRecordSetIDs`). */
  prCountBySessionId: Map<string, number>;
}) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const totalSets = sessions.reduce(
    (acc, s) =>
      acc +
      s.exercises.reduce(
        (subtotal, logged) =>
          subtotal +
          physiologicalSetUnits(logged.sets, {
            increment: exerciseById.get(logged.exerciseId)?.smallestIncrement,
          }),
        0
      ),
    0
  );
  const displayedTotalSets = Math.round(totalSets * 10) / 10;
  const totalPRs = sessions.reduce((acc, s) => acc + (prCountBySessionId.get(s.id) ?? 0), 0);
  const totalHours = sessions.reduce(
    (acc, session) => acc + sessionDurationMinutes(session, exercises).minutes / 60,
    0
  );

  return (
    <div className="sticky top-0 z-30 -mx-5 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl bg-gradient-to-b from-[var(--bg-top)] via-[var(--bg-top)]/90 to-transparent">
      <div className="grid grid-cols-4 gap-2">
        <StatTile value={sessions.length} label="Séances" />
        <StatTile value={displayedTotalSets} label="Sets" />
        <StatTile value={totalPRs} label="PR" accent={totalPRs > 0} />
        <StatTile value={totalHours.toFixed(1)} label="Heures" />
      </div>
    </div>
  );
}
