"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ExerciseReview } from "@/lib/engines/bilan";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

function gapLabel(review: ExerciseReview): string {
  if (review.gapKg !== 0) {
    const sign = review.gapKg > 0 ? "+" : "";
    return `${sign}${cleanWeight(review.gapKg)}kg`;
  }
  const sign = review.gapReps > 0 ? "+" : "";
  return `${sign}${review.gapReps} reps`;
}

function ExerciseRow({ review, positive }: { review: ExerciseReview; positive: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-(--color-fg)">{review.exerciseName}</span>
      <span
        className="tnum shrink-0 pill"
        style={
          positive
            ? { color: "#34d399", background: "rgba(52,211,153,0.12)" }
            : { color: "#fbbf24", background: "rgba(251,191,36,0.12)" }
        }
      >
        {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        {gapLabel(review)}
      </span>
    </li>
  );
}

/** Ce qui a marché (outperformed) vs à surveiller (underperformed), avec l'écart chiffré. */
export function BilanPerformance({ exercises }: { exercises: ExerciseReview[] }) {
  const outperformed = exercises.filter((e) => !e.calibrating && e.performed);
  const underperformed = exercises.filter((e) => !e.calibrating && !e.performed);
  const calibrating = exercises.filter((e) => e.calibrating);

  if (exercises.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {outperformed.length > 0 && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Ça a marché</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {outperformed.map((r) => (
              <ExerciseRow key={r.loggedExerciseId} review={r} positive />
            ))}
          </ul>
        </div>
      )}

      {calibrating.length > 0 && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Étalonnage</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {calibrating.map((r) => (
              <li key={r.loggedExerciseId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-(--color-fg)">{r.exerciseName}</span>
                <span className="tnum pill shrink-0 text-(--color-fg-muted)">
                  {r.achievedWeight > 0 ? `${cleanWeight(r.achievedWeight)} kg × ${r.achievedReps}` : `${r.achievedReps} reps`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {underperformed.length > 0 && (
        <div className="glass glass-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">À surveiller</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {underperformed.map((r) => (
              <ExerciseRow key={r.loggedExerciseId} review={r} positive={false} />
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
