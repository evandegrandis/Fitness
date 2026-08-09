"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

const KIND_LABEL: Record<string, string> = {
  heaviestWeight: "Record de poids",
  estimated1RM: "Nouveau 1RM estimé",
  repsAtWeight: "Record de reps à ce poids",
  bodyweightReps: "Record de reps",
  finisherReps: "Record de finisher",
};

/** Célébration plein écran quand un PR vient d'être loggé. Auto-dismiss après 2s (piloté par le store). */
export function AchievementOverlay() {
  const achievement = useWorkoutStore((s) => s.achievement);
  const dismissAchievement = useWorkoutStore((s) => s.dismissAchievement);

  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={dismissAchievement}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="glass glass-strong glow-accent mx-6 flex flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center"
          >
            <motion.div
              animate={{ rotate: [0, -8, 8, -6, 6, 0] }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="grid h-16 w-16 place-items-center rounded-full"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
            >
              <Trophy size={30} className="text-[#06070d]" />
            </motion.div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
              {KIND_LABEL[achievement.kind] ?? "Nouveau record"}
            </p>
            <p className="font-display text-xl font-bold text-[--color-fg]">{achievement.exerciseName}</p>
            <p className="tnum text-3xl font-bold text-accent-gradient">
              {achievement.weight > 0 ? `${cleanWeight(achievement.weight)}kg × ${achievement.reps}` : `BW × ${achievement.reps}`}
            </p>
            {[...Array(6)].map((_, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 1, x: 0, y: 0 }}
                animate={{ opacity: 0, x: (i - 2.5) * 26, y: -40 - i * 6 }}
                transition={{ duration: 0.9, delay: 0.1 }}
                className="pointer-events-none absolute top-1/3 h-1.5 w-1.5 rounded-full"
                style={{ background: i % 2 === 0 ? "var(--accent)" : "var(--accent-2)" }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
