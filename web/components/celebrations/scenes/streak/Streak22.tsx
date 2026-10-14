"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, ICE, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const R = 40;
const C = 2 * Math.PI * R;
const ROLL = 1.7;

/**
 * 22 · « 22/7 » : la fraction d'Archimède, la plus célèbre approximation de π. Une roue de
 * diamètre 1 roule d'un tour complet et déroule sa circonférence en un trait d'or sur le sol :
 * un peu plus de trois diamètres. 22/7 ≈ π.
 */
export default function Streak22({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={ICE} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="22/7 ≈ π : la roue d'Archimède." accent={GOLD} delay={ROLL + 0.5} />}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {/* Le sol, et les trois diamètres et un peu plus. */}
          <line x1={-C / 2 - 20} y1="60" x2={C / 2 + 20} y2="60" stroke={CREAM} strokeOpacity="0.25" strokeWidth="1" />
          {[0, 1, 2, 3].map((k) => (
            <motion.line key={k} x1={-C / 2 + k * 2 * R} y1="54" x2={-C / 2 + k * 2 * R} y2="66" stroke={ICE} strokeWidth="1.5" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ delay: (ROLL * k * 2 * R) / C, duration: 0.2 }} />
          ))}
          <motion.line x1={-C / 2} y1="60" x2={C / 2} y2="60" stroke={GOLD_HI} strokeWidth="3.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: ROLL, ease: "linear" }} />
          {/* La roue : elle tourne d'un tour exact en avançant de sa circonférence. */}
          <motion.g initial={{ x: -C / 2 }} animate={{ x: C / 2 }} transition={{ duration: ROLL, ease: "linear" }}>
            <g transform={`translate(0 ${60 - R})`}>
            <motion.g initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: ROLL, ease: "linear" }}>
              <circle r={R} fill="rgba(7,7,8,0.6)" stroke={CREAM} strokeWidth="2" />
              <line x1={-R} y1="0" x2={R} y2="0" stroke={ICE} strokeOpacity="0.6" strokeWidth="1" strokeDasharray="3 3" />
              <circle cy={R} r="4.5" fill={GOLD_HI} />
            </motion.g>
            </g>
          </motion.g>
          <motion.text x={C / 2 + 4} y="88" textAnchor="end" fontSize="13" fill={ICE} fontFamily="ui-monospace, monospace" initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: ROLL, duration: 0.4 }}>
            π ≈ 3,1428…
          </motion.text>
        </svg>
        <Glow color={GOLD} size={240} delay={ROLL} strength={30} y={-60} />
        <motion.div className="absolute inset-x-0 top-0 flex items-baseline justify-center gap-2" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ROLL - 0.1, type: "spring", stiffness: 240, damping: 16 }}>
          <MetalText metal="or" style={{ fontSize: 82, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
          <span className="font-display text-5xl" style={{ color: CREAM, opacity: 0.6 }}>
            /
          </span>
          <MetalText metal="argent" style={{ fontSize: 60, lineHeight: 1, display: "block" }}>
            7
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
