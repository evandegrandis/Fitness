"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Award } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import { LEVEL_STYLE } from "@/lib/engines/level-up";

/**
 * Célébration d'un palier StrengthLevel franchi.
 *
 * L'intensité suit le palier : le badge, la lueur et le nombre de particules montent de Débutant
 * à Élite. Un passage rare doit se sentir plus qu'un record de routine.
 *
 * Respecte `prefers-reduced-motion` : le badge reste, l'animation disparaît.
 */
export function LevelUpOverlay() {
  const levelUp = useWorkoutStore((s) => s.levelUp);
  const dismiss = useWorkoutStore((s) => s.dismissLevelUp);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!levelUp) return;
    const id = setTimeout(dismiss, 4200);
    return () => clearTimeout(id);
  }, [levelUp, dismiss]);

  const style = levelUp ? LEVEL_STYLE[levelUp.to] : null;

  return (
    <AnimatePresence>
      {levelUp && style && (
        <motion.button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative grid place-items-center px-8 text-center"
            initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            {!reduced &&
              Array.from({ length: style.particles }).map((_, i) => {
                const angle = (i / style.particles) * Math.PI * 2;
                const distance = 90 + (i % 4) * 26;
                return (
                  <motion.span
                    key={i}
                    className="absolute h-1.5 w-1.5 rounded-full"
                    style={{ background: style.color }}
                    initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                    animate={{
                      x: Math.cos(angle) * distance,
                      y: Math.sin(angle) * distance,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: 1.1 + (i % 3) * 0.25, ease: "easeOut", delay: (i % 5) * 0.04 }}
                  />
                );
              })}

            <motion.div
              className="grid h-28 w-28 place-items-center rounded-full"
              style={{ background: style.glow, boxShadow: `0 0 60px ${style.glow}, inset 0 0 30px ${style.glow}` }}
              animate={reduced ? undefined : { rotate: [0, -8, 8, 0] }}
              transition={{ duration: 0.7, delay: 0.15 }}
            >
              <Award size={54} style={{ color: style.color }} strokeWidth={1.6} />
            </motion.div>

            <p className="mt-5 font-mono text-[0.7rem] uppercase tracking-[0.2em]" style={{ color: style.color }}>
              Nouveau palier
            </p>
            <p className="mt-1 font-display text-3xl font-bold text-(--color-fg)">{style.label}</p>
            <p className="mt-2 max-w-xs text-sm text-(--color-fg-muted)">{levelUp.exerciseName}</p>

            {/* Les cinq crans : voir d'où l'on vient rend le palier concret. */}
            <div className="mt-5 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((rank) => (
                <motion.span
                  key={rank}
                  className="h-1.5 rounded-full"
                  style={{
                    width: rank === levelUp.rank ? 28 : 14,
                    background: rank <= levelUp.rank ? style.color : "rgba(255,255,255,0.16)",
                  }}
                  initial={reduced ? undefined : { scaleX: 0 }}
                  animate={reduced ? undefined : { scaleX: 1 }}
                  transition={{ delay: 0.25 + rank * 0.07 }}
                />
              ))}
            </div>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
