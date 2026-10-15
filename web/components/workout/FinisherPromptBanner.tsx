"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import { FLOATING, floatingBottom, FLOATING_FALLBACK_HEIGHT, useFloatingHeight } from "./floating-stack";
import { finisherPromptLabel } from "@/lib/engines/finisher";

/**
 * Proposition « c'était un finisher ? » — non bloquante, posée APRÈS que la série
 * a été enregistrée normalement. L'ignorer garde une série de travail classique.
 *
 * Elle ne s'affiche qu'en fin de séance et sur une série qui sort du bloc de
 * travail normal (cf. `lib/engines/finisher.ts`), et jamais deux fois pour le
 * même exercice — l'idée est qu'elle reste rare.
 *
 * Se décale au-dessus du RestTimer et de l'UndoToast pour ne jamais les recouvrir.
 */
export function FinisherPromptBanner() {
  const prompt = useWorkoutStore((s) => s.pendingFinisherPrompt);
  const restActive = useWorkoutStore((s) => s.rest !== null);
  const undoActive = useWorkoutStore((s) => s.undo !== null);
  const confirmFinisherPrompt = useWorkoutStore((s) => s.confirmFinisherPrompt);
  const dismissFinisherPrompt = useWorkoutStore((s) => s.dismissFinisherPrompt);

  // Au-dessus de la barre d'onglets ou du minuteur, puis du toast « Annuler » : hauteurs mesurées
  // (`floating-stack.ts`). Les valeurs fixes d'avant (4,5rem) la posaient 8 px sous la barre.
  const restTimerHeight = useFloatingHeight(FLOATING.restTimer, restActive);
  const undoHeight = useFloatingHeight(FLOATING.undoToast, undoActive);
  const bottom = floatingBottom(
    restActive ? restTimerHeight ?? FLOATING_FALLBACK_HEIGHT.restTimer : null,
    undoActive ? [undoHeight ?? FLOATING_FALLBACK_HEIGHT.banner] : []
  );

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          // `surface-solid` comme le RestTimer, et non `glass` : la bande flotte au-dessus
          // du contenu défilant, un fond translucide laisserait le texte transparaître.
          className="surface-solid fixed inset-x-0 z-40 mx-auto flex w-[calc(100%-2.5rem)] max-w-md items-center gap-3 rounded-2xl px-4 py-3"
          style={{ bottom }}
          data-finisher-prompt=""
        >
          <Flame aria-hidden="true" size={18} className="shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-(--color-fg)">Série finisher ?</p>
            <p className="truncate text-xs text-(--color-fg-muted)">{finisherPromptLabel[prompt.reason]}</p>
          </div>
          <button
            type="button"
            onClick={dismissFinisherPrompt}
            aria-label={`Non, garder une série normale pour ${prompt.exerciseName}`}
            className="min-h-11 shrink-0 px-2 text-sm text-(--color-fg-muted)"
          >
            Non
          </button>
          <button
            type="button"
            onClick={confirmFinisherPrompt}
            aria-label={`Oui, marquer cette série de ${prompt.exerciseName} comme finisher`}
            className="min-h-11 shrink-0 px-2 text-sm font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Oui
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
