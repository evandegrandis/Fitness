"use client";

import { motion } from "framer-motion";
import { CREAM, GOLD_HI, SILVER } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const R = 110;
const MONTHS = Array.from({ length: 7 }, (_, index) => {
  const angle = Math.PI + (index / 6) * Math.PI;
  return { x: Math.cos(angle) * R, y: Math.sin(angle) * R };
});

/** six-mois : un demi-cercle d'horizon à horizon ; un soleil le parcourt et allume les six mois au passage. */
export default function SixMois({ title, description }: SecretProps) {
  return (
    <SecretStage tint={SILVER} accent={SILVER} title={title} description={description} captionDelay={1.6}>
      <svg aria-hidden viewBox="-150 -170 300 300" className="absolute inset-0 overflow-visible">
        <line x1="-136" y1="0" x2="136" y2="0" stroke="rgba(236,230,216,0.35)" />
        <path d={`M${-R} 0 A${R} ${R} 0 0 1 ${R} 0`} fill="none" stroke="rgba(236,230,216,0.15)" strokeWidth="2" />
        <motion.path d={`M${-R} 0 A${R} ${R} 0 0 1 ${R} 0`} fill="none" stroke={CREAM} strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 1.2, ease: "linear" }} />
        {MONTHS.map((month, index) => (
          <motion.circle key={index} cx={month.x} cy={month.y} r={index === 6 ? 8 : 5} fill={index === 6 ? GOLD_HI : CREAM} initial={{ opacity: 0.15, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + (index / 6) * 1.2, type: "spring", stiffness: 500, damping: 15 }} />
        ))}
        <motion.text y="-30" textAnchor="middle" className="font-display" style={{ fontSize: 64, fontWeight: 700 }} fill={GOLD_HI} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.35, type: "spring", stiffness: 300, damping: 14 }}>
          6
        </motion.text>
        <motion.text y="-4" textAnchor="middle" className="font-mono" style={{ fontSize: 11, letterSpacing: "0.2em" }} fill="#a49f92" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
          MOIS
        </motion.text>
      </svg>
      {/* Le soleil, sur la trajectoire de l'arc (centre de l'arc à 150, 170 dans la scène). */}
      <motion.span
        aria-hidden
        className="absolute h-[26px] w-[26px] rounded-full"
        style={{ left: 150 - 13, top: 170 - 13, background: "radial-gradient(circle, #ffffff, #f4dca0 55%, rgba(216,178,106,0) 75%)" }}
        initial={{ x: -R, y: 0 }}
        animate={{ x: MONTHS.map((month) => month.x), y: MONTHS.map((month) => month.y) }}
        transition={{ delay: 0.2, duration: 1.2, ease: "linear" }}
      />
    </SecretStage>
  );
}
