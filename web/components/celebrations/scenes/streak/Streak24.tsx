"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, EMBER, GOLD, GOLD_HI, ICE, MetalText, NIGHT, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const DAY = 3;
/** Le circuit vu du ciel : une boucle allongée avec sa grande ligne droite. */
const TRACK = "M-110 40 C-130 40 -132 -6 -112 -14 L60 -70 C100 -84 132 -60 120 -26 C110 4 80 6 70 22 C62 36 74 52 50 56 Z";

/**
 * 24 · « 24 Heures » : la course du Mans. Le cadran fait un tour complet de vingt-quatre heures
 * pendant que le ciel passe du jour à la nuit et revient ; sur le circuit, les phares tracent
 * leurs traînées tour après tour, sans jamais s'arrêter.
 */
export default function Streak24({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={NIGHT} veil={0.9} />
      {/* Le ciel : aube dorée, nuit bleue, aube. */}
      <motion.div aria-hidden className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0, 0, 0.5] }} transition={{ duration: DAY, times: [0, 0.15, 0.4, 0.75, 1] }} style={{ background: `radial-gradient(100% 60% at 50% 100%, color-mix(in srgb, ${EMBER} 45%, transparent), transparent 70%)` }} />
      <motion.div aria-hidden className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.75, 0.75, 0] }} transition={{ duration: DAY, times: [0, 0.25, 0.45, 0.7, 0.95] }} style={{ background: `radial-gradient(100% 70% at 50% 20%, color-mix(in srgb, ${NIGHT} 90%, transparent), transparent 80%)` }} />
      <SceneLayout caption={<StreakCaption count={count} sub="Vingt-quatre heures, sans s'arrêter." accent={GOLD} delay={1.8} />}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {/* Le cadran de 24 heures. */}
          <circle r="142" fill="none" stroke={GOLD} strokeOpacity="0.35" strokeWidth="1" />
          {Array.from({ length: 24 }, (_, hour) => {
            const a = (hour / 24) * Math.PI * 2 - Math.PI / 2;
            const big = hour % 6 === 0;
            return <line key={hour} x1={Math.cos(a) * 142} y1={Math.sin(a) * 142} x2={Math.cos(a) * (big ? 128 : 135)} y2={Math.sin(a) * (big ? 128 : 135)} stroke={GOLD} strokeOpacity={big ? 0.9 : 0.45} strokeWidth={big ? 2 : 1} />;
          })}
          {/* L'aiguille : soleil puis lune, un tour en une journée. */}
          <motion.g initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: DAY, ease: "linear" }}>
            <line x1="0" y1="0" x2="0" y2="-120" stroke={GOLD_HI} strokeOpacity="0.5" strokeWidth="1" />
            <motion.circle cy="-120" r="7" initial={{ fill: GOLD_HI }} animate={{ fill: [GOLD_HI, GOLD_HI, ICE, ICE, GOLD_HI] }} transition={{ duration: DAY, times: [0, 0.25, 0.4, 0.7, 0.9] }} />
          </motion.g>
          {/* Le circuit et les traînées des phares. */}
          <path d={TRACK} fill="none" stroke="#2a2723" strokeWidth="14" strokeLinejoin="round" />
          <path d={TRACK} fill="none" stroke={CREAM} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="4 6" />
          {[0, 0.33, 0.66].map((lag, index) => (
            <motion.path
              key={index}
              d={TRACK}
              fill="none"
              stroke={index === 1 ? "#e0564f" : GOLD_HI}
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="0.16 0.84"
              initial={{ strokeDashoffset: lag }}
              animate={{ strokeDashoffset: lag - 3.2 }}
              transition={{ duration: DAY + 1.2, ease: "linear" }}
              style={{ filter: `drop-shadow(0 0 4px ${index === 1 ? "#e0564f" : GOLD_HI})` }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center pt-24">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.6 }} className="flex items-baseline gap-1">
            <MetalText metal="or" style={{ fontSize: 64, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
            <span className="font-mono text-lg" style={{ color: GOLD }}>
              h
            </span>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
