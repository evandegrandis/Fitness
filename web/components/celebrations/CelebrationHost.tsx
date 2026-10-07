"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useWorkoutStore } from "@/lib/store/workout";
import { sceneEntry, toastEntry } from "./registry";
import { useCelebrations, type QueuedCelebration } from "./store";

/**
 * Hôte unique des célébrations (monté dans le layout de l'app). Joue la file une scène à la fois,
 * puis les bandeaux ; attend que l'écran de record ou de passage de niveau de la séance soit
 * refermé, pour ne jamais empiler deux célébrations. `prefers-reduced-motion` : transformées
 * coupées (MotionConfig), primitives décoratives retirées (kit), il reste des fondus.
 */
export function CelebrationHost() {
  const scene = useCelebrations((state) => state.scene[0] ?? null);
  const toast = useCelebrations((state) => state.toast[0] ?? null);
  const blocked = useWorkoutStore((state) => state.achievement !== null || state.levelUp !== null);
  const sceneOn = scene && !blocked ? scene : null;
  const toastOn = toast && !blocked && !scene ? toast : null;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{sceneOn && <SceneSlot key={sceneOn.key} item={sceneOn} />}</AnimatePresence>
      <AnimatePresence mode="wait">{toastOn && <ToastSlot key={toastOn.key} item={toastOn} />}</AnimatePresence>
    </MotionConfig>
  );
}

function useAutoDone(lane: "scene" | "toast", key: number, duration: number | null) {
  useEffect(() => {
    const done = () => useCelebrations.getState().done(lane, key);
    if (duration === null) {
      done();
      return;
    }
    const id = setTimeout(done, duration);
    return () => clearTimeout(id);
  }, [lane, key, duration]);
}

function SceneSlot({ item }: { item: QueuedCelebration }) {
  const entry = sceneEntry(item.event);
  useAutoDone("scene", item.key, entry?.duration ?? null);
  if (!entry) return null;
  const close = () => useCelebrations.getState().done("scene", item.key);
  return (
    <motion.div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[70] overflow-hidden ${entry.tap ? "cursor-pointer" : "pointer-events-none"}`}
      onClick={entry.tap ? close : undefined}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <span className="sr-only">{entry.label}</span>
      {entry.render()}
      {entry.tap && (
        // Fermeture automatique : un filet qui se retire en bas de l'écran.
        <motion.span
          aria-hidden
          className="absolute inset-x-10 h-px origin-left"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)", background: "rgba(236,230,216,0.35)" }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: entry.duration / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

function ToastSlot({ item }: { item: QueuedCelebration }) {
  const entry = toastEntry(item.event);
  useAutoDone("toast", item.key, entry?.duration ?? null);
  if (!entry) return null;
  return (
    <>
      {/* Lueur du haut de l'écran, hors du bandeau (une transformée parente bornerait sa largeur). */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[64] h-52"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${entry.tint} 28%, transparent), transparent)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.4] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9, times: [0, 0.3, 1] }}
      />
      <motion.div
        role="status"
        aria-live="polite"
        aria-label={entry.label}
        className="pointer-events-none fixed inset-x-0 top-0 z-[65] mx-auto w-[calc(100%-2rem)] max-w-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        {entry.render()}
      </motion.div>
    </>
  );
}
