"use client";

import { motion } from "framer-motion";
import type { PerformanceLabel, SessionReview } from "@/lib/engines/bilan";

const LABEL_COLOR: Record<PerformanceLabel, string> = {
  "Bonne séance": "#34d399",
  "En demi-teinte": "#fbbf24",
  Difficile: "#fb7185",
};

/** En-tête du bilan : label de performance + jauge circulaire + phrase de synthèse. */
export function BilanHero({ review }: { review: SessionReview }) {
  const total = review.exercises.length;
  const above = review.outperformed.length;
  const color = LABEL_COLOR[review.performanceLabel];

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - review.performanceSignal / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass glass-card flex items-center gap-4"
    >
      <div className="relative grid h-[72px] w-[72px] shrink-0 place-items-center">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <motion.circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </svg>
        <span className="tnum absolute text-sm font-bold" style={{ color }}>
          {review.performanceSignal}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold" style={{ color }}>
          {review.performanceLabel}
        </p>
        <p className="mt-0.5 text-sm text-[--color-fg-muted]">
          {total > 0
            ? `${above}/${total} exercice${total > 1 ? "s" : ""} au-dessus de tes suggestions`
            : "Aucun exercice loggué"}
        </p>
      </div>
    </motion.div>
  );
}
