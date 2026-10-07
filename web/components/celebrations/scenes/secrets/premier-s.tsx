"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Glow, Sparks } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

/** Un S calligraphié, tracé d'un seul geste du haut vers le bas. */
const S_PATH = "M196 78 C 176 52, 112 50, 102 92 C 92 134, 200 140, 200 192 C 200 240, 120 252, 96 214";

/** premier-s : une plume d'or trace un S d'un seul geste, puis le sceau se pose autour. */
export default function PremierS({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description}>
      <Glow color={GOLD} size={300} delay={1} strength={45} />
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        <motion.circle cx="150" cy="150" r="118" fill="none" stroke={GOLD} strokeWidth="1" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.8 }} transition={{ delay: 1, duration: 0.6 }} />
        <motion.circle cx="150" cy="150" r="110" fill="none" stroke={GOLD} strokeWidth="0.6" strokeDasharray="2 5" initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 0.6, rotate: 0 }} transition={{ delay: 1.1, duration: 0.8 }} />
        <motion.path d={S_PATH} fill="none" stroke="rgba(216,178,106,0.35)" strokeWidth="26" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.15, duration: 0.95, ease: [0.5, 0, 0.3, 1] }} />
        <motion.path d={S_PATH} fill="none" stroke="url(#plume)" strokeWidth="14" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.15, duration: 0.95, ease: [0.5, 0, 0.3, 1] }} />
        <defs>
          <linearGradient id="plume" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbeec4" />
            <stop offset="0.5" stopColor="#ecc97f" />
            <stop offset="1" stopColor="#a8823e" />
          </linearGradient>
        </defs>
      </svg>
      <Sparks count={12} color={GOLD_HI} delay={1.05} distance={[20, 60]} size={2.5} seed={101} x={-54} y={64} duration={0.7} />
    </SecretStage>
  );
}
