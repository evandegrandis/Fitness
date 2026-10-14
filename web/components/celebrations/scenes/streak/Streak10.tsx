"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, CREAM, EMBER, GOLD, GOLD_HI, MetalText, SceneLayout, seeded } from "../../kit";
import { StreakCaption } from "./caption";

const TICK = 0.16;
const LIFTOFF = 0.25 + TICK * 10;

/** La fusée : corps crème, coiffe et ailerons d'or, hublot. */
function Rocket() {
  return (
    <svg viewBox="-30 -80 60 150" width="60" height="150" aria-hidden>
      <path d="M0 -78 C18 -56 20 -20 18 30 L-18 30 C-20 -20 -18 -56 0 -78Z" fill={CREAM} />
      <path d="M0 -78 C10 -66 14 -54 15 -44 L-15 -44 C-14 -54 -10 -66 0 -78Z" fill={GOLD} />
      <circle cx="0" cy="-18" r="7" fill="#1d2a4a" stroke={GOLD} strokeWidth="2.5" />
      <path d="M-18 6 L-30 40 L-18 32Z M18 6 L30 40 L18 32Z" fill={GOLD} />
      <rect x="-10" y="30" width="20" height="6" fill="#8f6a2c" />
    </svg>
  );
}

/**
 * 10 · « Compte à rebours » : dix, neuf, huit… le compte part de la série elle-même. À zéro, mise
 * à feu : la fumée s'étale sur le pas de tir, l'écran tremble, la fusée part et sort par le haut.
 */
export default function Streak10({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const smoke = useMemo(() => {
    const random = seeded(10);
    return Array.from({ length: 22 }, (_, index) => ({ x: (random() - 0.5) * 60, to: (index % 2 ? 1 : -1) * (40 + random() * 170), up: -random() * 70, size: 40 + random() * 60, lag: random() * 0.4 }));
  }, []);
  return (
    <>
      <Backdrop tint={EMBER} veil={0.92} />
      <motion.div className="absolute inset-0" animate={reduced ? undefined : { x: [0, 0, -3, 3, -2, 2, 0] }} transition={{ delay: LIFTOFF, duration: 0.9, times: [0, 0.05, 0.2, 0.4, 0.6, 0.8, 1] }}>
        <SceneLayout caption={<StreakCaption count={count} sub="Dix, neuf, huit… décollage." accent={GOLD} delay={LIFTOFF + 0.6} />}>
          {/* Le compte à rebours : chaque chiffre frappe puis s'efface. */}
          {Array.from({ length: 10 }, (_, index) => {
            const value = 10 - index;
            return (
              <motion.div key={value} className="absolute inset-x-0 top-6 grid place-items-center" initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: [0, 1, 0], scale: [1.4, 1, 0.9] }} transition={{ delay: 0.25 + index * TICK, duration: TICK * 1.6, times: [0, 0.2, 1] }}>
                <MetalText metal={index === 0 ? "or" : "creme"} style={{ fontSize: index === 0 ? 96 : 76, lineHeight: 1, display: "block" }}>
                  {value}
                </MetalText>
              </motion.div>
            );
          })}
          {/* Pas de tir, puis la fusée qui part. */}
          <div className="absolute inset-x-10 bottom-2 h-[3px] rounded-full" style={{ background: "#4a4438" }} />
          <motion.div className="absolute bottom-[10px] left-1/2 -ml-[30px]" initial={{ y: 0 }} animate={{ y: [0, 2, -40, -1000] }} transition={{ delay: LIFTOFF - 0.1, duration: 1.4, times: [0, 0.1, 0.35, 1], ease: "easeIn" }}>
            <motion.div className="absolute left-1/2 top-[146px] -ml-[9px] h-24 w-[18px] origin-top rounded-b-full" style={{ background: `linear-gradient(180deg, #fff, ${GOLD_HI} 25%, ${EMBER} 65%, transparent)` }} initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: [0, 0.6, 1.2, 1], opacity: 1 }} transition={{ delay: LIFTOFF - 0.15, duration: 0.5 }} />
            <Rocket />
          </motion.div>
          {!reduced &&
            smoke.map((puff, index) => (
              <motion.span
                key={index}
                aria-hidden
                className="absolute bottom-0 left-1/2 rounded-full"
                style={{ width: puff.size, height: puff.size, marginLeft: -puff.size / 2 + puff.x, marginBottom: -puff.size / 3, background: "radial-gradient(circle, rgba(236,230,216,0.55), rgba(236,230,216,0.12) 60%, transparent 70%)" }}
                initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
                animate={{ x: puff.to, y: puff.up, scale: [0.2, 1.4, 2], opacity: [0, 0.9, 0] }}
                transition={{ delay: LIFTOFF + puff.lag * 0.6, duration: 2, ease: "easeOut" }}
              />
            ))}
          <motion.div aria-hidden className="absolute inset-x-0 bottom-0 h-40" style={{ background: `radial-gradient(60% 100% at 50% 100%, color-mix(in srgb, ${GOLD_HI} 55%, transparent), transparent 70%)` }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.2] }} transition={{ delay: LIFTOFF, duration: 1.4 }} />
        </SceneLayout>
      </motion.div>
    </>
  );
}
