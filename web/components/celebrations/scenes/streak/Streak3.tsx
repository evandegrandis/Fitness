"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, MetalText, SceneLayout, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const KNOCKS = [0.25, 0.62, 0.99];
const VELVET = "repeating-linear-gradient(90deg, #3a0d14 0px, #6b1a24 14px, #8a2a32 22px, #5a1520 34px, #2c0a10 46px)";

/** Un pan du rideau : velours plissé, frange d'or, ombre vers le milieu de la scène. */
function Curtain({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  return (
    <motion.div
      aria-hidden
      className="absolute inset-y-0 w-1/2"
      style={{ [side]: 0, background: VELVET, transformOrigin: left ? "0% 0%" : "100% 0%" }}
      initial={{ x: 0, scaleX: 1, skewY: 0 }}
      animate={{ x: left ? "-92%" : "92%", scaleX: [1, 1, 0.82], skewY: [0, 0, left ? -2 : 2] }}
      transition={{ delay: 1.45, duration: 1.05, ease: [0.55, 0, 0.25, 1], scaleX: { delay: 1.45, duration: 1.05, times: [0, 0.2, 1] }, skewY: { delay: 1.45, duration: 1.05, times: [0, 0.2, 1] } }}
    >
      <div className="absolute inset-0" style={{ background: `linear-gradient(${left ? 90 : 270}deg, transparent 60%, rgba(0,0,0,0.55))` }} />
      <div className="absolute inset-x-0 bottom-0 h-5" style={{ background: `repeating-linear-gradient(90deg, ${GOLD} 0 3px, #8f6a2c 3px 6px)`, opacity: 0.85 }} />
      <div className="absolute inset-x-0 bottom-5 h-[3px]" style={{ background: GOLD_HI }} />
    </motion.div>
  );
}

/**
 * 3 · « Les trois coups » : au théâtre, on frappe trois fois le plancher avant que le rideau se
 * lève. Trois coups font trembler l'écran, le rideau de velours s'ouvre sur le 3 sous la poursuite.
 */
export default function Streak3({ count }: { count: number }) {
  const reduced = useReducedMotion();
  return (
    <>
      <Backdrop tint={GOLD} veil={0.95} />
      <motion.div
        className="absolute inset-0"
        animate={reduced ? undefined : { y: [0, 0, 7, 0, 0, 7, 0, 0, 9, 0] }}
        transition={{ duration: 1.2, times: [0, KNOCKS[0] / 1.2, KNOCKS[0] / 1.2 + 0.02, KNOCKS[0] / 1.2 + 0.08, KNOCKS[1] / 1.2, KNOCKS[1] / 1.2 + 0.02, KNOCKS[1] / 1.2 + 0.08, KNOCKS[2] / 1.2, KNOCKS[2] / 1.2 + 0.02, 1] }}
      >
        {/* La poursuite : un cône de lumière depuis les cintres. */}
        <motion.div
          aria-hidden
          className="absolute left-1/2 top-0 h-[78%] w-[150%] -translate-x-1/2"
          style={{ background: `conic-gradient(from 180deg at 50% 0%, transparent 168deg, color-mix(in srgb, ${GOLD_HI} 22%, transparent) 180deg, transparent 192deg)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.75] }}
          transition={{ delay: 1.7, duration: 1.2 }}
        />
        <SceneLayout caption={<StreakCaption count={count} sub="Les trois coups. Le rideau se lève." accent={GOLD} delay={2.15} />}>
          <motion.div aria-hidden className="absolute left-1/2 top-[62%] h-16 w-64 -translate-x-1/2 rounded-[50%]" style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${GOLD_HI} 40%, transparent), transparent)` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 0.6 }} />
          <div className="absolute inset-0 grid place-items-center">
            <motion.div initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 1.75, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
              <MetalText metal="or" style={{ fontSize: 150, lineHeight: 1, display: "block" }}>
                {count}
              </MetalText>
            </motion.div>
          </div>
          <Sparks count={18} color={GOLD_HI} delay={1.95} distance={[80, 140]} size={2.5} seed={33} />
        </SceneLayout>
      </motion.div>
      {/* Les coups sur le plancher : une onde au pied du rideau et un compteur de 1 à 3. */}
      {KNOCKS.map((at, index) => (
        <div key={index} className="pointer-events-none absolute inset-x-0 bottom-[22%]">
          <Shockwave color={GOLD_HI} delay={at} size={140 + index * 50} width={2} duration={0.6} y={0} />
        </div>
      ))}
      <Curtain side="left" />
      <Curtain side="right" />
      <div className="absolute inset-x-0 top-[30%] flex justify-center gap-5">
        {KNOCKS.map((at, index) => (
          <motion.span
            key={index}
            className="h-3 w-3 rounded-full"
            style={{ background: GOLD_HI, boxShadow: `0 0 12px ${GOLD_HI}` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.4, 1, 1] }}
            transition={{ delay: at, duration: 1.45 - at + 0.2, times: [0, 0.08, 0.2, 1] }}
          />
        ))}
      </div>
      {/* Le lambrequin : la bande fixe en haut du cadre de scène. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[calc(env(safe-area-inset-top)+2.5rem)]" style={{ background: "linear-gradient(180deg, #2c0a10, #5a1520)", borderBottom: `2px solid ${GOLD}` }} />
    </>
  );
}
