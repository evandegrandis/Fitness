"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * Toast d'annulation flottant — apparaît après suppression d'un set/exercice.
 * Se décale au-dessus du RestTimer s'il est affiché simultanément, pour
 * éviter tout chevauchement.
 */
export function UndoToast() {
  const undo = useWorkoutStore((s) => s.undo);
  const restActive = useWorkoutStore((s) => s.rest !== null);
  const undoLastAction = useWorkoutStore((s) => s.undoLastAction);
  const dismissUndo = useWorkoutStore((s) => s.dismissUndo);

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
          className={`glass glass-strong fixed inset-x-0 z-40 mx-auto flex w-[calc(100%-2.5rem)] max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
            restActive
              ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
              : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
          }`}
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
