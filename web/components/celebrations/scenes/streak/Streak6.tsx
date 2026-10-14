"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, Embers, Glow, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const SIZE = 33;
const HEX = Array.from({ length: 6 }, (_, k) => {
  const a = ((60 * k - 90) * Math.PI) / 180;
  return `${(Math.cos(a) * SIZE).toFixed(2)} ${(Math.sin(a) * SIZE).toFixed(2)}`;
}).join(" L");

/** Alvéoles à deux anneaux du centre (19), bâties en spirale depuis le centre. */
const CELLS = (() => {
  const cells: Array<{ x: number; y: number; ring: number; angle: number }> = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      if (Math.abs(q + r) > 2) continue;
      const x = SIZE * Math.sqrt(3) * (q + r / 2);
      const y = SIZE * 1.5 * r;
      cells.push({ x, y, ring: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)), angle: Math.atan2(y, x) });
    }
  }
  return cells.sort((a, b) => a.ring - b.ring || a.angle - b.angle);
})();
const LOW = Math.max(...CELLS.map((cell) => cell.y));

/**
 * 6 · « Hexagone » : six côtés, la forme que les abeilles choisissent (le moins de cire pour le
 * plus de place). Les alvéoles se bâtissent en spirale, puis le miel d'or monte du bas vers le haut.
 */
export default function Streak6({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Six côtés : l'hexagone, la ruche." accent={GOLD} delay={1.9} />}>
        <Glow color={GOLD} size={320} delay={1.2} strength={35} />
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id="honey" x1="0" y1="-1" x2="0" y2="1">
              <stop offset="0" stopColor="#fbeec4" />
              <stop offset="0.5" stopColor="#e2b45c" />
              <stop offset="1" stopColor="#9c6a22" />
            </linearGradient>
          </defs>
          {CELLS.map((cell, index) => (
            <g key={index} transform={`translate(${cell.x.toFixed(1)} ${cell.y.toFixed(1)})`}>
              <motion.path d={`M${HEX}Z`} fill="#120f0a" stroke={GOLD} strokeWidth="2.2" strokeLinejoin="round" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 0.94, opacity: 1 }} transition={{ delay: 0.1 + index * 0.045, type: "spring", stiffness: 360, damping: 18 }} />
              <motion.path
                d={`M${HEX}Z`}
                fill="url(#honey)"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 0.8, opacity: index === 0 ? 0 : 0.92 }}
                transition={{ delay: 1.15 + ((LOW - cell.y) / (LOW * 2)) * 0.7, duration: 0.45, ease: "easeOut" }}
              />
            </g>
          ))}
        </svg>
        <Embers count={16} color={GOLD_HI} delay={1.4} from={120} rise={[60, 160]} width={260} seed={6} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, type: "spring", stiffness: 300, damping: 15 }}>
            <MetalText metal="or" style={{ fontSize: 44, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
