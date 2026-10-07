"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, Glow, MetalText, Rays, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

/** 15 · « Éclipse » : un disque noir glisse sur le soleil d'or ; à la totalité, la couronne s'embrase et le 15 s'y grave. */
export default function Streak15({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Quinze S. Même le soleil s'efface." accent={GOLD} delay={1.6} />}>
        <Rays count={40} color={GOLD_HI} delay={0.95} spin={12} duration={2.8} peak={0.65} inner={70} outer={210} spread={0.03} />
        <Glow color={GOLD} size={360} delay={0.9} strength={55} rest={0.55} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            className="absolute rounded-full"
            style={{ width: 150, height: 150, background: "radial-gradient(circle, #fff6d8 0%, #f0cf86 45%, #c99a4c 75%, rgba(201,154,76,0) 100%)" }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
          {/* Corona : anneau fin qui s'élargit à la totalité. */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 146, height: 146, boxShadow: "0 0 0 2px #fff1c9, 0 0 0 7px rgba(244,220,160,0.35)" }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 1, 0.8], scale: [1, 1.05, 1.02] }}
            transition={{ delay: 0.95, duration: 0.8 }}
          />
          <motion.div
            className="absolute grid place-items-center rounded-full"
            style={{ width: 144, height: 144, background: "radial-gradient(circle at 45% 40%, #15130f, #050505 70%)" }}
            initial={{ x: -230 }}
            animate={{ x: 0 }}
            transition={{ delay: 0.25, duration: 0.75, ease: [0.3, 0, 0.2, 1] }}
          >
            <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.15, duration: 0.5 }}>
              <MetalText metal="or" style={{ fontSize: 62, lineHeight: 1, display: "block" }}>
                {count}
              </MetalText>
            </motion.span>
          </motion.div>
          {/* Bague de diamant : l'éclat au bord, à l'instant de la totalité. */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 40, height: 40, x: 52, y: -50, background: "radial-gradient(circle, #ffffff 0%, rgba(255,246,216,0.6) 30%, transparent 70%)" }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 1.8, 0.6] }}
            transition={{ delay: 0.92, duration: 0.6 }}
          />
        </div>
        <Shockwave color={GOLD_HI} delay={1} size={330} />
      </SceneLayout>
    </>
  );
}
