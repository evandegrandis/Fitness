"use client";

import { motion } from "framer-motion";
import { CREAM, Shockwave, SILVER } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

/** lancee : une lance traverse l'écran en diagonale et se fiche au centre de la cible, où elle vibre. */
export default function Lancee({ title, description }: SecretProps) {
  return (
    <SecretStage tint={SILVER} accent={SILVER} title={title} description={description}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        {[96, 70, 44, 18].map((radius, index) => (
          <motion.circle key={radius} r={radius} fill={index === 3 ? "rgba(236,230,216,0.9)" : "none"} stroke={CREAM} strokeWidth={index === 0 ? 1.6 : 1} opacity={0.75} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.75 }} transition={{ delay: index * 0.06, duration: 0.35 }} />
        ))}
      </svg>
      {/* Lignes de vitesse, dans l'axe du lancer. */}
      {[-14, 0, 14].map((offset, index) => (
        <motion.span key={offset} aria-hidden className="absolute h-px" style={{ left: -60, top: 150 + offset, width: 180, background: `linear-gradient(90deg, transparent, ${CREAM})`, rotate: -32, transformOrigin: "100% 50%" }} initial={{ x: -140, opacity: 0 }} animate={{ x: [-140, 60], opacity: [0, 0.8, 0] }} transition={{ delay: 0.12 + index * 0.04, duration: 0.45 }} />
      ))}
      {/* La lance : hampe + fer, pointe vers le centre. */}
      <motion.div className="absolute" style={{ left: 150, top: 150, width: 0, height: 0 }} initial={{ x: -320, y: 200 }} animate={{ x: 0, y: 0 }} transition={{ delay: 0.15, duration: 0.42, ease: [0.5, 0, 1, 1] }}>
        <motion.div style={{ rotate: -32, transformOrigin: "0 0" }} animate={{ rotate: [-32, -32, -26, -36, -29, -34, -31, -32] }} transition={{ delay: 0.57, duration: 0.9 }}>
          <svg aria-hidden width="240" height="24" viewBox="0 0 240 24" style={{ position: "absolute", left: -236, top: -12, overflow: "visible" }}>
            <rect x="0" y="10" width="196" height="4" rx="2" fill="#8a7a62" />
            <path d="M184 12 L208 -1 L240 12 L208 25 Z" fill="url(#fer)" stroke="#f2f4f7" strokeWidth="0.8" />
            <defs>
              <linearGradient id="fer" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="#8d939b" />
              </linearGradient>
            </defs>
          </svg>
        </motion.div>
      </motion.div>
      <Shockwave color={CREAM} delay={0.56} size={240} width={2} />
    </SecretStage>
  );
}
