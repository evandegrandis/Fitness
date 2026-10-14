"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, INK, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const R = 92;
/** Une moitié du taijitu : grand demi-cercle, puis deux petits qui dessinent la vague. */
const HALF = `M0 ${-R} A${R} ${R} 0 0 1 0 ${R} A${R / 2} ${R / 2} 0 0 1 0 0 A${R / 2} ${R / 2} 0 0 0 0 ${-R}Z`;

/**
 * 2 · « Yin et yang » : deux gouttes, l'une d'or, l'autre d'encre cerclée d'or, tournent l'une
 * autour de l'autre en se rapprochant, puis s'emboîtent : deux forces, un seul cercle.
 */
export default function Streak2({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Deux forces, un seul cercle." accent={GOLD} delay={1.75} />}>
        <Glow color={GOLD} size={300} delay={1.15} strength={35} />
        <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ rotate: -200 }} animate={{ rotate: 160 }} transition={{ duration: 3.4, ease: [0.3, 0.6, 0.2, 1] }}>
          <defs>
            <linearGradient id="yy-gold" x1="0" y1="-1" x2="0" y2="1">
              <stop offset="0" stopColor="#fbeec4" />
              <stop offset="0.45" stopColor={GOLD_HI} />
              <stop offset="1" stopColor="#a87b36" />
            </linearGradient>
          </defs>
          {/* L'or : arrive de la droite. */}
          <motion.g initial={{ x: 130, y: -60, scale: 0.55, opacity: 0 }} animate={{ x: 0, y: 0, scale: 1, opacity: 1 }} transition={{ duration: 1.15, ease: [0.5, 0, 0.2, 1] }}>
            <path d={HALF} fill="url(#yy-gold)" />
            <circle cx="0" cy={-R / 2} r="13" fill={INK} />
          </motion.g>
          {/* L'encre : arrive de la gauche, tournée d'un demi-tour. */}
          <motion.g initial={{ x: -130, y: 60, scale: 0.55, opacity: 0 }} animate={{ x: 0, y: 0, scale: 1, opacity: 1 }} transition={{ duration: 1.15, ease: [0.5, 0, 0.2, 1] }}>
            <g transform="rotate(180)">
              <path d={HALF} fill="#0d0c0a" stroke={GOLD} strokeWidth="1.5" />
              <circle cx="0" cy={-R / 2} r="13" fill={GOLD_HI} />
            </g>
          </motion.g>
          <motion.circle r={R + 1} fill="none" stroke={CREAM} strokeWidth="1.5" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.7 }} transition={{ delay: 1.1, duration: 0.6 }} />
        </motion.svg>
        <Shockwave color={GOLD_HI} delay={1.1} size={360} width={2} />
        <Shockwave color={CREAM} delay={1.25} size={460} width={1} duration={1.3} />
        <motion.div className="absolute inset-x-0 -top-6 grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.5 }}>
          <MetalText metal="creme" style={{ fontSize: 40, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
