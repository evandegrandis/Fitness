"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const R = 128;
const OPEN = 1.4;
/** Six lamelles du diaphragme : des parts qui se recouvrent, rabattues vers le centre. */
const BLADES = Array.from({ length: 6 }, (_, k) => {
  const a0 = ((k * 60 - 10) * Math.PI) / 180;
  const a1 = ((k * 60 + 80) * Math.PI) / 180;
  return { angle: k * 60 + 35, d: `M0 0 L${(Math.cos(a0) * R * 1.3).toFixed(1)} ${(Math.sin(a0) * R * 1.3).toFixed(1)} L${(Math.cos(a1) * R * 1.3).toFixed(1)} ${(Math.sin(a1) * R * 1.3).toFixed(1)} Z` };
});

/**
 * 35 · « 35 mm » : le format de la pellicule photo. Le viseur fait la mise au point, le
 * diaphragme s'ouvre en tournant ses six lamelles, le flash part : sur l'image, le 35.
 */
export default function Streak35({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={CREAM} veil={0.94} />
      <SceneLayout caption={<StreakCaption count={count} sub="35 mm. Déclic." accent={GOLD} delay={OPEN + 0.6} />}>
        {/* L'image, derrière le diaphragme. */}
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ scale: 1.3, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: OPEN - 0.3, duration: 0.6 }}>
            <MetalText metal="or" style={{ fontSize: 120, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
            <p className="text-center font-mono text-[0.7rem] uppercase tracking-[0.4em]" style={{ color: GOLD }}>
              mm
            </p>
          </motion.div>
        </div>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <defs>
            <clipPath id="lens">
              <circle r={R} />
            </clipPath>
            <linearGradient id="blade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2a2722" />
              <stop offset="1" stopColor="#0e0d0b" />
            </linearGradient>
          </defs>
          <g clipPath="url(#lens)">
            {BLADES.map((blade, index) => (
              <motion.g key={index} initial={{ rotate: blade.angle - 35, x: 0, y: 0 }} animate={{ rotate: blade.angle + 20, x: Math.cos((blade.angle * Math.PI) / 180) * R * 1.5, y: Math.sin((blade.angle * Math.PI) / 180) * R * 1.5 }} transition={{ delay: OPEN - 0.55, duration: 0.55, ease: [0.6, 0, 0.3, 1] }} style={{ originX: "0px", originY: "0px" }}>
                <path d={blade.d} fill="url(#blade)" stroke={GOLD} strokeOpacity="0.45" strokeWidth="1" />
              </motion.g>
            ))}
          </g>
          <circle r={R} fill="none" stroke="#3a362e" strokeWidth="10" />
          <circle r={R + 6} fill="none" stroke={GOLD} strokeOpacity="0.6" strokeWidth="1" />
          {Array.from({ length: 48 }, (_, index) => {
            const a = (index / 48) * Math.PI * 2;
            return <line key={index} x1={Math.cos(a) * (R + 9)} y1={Math.sin(a) * (R + 9)} x2={Math.cos(a) * (R + (index % 4 ? 13 : 17))} y2={Math.sin(a) * (R + (index % 4 ? 13 : 17))} stroke={GOLD} strokeOpacity="0.5" strokeWidth="1" />;
          })}
        </svg>
        {/* La bague de mise au point qui tourne avant le déclic. */}
        <motion.div aria-hidden className="absolute inset-[-24px] rounded-full" style={{ border: `1px dashed color-mix(in srgb, ${GOLD} 60%, transparent)` }} initial={{ rotate: 0, opacity: 0 }} animate={{ rotate: 70, opacity: [0, 1, 1, 0.4] }} transition={{ duration: OPEN, ease: "easeOut" }} />
        {/* Le flash. */}
        <motion.div aria-hidden className="fixed inset-0" style={{ background: "#fff" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0] }} transition={{ delay: OPEN, duration: 0.45, times: [0, 0.1, 1] }} />
        <motion.span aria-hidden className="absolute -right-2 -top-2 h-3 w-3 rounded-full" style={{ background: "#e0564f", boxShadow: "0 0 10px #e0564f" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0, 1, 0, 1] }} transition={{ duration: OPEN }} />
      </SceneLayout>
    </>
  );
}
