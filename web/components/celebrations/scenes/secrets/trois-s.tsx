"use client";

import { motion } from "framer-motion";
import { BRONZE, GOLD, Glow } from "../../kit";
import { SMedal } from "../streak/caption";
import { SecretStage, type SecretProps } from "./stage";

/** Un bras de triskèle : spirale qui part du centre (tournée de 0, 120, 240°). */
const ARM = "M0 0 C 30 -10, 52 -36, 40 -66 C 30 -90, -4 -92, -12 -70";
const ENDS = [0, 120, 240].map((deg) => {
  const radians = (deg * Math.PI) / 180;
  const [x, y] = [-12, -70];
  return { x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) };
});

/** trois-s : une triskèle d'or se déroule et tourne ; un médaillon S naît au bout de chaque bras. */
export default function TroisS({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description}>
      <Glow color={BRONZE} size={260} delay={0.7} strength={40} />
      <motion.div className="absolute inset-0" initial={{ rotate: -90 }} animate={{ rotate: 30 }} transition={{ duration: 1.8, ease: [0.2, 0.8, 0.3, 1] }}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {[0, 120, 240].map((deg) => (
            <motion.path key={deg} d={ARM} transform={`rotate(${deg})`} fill="none" stroke={GOLD} strokeWidth="7" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.8, ease: "easeOut" }} />
          ))}
          <circle r="7" fill={GOLD} />
        </svg>
        {ENDS.map((end, index) => (
          <motion.div key={index} className="absolute" style={{ left: 150 + end.x * 1.0 - 22, top: 150 + end.y * 1.0 - 22 }} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: -30 }} transition={{ delay: 0.85 + index * 0.12, type: "spring", stiffness: 380, damping: 14 }}>
            <SMedal size={44} />
          </motion.div>
        ))}
      </motion.div>
    </SecretStage>
  );
}
