"use client";

import { motion } from "framer-motion";
import { Backdrop, Embers, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

/** Feuilles le long d'un arc, de la base vers le haut (côté gauche ; le droit en miroir). */
const LEAVES = Array.from({ length: 8 }, (_, index) => {
  const t = index / 7;
  const angle = Math.PI * (0.62 + 0.62 * t); // de bas-gauche vers le haut
  const radius = 104;
  return { x: 150 + Math.cos(angle) * radius, y: 158 - Math.sin(angle) * radius * -1, rotate: (angle * 180) / Math.PI + 90, delay: 0.35 + index * 0.11, scale: 1 - t * 0.35 };
});

/** 5 · « Laurier » : la couronne de la statue se tresse feuille à feuille autour du 5. */
export default function Streak5({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} />
      <SceneLayout caption={<StreakCaption count={count} sub="La couronne de laurier, comme la statue." accent={GOLD} delay={1.35} />}>
        <Glow color={GOLD} size={280} delay={1.1} strength={45} />
        <Embers count={22} color={GOLD_HI} delay={0.2} width={300} from={-210} rise={[-260, -420]} band={60} duration={[2.4, 3.2]} seed={5} />
        <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
          {[1, -1].map((mirror) => (
            <g key={mirror} transform={mirror < 0 ? "translate(300 0) scale(-1 1)" : undefined}>
              <motion.path
                d="M136 262 C 58 238, 34 150, 78 72"
                fill="none"
                stroke={GOLD}
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 1, ease: "easeOut" }}
              />
              {LEAVES.map((leaf, index) => (
                <motion.path
                  key={index}
                  d="M0 0 C 7 -9, 7 -22, 0 -30 C -7 -22, -7 -9, 0 0Z"
                  fill="url(#laurier)"
                  stroke="rgba(251,238,196,0.6)"
                  strokeWidth="0.6"
                  style={{ x: leaf.x, y: leaf.y, rotate: leaf.rotate - (index % 2 ? 28 : -28) }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: leaf.scale, opacity: 1 }}
                  transition={{ delay: leaf.delay, type: "spring", stiffness: 380, damping: 14 }}
                />
              ))}
            </g>
          ))}
          <defs>
            <linearGradient id="laurier" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbeec4" />
              <stop offset="1" stopColor="#a8823e" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.15, type: "spring", stiffness: 260, damping: 14 }}>
            <MetalText metal="or" style={{ fontSize: 120, lineHeight: 1, display: "block", transform: "translateY(4px)" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
        <Shockwave color={GOLD_HI} delay={1.18} size={300} />
      </SceneLayout>
    </>
  );
}
