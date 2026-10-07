"use client";

import { motion } from "framer-motion";
import type { CelebrationEvent } from "../store";
import { CREAM, GOLD, GOLD_HI, MetalText, Sparks } from "../kit";
import { ToastShell } from "./ToastShell";

type Beaten = Extract<CelebrationEvent, { kind: "beaten" }>;

const WORDS = ["", "Une", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit", "Neuf", "Dix"];

export function beatenText(combo: number): { kicker: string; title: string; sub: string } {
  if (combo <= 1) return { kicker: "Encouragement", title: "Suggestion battue", sub: "Au-dessus de ce que le moteur proposait" };
  const count = WORDS[combo] ?? String(combo);
  const title = combo === 2 ? "Deux de suite" : combo === 3 ? "Trois de suite" : `${count} de suite`;
  const sub = combo === 3 ? "Garde le rythme" : "Suggestions battues d'affilée";
  return { kicker: "Combo", title, sub };
}

/**
 * Bandeau d'encouragement : une série au-dessus de la suggestion, puis le combo qui grimpe. Les
 * chevrons s'empilent (un par suggestion battue d'affilée, quatre au plus), le multiplicateur
 * grossit et se dore avec le combo ; dès ×5, un reflet balaie le bandeau et des éclats en jaillissent.
 */
export default function BeatenToast({ event }: { event: Beaten }) {
  const combo = Math.max(1, event.combo);
  const { kicker, title, sub } = beatenText(combo);
  const gold = combo >= 2;
  const chevrons = Math.min(4, combo);
  const size = Math.min(2.9, 2 + combo * 0.15);
  return (
    <ToastShell
      border={combo >= 5 ? `color-mix(in srgb, ${GOLD} 75%, transparent)` : gold ? `color-mix(in srgb, ${GOLD} 40%, transparent)` : "rgba(236,230,216,0.32)"}
      overlay={
        combo >= 5 ? (
          <motion.span
            aria-hidden
            className="absolute -inset-y-6 w-24"
            style={{ left: 0, rotate: 18, background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${GOLD_HI} 40%, transparent), transparent)` }}
            initial={{ x: -140 }}
            animate={{ x: 460 }}
            transition={{ delay: 0.3, duration: 0.85, ease: "easeInOut" }}
          />
        ) : undefined
      }
    >
      <span className="relative grid h-14 w-11 shrink-0 place-items-center">
        <svg viewBox="0 0 44 56" className="absolute inset-0 overflow-visible">
          {Array.from({ length: chevrons }, (_, index) => {
            const y = 38 - index * 9 - (4 - chevrons) * 4.5;
            const last = index === chevrons - 1;
            return (
              <motion.path
                key={index}
                d={`M9 ${y + 8} L22 ${y} L35 ${y + 8}`}
                fill="none"
                stroke={gold ? (last ? GOLD_HI : GOLD) : CREAM}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 - (chevrons - 1 - index) * 0.2 }}
                transition={{ delay: 0.08 + index * 0.09, type: "spring", stiffness: 420, damping: 20 }}
              />
            );
          })}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em]" style={{ color: gold ? GOLD : "var(--color-fg-muted)" }}>
          {kicker}
        </p>
        <p className="mt-0.5 font-display text-[1.3rem] font-bold leading-tight text-(--color-fg)">{title}</p>
        <p className="text-[0.76rem] leading-snug text-(--color-fg-muted)">{sub}</p>
      </div>
      {gold && (
        <span className="relative grid shrink-0 place-items-center pr-1">
          {combo >= 5 && <Sparks count={10} color={GOLD_HI} delay={0.35} distance={[26, 46]} size={2.5} seed={combo} duration={0.7} />}
          <motion.span
            initial={{ scale: 1.8, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.18, type: "spring", stiffness: 360, damping: 14 }}
          >
            <MetalText metal="or" className="tabular-nums" style={{ fontSize: `${size}rem`, lineHeight: 1, display: "block" }}>
              ×{combo}
            </MetalText>
          </motion.span>
        </span>
      )}
    </ToastShell>
  );
}
