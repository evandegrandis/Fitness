"use client";

import { motion } from "framer-motion";
import { CREAM, GOLD, GOLD_HI, Shockwave } from "../../kit";
import { SecretStage, starPath, type SecretProps } from "./stage";

/** retour : un boomerang part, décrit sa boucle autour de la scène et revient à son point de départ, où naît une étoile. */
/** Trajectoire du boomerang : trois courbes de Bézier, échantillonnées pour que l'objet suive le tracé. */
const SEGMENTS = [
  [[-90, 80], [20, 60], [130, 20], [110, -60]],
  [[110, -60], [95, -120], [-20, -120], [-40, -90]],
  [[-40, -90], [-70, -40], [-90, 20], [-90, 80]],
] as const;
const PATH = "M-90 80 C 20 60, 130 20, 110 -60 C 95 -120, -20 -120, -40 -90 C -70 -40, -90 20, -90 80";
const SAMPLES = SEGMENTS.flatMap(([p0, p1, p2, p3], segment) =>
  Array.from({ length: segment === 2 ? 9 : 8 }, (_, index) => {
    const t = index / 8;
    const u = 1 - t;
    return [0, 1].map((axis) => u * u * u * p0[axis] + 3 * u * u * t * p1[axis] + 3 * u * t * t * p2[axis] + t * t * t * p3[axis]);
  })
);

/** retour : un boomerang part, décrit sa boucle autour de la scène et revient à son point de départ, où naît une étoile. */
export default function Retour({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description} captionDelay={1.7}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        <motion.path d={PATH} fill="none" stroke="rgba(236,230,216,0.35)" strokeWidth="1.2" strokeDasharray="4 6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 1.3, ease: "linear" }} />
        <motion.g initial={{ x: -90, y: 80 }} animate={{ x: SAMPLES.map((point) => point[0]), y: SAMPLES.map((point) => point[1]) }} transition={{ delay: 0.15, duration: 1.3, ease: "linear" }}>
          <motion.path d="M-22 6 Q0 -22 22 6 Q12 -4 0 -6 Q-12 -4 -22 6Z" fill={CREAM} stroke="#ffffff" strokeWidth="0.8" animate={{ rotate: 1080 }} transition={{ delay: 0.15, duration: 1.3, ease: "linear" }} />
        </motion.g>
        <g transform="translate(-90 80)">
          <motion.path d={starPath(26)} fill={GOLD_HI} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.45, type: "spring", stiffness: 400, damping: 12 }} />
        </g>
      </svg>
      <Shockwave color={GOLD} delay={1.45} size={130} y={80} x={-90} />
    </SecretStage>
  );
}
