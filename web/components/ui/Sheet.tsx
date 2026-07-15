"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

/**
 * Feuille modale ascendante (bottom sheet) avec fond flouté.
 * Utilisée pour le résumé post-séance, le picker d'exercices, etc.
 */
export function Sheet({
  open,
  onClose,
  children,
  full,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** occupe presque tout l'écran (résumé post-séance) */
  full?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className={`glass glass-strong relative w-full max-w-md rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
              full ? "h-[92vh] overflow-y-auto" : "max-h-[85vh] overflow-y-auto"
            }`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
