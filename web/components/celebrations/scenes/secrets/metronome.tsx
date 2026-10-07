"use client";

import { motion } from "framer-motion";
import { SAGE } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const TICKS = [0.35, 0.75, 1.15, 1.55];

/** metronome : le balancier bat quatre fois ; à chaque battement, une semaine de quatre séances se remplit. */
export default function Metronome({ title, description }: SecretProps) {
  return (
    <SecretStage tint={SAGE} accent={SAGE} title={title} description={description} captionDelay={1.8}>
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        <path d="M58 250 L118 250 L102 70 L74 70 Z" fill="rgba(157,180,135,0.08)" stroke={SAGE} strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="70" y1="232" x2="106" y2="232" stroke={SAGE} strokeWidth="1" opacity="0.5" />
      </svg>
      <motion.div
        aria-hidden
        className="absolute"
        style={{ left: 86, top: 70, width: 4, height: 162, marginLeft: -2, transformOrigin: "50% 162px" }}
        initial={{ rotate: -26 }}
        animate={{ rotate: [-26, 26, -26, 26, -26] }}
        transition={{ duration: 1.6, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut" }}
      >
        <div className="h-full w-full rounded-full bg-[#e6eedd]" />
        <div className="absolute left-1/2 top-6 h-4 w-5 -translate-x-1/2 rounded-[3px] bg-[#9db487]" />
      </motion.div>
      <div className="absolute grid grid-cols-4 gap-1.5" style={{ left: 146, top: 92 }}>
        {Array.from({ length: 16 }, (_, index) => {
          const week = index % 4;
          return (
            <span key={index} className="relative h-[26px] w-[26px] rounded-[4px]" style={{ border: "1px solid rgba(157,180,135,0.4)" }}>
              <motion.span
                className="absolute inset-0 rounded-[3px] bg-[#9db487]"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 0.9, scale: 1 }}
                transition={{ delay: TICKS[week] + Math.floor(index / 4) * 0.04, type: "spring", stiffness: 500, damping: 18 }}
              />
            </span>
          );
        })}
        <span className="col-span-4 mt-1 text-center font-mono text-[0.56rem] uppercase tracking-[0.18em] text-(--color-fg-muted)">4 × 4</span>
      </div>
    </SecretStage>
  );
}
