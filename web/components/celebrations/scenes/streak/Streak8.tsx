"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, ICE, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

/** Lemniscate de Bernoulli, centrée dans la scène de 300 px. */
const LEMNISCATE = (() => {
  const a = 128;
  const points = Array.from({ length: 121 }, (_, index) => {
    const t = (index / 120) * Math.PI * 2;
    const k = 1 + Math.sin(t) ** 2;
    return `${(150 + (a * Math.cos(t)) / k).toFixed(1)} ${(150 + (a * Math.sin(t) * Math.cos(t)) / k).toFixed(1)}`;
  });
  return `M${points.join(" L")}Z`;
})();
const TRAIL = 14;

/**
 * 8 · « Infini » : un 8 debout bascule et se couche ; couché, c'est l'infini. Une comète le
 * parcourt deux fois, sa traîne derrière elle, et la boucle reste allumée.
 */
export default function Streak8({ count }: { count: number }) {
  const reduced = useReducedMotion();
  return (
    <>
      <Backdrop tint={ICE} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Huit, couché : l'infini." accent={GOLD} delay={1.6} />}>
        <Glow color={GOLD} size={320} delay={0.9} strength={25} />
        {/* Le 8 debout qui se couche, puis s'efface dans la boucle. */}
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ rotate: 0, opacity: 0, scale: 0.8 }} animate={{ rotate: 90, opacity: [0, 1, 1, 0], scale: [0.8, 1, 1.6, 1.8] }} transition={{ duration: 1.1, ease: [0.6, 0, 0.3, 1], opacity: { duration: 1.1, times: [0, 0.15, 0.7, 1] } }}>
            <MetalText metal="or" style={{ fontSize: 150, lineHeight: 1, display: "block" }}>
              8
            </MetalText>
          </motion.div>
        </div>
        <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
          <motion.path d={LEMNISCATE} fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.9 }} transition={{ delay: 0.8, duration: 1.2, ease: "easeInOut" }} />
          <motion.path d={LEMNISCATE} fill="none" stroke={GOLD_HI} strokeWidth="1.2" initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: 1.6, duration: 0.4 }} />
        </svg>
        {!reduced &&
          Array.from({ length: TRAIL }, (_, index) => {
            const size = index === 0 ? 12 : Math.max(2, 8 - index * 0.45);
            return (
              <motion.span
                key={index}
                aria-hidden
                className="absolute left-0 top-0 rounded-full"
                style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, offsetPath: `path("${LEMNISCATE}")`, offsetRotate: "0deg", background: index === 0 ? "#fff" : index < 4 ? GOLD_HI : CREAM, boxShadow: index === 0 ? `0 0 16px 6px ${GOLD_HI}` : undefined }}
                initial={{ offsetDistance: "0%", opacity: 0 }}
                animate={{ offsetDistance: ["0%", "200%"], opacity: [0, 1 - index / TRAIL, 1 - index / TRAIL, 0.6 - index / (TRAIL * 2)] }}
                transition={{ delay: 0.85 + index * 0.025, duration: 2.6, ease: [0.3, 0.1, 0.4, 1], opacity: { delay: 0.85 + index * 0.025, duration: 2.6, times: [0, 0.05, 0.85, 1] } }}
              />
            );
          })}
        <motion.div className="absolute inset-x-0 bottom-0 grid place-items-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.5 }}>
          <MetalText metal="creme" style={{ fontSize: 36, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
