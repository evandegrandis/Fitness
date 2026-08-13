"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { deleteSession, saveSession } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import { useWorkoutStore } from "@/lib/store/workout";
import { sessionsNewestFirst, type WorkoutSession } from "@/lib/models/types";
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
  const [undoing, setUndoing] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const weeks = useMemo(() => groupSessionsByIsoWeek(history), [history]);
  const prCountBySessionId = useMemo(() => buildPrCountBySessionId(history, catalog), [history, catalog]);

  const handleDelete = useCallback(async (id: string) => {
    // Lire au moment du geste : deux swipes rapides peuvent précéder le
    // rerender et la closure `history` serait alors obsolète.
    const removed = useWorkoutStore.getState().history.find((sess) => sess.id === id) ?? null;
    setMutationError(null);
    // Optimistic-ish : on retire immédiatement de la vue via le store local en
    // attendant la revalidation serveur (le layout hydrate `history` à
    // nouveau après `revalidatePath`).
    useWorkoutStore.setState((s) => ({ history: s.history.filter((sess) => sess.id !== id) }));
    try {
      await writeThrough({ kind: "session_delete", sessionId: id }, () => deleteSession(id));
    } catch (cause) {
      // Seule panne non récupérable ici : ni serveur ni outbox locale. Remet la séance dans la vue.
      if (removed) {
        useWorkoutStore.setState((s) => ({
          history: sessionsNewestFirst([removed, ...s.history.filter((session) => session.id !== removed.id)]),
        }));
      }
      setMutationError(cause instanceof Error ? cause.message : "Impossible de sécuriser la suppression.");
      return;
    }

    if (removed) {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      setDeletedSession(removed);
      undoTimeoutRef.current = setTimeout(() => setDeletedSession(null), UNDO_TIMEOUT_MS);
    }
  }, []);

  async function handleUndoDelete() {
    if (!deletedSession || undoing) return;
    const restored = deletedSession;
    setUndoing(true);
    setMutationError(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setDeletedSession(null);
    useWorkoutStore.setState((s) => ({
      history: sessionsNewestFirst([restored, ...s.history.filter((sess) => sess.id !== restored.id)]),
    }));
    try {
      await writeThrough({ kind: "session", session: restored }, () => saveSession(restored));
    } catch (cause) {
      // La restauration n'est ni en base ni dans l'outbox : retire l'état
      // optimiste et redonne un bouton d'annulation au lieu d'une séance
      // fantôme qui disparaîtrait au prochain chargement.
      useWorkoutStore.setState((state) => ({
        history: state.history.filter((session) => session.id !== restored.id),
      }));
      setDeletedSession(restored);
      setMutationError(cause instanceof Error ? cause.message : "Impossible de sécuriser la restauration.");
    } finally {
      setUndoing(false);
    }
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

        <HistoryOverviewCard
          sessions={history}
          exercises={catalog}
          prCountBySessionId={prCountBySessionId}
        />

        {mutationError && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">
            {mutationError}
          </p>
        )}

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
              disabled={undoing}
              className="pill shrink-0 disabled:opacity-50"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              {undoing ? "Restauration…" : "Annuler"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
