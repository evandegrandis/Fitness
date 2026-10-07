"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, ICE, Shockwave, Sparks } from "../../kit";
import { GHOST_PATH } from "./ghost";
import { SecretStage, type SecretProps } from "./stage";

/** fantome-ecrase : un disque de fonte tombe sur le fantôme, qui s'écrase puis éclate en volutes ; l'écran tremble. */
export default function FantomeEcrase({ title, description }: SecretProps) {
  return (
    <SecretStage tint={ICE} accent={GOLD} title={title} description={description} captionDelay={1.4}>
      <motion.div className="absolute inset-0" animate={{ x: [0, 0, -7, 6, -3, 0] }} transition={{ duration: 0.9, times: [0, 0.6, 0.66, 0.72, 0.8, 0.9] }}>
        <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
          <line x1="40" y1="236" x2="260" y2="236" stroke="rgba(236,230,216,0.3)" />
          <g transform="translate(150 199)">
            <motion.g style={{ originY: 1 }} initial={{ opacity: 0, scaleY: 1 }} animate={{ opacity: [0, 1, 1, 0], scaleY: [1, 1, 0.25, 0.1] }} transition={{ duration: 1, times: [0, 0.2, 0.6, 0.85] }}>
              <path d={GHOST_PATH} fill="rgba(188,214,234,0.4)" stroke={ICE} strokeWidth="1.2" />
              <ellipse cx="-10" cy="-10" rx="3.5" ry="5" fill="#0b0b0c" />
              <ellipse cx="10" cy="-10" rx="3.5" ry="5" fill="#0b0b0c" />
            </motion.g>
          </g>
        </svg>
        {/* Le disque, vu de profil, tombe et rebondit à peine. */}
        <motion.div
          className="absolute left-1/2 rounded-[10px]"
          style={{ width: 150, height: 34, marginLeft: -75, top: 202, background: "linear-gradient(180deg, #8d8679 0%, #4a453d 45%, #24211c 100%)", border: "1px solid rgba(236,230,216,0.6)", boxShadow: "0 -2px 0 rgba(255,255,255,0.25) inset" }}
          initial={{ y: -330, opacity: 0 }}
          animate={{ y: [-330, -330, 0, -8, 0], opacity: [0, 1, 1, 1, 1] }}
          transition={{ duration: 0.95, times: [0, 0.2, 0.6, 0.72, 0.82], ease: "easeIn" }}
        >
          <div className="absolute inset-0 grid place-items-center font-mono text-[0.62rem] font-bold tracking-[0.3em] text-[#f4dca0]">20 KG</div>
        </motion.div>
      </motion.div>
      <Sparks count={18} color={ICE} delay={0.58} distance={[50, 130]} spread={160} direction={-90} size={4} seed={20} y={70} duration={0.9} />
      <Sparks count={10} color={GOLD_HI} delay={0.6} distance={[40, 90]} spread={120} direction={-90} streak size={2} seed={21} y={70} duration={0.6} />
      <Shockwave color={GOLD} delay={0.58} size={260} y={70} />
      <motion.p className="absolute inset-x-0 text-center font-display text-2xl font-bold" style={{ top: 58, color: GOLD_HI }} initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.75, type: "spring", stiffness: 320, damping: 14 }}>
        +20 %
      </motion.p>
    </SecretStage>
  );
}
