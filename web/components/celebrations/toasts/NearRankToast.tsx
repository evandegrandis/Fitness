"use client";

import { motion } from "framer-motion";
import { RANK_COLORS } from "@/lib/theme/tiers";
import { MetalText } from "../kit";
import type { CelebrationEvent } from "../store";
import { ToastShell } from "./ToastShell";

type NearRank = Extract<CelebrationEvent, { kind: "near-rank" }>;

const METAL_OF = { B: "bronze", A: "argent", S: "or" } as const;

export function nearRankText(event: Pick<NearRank, "letter" | "sets" | "records">): { title: string; sub: string } {
  const { letter, sets, records } = event;
  if (sets !== null && sets <= 2) {
    const title = `Encore ${sets} série${sets > 1 ? "s" : ""}`;
    const sub = `${sets === 1 ? "et c'est le" : "pour le"} rang ${letter}${records === 1 ? " · ou 1 record" : ""}`;
    return { title, sub };
  }
  return { title: "Un record suffit", sub: `pour le rang ${letter}` };
}

/**
 * Bandeau « rang en vue » : le rang suivant est à une ou deux séries (ou à un record). La lettre
 * visée attend à droite, en métal, et bat ; dessous, la même jauge que l'en-tête de séance se
 * remplit jusqu'à l'avancée réelle, les crans restants clignotent.
 */
export default function NearRankToast({ event }: { event: NearRank }) {
  const color = RANK_COLORS[event.letter];
  const { title, sub } = nearRankText(event);
  const fraction = Math.min(0.96, Math.max(0.04, event.fraction));
  const notches = event.sets !== null && event.sets <= 2 ? event.sets : 1;
  return (
    <ToastShell border={`color-mix(in srgb, ${color} 55%, transparent)`}>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em]" style={{ color }}>
          Rang en vue
        </p>
        <p className="mt-0.5 font-display text-[1.35rem] font-bold leading-tight text-(--color-fg)">{title}</p>
        <p className="text-[0.76rem] leading-snug text-(--color-fg-muted)">{sub}</p>
        <div className="relative mt-2.5 h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: color, transformOrigin: "left" }}
            initial={{ scaleX: Math.max(0, fraction - 0.2) }}
            animate={{ scaleX: fraction }}
            transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
          />
          {Array.from({ length: notches }, (_, index) => (
            <motion.span
              key={index}
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `calc(${(fraction + ((1 - fraction) * index) / notches) * 100}% + 3px)`,
                width: `calc(${((1 - fraction) / notches) * 100}% - 3px)`,
                background: color,
              }}
              initial={{ opacity: 0.15 }}
              animate={{ opacity: [0.15, 0.85, 0.15, 0.85, 0.3] }}
              transition={{ delay: 0.9 + index * 0.15, duration: 1.6, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
      <span className="relative grid h-16 w-16 shrink-0 place-items-center">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, color-mix(in srgb, ${color} 40%, transparent) 0%, transparent 70%)` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0.4, 1, 0.5], scale: [0.6, 1.1, 1, 1.1, 1] }}
          transition={{ delay: 0.25, duration: 2, ease: "easeInOut" }}
        />
        <motion.span
          aria-hidden
          className="absolute inset-1.5 rounded-full"
          style={{ border: `1px solid ${color}` }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.8, 1.35, 1.5] }}
          transition={{ delay: 0.7, duration: 1, ease: "easeOut", repeat: 1, repeatDelay: 0.1 }}
        />
        <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.12, type: "spring", stiffness: 380, damping: 16 }}>
          <MetalText metal={METAL_OF[event.letter]} style={{ fontSize: "2.6rem", lineHeight: 1, display: "block" }}>
            {event.letter}
          </MetalText>
        </motion.span>
      </span>
    </ToastShell>
  );
}
