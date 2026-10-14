"use client";

import { motion, useAnimationFrame } from "framer-motion";
import { useRef } from "react";
import { Backdrop, CREAM, GOLD, GOLD_HI, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

/** Soulevé de terre en bâtons : barre au sol, dos plat, puis debout (même structure de tracé). */
const DOWN = { body: "M-14 -2 L-2 -40 L10 -62 M-14 -2 L-24 26 L-18 56 M-14 -2 L4 24 L-2 56 M10 -62 L16 -30 L20 18", head: { cx: 16, cy: -72 }, bar: 18 };
const UP = { body: "M0 0 L0 -40 L0 -66 M0 0 L-6 28 L-8 56 M0 0 L6 28 L8 56 M0 -66 L-2 -36 L-2 4", head: { cx: 0, cy: -78 }, bar: 4 };

/**
 * 25 · « 25 images par seconde » : la cadence de la vidéo en Europe. Une pellicule défile à
 * l'écran, et dans la fenêtre du projecteur un soulevé de terre s'anime image par image ; le
 * compteur d'images file jusqu'à 25.
 */
export default function Streak25({ count }: { count: number }) {
  const counter = useRef<HTMLSpanElement>(null);
  const start = useRef<number | null>(null);
  useAnimationFrame((time) => {
    if (start.current === null) start.current = time;
    const frame = Math.min(25, Math.floor(((time - start.current) / 1000) * 25 * 0.6) + 1);
    if (counter.current) counter.current.textContent = String(frame).padStart(2, "0");
  });
  const lift = { duration: 0.9, repeat: 2, repeatType: "reverse" as const, ease: [0.5, 0, 0.3, 1] as const, delay: 0.3, repeatDelay: 0.15 };
  return (
    <>
      <Backdrop tint={GOLD} veil={0.93} />
      {/* Les deux bandes de pellicule qui défilent sur les côtés. */}
      {[-1, 1].map((side) => (
        <motion.div key={side} aria-hidden className="absolute inset-y-[-40%] w-7" style={{ [side < 0 ? "left" : "right"]: 6, opacity: 0.45, background: `repeating-linear-gradient(180deg, transparent 0 8px, rgba(236,230,216,0.22) 8px 18px, transparent 18px 26px), linear-gradient(90deg, #15130f, #1f1b14, #15130f)`, borderLeft: "1px solid rgba(236,230,216,0.12)", borderRight: "1px solid rgba(236,230,216,0.12)" }} initial={{ y: 0 }} animate={{ y: side * 260 }} transition={{ duration: 4, ease: "linear" }} />
      ))}
      <SceneLayout caption={<StreakCaption count={count} sub="Vingt-cinq images par seconde." accent={GOLD} delay={2} />}>
        {/* Le faisceau du projecteur et la fenêtre. */}
        <div aria-hidden className="absolute -top-24 left-1/2 h-24 w-48 -translate-x-1/2" style={{ background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${GOLD_HI} 15%, transparent))`, clipPath: "polygon(45% 0, 55% 0, 100% 100%, 0 100%)" }} />
        <motion.div className="absolute left-1/2 top-1/2 h-[210px] w-[250px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md" style={{ background: "radial-gradient(circle, #2b2418, #120f0a 80%)", border: `2px solid ${GOLD}` }} animate={{ opacity: [1, 0.86, 1, 0.92, 1, 0.88, 1] }} transition={{ duration: 3.6, ease: "linear" }}>
          <svg viewBox="-60 -95 120 160" className="absolute inset-0 h-full w-full" aria-hidden>
            <line x1="-60" y1="57" x2="60" y2="57" stroke={CREAM} strokeOpacity="0.3" />
            <motion.path d={DOWN.body} fill="none" stroke={CREAM} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ d: DOWN.body }} animate={{ d: UP.body }} transition={lift} />
            <motion.circle r="9" fill={CREAM} initial={DOWN.head} animate={UP.head} transition={lift} />
            <motion.g initial={{ y: DOWN.bar }} animate={{ y: UP.bar }} transition={lift}>
              <line x1="-44" y1="18" x2="44" y2="18" stroke={GOLD_HI} strokeWidth="3.5" strokeLinecap="round" />
              <rect x="-50" y="2" width="8" height="32" rx="2" fill={GOLD} />
              <rect x="42" y="2" width="8" height="32" rx="2" fill={GOLD} />
            </motion.g>
          </svg>
          {/* Grain et rayures de pellicule. */}
          <motion.div aria-hidden className="absolute inset-y-0 w-px" style={{ background: "rgba(236,230,216,0.25)" }} animate={{ left: ["20%", "64%", "35%", "80%"] }} transition={{ duration: 3.6, ease: "linear" }} />
          <span className="absolute left-2 top-1.5 font-mono text-[0.62rem] tracking-[0.2em]" style={{ color: GOLD_HI }}>
            IMG <span ref={counter}>01</span>/25
          </span>
        </motion.div>
        <motion.div className="absolute -right-3 -top-6" initial={{ opacity: 0, scale: 0.6, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: -6 }} transition={{ delay: 1.6, type: "spring", stiffness: 260, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 72, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
