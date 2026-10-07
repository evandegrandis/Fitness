"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useCareer } from "@/lib/hooks/use-career";
import type { WorkoutSession } from "@/lib/models/types";
import { GOLD, MetalText } from "./kit";
import { nextStreakMilestone } from "./scenes/streak/milestones";
import { celebrate, type CelebrationEvent } from "./store";
import { streakContext } from "./streak-context";

/** Séances déjà fêtées : rouvrir le bilan ne rejoue rien. */
const played = new Set<string>();

/**
 * Point d'entrée unique du bilan (PostWorkoutSheet) : la série de S de la séance, et les scènes
 * plein écran qu'elle a méritées (série de S dès 2, puis chaque secret débloqué), jouées une fois,
 * après la médaille du rang.
 */
export function BilanCelebrations({ session }: { session: WorkoutSession }) {
  const career = useCareer();
  const entry = career.bySession.get(session.id);
  const context = useMemo(() => streakContext(career, session.id), [career, session.id]);

  useEffect(() => {
    if (!entry || played.has(session.id)) return;
    const events: CelebrationEvent[] = [];
    if (entry.sStreak >= 2) events.push({ kind: "streak", count: entry.sStreak });
    for (const unlock of entry.unlocks) {
      if (unlock.kind === "secret") events.push({ kind: "secret", id: unlock.id, title: unlock.title, description: unlock.description });
    }
    if (events.length === 0) return;
    // Après la médaille du rang (≈ 1 s), pour qu'on la voie d'abord.
    const id = setTimeout(() => {
      if (played.has(session.id)) return;
      played.add(session.id);
      events.forEach(celebrate);
    }, 1100);
    return () => clearTimeout(id);
  }, [entry, session.id]);

  if (!context || (context.count === 0 && context.broken === 0)) return null;
  return <StreakStrip count={context.count} broken={context.broken} best={context.best} />;
}

/** Bandeau de série du bilan : un médaillon par S d'affilée, le dernier se pose en or. */
export function StreakStrip({ count, broken, best }: { count: number; broken: number; best: number }) {
  const shown = count > 0 ? count : broken;
  const chips = Math.min(shown, 10);
  const line =
    count === 0
      ? `La série de ${broken} S s'arrête ici. Record : ${best}.`
      : count === 1
        ? `Une nouvelle série commence. Record : ${best}.`
        : `Prochain palier : ${nextStreakMilestone(count)}. Record : ${best}.`;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.3 }} className="glass glass-card flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Série de S</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {shown > chips && <span className="mr-0.5 font-mono text-[0.62rem] text-(--color-fg-faint)">+{shown - chips}</span>}
          {Array.from({ length: chips }, (_, index) => {
            const last = index === chips - 1 && count > 0;
            return (
              <motion.span
                key={index}
                className="grid h-[22px] w-[22px] place-items-center rounded-full font-display text-[0.7rem] font-bold leading-none"
                style={{
                  border: `1px solid ${count === 0 ? "rgba(236,230,216,0.18)" : last ? GOLD : "color-mix(in srgb, var(--color-warning) 50%, transparent)"}`,
                  background: last ? GOLD : "transparent",
                  color: count === 0 ? "var(--color-fg-faint)" : last ? "#0b0b0c" : GOLD,
                }}
                initial={last ? { scale: 0, rotate: -90 } : { opacity: 0 }}
                animate={last ? { scale: 1, rotate: 0 } : { opacity: 1 }}
                transition={last ? { delay: 0.8, type: "spring", stiffness: 380, damping: 14 } : { delay: 0.55 + index * 0.03 }}
              >
                S
              </motion.span>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-snug text-(--color-fg-muted)">{line}</p>
      </div>
      <div className="shrink-0 text-right">
        {count > 0 ? (
          <MetalText metal="or" style={{ fontSize: "2.6rem", lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        ) : (
          <span className="block font-display text-[2.6rem] font-bold leading-none text-(--color-fg-faint)">0</span>
        )}
        <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-(--color-fg-faint)">d&apos;affilée</p>
      </div>
    </motion.div>
  );
}
