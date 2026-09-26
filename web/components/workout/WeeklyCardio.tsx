"use client";

import { motion } from "framer-motion";
import type { CardioProgress } from "@/lib/engines/cardio";

/**
 * Cardio de la semaine sur l'accueil. Les objectifs musculaires qui partageaient cette carte en
 * sont partis (Evan, 26/09/2026) : la semaine se lit dans l'en-tête de semaine juste au-dessus,
 * le détail par muscle dans Progrès. Vert, pour rester distinguable d'un déficit musculaire.
 */
export function WeeklyCardio({ cardio }: { cardio: CardioProgress }) {
  const done = cardio.remainingMinutes === 0;
  return (
    <div className="glass glass-card">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Cardio</span>
        <span className="tnum text-sm font-semibold" style={{ color: done ? "rgb(110,231,183)" : "var(--color-fg)" }}>
          {cardio.minutes}/{cardio.goalMinutes} min
        </span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: done ? "rgb(110,231,183)" : "rgba(110,231,183,0.55)" }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(cardio.ratio * 100)}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 30 }}
        />
      </div>
    </div>
  );
}
