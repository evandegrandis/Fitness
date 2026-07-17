"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { deleteSession, saveSession } from "@/lib/db/actions";
import { useWorkoutStore } from "@/lib/store/workout";
import type { WorkoutSession } from "@/lib/models/types";
import { HistoryOverviewCard } from "@/components/history/HistoryOverviewCard";
import { WeekGroup } from "@/components/history/WeekGroup";
import { buildPrCountBySessionId, groupSessionsByIsoWeek } from "@/components/history/historyHelpers";

const UNDO_TIMEOUT_MS = 6000;

export default function HistoriquePage() {
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);

  const [deletedSession, setDeletedSession] = useState<WorkoutSession | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const weeks = useMemo(() => groupSessionsByIsoWeek(history), [history]);
  const prCountBySessionId = useMemo(() => buildPrCountBySessionId(history, catalog), [history, catalog]);

  const handleDelete = useCallback(async (id: string) => {
    const removed = history.find((sess) => sess.id === id) ?? null;
    // Optimistic-ish : on retire immédiatement de la vue via le store local en
    // attendant la revalidation serveur (le layout hydrate `history` à
    // nouveau après `revalidatePath`).
    useWorkoutStore.setState((s) => ({ history: s.history.filter((sess) => sess.id !== id) }));
    await deleteSession(id);

    if (removed) {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      setDeletedSession(removed);
      undoTimeoutRef.current = setTimeout(() => setDeletedSession(null), UNDO_TIMEOUT_MS);
    }
  }, [history]);

  async function handleUndoDelete() {
    if (!deletedSession) return;
    const restored = deletedSession;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setDeletedSession(null);
    useWorkoutStore.setState((s) => ({
      history: [restored, ...s.history.filter((sess) => sess.id !== restored.id)],
    }));
    await saveSession(restored);
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
    <>
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

      <AnimatePresence>
        {deletedSession && (
          <motion.div
            key={deletedSession.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="surface-solid fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[calc(100%-2.5rem)] max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3"
          >
            <p className="eyebrow text-[--color-fg]">Séance supprimée</p>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="pill shrink-0"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Annuler
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
