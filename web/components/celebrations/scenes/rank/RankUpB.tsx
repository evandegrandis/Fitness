"use client";

import { motion } from "framer-motion";
import { Backdrop, BRONZE, Caption, EMBER, Glow, MetalText, SceneLayout, Shockwave, Sparks } from "../../kit";

/**
 * Passage au rang B, « coulée » : un filet de bronze en fusion tombe dans le moule de la lettre,
 * qui se remplit par le bas, rougeoie puis refroidit en bronze. La plus sobre des trois.
 */
export default function RankUpB() {
  const H = 170;
  return (
    <>
      <Backdrop tint={BRONZE} veil={0.8} />
      <SceneLayout
        size={240}
        caption={<Caption kicker="Rang en séance" title="Rang B" sub="Coulé dans le bronze. Prochain palier : A." accent={BRONZE} delay={0.75} />}
      >
        <Glow color={EMBER} size={260} delay={0.55} strength={45} rest={0.3} />
        {/* Filet de métal en fusion qui tombe dans le moule. */}
        <motion.div
          aria-hidden
          className="absolute left-1/2 rounded-full"
          style={{ width: 5, height: 260, marginLeft: -2.5, top: -150, transformOrigin: "top", background: "linear-gradient(180deg, transparent, #ffcf87 30%, #e0794a 100%)" }}
          initial={{ scaleY: 0, opacity: 1 }}
          animate={{ scaleY: [0, 1, 1], opacity: [1, 1, 0] }}
          transition={{ duration: 0.85, times: [0, 0.35, 1], ease: "easeIn" }}
        />
        {/* Moule : contour de la lettre, posé avant la coulée. */}
        <motion.div
          aria-hidden
          className="absolute inset-0 grid place-items-center"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: [0, 0.9, 0.9, 0], scale: 1 }}
          transition={{ duration: 1.7, times: [0, 0.12, 0.7, 1] }}
        >
          <span className="font-display font-bold" style={{ fontSize: H, lineHeight: 1, color: "transparent", WebkitTextStroke: `1.2px ${BRONZE}` }}>
            B
          </span>
        </motion.div>
        {/* Remplissage par le bas : fenêtre qui monte (transformées seulement). */}
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            className="relative overflow-hidden"
            style={{ width: 200, height: 240 }}
            initial={{ y: 240 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.25, duration: 0.7, ease: [0.45, 0, 0.2, 1] }}
          >
            {/* Surface du métal en fusion : un filet incandescent qui monte avec le niveau. */}
            <motion.span
              aria-hidden
              className="absolute inset-x-6 top-0 z-10 h-[3px] rounded-full"
              style={{ background: "linear-gradient(90deg, transparent, #fff1c9, transparent)" }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.9, duration: 0.25 }}
            />
            <motion.div
              className="absolute inset-0 grid place-items-center"
              initial={{ y: -240 }}
              animate={{ y: 0 }}
              transition={{ delay: 0.25, duration: 0.7, ease: [0.45, 0, 0.2, 1] }}
            >
              <MetalText metal="bronze" style={{ fontSize: H, lineHeight: 1 }}>
                B
              </MetalText>
              <motion.span
                className="absolute inset-0 grid place-items-center"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 0.95, duration: 0.8 }}
              >
                <MetalText metal="braise" style={{ fontSize: H, lineHeight: 1 }}>
                  B
                </MetalText>
              </motion.span>
            </motion.div>
          </motion.div>
        </div>
        <Shockwave color={BRONZE} delay={0.9} size={240} />
        <Sparks count={12} color="#ffbf69" delay={0.88} distance={[60, 120]} spread={150} direction={-90} fall={40} seed={3} size={3} duration={1} />
      </SceneLayout>
    </>
  );
}
