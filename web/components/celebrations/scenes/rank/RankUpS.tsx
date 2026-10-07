"use client";

import { motion } from "framer-motion";
import { Backdrop, Caption, EASE_OUT, Embers, GOLD, GOLD_HI, Glow, MetalText, Rays, SceneLayout, Shockwave, Sparks } from "../../kit";

const TICKS = Array.from({ length: 24 }, (_, index) => index);

/**
 * Passage au rang S, « ascension » : une colonne de lumière monte du bas de l'écran, la lettre la
 * suit et s'arrête au centre ; à son arrivée, double onde, soleil de rayons, cadran d'or qui se
 * referme et braises sur toute la largeur. La plus forte des trois.
 */
export default function RankUpS() {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.88} />
      {/* Colonne de lumière, du bas de l'écran jusqu'au centre. */}
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/2"
        style={{ width: 120, height: "62%", marginLeft: -60, transformOrigin: "bottom", background: "linear-gradient(0deg, rgba(216,178,106,0) 0%, rgba(244,220,160,0.55) 55%, rgba(244,220,160,0) 100%)" }}
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 1.7, times: [0, 0.3, 1], ease: "easeOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/2"
        style={{ width: 2, height: "62%", marginLeft: -1, transformOrigin: "bottom", background: "linear-gradient(0deg, transparent, #fff6dc 60%, transparent)" }}
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 1.3, times: [0, 0.35, 1], ease: "easeOut" }}
      />
      <SceneLayout
        size={280}
        caption={<Caption kicker="Rang en séance" title="Rang S" sub="Le plus haut rang. Tiens-le jusqu'au bout." accent={GOLD} delay={1.05} size={2.3} />}
      >
        <Embers count={26} color={GOLD_HI} delay={0.7} width={380} from={240} rise={[220, 460]} seed={5} />
        <Glow color={GOLD} size={340} delay={0.8} strength={55} rest={0.45} />
        <Rays count={18} color={GOLD_HI} delay={0.82} spin={30} duration={2.2} peak={0.55} />
        {/* Cadran d'or qui se referme autour de la lettre. */}
        <motion.svg aria-hidden viewBox="-140 -140 280 280" className="absolute inset-0" initial={{ rotate: -40, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ delay: 0.88, duration: 0.9, ease: EASE_OUT }}>
          <motion.circle r="112" fill="none" stroke={GOLD} strokeWidth="1.2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 0.8, ease: EASE_OUT }} />
          {TICKS.map((index) => {
            const angle = (index / TICKS.length) * Math.PI * 2;
            const long = index % 6 === 0;
            return (
              <line
                key={index}
                x1={Math.cos(angle) * (long ? 120 : 117)}
                y1={Math.sin(angle) * (long ? 120 : 117)}
                x2={Math.cos(angle) * 126}
                y2={Math.sin(angle) * 126}
                stroke={GOLD}
                strokeWidth={long ? 1.6 : 0.8}
                opacity={long ? 0.9 : 0.5}
              />
            );
          })}
        </motion.svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            initial={{ y: 300, scale: 0.7, opacity: 0 }}
            animate={{ y: [300, -10, 0], scale: [0.7, 1.08, 1], opacity: [0, 1, 1] }}
            transition={{ delay: 0.2, duration: 0.85, times: [0, 0.8, 1], ease: "easeOut" }}
          >
            <MetalText metal="or" style={{ fontSize: 168, lineHeight: 1, display: "block", transform: "translateY(6px)" }}>
              S
            </MetalText>
          </motion.div>
        </div>
        <Shockwave color={GOLD_HI} delay={0.88} size={320} width={2} />
        <Shockwave color={GOLD} delay={1.04} size={460} width={1} duration={1.2} />
        <Sparks count={22} color={GOLD_HI} delay={0.86} distance={[120, 200]} streak size={2.2} seed={21} duration={1} />
      </SceneLayout>
    </>
  );
}
