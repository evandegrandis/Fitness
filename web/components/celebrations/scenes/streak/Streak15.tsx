"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, MetalText, SAGE, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const KICK = 0.35;
const FLIGHT = 1.15;

/**
 * 15 · « Le XV » : un pied de rugby, quinze joueurs. Le ballon part du bas de l'écran en
 * tournant sur lui-même, file vers les poteaux en perspective et passe au-dessus de la barre :
 * transformation réussie, les poteaux s'illuminent et le XV s'inscrit dessus.
 */
export default function Streak15({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={SAGE} veil={0.92} at="50% 60%" />
      {/* Le terrain en perspective : lignes qui fuient vers l'horizon. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 top-[46%] overflow-hidden" style={{ perspective: 300 }}>
        <div className="absolute inset-x-[-60%] bottom-[-10%] top-0 origin-top" style={{ transform: "rotateX(62deg)", background: `repeating-linear-gradient(180deg, transparent 0 46px, rgba(236,230,216,0.22) 46px 48px), linear-gradient(180deg, #121a10, #1c2a17)` }} />
        <div className="absolute inset-x-0 top-0 h-16" style={{ background: "linear-gradient(180deg, #070708, transparent)" }} />
      </div>
      {/* Les poteaux en H, au loin. */}
      <svg aria-hidden viewBox="-60 -120 120 140" className="absolute left-1/2 top-[22%] h-[30%] -translate-x-1/2 overflow-visible">
        <motion.g initial={{ opacity: 0.55 }} animate={{ opacity: [0.55, 0.55, 1] }} transition={{ duration: KICK + FLIGHT + 0.1, times: [0, 0.9, 1] }}>
          <path d="M-34 20 L-34 -118 M34 20 L34 -118 M-34 -30 L34 -30" stroke={CREAM} strokeWidth="4" strokeLinecap="round" fill="none" />
        </motion.g>
        <motion.path d="M-34 20 L-34 -118 M34 20 L34 -118 M-34 -30 L34 -30" stroke={GOLD_HI} strokeWidth="5" strokeLinecap="round" fill="none" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: KICK + FLIGHT, duration: 0.5 }} style={{ filter: `drop-shadow(0 0 8px ${GOLD})` }} />
      </svg>
      {/* Le ballon : arc, rapetisse avec la distance, tourne bout par-dessus bout. */}
      <motion.div
        className="absolute left-1/2 top-[30%]"
        initial={{ x: -40, y: 470, scale: 1.7, opacity: 0 }}
        animate={{ x: [-40, -10, 6], y: [470, 20, -40], scale: [1.7, 0.6, 0.24], opacity: [0, 1, 1, 0] }}
        transition={{ delay: KICK, duration: FLIGHT, ease: "linear", y: { delay: KICK, duration: FLIGHT, times: [0, 0.6, 1], ease: [0.2, 0.6, 0.4, 1] }, scale: { delay: KICK, duration: FLIGHT, ease: [0.2, 0.7, 0.4, 1] }, opacity: { delay: KICK, duration: FLIGHT + 0.15, times: [0, 0.05, 0.9, 1] } }}
      >
        <motion.svg viewBox="-34 -22 68 44" width="68" height="44" className="-ml-[34px] -mt-[22px] overflow-visible" initial={{ rotate: 0 }} animate={{ rotate: 900 }} transition={{ delay: KICK, duration: FLIGHT, ease: "linear" }} aria-hidden>
          <ellipse rx="32" ry="20" fill="url(#ball)" stroke="#8f6a2c" strokeWidth="1.5" />
          <path d="M-14 -3 L14 -3 M-8 -7 L-8 1 M0 -7 L0 1 M8 -7 L8 1" stroke="#5b3f15" strokeWidth="2" />
          <defs>
            <radialGradient id="ball" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fff8e6" />
              <stop offset="0.6" stopColor={CREAM} />
              <stop offset="1" stopColor="#b9a989" />
            </radialGradient>
          </defs>
        </motion.svg>
      </motion.div>
      <div className="absolute left-1/2 top-[22%] h-[30%]" style={{ marginTop: "8%" }}>
        <Shockwave color={GOLD_HI} delay={KICK + FLIGHT} size={260} width={2} />
        <Sparks count={30} color={GOLD_HI} delay={KICK + FLIGHT} distance={[60, 160]} size={2.5} seed={15} />
      </div>
      <motion.div className="absolute inset-x-0 top-[8%] grid place-items-center" initial={{ opacity: 0, y: -14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: KICK + FLIGHT + 0.15, type: "spring", stiffness: 240, damping: 15 }}>
        <MetalText metal="or" style={{ fontSize: 76, lineHeight: 1, display: "block", letterSpacing: "0.04em" }}>
          XV
        </MetalText>
      </motion.div>
      <div className="absolute inset-x-0 top-[56%] flex justify-center px-6">
        <StreakCaption count={count} sub="Le XV : transformation réussie." accent={GOLD} delay={KICK + FLIGHT + 0.4} />
      </div>
    </>
  );
}
