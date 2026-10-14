"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, EMBER, GOLD, GOLD_HI, MetalText, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const SHOT = 1.25;

/**
 * 23 · « Le 23 » : le numéro de Michael Jordan. Tir en extension depuis le bas de l'écran : le
 * ballon monte en cloche en tournant, redescend au centre du cercle sans toucher l'arceau, le filet
 * claque (swish) et le 23 s'affiche comme sur un maillot.
 */
export default function Streak23({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={EMBER} veil={0.9} at="60% 30%" />
      {/* Le panier : planche, arceau, filet. */}
      <div className="absolute left-1/2 top-[22%]" style={{ marginLeft: 20 }}>
        <div className="absolute -left-[70px] -top-[86px] h-[96px] w-[140px] rounded-sm" style={{ border: `2px solid ${CREAM}`, background: "rgba(236,230,216,0.05)" }}>
          <div className="absolute bottom-[10px] left-1/2 h-[40px] w-[52px] -translate-x-1/2" style={{ border: `2px solid ${CREAM}` }} />
        </div>
        <motion.svg viewBox="-40 0 80 70" width="80" height="70" className="absolute -left-[40px] top-[6px] origin-top overflow-visible" aria-hidden initial={{ scaleY: 1, scaleX: 1 }} animate={{ scaleY: [1, 1, 1.35, 0.92, 1], scaleX: [1, 1, 0.84, 1.04, 1] }} transition={{ duration: SHOT + 0.6, times: [0, SHOT / (SHOT + 0.6), (SHOT + 0.15) / (SHOT + 0.6), (SHOT + 0.35) / (SHOT + 0.6), 1] }}>
          {Array.from({ length: 7 }, (_, index) => {
            const top = -34 + index * (68 / 6);
            const bottom = -20 + index * (40 / 6);
            return <line key={index} x1={top} y1="0" x2={bottom} y2="60" stroke={CREAM} strokeOpacity="0.7" strokeWidth="1.2" />;
          })}
          {[15, 30, 45].map((y) => (
            <line key={y} x1={-34 + (y / 60) * 14} y1={y} x2={34 - (y / 60) * 14} y2={y} stroke={CREAM} strokeOpacity="0.5" strokeWidth="1" />
          ))}
        </motion.svg>
        <div className="absolute -left-[40px] top-0 h-[8px] w-[80px] rounded-[50%]" style={{ border: `3px solid ${EMBER}` }} />
        <div className="absolute top-[30px]">
          <Shockwave color={GOLD_HI} delay={SHOT + 0.05} size={200} width={2} />
          <Sparks count={18} color={GOLD_HI} delay={SHOT + 0.05} distance={[60, 120]} size={2.5} seed={23} />
        </div>
      </div>
      {/* Le ballon : en cloche, tourne à rebours, puis traverse le filet. */}
      <motion.div
        className="absolute left-1/2 top-[22%]"
        initial={{ x: -130, y: 560, scale: 1.5 }}
        animate={{ x: [-130, -60, 20, 20], y: [560, -120, -14, 90], scale: [1.5, 1.05, 0.88, 0.85], opacity: [1, 1, 1, 0] }}
        transition={{ duration: SHOT + 0.35, times: [0, 0.5, SHOT / (SHOT + 0.35), 1], ease: "easeInOut" }}
      >
        <motion.svg viewBox="-24 -24 48 48" width="48" height="48" className="-ml-6 -mt-6" aria-hidden initial={{ rotate: 0 }} animate={{ rotate: -540 }} transition={{ duration: SHOT, ease: "linear" }}>
          <circle r="22" fill="url(#bb)" />
          <path d="M-22 0 H22 M0 -22 V22 M-15 -16 C-6 -6 -6 6 -15 16 M15 -16 C6 -6 6 6 15 16" stroke="#3b1a0c" strokeWidth="1.6" fill="none" />
          <defs>
            <radialGradient id="bb" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#f2a56b" />
              <stop offset="1" stopColor="#a8471f" />
            </radialGradient>
          </defs>
        </motion.svg>
      </motion.div>
      <motion.div className="absolute inset-x-0 top-[44%] grid place-items-center" initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: SHOT + 0.2, type: "spring", stiffness: 260, damping: 15 }}>
        <MetalText metal="or" style={{ fontSize: 120, lineHeight: 1, display: "block", fontStretch: "condensed", letterSpacing: "-0.02em" }}>
          {count}
        </MetalText>
      </motion.div>
      <div className="absolute inset-x-0 top-[62%] flex justify-center px-6">
        <StreakCaption count={count} sub="Le 23 de Jordan. Panier." accent={GOLD} delay={SHOT + 0.45} />
      </div>
    </>
  );
}
