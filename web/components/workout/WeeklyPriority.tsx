"use client";

import { motion } from "framer-motion";
import { coverageStatusAccent, type ParentMuscleProgress } from "@/lib/engines/effective-sets";
import { parentShortName } from "@/lib/models/muscles";
import { cn } from "@/lib/utils";

const ACCENT_BORDER: Record<string, string> = {
  green: "border-emerald-400/40 bg-emerald-400/10",
  blue: "border-sky-400/40 bg-sky-400/10",
  orange: "border-amber-400/40 bg-amber-400/10",
  red: "border-rose-400/40 bg-rose-400/10",
};

/**
 * Bandeau compact des priorités 7 jours — chips par parent musculaire avec
 * sets restants, bord coloré selon l'urgence. Affiché sur QuickStart.
 */
export function WeeklyPriority({ priorities }: { priorities: [string, number][] }) {
  return (
    <div className="glass glass-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Objectifs 7 jours</p>
      {priorities.length === 0 ? (
        <p className="mt-2 text-sm text-[--color-fg]">Tous couverts ✓</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {priorities.map(([parent, remaining], i) => (
            <PriorityChip key={parent} parent={parent} remaining={remaining} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityChip({ parent, remaining, index }: { parent: string; remaining: number; index: number }) {
  const status: ParentMuscleProgress["status"] = remaining >= 4 ? "priority" : remaining >= 2 ? "toStrengthen" : "onTrack";
  const accent = coverageStatusAccent[status];
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 400, damping: 30 }}
      className={cn("pill border", ACCENT_BORDER[accent])}
    >
      {parentShortName[parent as keyof typeof parentShortName] ?? parent}
      <span className="tnum text-[--color-fg-muted]">{Math.ceil(remaining)}</span>
    </motion.span>
  );
}
