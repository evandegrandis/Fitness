"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Sparks } from "../../kit";
import { SecretStage, starPath, type SecretProps } from "./stage";

const STARS = [
  { x: -78, size: 30, at: 0.2 },
  { x: 78, size: 30, at: 0.45 },
  { x: 0, size: 42, at: 0.7 },
];

/** triple : trois étoiles tombent l'une après l'autre et s'alignent ; un trait d'or les souligne. */
export default function Triple({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="etoile-or" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbeec4" />
            <stop offset="1" stopColor="#c99a4c" />
          </linearGradient>
        </defs>
        {STARS.map((star) => (
          <motion.path
            key={star.x}
            d={starPath(star.size)}
            fill="url(#etoile-or)"
            stroke="#fff6dc"
            strokeWidth="1"
            initial={{ x: star.x, y: -260, rotate: -120, opacity: 0 }}
            animate={{ x: star.x, y: [-260, 8, -6, 0], rotate: 0, opacity: 1 }}
            transition={{ delay: star.at, duration: 0.6, times: [0, 0.7, 0.85, 1], ease: "easeIn" }}
          />
        ))}
        <motion.line x1="-120" y1="62" x2="120" y2="62" stroke={GOLD} strokeWidth="1.6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.2, duration: 0.5 }} />
        <motion.text y="96" textAnchor="middle" className="font-display" style={{ fontSize: 30, fontWeight: 700 }} fill={GOLD_HI} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.4 }}>
          × 3
        </motion.text>
      </svg>
      {STARS.map((star, index) => (
        <Sparks key={star.x} count={10} color={GOLD_HI} delay={star.at + 0.42} distance={[30, 70]} size={2.5} seed={index + 30} x={star.x} duration={0.6} />
      ))}
    </SecretStage>
  );
}
