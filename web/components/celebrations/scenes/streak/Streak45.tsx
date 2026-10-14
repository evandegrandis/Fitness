"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, MUTED, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const ROWS = 9;
const GAP = 26;
/** Les 45 billes : rangée de 1 en haut à rangée de 9 en bas. Elles tombent rangée du bas d'abord. */
const BALLS = Array.from({ length: ROWS }, (_, row) => Array.from({ length: row + 1 }, (_, col) => ({ row, x: (col - row / 2) * GAP, y: (row - (ROWS - 1) / 2) * GAP * 0.88 + 10 }))).flat();
const fallAt = (row: number, index: number) => 0.15 + (ROWS - 1 - row) * 0.14 + index * 0.012;

/**
 * 45 · « Nombre triangulaire » : 45 = 1 + 2 + … + 9. Les billes tombent du haut de l'écran et
 * s'empilent rangée par rangée, neuf, huit, sept… jusqu'à la bille du sommet ; le triangle s'allume.
 */
export default function Streak45({ count }: { count: number }) {
  const done = fallAt(0, 44) + 0.5;
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="1 + 2 + 3 + … + 9 = 45." accent={GOLD} delay={done + 0.3} />}>
        <Glow color={GOLD} size={300} delay={done} strength={35} y={20} />
        {BALLS.map((ball, index) => (
          <motion.span
            key={index}
            className="absolute left-1/2 top-1/2 h-[22px] w-[22px] rounded-full"
            style={{ marginLeft: ball.x - 11, marginTop: ball.y - 11, background: ball.row === 0 ? `radial-gradient(circle at 35% 30%, #fff8e6, ${GOLD_HI} 45%, ${GOLD})` : `radial-gradient(circle at 35% 30%, #fff8e6, ${CREAM} 45%, #9c9483)` }}
            initial={{ y: -520, opacity: 0 }}
            animate={{ y: [-520, 6, -3, 0], opacity: 1 }}
            transition={{ delay: fallAt(ball.row, index), duration: 0.5, times: [0, 0.7, 0.85, 1], ease: "easeIn" }}
          />
        ))}
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <motion.path d={`M0 ${BALLS[0].y - 22} L${BALLS[44].x + 20} ${BALLS[44].y + 16} L${BALLS[36].x - 20} ${BALLS[36].y + 16}Z`} fill="none" stroke={GOLD_HI} strokeWidth="1.5" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: done, duration: 0.6 }} />
        </svg>
        <motion.div className="absolute -left-2 -top-6" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: done + 0.1, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 70, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
          <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.2em]" style={{ color: MUTED }}>
            Triangulaire
          </p>
        </motion.div>
      </SceneLayout>
    </>
  );
}
