"use client";

import { StatTile } from "@/components/ui/StatTile";
import { completedWorkSets, type WorkoutSession } from "@/lib/models/types";

/**
 * Carte d'aperçu sticky de l'onglet Historique — 4 métriques calculées sur
 * les 8 dernières séances (Séances, Sets, PR, Heures).
 */
export function HistoryOverviewCard({
  sessions,
  prCountBySessionId,
}: {
  sessions: WorkoutSession[];
  /** Nombre de sets record par session (calculé par la page via `displayedRecordSetIDs`). */
  prCountBySessionId: Map<string, number>;
}) {
  const recent = sessions.slice(0, 8);

  const totalSets = recent.reduce(
    (acc, s) => acc + s.exercises.reduce((subtotal, e) => subtotal + completedWorkSets(e).length, 0),
    0
  );
  const totalPRs = recent.reduce((acc, s) => acc + (prCountBySessionId.get(s.id) ?? 0), 0);
  const totalHours = recent.reduce((acc, s) => {
    if (!s.endTime) return acc;
    return acc + (s.endTime.getTime() - s.startTime.getTime()) / 3_600_000;
  }, 0);

  return (
    <div className="sticky top-0 z-30 -mx-5 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl bg-gradient-to-b from-[var(--bg-top)] via-[var(--bg-top)]/90 to-transparent">
      <div className="grid grid-cols-4 gap-2">
        <StatTile value={recent.length} label="Séances" />
        <StatTile value={totalSets} label="Sets" />
        <StatTile value={totalPRs} label="PR" accent={totalPRs > 0} />
        <StatTile value={totalHours.toFixed(1)} label="Heures" />
      </div>
    </div>
  );
}
