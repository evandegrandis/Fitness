"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { seasonState } from "@/lib/engines/seasons";
import { useWorkoutStore } from "@/lib/store/workout";

const GOLD = "var(--color-warning)";
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Saison en cours (ou la prochaine, les derniers jours avant qu'elle commence) : trois objectifs. */
export function SeasonCard() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settings = useWorkoutStore((s) => s.settings);
  const state = useMemo(
    () => seasonState({ history, catalog, goals, bodyWeights, settings, now: new Date() }),
    [history, catalog, goals, bodyWeights, settings]
  );
  if (!state || state.status === "ended") return null;
  const { season, status, day, totalDays, objectives, next } = state;
  const year = season.start.getFullYear();

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">
          {season.name} {year}
        </p>
        <p className="tnum text-[0.68rem] text-(--color-fg-faint)">
          {status === "upcoming" ? `dès le ${season.start.getDate() === 1 ? "1er" : season.start.getDate()} ${MONTHS[season.start.getMonth()]}` : `jour ${day} / ${totalDays}`}
        </p>
      </div>
      <p className="mt-1 font-display text-lg font-semibold leading-tight text-(--color-fg)">{season.theme}</p>

      <div className="mt-3.5 space-y-3">
        {objectives.map((entry, index) => (
          <div key={entry.objective.label}>
            <div className="flex items-baseline justify-between gap-3 text-[0.72rem]">
              <p className="flex min-w-0 items-center gap-1.5 truncate text-(--color-fg-muted)">
                {entry.done && <Check size={11} className="shrink-0" style={{ color: GOLD }} />}
                {entry.objective.label}
              </p>
              <p className="tnum shrink-0 text-(--color-fg-muted)">{entry.display}</p>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: entry.done ? GOLD : "var(--accent)" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(entry.progress * 100)}%` }}
                transition={{ duration: 0.5, delay: 0.06 * index, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>

      {next && (
        <p className="mt-3.5 text-[0.68rem] text-(--color-fg-faint)">
          Ensuite : {next.name.toLowerCase()}, {next.theme.charAt(0).toLowerCase()}
          {next.theme.slice(1)}.
        </p>
      )}
    </GlassCard>
  );
}
