"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Backdrop, EMBER, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const HIT = 0.3;
/** Une flamme de bougie : goutte effilée. */
const FLAME = "M0 -11 C4 -5 5 0 3 4 C2 6 -2 6 -3 4 C-5 0 -4 -5 0 -11Z";

/**
 * 36 · « 36 chandelles » : voir trente-six chandelles, c'est voir des étoiles après un coup.
 * L'écran encaisse le choc, puis trente-six flammes tournent en couronne autour de la tête, se
 * posent en cercle et vacillent, chacune sur sa bougie.
 */
export default function Streak36({ count }: { count: number }) {
  const reduced = useReducedMotion();
  return (
    <>
      <Backdrop tint={EMBER} veil={0.92} />
      <motion.div aria-hidden className="absolute inset-0" style={{ background: "#fff" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0] }} transition={{ delay: HIT, duration: 0.35, times: [0, 0.1, 1] }} />
      <motion.div className="absolute inset-0" animate={reduced ? undefined : { x: [0, 0, -12, 10, -6, 4, 0], rotate: [0, 0, -2, 1.5, -1, 0.5, 0] }} transition={{ duration: HIT + 0.6, times: [0, HIT / (HIT + 0.6), 0.45, 0.6, 0.75, 0.88, 1] }}>
        <SceneLayout caption={<StreakCaption count={count} sub="Voir trente-six chandelles." accent={GOLD} delay={1.8} />}>
          <Glow color={EMBER} size={320} delay={HIT} strength={30} />
          <Shockwave color={GOLD_HI} delay={HIT} size={300} width={3} duration={0.7} />
          {/* La couronne : tourne vite après le choc, ralentit, se pose. */}
          <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ rotate: 0, scale: 0.4, opacity: 0 }} animate={{ rotate: 540, scale: 1, opacity: 1 }} transition={{ delay: HIT + 0.05, duration: 1.8, ease: [0.1, 0.7, 0.3, 1], opacity: { delay: HIT, duration: 0.2 } }}>
            {Array.from({ length: 36 }, (_, index) => {
              const a = (index / 36) * Math.PI * 2;
              const x = Math.cos(a) * 118;
              const y = Math.sin(a) * 118;
              return (
                <g key={index} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                  <motion.rect x="-2.5" y="2" width="5" height="12" rx="1" fill="#e9e0cc" initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: 1.5 + (index % 6) * 0.03, duration: 0.3 }} />
                  <motion.g initial={{ scaleY: 1 }} animate={reduced ? undefined : { scaleY: [1, 1.25, 0.9, 1.15, 1], x: [0, 0.6, -0.6, 0.3, 0] }} transition={{ delay: 1.3 + (index % 5) * 0.07, duration: 0.7, repeat: 3, ease: "easeInOut" }} style={{ originX: "0px", originY: "4px" }}>
                    <circle r="9" cy="-3" fill={GOLD_HI} opacity="0.18" />
                    <path d={FLAME} fill={index % 3 ? GOLD_HI : "#ffd38a"} />
                    <path d="M0 -5 C1.6 -2 1.6 1 0 3 C-1.6 1 -1.6 -2 0 -5Z" fill="#fff" />
                  </motion.g>
                </g>
              );
            })}
          </motion.svg>
          <div className="absolute inset-0 grid place-items-center">
            <motion.div initial={{ opacity: 0, scale: 1.6, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: HIT, type: "spring", stiffness: 340, damping: 12 }}>
              <MetalText metal="braise" style={{ fontSize: 110, lineHeight: 1, display: "block" }}>
                {count}
              </MetalText>
            </motion.div>
          </div>
        </SceneLayout>
      </motion.div>
    </>
  );
}
