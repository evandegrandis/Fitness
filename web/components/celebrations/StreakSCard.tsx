"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Career } from "@/lib/engines/career";
import type { RankLetter } from "@/lib/engines/session-rank";
import { RANK_COLORS } from "@/lib/theme/tiers";
import { GOLD, MetalText } from "./kit";
import { nextStreakMilestone } from "./scenes/streak/milestones";
import { celebrate } from "./store";

const SHOWN = 14;

/**
 * Progrès › Semaine : la série de S en cours, la plus longue, les derniers rangs (la série en
 * cours soulignée d'or) et le palier suivant. « Revoir » rejoue la mise en scène de la série.
 */
export function StreakSCard({ career }: { career: Career }) {
  const letters: RankLetter[] = [];
  for (const entry of career.bySession.values()) if (entry.rank) letters.push(entry.rank.letter);
  if (letters.length === 0) return null;
  const { current, best } = career.sStreak;
  const recent = letters.slice(-SHOWN);
  const inStreak = (index: number) => index >= recent.length - current;
  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Série de S</p>
        <p className="tnum text-[0.68rem] text-(--color-fg-faint)">record {best}</p>
      </div>
      <div className="mt-3 flex items-end gap-4">
        <div className="shrink-0">
          {current > 0 ? (
            <MetalText metal="or" style={{ fontSize: "3rem", lineHeight: 1, display: "block" }}>
              {current}
            </MetalText>
          ) : (
            <span className="block font-display text-5xl font-bold leading-none text-(--color-fg-faint)">0</span>
          )}
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-(--color-fg-faint)">d&apos;affilée</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[3px]">
            {recent.map((letter, index) => (
              <motion.span
                key={`${index}-${letter}`}
                className="grid h-[20px] flex-1 place-items-center rounded-[3px] font-display text-[0.62rem] font-bold leading-none"
                style={{
                  maxWidth: 22,
                  color: letter === "S" && inStreak(index) ? "#0b0b0c" : RANK_COLORS[letter],
                  background: letter === "S" && inStreak(index) ? GOLD : "rgba(255,255,255,0.04)",
                  border: `1px solid ${letter === "S" ? "color-mix(in srgb, var(--color-warning) 45%, transparent)" : "rgba(255,255,255,0.06)"}`,
                }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * index, duration: 0.2 }}
              >
                {letter}
              </motion.span>
            ))}
          </div>
          <p className="mt-2 text-[0.72rem] leading-snug text-(--color-fg-muted)">
            {current >= 1 ? `Prochain palier : ${nextStreakMilestone(current)} S d'affilée.` : "La prochaine séance au rang S lance une série."}
          </p>
        </div>
      </div>
      {current >= 1 && (
        <button type="button" onClick={() => celebrate({ kind: "streak", count: current })} className="pill mt-3 !text-(--color-fg) active:scale-95">
          Revoir la mise en scène
        </button>
      )}
    </GlassCard>
  );
}
