"use client";

import { HeartPulse } from "lucide-react";

import type { CardioEntry } from "@/lib/models/types";

function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes === 0) return `${remaining} s`;
  return remaining === 0 ? `${minutes} min` : `${minutes} min ${remaining} s`;
}

export function SessionCardioBlock({ entries }: { entries: CardioEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section
      className="glass glass-card border-l-2"
      style={{ borderLeftColor: "#34d399", background: "rgba(52,211,153,0.045)" }}
    >
      <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
        <HeartPulse size={13} />
        Cardio · fin de séance
      </div>
      <div className="flex flex-col gap-1.5">
        {[...entries]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((entry) => (
            <div key={entry.id} className="rounded-xl bg-white/5 px-3 py-2.5">
              <p className="text-sm font-semibold text-[--color-fg]">{entry.activityName}</p>
              <p className="mt-0.5 text-xs text-[--color-fg-muted]">
                {durationLabel(entry.durationSeconds)}
                {entry.level != null ? ` · niveau ${entry.level}` : ""}
                {entry.distanceKm != null ? ` · ${entry.distanceKm} km` : ""}
              </p>
            </div>
          ))}
      </div>
    </section>
  );
}
