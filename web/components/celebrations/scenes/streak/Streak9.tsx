"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, Glow, ICE, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

/** Huit planètes (rayon d'orbite, taille, couleur, phase) ; la neuvième, Pluton, arrive à part. */
const PLANETS = [
  { r: 26, size: 4, color: "#b9a68c", phase: 40 },
  { r: 38, size: 6, color: "#e8cf9a", phase: 200 },
  { r: 51, size: 6.5, color: "#7fb0d8", phase: 300 },
  { r: 63, size: 5, color: "#d27a52", phase: 120 },
  { r: 82, size: 13, color: "#d9b98a", phase: 250 },
  { r: 101, size: 11, color: "#e6d3a2", phase: 20, ring: true },
  { r: 117, size: 8, color: "#a9d6dd", phase: 160 },
  { r: 131, size: 8, color: "#5e86c8", phase: 320 },
];
const PLUTO = { r: 146, size: 4.5, phase: 70 };

/** Un tour complet en `period` secondes pour l'orbite de rayon 26 ; les autres suivent Kepler (T ∝ r^1,5). */
function turn(r: number) {
  return 2.2 * Math.pow(r / 26, 1.5);
}

function Orbit({ r, size, color, phase, children, delay }: { r: number; size: number; color: string; phase: number; children?: React.ReactNode; delay: number }) {
  const duration = 4.5;
  return (
    <motion.div
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, border: "1px solid rgba(236,230,216,0.12)" }}
      initial={{ rotate: phase, opacity: 0 }}
      animate={{ rotate: phase + (360 * duration) / turn(r), opacity: 1 }}
      transition={{ duration, ease: "linear", opacity: { delay, duration: 0.4 } }}
    >
      <span className="absolute left-1/2 top-0 rounded-full" style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: color, boxShadow: `inset -${size / 4}px -${size / 4}px 0 rgba(0,0,0,0.45)` }} />
      {children}
    </motion.div>
  );
}

/**
 * 9 · « Neuf planètes » : le système solaire s'allume orbite par orbite, chaque planète à sa vitesse
 * de Kepler. Puis la neuvième, Pluton, déclassée en 2006, revient sur son orbite inclinée, en or.
 */
export default function Streak9({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={ICE} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Neuf planètes. Pluton revient." accent={GOLD} delay={1.9} />}>
        <Glow color={GOLD_HI} size={90} delay={0} strength={90} rest={0.8} />
        <motion.span aria-hidden className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, #fff, ${GOLD_HI} 60%, ${GOLD})`, boxShadow: `0 0 24px 6px color-mix(in srgb, ${GOLD_HI} 60%, transparent)` }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} />
        {PLANETS.map((planet, index) => (
          <Orbit key={index} {...planet} delay={0.1 + index * 0.1}>
            {planet.ring && <span className="absolute left-1/2 top-0 h-[5px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] rounded-[50%]" style={{ border: "1px solid rgba(236,211,162,0.8)" }} />}
          </Orbit>
        ))}
        {/* Pluton : orbite excentrée et inclinée, arrive en dernier. */}
        <motion.div className="absolute inset-0" style={{ rotate: 18 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15, duration: 0.5 }}>
          <div className="absolute inset-0" style={{ transform: "scaleY(0.82) translateX(8px)" }}>
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: PLUTO.r * 2, height: PLUTO.r * 2, marginLeft: -PLUTO.r, marginTop: -PLUTO.r, border: `1px dashed color-mix(in srgb, ${GOLD} 70%, transparent)` }}
              initial={{ rotate: PLUTO.phase }}
              animate={{ rotate: PLUTO.phase + 40 }}
              transition={{ duration: 4.5, ease: "linear" }}
            >
              <motion.span className="absolute left-1/2 top-0 rounded-full" style={{ width: PLUTO.size * 2, height: PLUTO.size * 2, marginLeft: -PLUTO.size, marginTop: -PLUTO.size, background: GOLD_HI, boxShadow: `0 0 14px 4px ${GOLD}` }} initial={{ scale: 0 }} animate={{ scale: [0, 2.2, 1] }} transition={{ delay: 1.3, duration: 0.6 }} />
            </motion.div>
          </div>
        </motion.div>
        <Shockwave color={GOLD_HI} delay={1.35} size={360} width={1.5} />
        <motion.div className="absolute -right-2 -top-4" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.45, type: "spring", stiffness: 260, damping: 15 }}>
          <MetalText metal="or" style={{ fontSize: 64, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
