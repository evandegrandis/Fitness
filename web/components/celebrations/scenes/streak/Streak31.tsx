"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, MetalText, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/** Une aile du nœud papillon (côté droit ; la gauche en miroir), plis compris. */
const WING = "M8 -6 C30 -26 58 -34 70 -26 C76 -12 76 12 70 26 C58 34 30 26 8 6 Z";
const FOLDS = "M14 -4 C34 -14 52 -18 64 -16 M14 4 C34 14 52 18 64 16";
const TIE = 0.9;

/**
 * 31 · « Sur son 31 » : se mettre sur son trente et un, c'est sortir sa plus belle tenue. Le
 * projecteur s'allume, les revers du smoking se tracent, le nœud papillon se noue d'un coup sec
 * et un éclat court sur la soie.
 */
export default function Streak31({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.95} />
      <motion.div aria-hidden className="absolute left-1/2 top-0 h-[80%] w-[160%] -translate-x-1/2" style={{ background: `conic-gradient(from 180deg at 50% 0%, transparent 166deg, color-mix(in srgb, ${CREAM} 16%, transparent) 180deg, transparent 194deg)` }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.8] }} transition={{ duration: 0.8 }} />
      <SceneLayout caption={<StreakCaption count={count} sub="Te voilà sur ton trente et un." accent={GOLD} delay={1.8} />}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {/* Le plastron et les revers de satin. */}
          <motion.path d="M-36 -40 L0 70 L36 -40" fill="#f3eee4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.4 }} />
          {[-1, 1].map((side) => (
            <motion.path key={side} d={`M${side * 36} -40 L${side * 4} 70 L${side * 110} 150 L${side * 140} 150 L${side * 140} -40 Z`} fill="#0f0e0c" stroke={GOLD} strokeOpacity="0.55" strokeWidth="1.2" initial={{ x: side * 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
          ))}
          {[20, 44].map((y) => (
            <motion.circle key={y} cy={y} r="3.5" fill="#1a1814" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.75 + y / 200, duration: 0.2 }} />
          ))}
          {/* Le nœud : les ailes jaillissent du centre, se resserrent, se posent. */}
          <g transform="translate(0 -46)">
            {[1, -1].map((side) => (
              <motion.g key={side} style={{ originX: "0px", originY: "0px" }} initial={{ scaleX: 0, scaleY: 0.4, rotate: side * 40 }} animate={{ scaleX: [0, side * 1.25, side * 0.92, side], scaleY: [0.4, 1.1, 0.95, 1], rotate: [side * 40, side * -8, side * 3, 0] }} transition={{ delay: TIE - 0.25, duration: 0.6, times: [0, 0.45, 0.75, 1] }}>
                <path d={WING} fill="url(#silk)" />
                <path d={FOLDS} stroke="#000" strokeOpacity="0.35" strokeWidth="2" fill="none" />
              </motion.g>
            ))}
            <motion.rect x="-11" y="-13" width="22" height="26" rx="5" fill="url(#silk)" stroke="#000" strokeOpacity="0.3" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: TIE - 0.3, duration: 0.4 }} />
            {/* L'éclat qui court sur la soie. */}
            <motion.rect x="-80" y="-34" width="14" height="68" fill="#fff" opacity="0.5" style={{ mixBlendMode: "overlay" }} initial={{ x: -10, opacity: 0, skewX: -20 }} animate={{ x: 160, opacity: [0, 0.7, 0] }} transition={{ delay: TIE + 0.45, duration: 0.6, ease: "easeInOut" }} />
          </g>
          <defs>
            <linearGradient id="silk" x1="0" y1="-1" x2="0" y2="1">
              <stop offset="0" stopColor="#f4dca0" />
              <stop offset="0.5" stopColor="#c99a4c" />
              <stop offset="1" stopColor="#6e4f1c" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute left-1/2 top-[54px]">
          <Sparks count={14} color={GOLD_HI} delay={TIE + 0.05} distance={[70, 130]} size={3} seed={31} spread={140} direction={-90} />
        </div>
        <motion.div className="absolute inset-x-0 -top-12 grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: TIE + 0.4, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 80, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
