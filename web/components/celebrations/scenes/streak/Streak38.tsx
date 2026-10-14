"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const POCKETS = 38;
const STEP = 360 / POCKETS;
const SPIN = 3;
const WHEEL_END = -620;
const BALL_END = 905;
/** La case où la bille s'arrête, dans le repère de la roue. */
const LANDED = Math.round((((BALL_END - WHEEL_END) % 360) + 360) % 360 / STEP) % POCKETS;

function wedge(index: number, r0: number, r1: number) {
  const a0 = ((index * STEP - 90 - STEP / 2) * Math.PI) / 180;
  const a1 = ((index * STEP - 90 + STEP / 2) * Math.PI) / 180;
  const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
}

/**
 * 38 · « Roulette » : la roulette américaine a trente-huit cases, le 0 et le 00 compris. La roue
 * tourne, la bille court en sens inverse sur la piste, perd de la vitesse, saute et tombe dans une case qui s'allume en or.
 */
export default function Streak38({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Trente-huit cases. La bille est tombée." accent={GOLD} delay={SPIN - 0.2} />}>
        <Glow color={GOLD} size={340} delay={SPIN - 0.5} strength={30} />
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <circle r="146" fill="#1a1611" stroke={GOLD} strokeWidth="2" />
          <circle r="132" fill="#0e0c09" stroke={GOLD} strokeOpacity="0.4" />
          <motion.g initial={{ rotate: 0 }} animate={{ rotate: WHEEL_END }} transition={{ duration: SPIN, ease: [0.15, 0.6, 0.3, 1] }}>
            {Array.from({ length: POCKETS }, (_, index) => {
              const green = index === 0 || index === POCKETS / 2;
              return <path key={index} d={wedge(index, 72, 112)} fill={green ? "#1f5a33" : index % 2 ? "#9b231f" : "#141210"} stroke={GOLD} strokeOpacity="0.5" strokeWidth="0.7" />;
            })}
            <motion.path d={wedge(LANDED, 72, 112)} fill={GOLD_HI} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.75, 1] }} transition={{ delay: SPIN, duration: 0.6 }} />
            <circle r="72" fill="#2a2319" stroke={GOLD} strokeWidth="1.5" />
            {[0, 90, 180, 270].map((deg) => (
              <line key={deg} x1="0" y1="0" x2={Math.cos((deg * Math.PI) / 180) * 50} y2={Math.sin((deg * Math.PI) / 180) * 50} stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
            ))}
            <circle r="12" fill={GOLD_HI} />
          </motion.g>
          {/* La bille : sur la piste extérieure, puis elle descend dans la case. */}
          <motion.g initial={{ rotate: 0 }} animate={{ rotate: BALL_END }} transition={{ duration: SPIN, ease: [0.2, 0.55, 0.35, 1] }}>
            <motion.circle cx="0" r="6" fill={CREAM} stroke="#fff" initial={{ cy: -124 }} animate={{ cy: [-124, -124, -114, -120, -92] }} transition={{ duration: SPIN, times: [0, 0.65, 0.78, 0.86, 1] }} />
          </motion.g>
        </svg>
        <Shockwave color={GOLD_HI} delay={SPIN} size={300} width={1.5} />
        <motion.div className="absolute inset-0 grid place-items-center" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: SPIN - 0.1, type: "spring", stiffness: 280, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 52, lineHeight: 1, display: "block", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.9))" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
