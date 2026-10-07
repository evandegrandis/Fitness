"use client";

import { motion } from "framer-motion";
import { GOLD, Glow, MetalText, SILVER } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const HALVES = [
  { clip: "polygon(0 0, 100% 0, 100% 38%, 0 72%)", dx: -10, dy: -6 },
  { clip: "polygon(0 72%, 100% 38%, 100% 100%, 0 100%)", dx: 10, dy: 6 },
];

/** tranchant : une lame balaie l'écran en diagonale ; le S d'or se fend en deux, glisse, puis se ressoude. */
export default function Tranchant({ title, description }: SecretProps) {
  return (
    <SecretStage tint={SILVER} accent={SILVER} title={title} description={description}>
      <Glow color={GOLD} size={240} delay={0.2} strength={35} />
      {HALVES.map((half, index) => (
        <motion.div key={index} className="absolute inset-0 grid place-items-center" style={{ clipPath: half.clip }} initial={{ x: 0, y: 0, opacity: 0 }} animate={{ opacity: 1, x: [0, 0, half.dx, half.dx, 0], y: [0, 0, half.dy, half.dy, 0] }} transition={{ duration: 1.4, times: [0, 0.3, 0.42, 0.75, 0.9], opacity: { duration: 0.25 } }}>
          <MetalText metal="or" style={{ fontSize: 190, lineHeight: 1, display: "block", transform: "translateY(8px)" }}>
            S
          </MetalText>
        </motion.div>
      ))}
      {/* La lame : un trait blanc qui traverse, avec son reflet. */}
      <motion.div className="absolute left-1/2 top-1/2" style={{ width: 420, height: 3, marginLeft: -210, marginTop: -1.5, rotate: -26, transformOrigin: "50% 50%", background: "linear-gradient(90deg, transparent, #ffffff 40%, #ffffff 60%, transparent)" }} initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ delay: 0.35, duration: 0.55, times: [0, 0.3, 1] }} />
      <motion.div className="absolute left-1/2 top-1/2" style={{ width: 420, height: 26, marginLeft: -210, marginTop: -13, rotate: -26, background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.18), transparent)" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ delay: 0.4, duration: 0.5 }} />
    </SecretStage>
  );
}
