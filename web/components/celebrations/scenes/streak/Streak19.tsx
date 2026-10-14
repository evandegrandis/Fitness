"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, ICE, MetalText, NIGHT, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const MOONS = 19;
const STEP = 0.075;

/** Une Lune à la phase `phase` (0 = nouvelle, 0,5 = pleine), ombre approchée par un disque qui glisse. */
function Moon({ r, phase, x = 0, y = 0 }: { r: number; phase: number; x?: number; y?: number }) {
  // Croissante : l'ombre glisse vers la gauche ; décroissante : elle revient par la droite.
  const shadowX = phase < 0.5 ? -phase * 4 * r : (1 - phase) * 4 * r;
  const id = `m${Math.round(phase * 1000)}-${r}`;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <defs>
        <clipPath id={id}>
          <circle r={r} />
        </clipPath>
      </defs>
      <circle r={r} fill="#171512" />
      <g clipPath={`url(#${id})`}>
        <circle r={r} fill={CREAM} />
        <circle r={r * 1.02} cx={shadowX} fill="#171512" />
      </g>
    </g>
  );
}

/**
 * 19 · « Cycle de Méton » : tous les dix-neuf ans, les phases de la Lune retombent aux mêmes dates.
 * Dix-neuf lunes s'allument autour du cadran, chacune un peu plus avancée ; au bout du tour, la
 * première revient, en or, et le cycle se referme.
 */
export default function Streak19({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={NIGHT} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Tous les dix-neuf ans, la Lune revient au même jour." accent={ICE} delay={2.2} />}>
        <Glow color={ICE} size={300} delay={0.2} strength={18} />
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <motion.circle r="118" fill="none" stroke={GOLD} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 5" initial={{ rotate: 0 }} animate={{ rotate: -40 }} transition={{ duration: 4, ease: "linear" }} />
          {Array.from({ length: MOONS }, (_, index) => {
            const a = (index / MOONS) * Math.PI * 2 - Math.PI / 2;
            const phase = ((index * 0.37) % 1 + 1) % 1;
            return (
              <motion.g key={index} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + index * STEP, duration: 0.3 }}>
                <Moon r={11} phase={Math.abs(phase - 0.5) < 0.04 ? 0.46 : phase} x={Math.cos(a) * 118} y={Math.sin(a) * 118} />
              </motion.g>
            );
          })}
          {/* L'aiguille du cycle. */}
          <motion.line x1="0" y1="0" x2="0" y2="-96" stroke={GOLD_HI} strokeWidth="1.5" strokeLinecap="round" initial={{ rotate: 0, opacity: 0 }} animate={{ rotate: 360, opacity: [0, 1, 1, 0] }} transition={{ delay: 0.15, duration: STEP * MOONS + 0.1, ease: "linear" }} />
          {/* La grande Lune du centre passe par toutes ses phases. */}
          {[0.08, 0.2, 0.32, 0.5, 0.66, 0.8, 0.92].map((phase, index) => (
            <motion.g key={index} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ delay: 0.15 + index * 0.2, duration: 0.35 }}>
              <Moon r={44} phase={phase} />
            </motion.g>
          ))}
          <motion.circle r="12" cy="-118" fill="none" stroke={GOLD_HI} strokeWidth="2" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.8, 1.2], opacity: 1 }} transition={{ delay: 0.15 + STEP * MOONS, duration: 0.5 }} />
        </svg>
        <Shockwave color={GOLD_HI} delay={0.2 + STEP * MOONS} size={300} width={1.5} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.6, type: "spring", stiffness: 240, damping: 15 }}>
            <MetalText metal="or" style={{ fontSize: 76, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
