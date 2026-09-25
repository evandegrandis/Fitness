"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Feuille modale ascendante (bottom sheet) avec fond flouté.
 * Utilisée pour le résumé post-séance, le picker d'exercices, etc.
 */
export function Sheet({
  open,
  onClose,
  children,
  full,
  ariaLabel = "Fenêtre de dialogue",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** occupe presque tout l'écran (résumé post-séance) */
  full?: boolean;
  ariaLabel?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // Le drag part UNIQUEMENT de la poignée : le corps de la feuille défile (liste d'exercices),
  // un drag global s'y disputerait le geste avec le scroll.
  const dragControls = useDragControls();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            // Surface opaque : en verre (4,5 % d'opacité), on voyait à travers la feuille les boutons
            // de la séance, flous mais bien là, comme superposés au formulaire (Evan, 26/09/2026).
            className={`surface-solid relative w-full max-w-md rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
              full ? "flex h-[92dvh] flex-col" : "max-h-[85vh] overflow-y-auto"
            }`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              // Descendre franchement OU d'un geste rapide ferme — comme n'importe quelle
              // bottom sheet native. Sans ça, une feuille `full` n'offrait presque aucune sortie :
              // le fond cliquable ne couvre que 8 % de l'écran et Escape n'existe pas sur mobile.
              if (info.offset.y > 110 || info.velocity.y > 550) onCloseRef.current();
            }}
          >
            <div
              onPointerDown={(event) => dragControls.start(event)}
              className="-mx-5 -mt-3 flex touch-none cursor-grab items-center justify-between px-5 pb-2 pt-3 active:cursor-grabbing"
            >
              <span aria-hidden="true" className="w-11" />
              <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-white/25" />
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="grid h-11 w-11 place-items-center rounded-full text-(--color-fg-muted) active:scale-90 transition"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            {/* Pleine hauteur : le contenu prend la place qui reste sous la poignée. En « h-full »
                sous la poignée, le bas du formulaire (et son bouton Enregistrer) sortait de l'écran. */}
            {full ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
