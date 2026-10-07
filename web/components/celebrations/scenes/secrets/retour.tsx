"use client";

import { motion } from "framer-motion";
import { CREAM, GOLD, GOLD_HI, Shockwave } from "../../kit";
import { SecretStage, starPath, type SecretProps } from "./stage";

/** retour : un boomerang part, décrit sa boucle autour de la scène et revient à son point de départ, où naît une étoile. */
export default function Retour({ title, description }: SecretProps) {
  const loop = { x: [-90, 20, 110, 70, -40, -90], y: [80, 60, -20, -100, -90, 80] };
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description} captionDelay={1.7}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        <motion.path d="M-90 80 C 20 60, 130 20, 110 -60 C 95 -120, -20 -120, -40 -90 C -70 -40, -90 20, -90 80" fill="none" stroke="rgba(236,230,216,0.35)" strokeWidth="1.2" strokeDasharray="4 6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 1.3, ease: "easeInOut" }} />
        <motion.g initial={{ x: -90, y: 80 }} animate={loop} transition={{ delay: 0.15, duration: 1.3, ease: "easeInOut" }}>
          <motion.path d="M-22 6 Q0 -22 22 6 Q12 -4 0 -6 Q-12 -4 -22 6Z" fill={CREAM} stroke="#ffffff" strokeWidth="0.8" animate={{ rotate: 1080 }} transition={{ delay: 0.15, duration: 1.3, ease: "linear" }} />
        </motion.g>
        <motion.path d={starPath(26)} transform="translate(-90 80)" fill={GOLD_HI} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.45, type: "spring", stiffness: 400, damping: 12 }} />
      </svg>
      <Shockwave color={GOLD} delay={1.45} size={160} y={80} />
    </SecretStage>
  );
}
