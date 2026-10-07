"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, ICE, MetalText, SceneLayout, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const BOLTS = [
  { d: "M118 -120 L132 -40 L110 -20 L140 60 L122 72 L146 132", at: 0.3 },
  { d: "M210 -130 L190 -50 L214 -30 L178 50 L198 58 L160 130", at: 0.72 },
  { d: "M150 -140 L162 -60 L138 -44 L166 34 L144 46 L152 128", at: 1.1 },
];

/** 20 · « Foudre » : trois éclairs frappent le 20, l'écran blanchit à chaque coup, le chiffre se charge. */
export default function Streak20({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={ICE} veil={0.9} />
      {BOLTS.map((bolt) => (
        <motion.div key={bolt.at} aria-hidden className="absolute inset-0 bg-[#e8f1ff]" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.16, 0, 0.09, 0] }} transition={{ delay: bolt.at + 0.08, duration: 0.35 }} />
      ))}
      <SceneLayout caption={<StreakCaption count={count} sub="Vingt S. La foudre frappe encore." accent={GOLD} delay={1.55} />}>
        <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
          {BOLTS.map((bolt) => (
            <g key={bolt.at}>
              <motion.path d={bolt.d} fill="none" stroke="rgba(188,214,234,0.5)" strokeWidth="9" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ delay: bolt.at, duration: 0.5, times: [0, 0.2, 1] }} />
              <motion.path d={bolt.d} fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ delay: bolt.at, duration: 0.5, times: [0, 0.2, 1] }} />
            </g>
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 1, 1, 1], scale: [0.7, 1.08, 1, 1.1, 1], x: [0, 0, -4, 3, 0] }}
            transition={{ delay: 0.36, duration: 1.1, times: [0, 0.2, 0.45, 0.75, 1] }}
            className="relative"
          >
            <MetalText metal="or" style={{ fontSize: 132, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
            <motion.span className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0, 0.9, 0, 0.7, 0] }} transition={{ delay: 0.36, duration: 1.2 }}>
              <MetalText metal="argent" style={{ fontSize: 132, lineHeight: 1, display: "block" }}>
                {count}
              </MetalText>
            </motion.span>
          </motion.div>
        </div>
        {BOLTS.map((bolt, index) => (
          <Sparks key={bolt.at} count={14} color={index === 2 ? GOLD_HI : "#e8f1ff"} delay={bolt.at + 0.1} distance={[60, 140]} streak size={2} seed={200 + index} duration={0.6} y={40} />
        ))}
        <Shockwave color={GOLD} delay={1.2} size={360} width={2} />
        <Shockwave color={ICE} delay={1.32} size={460} width={1} />
      </SceneLayout>
    </>
  );
}
