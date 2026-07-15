"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { deleteSession } from "@/lib/db/actions";
import { useWorkoutStore } from "@/lib/store/workout";
import { HistoryOverviewCard } from "@/components/history/HistoryOverviewCard";
import { WeekGroup } from "@/components/history/WeekGroup";
import { buildPrCountBySessionId, groupSessionsByIsoWeek } from "@/components/history/historyHelpers";

export default function HistoriquePage() {
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);

  const weeks = useMemo(() => groupSessionsByIsoWeek(history), [history]);
  const prCountBySessionId = useMemo(() => buildPrCountBySessionId(history, catalog), [history, catalog]);

  async function handleDelete(id: string) {
    // Optimistic-ish : on retire immédiatement de la vue via le store local en
    // attendant la revalidation serveur (le layout hydrate `history` à
    // nouveau après `revalidatePath`).
    useWorkoutStore.setState((s) => ({ history: s.history.filter((sess) => sess.id !== id) }));
    await deleteSession(id);
  }

  if (!hasHydratedStorage) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <h1 className="font-display text-2xl font-bold text-accent-gradient">Historique</h1>
        <div className="mt-6 flex flex-col gap-4 animate-pulse">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-white/5" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-8">
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="font-display text-2xl font-bold text-accent-gradient">Historique</h1>
      </div>

      <HistoryOverviewCard sessions={history} prCountBySessionId={prCountBySessionId} />

      {history.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass glass-card mt-4 text-center text-sm text-[--color-fg-muted]"
        >
          Aucune séance enregistrée pour le moment.
        </motion.div>
      ) : (
        <div className="mt-2 flex flex-col gap-6">
          <AnimatePresence initial={false}>
            {weeks.map((week) => (
              <WeekGroup
                key={week.weekStart.getTime()}
                weekStart={week.weekStart}
                sessions={week.sessions}
                allSessions={history}
                exercises={catalog}
                goals={goals}
                prCountBySessionId={prCountBySessionId}
                onDeleteSession={handleDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </main>
  );
}
