"use client";

import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import type { Achievement } from "@/lib/engines/achievements";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

const KIND_LABEL: Record<Achievement["kind"], string> = {
  heaviestWeight: "Nouveau record de poids",
  estimated1RM: "Nouveau 1RM estimé",
  repsAtWeight: "Plus de reps à ce poids",
  bodyweightReps: "Nouveau record de reps",
  finisherReps: "Nouveau record de finisher",
};

/** Liste des records récents — écran d'accueil (10 derniers PR). */
export function RecentAchievements({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null;

  return (
    <div className="glass glass-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Records récents</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {achievements.slice(0, 10).map((a, i) => (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
          >
            <Star size={16} className="shrink-0 text-amber-300" fill="currentColor" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[--color-fg]">{a.exerciseName}</p>
              <p className="truncate text-xs text-[--color-fg-muted]">
                {KIND_LABEL[a.kind]} · {a.weight > 0 ? `${cleanWeight(a.weight)}kg×${a.reps}` : `BW×${a.reps}`}
              </p>
            </div>
            <span className="shrink-0 text-[0.68rem] text-[--color-fg-faint]">
              {formatDistanceToNow(a.date, { addSuffix: true, locale: fr })}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
