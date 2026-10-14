"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const DROP = 1.05;

/**
 * 33 · « 33 tours » : le disque microsillon. La platine démarre, le vinyle prend sa vitesse (33
 * tours par minute, vraie cadence), le bras pivote, se pose sur le premier sillon, et le reflet
 * reste immobile pendant que l'étiquette d'or tourne.
 */
export default function Streak33({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Trente-trois tours." accent={GOLD} delay={1.9} />}>
        <Glow color={GOLD} size={340} delay={DROP} strength={25} />
        {/* Le plateau et le disque : accélère puis tourne à 33 tours/min (0,55 tour/s). */}
        <motion.div
          className="absolute left-1/2 top-1/2 h-[262px] w-[262px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "repeating-radial-gradient(circle, #0c0c0c 0 1.5px, #1a1a1a 1.5px 3px)", boxShadow: "0 0 0 6px #1d1b17, 0 20px 50px rgba(0,0,0,0.6)" }}
          initial={{ rotate: 0, scale: 0.8, opacity: 0 }}
          animate={{ rotate: [0, 40, 200, 560], scale: 1, opacity: 1 }}
          transition={{ duration: 4.2, times: [0, 0.2, 0.45, 1], ease: "linear", scale: { duration: 0.5 }, opacity: { duration: 0.3 } }}
        >
          {/* L'étiquette : on la voit tourner. */}
          <div className="absolute left-1/2 top-1/2 grid h-[96px] w-[96px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" style={{ background: `radial-gradient(circle, #1a1408 0 5px, ${GOLD_HI} 6px, ${GOLD} 70%, #8f6a2c)` }}>
            <span className="absolute top-3 font-mono text-[0.5rem] uppercase tracking-[0.25em]" style={{ color: "#3a2a12" }}>
              Série de S
            </span>
            <span className="absolute bottom-2 font-display text-[1.7rem] font-bold leading-none" style={{ color: "#2a1d08" }}>
              {count}
            </span>
            <span className="absolute left-[14px] top-1/2 -translate-y-1/2 font-mono text-[0.48rem]" style={{ color: "#3a2a12" }}>
              tr/min
            </span>
          </div>
        </motion.div>
        {/* Le reflet fixe sur les sillons. */}
        <div aria-hidden className="absolute left-1/2 top-1/2 h-[262px] w-[262px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "conic-gradient(from 20deg, transparent 0deg, rgba(236,230,216,0.13) 25deg, transparent 55deg, transparent 180deg, rgba(236,230,216,0.1) 205deg, transparent 235deg)" }} />
        {/* Le bras de lecture : pivote depuis la droite et se pose. */}
        <motion.svg viewBox="0 0 120 220" width="120" height="220" className="absolute -right-6 -top-6 overflow-visible" style={{ originX: "86px", originY: "26px" }} aria-hidden initial={{ rotate: -28 }} animate={{ rotate: [-28, 6, 6] }} transition={{ delay: 0.35, duration: DROP - 0.35 + 0.2, times: [0, 0.8, 1], ease: "easeInOut" }}>
          <circle cx="86" cy="26" r="16" fill="#26231e" stroke={GOLD} strokeWidth="1.5" />
          <circle cx="86" cy="26" r="5" fill={GOLD} />
          <path d="M86 26 L84 150 L52 196" stroke={CREAM} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="38" y="190" width="24" height="14" rx="2" transform="rotate(-34 50 197)" fill={GOLD} />
        </motion.svg>
      </SceneLayout>
    </>
  );
}
