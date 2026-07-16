"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Link2, X } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * Bandeau persistant affiché pendant l'armement d'un lien superset.
 * Reste visible en bas d'écran tant qu'un exercice est armé — tap sur une
 * 2ᵉ carte crée le groupe (`handleSupersetLink`), "Annuler" désarme.
 */
export function SupersetLinkBanner() {
  const armedSupersetExerciseId = useWorkoutStore((s) => s.armedSupersetExerciseId);
  const active = useWorkoutStore((s) => s.active);
  const restActive = useWorkoutStore((s) => s.rest !== null);
  const handleSupersetLink = useWorkoutStore((s) => s.handleSupersetLink);

  const armedExercise = active?.exercises.find((e) => e.id === armedSupersetExerciseId);

  return (
    <AnimatePresence>
      {armedExercise && (
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
          style={{ boxShadow: "0 0 0 1px var(--accent)" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,138,61,0.15)", color: "#ff8a3d" }}>
              <Link2 size={15} />
            </div>
            <p className="truncate text-sm text-[--color-fg]">
              Superset : touche le 2<sup>e</sup> exercice
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSupersetLink(armedExercise.id)}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[--color-fg-muted] active:scale-95 transition"
          >
            <X size={15} />
            Annuler
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
