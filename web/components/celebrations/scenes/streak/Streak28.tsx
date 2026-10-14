"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, MUTED, SceneLayout, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/** Les diviseurs propres de 28 : ils s'additionnent exactement en 28. */
const DIVISORS = [1, 2, 4, 7, 14];
const MERGE = 1.55;

/**
 * 28 · « Nombre parfait » : 28 est égal à la somme de ses diviseurs, 1 + 2 + 4 + 7 + 14. Les
 * diviseurs tombent un à un sur la ligne, les signes « + » s'intercalent, puis tout converge et fusionne en 28.
 */
export default function Streak28({ count }: { count: number }) {
  const xs = [-118, -70, -22, 30, 98];
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="1 + 2 + 4 + 7 + 14 = 28. Un nombre parfait." accent={GOLD} delay={MERGE + 0.5} />}>
        {DIVISORS.map((divisor, index) => (
          <motion.span
            key={divisor}
            className="absolute left-1/2 top-1/2 h-0 w-0"
            initial={{ x: xs[index], y: -220, opacity: 0 }}
            animate={{ x: [xs[index], xs[index], xs[index], 0], y: [-220, 0, 0, 0], opacity: [0, 1, 1, 0], scale: [1, 1, 1, 0.5] }}
            transition={{ delay: 0.1 + index * 0.16, duration: MERGE - index * 0.16, times: [0, 0.3, 0.75, 1], ease: "easeInOut" }}
          >
            <span className="absolute -translate-x-1/2 -translate-y-1/2 font-display text-[44px] font-bold leading-none" style={{ color: CREAM }}>
              {divisor}
            </span>
          </motion.span>
        ))}
        {xs.slice(0, 4).map((x, index) => (
          <motion.span key={index} className="absolute left-1/2 top-1/2 h-0 w-0" initial={{ x: (x + xs[index + 1]) / 2, opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0] }} transition={{ delay: 0.85, duration: MERGE - 0.75, times: [0, 0.2, 0.75, 1] }}>
            <span className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-2xl" style={{ color: GOLD }}>
              +
            </span>
          </motion.span>
        ))}
        <Glow color={GOLD} size={300} delay={MERGE} strength={45} />
        <Shockwave color={GOLD_HI} delay={MERGE} size={320} width={2} />
        <Sparks count={28} color={GOLD_HI} delay={MERGE} distance={[90, 160]} size={2.5} seed={28} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: MERGE - 0.05, type: "spring", stiffness: 300, damping: 13 }}>
            <MetalText metal="or" style={{ fontSize: 120, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
        <motion.p className="absolute inset-x-0 bottom-6 text-center font-mono text-[0.72rem] uppercase tracking-[0.3em]" style={{ color: MUTED }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: MERGE + 0.25, duration: 0.4 }}>
          Nombre parfait
        </motion.p>
      </SceneLayout>
    </>
  );
}
