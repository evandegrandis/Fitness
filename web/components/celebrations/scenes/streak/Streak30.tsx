"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, Glow, ICE, MetalText, Rays, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

/** La valve de l'huître : bord festonné et côtes qui rayonnent depuis la charnière. */
const VALVE = "M-110 0 C-112 -30 -96 -58 -70 -72 C-56 -84 -40 -88 -24 -86 C-10 -96 10 -96 24 -86 C40 -88 56 -84 70 -72 C96 -58 112 -30 110 0 Z";
const RIBS = Array.from({ length: 9 }, (_, index) => {
  const a = Math.PI + ((index + 1) / 10) * Math.PI;
  return `M0 0 L${(Math.cos(a) * 104).toFixed(1)} ${(Math.sin(a) * 84).toFixed(1)}`;
}).join(" ");
const OPEN = 0.7;

/**
 * 30 · « Noces de perle » : trente ans, c'est la perle. L'huître est posée, close ; sa valve se
 * soulève lentement sur sa charnière et la lumière sort : une perle nacrée, qui tourne ses reflets.
 */
export default function Streak30({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={ICE} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Trente : les noces de perle." accent={ICE} delay={1.9} />}>
        <Rays count={14} color={CREAM} delay={OPEN + 0.25} inner={40} outer={190} spin={18} duration={2.8} peak={0.35} y={22} />
        <Glow color={ICE} size={260} delay={OPEN + 0.2} strength={45} y={22} />
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id="shell" x1="0" y1="-1" x2="0" y2="1">
              <stop offset="0" stopColor="#4a453c" />
              <stop offset="1" stopColor="#1a1814" />
            </linearGradient>
            <radialGradient id="nacre" cx="0.5" cy="0.4" r="0.7">
              <stop offset="0" stopColor="#f3eee6" />
              <stop offset="0.7" stopColor="#bdb7ad" />
              <stop offset="1" stopColor="#6e6a62" />
            </radialGradient>
            <radialGradient id="pearl" cx="0.36" cy="0.32" r="0.75">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#f3ece2" />
              <stop offset="0.7" stopColor="#d7d2e6" />
              <stop offset="1" stopColor="#9a9486" />
            </radialGradient>
          </defs>
          {/* Valve du bas, intérieur nacré. */}
          <g transform="translate(0 40) scale(1 -0.55)">
            <path d={VALVE} fill="url(#shell)" stroke={GOLD} strokeOpacity="0.6" strokeWidth="1.5" />
          </g>
          <ellipse cx="0" cy="34" rx="86" ry="26" fill="url(#nacre)" opacity="0.85" />
          {/* La perle. */}
          <motion.g initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: OPEN, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <circle cx="0" cy="22" r="24" fill="url(#pearl)" />
            <motion.ellipse cx="-8" cy="12" rx="7" ry="4" fill="#fff" opacity="0.9" initial={{ rotate: 0 }} animate={{ rotate: 40, cx: [-8, 2, -6] }} transition={{ delay: OPEN + 0.3, duration: 2.4 }} />
            <motion.circle cx="0" cy="22" r="24" fill="none" stroke="#e6d4ef" strokeWidth="2" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0.1, 0.5] }} transition={{ delay: OPEN + 0.4, duration: 2.2 }} />
          </motion.g>
          {/* Valve du haut : se soulève sur sa charnière (en arrière). */}
          <motion.g style={{ originX: "50%", originY: "100%" }} initial={{ y: 40, scaleY: 0.62 }} animate={{ y: -4, scaleY: 1.05, rotate: -6 }} transition={{ delay: 0.25, duration: OPEN + 0.5, ease: [0.6, 0, 0.2, 1] }}>
            <path d={VALVE} fill="url(#shell)" stroke={GOLD} strokeWidth="1.5" />
            <path d={RIBS} stroke={GOLD} strokeOpacity="0.35" strokeWidth="1" fill="none" />
          </motion.g>
        </svg>
        <motion.div className="absolute inset-x-0 -top-6 grid place-items-center" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: OPEN + 0.7, duration: 0.5 }}>
          <MetalText metal="argent" style={{ fontSize: 76, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
