"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Shockwave } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const R = 92;

function arc(index: number): string {
  const gap = 0.06;
  const a0 = (index / 7) * Math.PI * 2 - Math.PI / 2 + gap;
  const a1 = ((index + 1) / 7) * Math.PI * 2 - Math.PI / 2 - gap;
  return `M${(Math.cos(a0) * R).toFixed(1)} ${(Math.sin(a0) * R).toFixed(1)} A${R} ${R} 0 0 1 ${(Math.cos(a1) * R).toFixed(1)} ${(Math.sin(a1) * R).toFixed(1)}`;
}

/** sept-jours : la roue de la semaine, sept arcs du lundi au dimanche, s'allume jour après jour jusqu'à se boucler. */
export default function SeptJours({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description} captionDelay={1.6}>
      <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ rotate: 0 }} animate={{ rotate: [0, 0, 51.4] }} transition={{ duration: 2, times: [0, 0.6, 1], ease: "easeInOut" }}>
        {DAYS.map((day, index) => {
          const mid = ((index + 0.5) / 7) * Math.PI * 2 - Math.PI / 2;
          return (
            <g key={index}>
              <path d={arc(index)} fill="none" stroke="rgba(236,230,216,0.12)" strokeWidth="14" strokeLinecap="round" />
              <motion.path d={arc(index)} fill="none" stroke={index === 6 ? GOLD_HI : GOLD} strokeWidth="14" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.2 + index * 0.14, duration: 0.16 }} />
              <motion.text x={Math.cos(mid) * 122} y={Math.sin(mid) * 122 + 5} textAnchor="middle" className="font-mono" style={{ fontSize: 13 }} fill="#ece6d8" initial={{ opacity: 0.25 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + index * 0.14 }}>
                {day}
              </motion.text>
            </g>
          );
        })}
      </motion.svg>
      <motion.div className="absolute inset-0 grid place-items-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, type: "spring", stiffness: 300, damping: 14 }}>
        <span className="font-display text-6xl font-bold" style={{ color: GOLD_HI }}>
          7/7
        </span>
      </motion.div>
      <Shockwave color={GOLD_HI} delay={1.18} size={260} width={2} />
    </SecretStage>
  );
}
