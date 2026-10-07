"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Sparks } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const RED = "#d8653f";
const CURVE = "M30 110 C 60 120, 80 210, 112 236 C 140 258, 160 120, 200 80 C 225 56, 250 50, 268 44";

/** remontada : la courbe plonge jusqu'au C, touche le fond, puis remonte d'un trait jusqu'au S, du rouge à l'or. */
export default function Remontada({ title, description }: SecretProps) {
  return (
    <SecretStage tint={RED} accent={GOLD} title={title} description={description}>
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="remontee" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={RED} />
            <stop offset="0.55" stopColor={RED} />
            <stop offset="1" stopColor={GOLD_HI} />
          </linearGradient>
        </defs>
        {[80, 140, 200].map((y) => (
          <line key={y} x1="24" y1={y} x2="276" y2={y} stroke="rgba(236,230,216,0.08)" strokeDasharray="3 5" />
        ))}
        <motion.path d={CURVE} fill="none" stroke="url(#remontee)" strokeWidth="4.5" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.15, duration: 1.1, ease: [0.45, 0, 0.3, 1] }} />
        <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.55, duration: 0.3 }}>
          <circle cx="112" cy="240" r="15" fill="#120d0b" stroke={RED} strokeWidth="1.6" />
          <text x="112" y="246" textAnchor="middle" className="font-display" style={{ fontSize: 17, fontWeight: 700 }} fill={RED}>
            C
          </text>
        </motion.g>
        <motion.g initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.25, type: "spring", stiffness: 380, damping: 13 }}>
          <circle cx="268" cy="44" r="21" fill={GOLD} />
          <text x="268" y="52" textAnchor="middle" className="font-display" style={{ fontSize: 24, fontWeight: 700 }} fill="#0b0b0c">
            S
          </text>
        </motion.g>
      </svg>
      <Sparks count={16} color={GOLD_HI} delay={1.25} distance={[30, 80]} size={2.5} seed={14} x={118} y={-106} duration={0.7} />
    </SecretStage>
  );
}
