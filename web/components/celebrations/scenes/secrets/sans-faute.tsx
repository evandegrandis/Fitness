"use client";

import { motion } from "framer-motion";
import { CREAM, SAGE } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const CELLS = Array.from({ length: 6 }, (_, index) => ({ x: -66 + (index % 3) * 66, y: -58 + Math.floor(index / 3) * 70 }));

/** sans-faute : six cases se cochent une à une, sans en manquer une ; puis le tampon « 6/6 » s'abat. */
export default function SansFaute({ title, description }: SecretProps) {
  return (
    <SecretStage tint={SAGE} accent={CREAM} title={title} description={description} captionDelay={1.5}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        {CELLS.map((cell, index) => (
          <g key={index} transform={`translate(${cell.x} ${cell.y})`}>
            <motion.rect x="-24" y="-24" width="48" height="48" rx="6" fill="rgba(236,230,216,0.03)" stroke="rgba(236,230,216,0.4)" strokeWidth="1.2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }} />
            <motion.rect x="-24" y="-24" width="48" height="48" rx="6" fill="rgba(157,180,135,0.22)" stroke={SAGE} strokeWidth="1.4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + index * 0.14, duration: 0.15 }} />
            <motion.path d="M-12 1 L-3 10 L13 -9" fill="none" stroke="#eef5e6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.3 + index * 0.14, duration: 0.18 }} />
          </g>
        ))}
      </svg>
      {/* Tampon : deux anneaux et « 6/6 », qui s'abat de biais. */}
      <motion.div
        className="absolute grid place-items-center rounded-full"
        style={{ left: 200, top: 196, width: 92, height: 92, border: `2.5px solid ${CREAM}`, boxShadow: `inset 0 0 0 5px rgba(7,7,8,0.9), inset 0 0 0 6.5px ${CREAM}`, background: "rgba(7,7,8,0.85)" }}
        initial={{ scale: 2.4, opacity: 0, rotate: 8 }}
        animate={{ scale: 1, opacity: 1, rotate: -12 }}
        transition={{ delay: 1.2, duration: 0.25, ease: "easeIn" }}
      >
        <span className="font-display text-2xl font-bold text-[#ece6d8]">6/6</span>
      </motion.div>
    </SecretStage>
  );
}
