"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, ICE } from "../../kit";
import { GHOST_PATH } from "./ghost";
import { SecretStage, type SecretProps } from "./stage";

/** fantome : deux colonnes, la tienne d'il y a quatre semaines (spectrale) et celle d'aujourd'hui, qui la dépasse ; le fantôme s'efface. */
export default function Fantome({ title, description }: SecretProps) {
  return (
    <SecretStage tint={ICE} accent={ICE} title={title} description={description} captionDelay={1.5}>
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        <line x1="40" y1="250" x2="260" y2="250" stroke="rgba(236,230,216,0.3)" />
        <motion.rect x="72" y="110" width="56" height="140" rx="4" fill="rgba(188,214,234,0.1)" stroke={ICE} strokeDasharray="4 4" style={{ originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5 }} />
        <motion.rect x="172" y="96" width="56" height="154" rx="4" fill="url(#aujourdhui)" style={{ originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: [0, 0.9, 1] }} transition={{ delay: 0.5, duration: 0.8, times: [0, 0.7, 1] }} />
        <motion.line x1="160" y1="110" x2="240" y2="110" stroke={ICE} strokeDasharray="2 3" initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 0.9 }} />
        <motion.text x="200" y="84" textAnchor="middle" className="font-display" style={{ fontSize: 22, fontWeight: 700 }} fill={GOLD_HI} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15 }}>
          +10 %
        </motion.text>
        <g transform="translate(100 70)">
          <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: [0, 0.9, 0.9, 0.15], y: [10, 0, -4, -24] }} transition={{ duration: 2.2, times: [0, 0.2, 0.55, 1] }}>
            <path d={GHOST_PATH} fill="rgba(188,214,234,0.35)" stroke={ICE} strokeWidth="1" />
            <ellipse cx="-10" cy="-10" rx="3.5" ry="5" fill="#0b0b0c" />
            <ellipse cx="10" cy="-10" rx="3.5" ry="5" fill="#0b0b0c" />
          </motion.g>
        </g>
        <defs>
          <linearGradient id="aujourdhui" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={GOLD_HI} />
            <stop offset="1" stopColor={GOLD} stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-x-0 flex justify-around px-14 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-(--color-fg-muted)" style={{ top: 258 }}>
        <span>il y a 4 sem.</span>
        <span>aujourd&apos;hui</span>
      </div>
    </SecretStage>
  );
}
