"use client";

import { motion } from "framer-motion";
import { SAGE, Shockwave } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

/** marathon : un chronomètre dont l'aiguille fait deux tours et demi ; l'arc se remplit, « 2 h 30 » s'affiche. */
export default function Marathon({ title, description }: SecretProps) {
  return (
    <SecretStage tint={SAGE} accent={SAGE} title={title} description={description} captionDelay={1.6}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        <rect x="-10" y="-124" width="20" height="14" rx="3" fill="none" stroke={SAGE} strokeWidth="1.4" />
        <line x1="-18" y1="-128" x2="18" y2="-128" stroke={SAGE} strokeWidth="2.4" strokeLinecap="round" />
        <circle r="102" fill="rgba(12,16,10,0.75)" stroke="rgba(157,180,135,0.35)" strokeWidth="1.2" />
        {Array.from({ length: 60 }, (_, index) => {
          const angle = (index / 60) * Math.PI * 2;
          const long = index % 5 === 0;
          return <line key={index} x1={Math.sin(angle) * (long ? 86 : 91)} y1={-Math.cos(angle) * (long ? 86 : 91)} x2={Math.sin(angle) * 96} y2={-Math.cos(angle) * 96} stroke="rgba(236,230,216,0.5)" strokeWidth={long ? 1.4 : 0.6} />;
        })}
        {/* Deux tours pleins, puis la demie : l'arc se pose en trois passes. */}
        {[0, 1].map((lap) => (
          <motion.circle key={lap} r={74 - lap * 9} fill="none" stroke={lap ? "#c8dbb4" : SAGE} strokeWidth="5" strokeLinecap="round" transform="rotate(-90)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15 + lap * 0.5, duration: 0.5, ease: "linear" }} />
        ))}
        <motion.circle r="56" fill="none" stroke="#eef5e6" strokeWidth="5" strokeLinecap="round" transform="rotate(-90)" initial={{ pathLength: 0 }} animate={{ pathLength: 0.5 }} transition={{ delay: 1.15, duration: 0.25, ease: "linear" }} />
      </svg>
      <motion.span
        aria-hidden
        className="absolute rounded-full bg-[#ece6d8]"
        style={{ left: 149, top: 62, width: 2, height: 96, transformOrigin: "50% 88px" }}
        initial={{ rotate: 0, opacity: 1 }}
        animate={{ rotate: 900, opacity: [1, 1, 0] }}
        transition={{ delay: 0.15, duration: 1.25, ease: "linear", opacity: { delay: 0.15, duration: 1.5, times: [0, 0.83, 1] } }}
      />
      <motion.div className="absolute inset-x-0 grid place-items-center" style={{ top: 136 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, duration: 0.4 }}>
        <span className="font-mono text-[1.35rem] font-bold tracking-tight text-[#eef5e6]">2 h 30</span>
      </motion.div>
      <Shockwave color={SAGE} delay={1.4} size={300} />
    </SecretStage>
  );
}
