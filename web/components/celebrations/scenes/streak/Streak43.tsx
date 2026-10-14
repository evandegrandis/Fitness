"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, CREAM, EMBER, GOLD, GOLD_HI, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const FLAT = "M-38 52 C-20 52 20 52 38 52";
const SMILE = "M-44 44 C-24 72 24 72 44 44";
const PULL = 1.55;

/**
 * 43 · « Sourire » : on attribue quarante-trois muscles au visage. Un visage au trait, la bouche
 * droite ; quarante-trois fibres s'allument une à une, des tempes aux commissures, et tirent la
 * bouche en un sourire.
 */
export default function Streak43({ count }: { count: number }) {
  const fibers = useMemo(() => {
    const out: string[] = [];
    const f = (n: number) => n.toFixed(1);
    // Frontal : dix fibres verticales sur le front.
    for (let index = 0; index < 10; index += 1) {
      const x = -54 + index * 12;
      out.push(`M${f(x)} -98 Q${f(x * 1.08)} -78 ${f(x * 0.95)} -56`);
    }
    // Orbiculaires des yeux : huit arcs autour de chaque œil.
    for (const ex of [-34, 34]) {
      for (let index = 0; index < 8; index += 1) {
        const a0 = (index / 8) * Math.PI * 2;
        const a1 = a0 + 0.62;
        const r = 24;
        out.push(`M${f(ex + Math.cos(a0) * r)} ${f(-26 + Math.sin(a0) * r * 0.75)} A${r} ${r * 0.75} 0 0 1 ${f(ex + Math.cos(a1) * r)} ${f(-26 + Math.sin(a1) * r * 0.75)}`);
      }
    }
    // Zygomatiques : cinq faisceaux de chaque pommette vers la commissure.
    for (const side of [-1, 1]) {
      for (let index = 0; index < 5; index += 1) {
        out.push(`M${f(side * (60 + index * 4))} ${f(-6 + index * 6)} Q${f(side * 58)} ${f(30 + index * 2)} ${f(side * 42)} 48`);
      }
    }
    // Orbiculaire de la bouche : sept anneaux.
    for (let index = 0; index < 7; index += 1) {
      const rx = 50 + index * 3.2;
      const ry = 14 + index * 2.6;
      out.push(`M${f(-rx)} 52 A${f(rx)} ${f(ry)} 0 ${index % 2} ${index % 2 ? 1 : 0} ${f(rx)} 52`);
    }
    return out.map((d, index) => ({ d, lag: 0.3 + (index / out.length) * 1.1 }));
  }, []);
  return (
    <>
      <Backdrop tint={EMBER} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Quarante-trois muscles pour un sourire." accent={GOLD} delay={PULL + 0.4} />}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <ellipse cx="0" cy="0" rx="96" ry="122" fill="none" stroke={CREAM} strokeOpacity="0.5" strokeWidth="1.5" />
          {fibers.map((fiber, index) => (
            <motion.path key={index} d={fiber.d} fill="none" stroke={GOLD_HI} strokeWidth="1.2" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: [0, 0.95, 0.35] }} transition={{ delay: fiber.lag, duration: 0.6 }} />
          ))}
          {[-34, 34].map((x) => (
            <motion.path key={x} d={`M${x - 14} -26 Q${x} -36 ${x + 14} -26`} fill="none" stroke={CREAM} strokeWidth="3" strokeLinecap="round" initial={{ d: `M${x - 14} -26 Q${x} -26 ${x + 14} -26` }} animate={{ d: `M${x - 14} -24 Q${x} -38 ${x + 14} -24` }} transition={{ delay: PULL - 0.2, duration: 0.4 }} />
          ))}
          <motion.path d={FLAT} fill="none" stroke={CREAM} strokeWidth="4" strokeLinecap="round" initial={{ d: FLAT }} animate={{ d: SMILE }} transition={{ delay: PULL - 0.25, duration: 0.5, ease: [0.3, 1.4, 0.5, 1] }} />
        </svg>
        <motion.div className="absolute -right-4 -top-6" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: PULL, type: "spring", stiffness: 260, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 68, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
