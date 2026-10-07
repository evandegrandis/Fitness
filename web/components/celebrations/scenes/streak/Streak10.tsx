"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, Embers, GOLD, GOLD_HI, Glow, MetalText, Rays, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const COLUMNS = [62, 97, 132, 168, 203, 238];

/** 10 · « Olympe » : le temple se bâtit (marches, colonnes, fronton) et le 10 s'y pose dans la lumière. */
export default function Streak10({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} />
      <SceneLayout caption={<StreakCaption count={count} sub="Dix S d'affilée. Bienvenue sur l'Olympe." accent={GOLD} delay={1.9} />}>
        <Rays count={24} color={GOLD_HI} delay={1.4} spin={18} duration={2.4} peak={0.45} y={-40} />
        <Glow color={GOLD} size={320} delay={1} strength={50} y={10} />
        <Embers count={30} color={GOLD_HI} delay={1.3} width={340} from={140} rise={[200, 380]} seed={10} />
        <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
          {[0, 1, 2].map((step) => (
            <motion.rect
              key={step}
              x={36 + step * 10}
              y={268 - step * 9}
              width={228 - step * 20}
              height="8"
              fill="#1d1a14"
              stroke="rgba(236,230,216,0.55)"
              strokeWidth="0.8"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: step * 0.1, duration: 0.35 }}
            />
          ))}
          {COLUMNS.map((x, index) => (
            <motion.g key={x} style={{ transformOrigin: `${x}px 250px` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.3 + index * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
              <rect x={x - 9} y="150" width="18" height="100" fill="url(#marbre)" />
              {[-4, 0, 4].map((dx) => (
                <line key={dx} x1={x + dx} y1="154" x2={x + dx} y2="246" stroke="rgba(7,7,8,0.25)" strokeWidth="0.8" />
              ))}
              <rect x={x - 12} y="144" width="24" height="6" fill={CREAM} opacity="0.8" />
            </motion.g>
          ))}
          <motion.path d="M34 142 L150 84 L266 142 Z" fill="rgba(236,230,216,0.08)" stroke={CREAM} strokeWidth="1.4" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 0.85, duration: 0.6 }} />
          <motion.rect x="34" y="138" width="232" height="6" fill={CREAM} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ transformOrigin: "150px 141px" }} transition={{ delay: 0.8, duration: 0.4 }} />
          <defs>
            <linearGradient id="marbre" x1="0" x2="1">
              <stop offset="0" stopColor="#8f897c" />
              <stop offset="0.45" stopColor="#f3eee3" />
              <stop offset="1" stopColor="#9a9386" />
            </linearGradient>
          </defs>
        </svg>
        <motion.div className="absolute inset-x-0 grid place-items-center" style={{ top: 98 }} initial={{ opacity: 0, y: -70, scale: 1.3 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 1.25, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <MetalText metal="or" style={{ fontSize: 46, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
        <Shockwave color={GOLD} delay={1.45} size={360} />
      </SceneLayout>
    </>
  );
}
