"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, Glow, INK, MetalText, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/** Les cinq anneaux : bleu, noir (crème sur fond sombre), rouge en haut ; jaune, vert en bas. */
const RINGS = [
  { x: -78, y: -14, color: "#3d7fc4" },
  { x: 0, y: -14, color: "#ece6d8" },
  { x: 78, y: -14, color: "#d8504a" },
  { x: -39, y: 22, color: "#e9b949" },
  { x: 39, y: 22, color: "#4f9a5e" },
];
const R = 35;

/** Arc d'un anneau, de `from` à `to` degrés (0 = à droite, sens horaire). */
function arc(x: number, y: number, from: number, to: number) {
  const p = (deg: number) => `${(x + Math.cos((deg * Math.PI) / 180) * R).toFixed(2)} ${(y + Math.sin((deg * Math.PI) / 180) * R).toFixed(2)}`;
  return `M${p(from)} A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
}

/**
 * 5 · « Anneaux » : les cinq anneaux olympiques se tracent l'un après l'autre puis s'entrelacent
 * (chaque anneau du bas repasse par-dessus ceux du haut à un croisement, comme sur le drapeau).
 */
export default function Streak5({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Cinq S, cinq anneaux." accent={GOLD} delay={1.7} />}>
        <Glow color={GOLD} size={300} delay={1.3} strength={28} y={4} />
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {RINGS.map((ring, index) => (
            <g key={index}>
              <motion.circle cx={ring.x} cy={ring.y} r={R} fill="none" stroke={INK} strokeWidth="11" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15 + index * 0.2, duration: 0.55, ease: "easeInOut" }} />
              <motion.circle cx={ring.x} cy={ring.y} r={R} fill="none" stroke={ring.color} strokeWidth="6.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15 + index * 0.2, duration: 0.55, ease: "easeInOut" }} />
            </g>
          ))}
          {/* Entrelacs : le haut de chaque anneau du bas repasse au-dessus de ses voisins du haut. */}
          {RINGS.slice(3).map((ring, index) => (
            <motion.g key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.2 }}>
              <path d={arc(ring.x, ring.y, 200, 250)} fill="none" stroke={INK} strokeWidth="11" />
              <path d={arc(ring.x, ring.y, 196, 254)} fill="none" stroke={ring.color} strokeWidth="6.5" />
            </motion.g>
          ))}
          {RINGS.slice(0, 3).map((ring, index) => (
            <motion.g key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.2 }}>
              <path d={arc(ring.x, ring.y, 20, 70)} fill="none" stroke={INK} strokeWidth="11" />
              <path d={arc(ring.x, ring.y, 16, 74)} fill="none" stroke={ring.color} strokeWidth="6.5" />
            </motion.g>
          ))}
        </svg>
        <motion.div className="absolute inset-0" initial={{ scale: 1 }} animate={{ scale: [1, 1.06, 1] }} transition={{ delay: 1.2, duration: 0.5 }}>
          <Sparks count={26} color={GOLD_HI} delay={1.25} distance={[110, 190]} size={2.5} seed={55} />
        </motion.div>
        <motion.div className="absolute inset-x-0 top-[-6px] grid place-items-center" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 72, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
