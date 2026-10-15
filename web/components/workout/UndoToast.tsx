"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkoutStore } from "@/lib/store/workout";
import { FLOATING, floatingBottom, FLOATING_FALLBACK_HEIGHT, useFloatingHeight } from "./floating-stack";

/**
 * Toast d'annulation flottant : après la suppression d'une série ou d'un exercice, un remplacement,
 * ou un superset habituel formé d'office. Posé au-dessus de la barre d'onglets ou du minuteur de
 * repos (`floating-stack.ts`).
 */
export function UndoToast() {
  const undo = useWorkoutStore((s) => s.undo);
  const restActive = useWorkoutStore((s) => s.rest !== null);
  const undoLastAction = useWorkoutStore((s) => s.undoLastAction);
  const dismissUndo = useWorkoutStore((s) => s.dismissUndo);
  const restTimerHeight = useFloatingHeight(FLOATING.restTimer, restActive);

  // Sans ça, le toast restait affiché jusqu'à la fin de la séance : il occupait le bas de l'écran
  // (et décalait le RestTimer) longtemps après que la suppression n'était plus annulable de tête.
  // 6 s : le temps de lire et de réagir, pas plus.
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(dismissUndo, 6000);
    return () => clearTimeout(id);
  }, [undo, dismissUndo]);

  return (
    <AnimatePresence>
      {undo && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          // Opaque comme les autres bandeaux flottants : en verre, la séance se lisait à travers.
          className="surface-solid fixed inset-x-0 z-40 mx-auto flex w-[calc(100%-2.5rem)] max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{ bottom: floatingBottom(restActive ? restTimerHeight ?? FLOATING_FALLBACK_HEIGHT.restTimer : null) }}
          data-undo-toast=""
        >
          <p className="text-sm text-(--color-fg)">{undo.message}</p>
          <button
            type="button"
            onClick={undoLastAction}
            className="shrink-0 text-sm font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Annuler
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
