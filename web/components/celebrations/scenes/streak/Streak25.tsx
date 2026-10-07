"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, EMBER, GOLD, GOLD_HI, Glow, MetalText, Rays, SceneLayout, seeded, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

/** 25 · « Nova » : une galaxie d'or s'enroule, se contracte en un point, puis explose en anneaux successifs. */
export default function Streak25({ count }: { count: number }) {
  const arms = useMemo(() => {
    const random = seeded(25);
    return Array.from({ length: 54 }, (_, index) => {
      const arm = index % 3;
      const t = Math.floor(index / 3) / 18;
      const angle = arm * ((Math.PI * 2) / 3) + t * Math.PI * 1.6;
      const radius = 22 + t * 125;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, size: 2.4 + random() * 3 * (1 - t * 0.5), hue: random() > 0.75 ? EMBER : GOLD_HI };
    });
  }, []);
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <motion.div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 42%, #fff6dc 0%, rgba(255,246,220,0.4) 30%, transparent 70%)" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.5, 0] }} transition={{ duration: 1.5, times: [0, 0.62, 0.68, 1] }} />
      <SceneLayout caption={<StreakCaption count={count} sub="Vingt-cinq S. Une étoile est née." accent={GOLD} delay={1.7} />}>
        <motion.div
          className="absolute inset-0"
          initial={{ rotate: 0, scale: 1, opacity: 0 }}
          animate={{ rotate: 200, scale: [1, 1, 0.05, 0.05], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.05, times: [0, 0.3, 0.92, 1], ease: "easeIn" }}
        >
          {arms.map((dot, index) => (
            <span key={index} aria-hidden className="absolute rounded-full" style={{ left: "50%", top: "50%", width: dot.size, height: dot.size, marginLeft: dot.x, marginTop: dot.y, background: dot.hue }} />
          ))}
        </motion.div>
        {[0, 1, 2, 3, 4].map((ring) => (
          <Shockwave key={ring} color={ring % 2 ? GOLD : GOLD_HI} delay={1 + ring * 0.13} size={240 + ring * 90} width={2 - ring * 0.3} duration={1.1} />
        ))}
        <Rays count={36} color={GOLD_HI} delay={1} spin={-24} duration={2.6} peak={0.6} outer={220} spread={0.045} />
        <Glow color={GOLD} size={380} delay={1} strength={60} rest={0.5} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.2 }} animate={{ opacity: 1, scale: [0.2, 1.15, 1] }} transition={{ delay: 1.02, duration: 0.6 }}>
            <MetalText metal="or" style={{ fontSize: 130, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
