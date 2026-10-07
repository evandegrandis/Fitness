"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, SceneLayout, Shockwave, Sparks } from "../../kit";
import { SMedal, StreakCaption } from "./caption";

/** 2 · « Doublé » : deux médaillons S arrivent des deux bords et se percutent au centre. */
export default function Streak2({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} />
      <SceneLayout caption={<StreakCaption count={count} sub="Deux séances au sommet, coup sur coup." accent={GOLD} delay={0.85} />}>
        <Glow color={GOLD} size={260} delay={0.5} strength={50} />
        <Shockwave color={GOLD_HI} delay={0.54} size={280} width={2} />
        <Sparks count={18} color={GOLD_HI} delay={0.55} distance={[70, 150]} streak size={2} seed={2} />
        {[-1, 1].map((side) => (
          <motion.div
            key={side}
            className="absolute left-1/2 top-1/2"
            style={{ marginLeft: -46, marginTop: -46, zIndex: side > 0 ? 1 : 0 }}
            initial={{ x: side * 200, opacity: 0, rotate: side * -30 }}
            animate={{ x: [side * 200, side * 22, side * 40], opacity: 1, rotate: [side * -30, 0, side * 6] }}
            transition={{ duration: 0.8, times: [0, 0.68, 1], ease: "easeIn" }}
          >
            <SMedal size={92} ring={side > 0 ? GOLD : CREAM} />
          </motion.div>
        ))}
        <motion.p
          className="absolute inset-x-0 bottom-6 text-center font-display text-5xl font-bold"
          style={{ color: GOLD_HI }}
          initial={{ opacity: 0, scale: 1.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.62, type: "spring", stiffness: 300, damping: 15 }}
        >
          ×2
        </motion.p>
      </SceneLayout>
    </>
  );
}
