"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import type { SessionReview } from "@/lib/engines/bilan";
import { parentShortName } from "@/lib/models/muscles";

/** Couverture musculaire de la séance + ce qu'il reste à couvrir + records battus. */
export function BilanCoverage({ review }: { review: SessionReview }) {
  const { coverage, records } = review;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="flex flex-col gap-3"
    >
      {coverage.workedParents.length > 0 && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Couverture musculaire</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {coverage.workedParents.map((p) => (
              <span key={p} className="pill">
                {parentShortName[p]}
              </span>
            ))}
          </div>
          {coverage.stillNeedsWork.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">
                Encore à couvrir cette semaine
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coverage.stillNeedsWork.map((s) => (
                  <span key={s.parent} className="pill" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}>
                    {parentShortName[s.parent]} · {s.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {records.length > 0 && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Records de séance</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {records.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-[--color-fg]">
                <Star size={14} className="shrink-0 text-amber-300" fill="currentColor" />
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
