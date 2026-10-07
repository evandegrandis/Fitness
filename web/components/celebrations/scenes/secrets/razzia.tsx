"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Shockwave } from "../../kit";
import { SecretStage, starPath, type SecretProps } from "./stage";

const CRIMSON = "#e2604a";
const POINTS = Array.from({ length: 5 }, (_, index) => {
  const angle = (index / 5) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * 82, y: Math.sin(angle) * 82, fromX: Math.cos(angle) * 320, fromY: Math.sin(angle) * 320, deg: (angle * 180) / Math.PI };
});

/** razzia : cinq étoiles filantes fondent des cinq directions et se figent en pentagone, qui tourne. */
export default function Razzia({ title, description }: SecretProps) {
  return (
    <SecretStage tint={CRIMSON} accent={CRIMSON} title={title} description={description}>
      <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ rotate: 0 }} animate={{ rotate: [0, 0, 36] }} transition={{ duration: 2, times: [0, 0.5, 1], ease: "easeInOut" }}>
        <motion.path d={`M${POINTS.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L")}Z`} fill="rgba(226,96,74,0.08)" stroke={CRIMSON} strokeWidth="1.2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.75, duration: 0.5 }} />
        {POINTS.map((point, index) => (
          <g key={index}>
            {/* Traînée de la comète, dans l'axe de sa course. */}
            <motion.line
              x1={point.x}
              y1={point.y}
              x2={point.x + (point.fromX - point.x) * 0.35}
              y2={point.y + (point.fromY - point.y) * 0.35}
              stroke={GOLD_HI}
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ opacity: 0, x: point.fromX - point.x, y: point.fromY - point.y }}
              animate={{ opacity: [0, 0.9, 0], x: 0, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.6, ease: "easeIn" }}
            />
            <motion.path
              d={starPath(17)}
              fill={index % 2 ? GOLD : GOLD_HI}
              initial={{ x: point.fromX, y: point.fromY, rotate: point.deg, opacity: 0 }}
              animate={{ x: point.x, y: point.y, rotate: point.deg + 360, opacity: 1 }}
              transition={{ delay: index * 0.08, duration: 0.6, ease: "easeIn" }}
            />
          </g>
        ))}
        <motion.text y="14" textAnchor="middle" className="font-display" style={{ fontSize: 46, fontWeight: 700 }} fill={GOLD_HI} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.85, type: "spring", stiffness: 300, damping: 14 }}>
          5
        </motion.text>
      </motion.svg>
      <Shockwave color={CRIMSON} delay={0.72} size={300} width={2} />
      <Shockwave color={GOLD} delay={0.86} size={400} />
    </SecretStage>
  );
}
