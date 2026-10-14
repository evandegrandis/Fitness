"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, Glow, ICE, MetalText, NIGHT, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

/** Les douze signes, en glyphes texte (U+FE0E : jamais d'émoji). */
const SIGNS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((sign) => `${sign}︎`);
const STEP = 0.11;

/**
 * 12 · « Zodiaque » : la roue céleste. Les douze signes s'allument un par un dans le sens du ciel
 * pendant qu'un faisceau en fait le tour ; au douzième, la roue est complète et le 12 s'embrase au centre.
 */
export default function Streak12({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={NIGHT} veil={0.86} />
      <SceneLayout caption={<StreakCaption count={count} sub="Douze S : le tour complet du zodiaque." accent={GOLD} delay={2} />}>
        <Glow color={GOLD} size={330} delay={1.5} strength={30} />
        {/* Le faisceau qui fait le tour pendant que les signes s'allument. */}
        <motion.div aria-hidden className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, ${GOLD_HI} 30%, transparent) 26deg, transparent 32deg)` }} initial={{ rotate: -15, opacity: 0 }} animate={{ rotate: 345, opacity: [0, 1, 1, 0] }} transition={{ delay: 0.15, duration: STEP * 12 + 0.1, ease: "linear", opacity: { delay: 0.15, duration: STEP * 12 + 0.4, times: [0, 0.05, 0.85, 1] } }} />
        <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ rotate: -20, scale: 0.85, opacity: 0 }} animate={{ rotate: 25, scale: 1, opacity: 1 }} transition={{ duration: 3.8, ease: [0.2, 0.7, 0.3, 1], opacity: { duration: 0.4 } }}>
          <circle r="140" fill="none" stroke={GOLD} strokeOpacity="0.6" strokeWidth="1.5" />
          <circle r="134" fill="none" stroke={GOLD} strokeOpacity="0.3" strokeWidth="0.8" />
          <circle r="86" fill="none" stroke={GOLD} strokeOpacity="0.6" strokeWidth="1.2" />
          {Array.from({ length: 72 }, (_, index) => {
            const a = (index / 72) * Math.PI * 2;
            const long = index % 6 === 0;
            return <line key={index} x1={Math.cos(a) * 134} y1={Math.sin(a) * 134} x2={Math.cos(a) * (long ? 124 : 130)} y2={Math.sin(a) * (long ? 124 : 130)} stroke={GOLD} strokeOpacity={long ? 0.8 : 0.35} strokeWidth="1" />;
          })}
          {SIGNS.map((_, index) => {
            const a = ((index * 30 - 90 - 15) * Math.PI) / 180;
            return <line key={index} x1={Math.cos(a) * 86} y1={Math.sin(a) * 86} x2={Math.cos(a) * 124} y2={Math.sin(a) * 124} stroke={GOLD} strokeOpacity="0.4" strokeWidth="1" />;
          })}
          {SIGNS.map((sign, index) => {
            const a = ((index * 30 - 90) * Math.PI) / 180;
            return (
              <motion.text
                key={index}
                x={Math.cos(a) * 105}
                y={Math.sin(a) * 105}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="22"
                fill={GOLD_HI}
                initial={{ opacity: 0.15 }}
                animate={{ opacity: [0.15, 1, 0.85] }}
                transition={{ delay: 0.2 + index * STEP, duration: 0.5 }}
                style={{ filter: "drop-shadow(0 0 6px rgba(244,220,160,0.6))" }}
              >
                {sign}
              </motion.text>
            );
          })}
        </motion.svg>
        <Shockwave color={GOLD_HI} delay={0.2 + STEP * 12} size={320} width={2} />
        <Shockwave color={ICE} delay={0.35 + STEP * 12} size={420} width={1} duration={1.3} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + STEP * 12, type: "spring", stiffness: 260, damping: 14 }}>
            <MetalText metal="or" style={{ fontSize: 78, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
