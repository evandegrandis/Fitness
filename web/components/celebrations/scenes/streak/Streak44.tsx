"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, ICE, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const W = 280;
const SAMPLES = 28;
const wave = (x: number) => Math.sin((x / W) * Math.PI * 4) * 46 * (0.6 + 0.4 * Math.sin((x / W) * Math.PI * 1.3)) + Math.sin((x / W) * Math.PI * 11) * 9;
const CURVE = `M${Array.from({ length: 141 }, (_, index) => {
  const x = (index / 140) * W;
  return `${(x - W / 2).toFixed(1)} ${wave(x).toFixed(1)}`;
}).join(" L")}`;
const STAIR = (() => {
  let d = "";
  for (let index = 0; index < SAMPLES; index += 1) {
    const x = (index / SAMPLES) * W;
    const y = Math.round(wave(x) / 8) * 8;
    d += `${index ? "L" : "M"}${(x - W / 2).toFixed(1)} ${y} L${(x + W / SAMPLES - W / 2).toFixed(1)} ${y} `;
  }
  return d;
})();
const SAMPLE = 0.8;

/**
 * 44 · « 44,1 kHz » : la fréquence d'échantillonnage du CD. Une onde continue se trace, puis des
 * échantillons la mesurent à intervalles réguliers, de gauche à droite ; l'onde s'efface et il ne
 * reste que l'escalier numérique.
 */
export default function Streak44({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={ICE} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="44,1 kHz : le son du CD." accent={ICE} delay={2.1} />}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          <line x1={-W / 2} y1="0" x2={W / 2} y2="0" stroke={CREAM} strokeOpacity="0.15" />
          <motion.path d={CURVE} fill="none" stroke={CREAM} strokeWidth="2" initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0.15] }} transition={{ duration: 0.7, opacity: { duration: 2, times: [0, 0.75, 1] } }} />
          {Array.from({ length: SAMPLES }, (_, index) => {
            const x = (index / SAMPLES) * W + W / SAMPLES / 2;
            const y = wave(x);
            return (
              <motion.g key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: SAMPLE + index * 0.03, duration: 0.15 }}>
                <line x1={x - W / 2} y1="0" x2={x - W / 2} y2={y} stroke={GOLD} strokeOpacity="0.6" strokeWidth="1.5" />
                <circle cx={x - W / 2} cy={y} r="3" fill={GOLD_HI} />
              </motion.g>
            );
          })}
          <motion.path d={STAIR} fill="none" stroke={GOLD_HI} strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: SAMPLE + SAMPLES * 0.03, duration: 0.6, ease: "linear" }} />
        </svg>
        <motion.div className="absolute inset-x-0 -top-4 flex items-baseline justify-center gap-1" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 76, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
          <span className="font-display text-3xl font-bold" style={{ color: GOLD }}>
            ,1
          </span>
          <span className="ml-1 font-mono text-sm" style={{ color: ICE }}>
            kHz
          </span>
        </motion.div>
      </SceneLayout>
    </>
  );
}
