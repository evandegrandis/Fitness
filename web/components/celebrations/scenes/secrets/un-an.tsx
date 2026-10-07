"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Glow, ICE, Rays, Shockwave } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const RX = 112;
const RY = 70;
const STEPS = 24;
const ORBIT = Array.from({ length: STEPS + 1 }, (_, index) => {
  const angle = (index / STEPS) * Math.PI * 2 + Math.PI / 2;
  return { x: Math.cos(angle) * RX, y: Math.sin(angle) * RY };
});

/** un-an : la Terre fait le tour complet du soleil d'or ; douze mois s'allument sur l'orbite, puis le soleil s'embrase. */
export default function UnAn({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description} captionDelay={2}>
      <Rays count={28} color={GOLD_HI} delay={1.75} spin={20} duration={2} peak={0.5} inner={30} outer={160} />
      <Glow color={GOLD} size={200} delay={0} strength={50} rest={0.7} />
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        <ellipse rx={RX} ry={RY} fill="none" stroke="rgba(236,230,216,0.12)" />
        <motion.path d={`M0 ${RY} A${RX} ${RY} 0 0 1 0 ${-RY} A${RX} ${RY} 0 0 1 0 ${RY}`} fill="none" stroke={ICE} strokeWidth="1.6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 1.6, ease: "linear" }} />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2 + Math.PI / 2;
          return <motion.circle key={index} cx={Math.cos(angle) * (RX + 14)} cy={Math.sin(angle) * (RY + 12)} r="2.4" fill={GOLD_HI} initial={{ opacity: 0.12 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + (index / 12) * 1.6 }} />;
        })}
        <motion.circle r="30" fill="url(#soleil)" initial={{ scale: 0.8 }} animate={{ scale: [0.8, 1, 1, 1.25, 1.1] }} transition={{ duration: 2.2, times: [0, 0.2, 0.75, 0.85, 1] }} />
        <defs>
          <radialGradient id="soleil">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#f4dca0" />
            <stop offset="1" stopColor="#c99a4c" />
          </radialGradient>
        </defs>
      </svg>
      <motion.span
        aria-hidden
        className="absolute h-[16px] w-[16px] rounded-full"
        style={{ left: 142, top: 142, background: "radial-gradient(circle at 35% 35%, #e8f4ff, #5d8fc4 70%)", boxShadow: "0 0 0 2px rgba(188,214,234,0.25)" }}
        initial={{ x: ORBIT[0].x, y: ORBIT[0].y }}
        animate={{ x: ORBIT.map((point) => point.x), y: ORBIT.map((point) => point.y) }}
        transition={{ delay: 0.15, duration: 1.6, ease: "linear" }}
      />
      <motion.p className="absolute inset-x-0 text-center font-display text-3xl font-bold" style={{ top: 20, color: GOLD_HI }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.4 }}>
        1 an
      </motion.p>
      <Shockwave color={GOLD_HI} delay={1.78} size={320} width={2} />
    </SecretStage>
  );
}
