"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, EMBER, GOLD, GOLD_HI, Glow, MetalText, Rays, SceneLayout, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const R = 96;
const outer = Array.from({ length: 6 }, (_, k) => [Math.cos(((k * 60 - 90) * Math.PI) / 180) * R, Math.sin(((k * 60 - 90) * Math.PI) / 180) * R]);
const inner = [-90, 30, 150].map((deg) => [Math.cos((deg * Math.PI) / 180) * R * 0.56, Math.sin((deg * Math.PI) / 180) * R * 0.56]);
/** Le dé à vingt faces vu de face : hexagone, triangle central et ses rayons vers les sommets. */
const D20 = (() => {
  const p = ([x, y]: number[]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  let d = `M${outer.map(p).join(" L")}Z M${inner.map(p).join(" L")}Z`;
  const links = [[0, 0], [0, 1], [0, 5], [1, 1], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5]];
  for (const [i, o] of links) d += ` M${p(inner[i])} L${p(outer[o])}`;
  return d;
})();
/** Les faces qui défilent pendant que le dé roule, puis le 20. */
const ROLLS = ["7", "13", "2", "18", "9", "4", "16", "11"];
const LAND = 1.35;

/**
 * 20 · « Coup critique » : au jeu de rôle, faire 20 sur le dé à vingt faces, c'est la réussite
 * critique. Le dé tombe, rebondit, roule en montrant ses faces, puis s'immobilise sur le 20.
 */
export default function Streak20({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={EMBER} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Vingt naturel : coup critique." accent={GOLD} delay={LAND + 0.5} />}>
        <Rays count={18} color={GOLD_HI} delay={LAND} inner={70} outer={210} spin={30} duration={2.6} peak={0.45} />
        <Glow color={GOLD} size={320} delay={LAND} strength={45} />
        <motion.div
          className="absolute inset-0"
          initial={{ y: -380, rotate: -200, scale: 0.7 }}
          animate={{ y: [-380, 30, -60, 8, -14, 0], rotate: [-200, -60, 40, -12, 6, 0], x: [-80, -30, 30, -10, 4, 0], scale: [0.7, 1, 1, 1, 1, 1] }}
          transition={{ duration: LAND, times: [0, 0.38, 0.58, 0.76, 0.88, 1], ease: "easeOut" }}
        >
          <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
            <defs>
              <linearGradient id="d20" x1="0" y1="-1" x2="0" y2="1">
                <stop offset="0" stopColor="#2a2216" />
                <stop offset="1" stopColor="#0e0c09" />
              </linearGradient>
            </defs>
            <path d={`M${outer.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}Z`} fill="url(#d20)" />
            <path d={`M${inner.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}Z`} fill="rgba(216,178,106,0.14)" />
            <path d={D20} fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinejoin="round" />
          </svg>
          {ROLLS.map((face, index) => (
            <motion.span key={index} className="absolute inset-0 grid place-items-center pt-3 font-display text-3xl font-bold" style={{ color: CREAM }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ delay: (index * LAND) / ROLLS.length, duration: LAND / ROLLS.length + 0.02 }}>
              {face}
            </motion.span>
          ))}
          <motion.div className="absolute inset-0 grid place-items-center pt-3" initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: LAND - 0.05, duration: 0.3 }}>
            <MetalText metal="or" style={{ fontSize: 46, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </motion.div>
        <Shockwave color={GOLD_HI} delay={LAND} size={360} width={2.5} />
        <Sparks count={34} color={GOLD_HI} delay={LAND} distance={[110, 200]} size={3} seed={20} streak />
        <motion.p className="absolute inset-x-0 -top-8 text-center font-mono text-[0.7rem] uppercase tracking-[0.3em]" style={{ color: GOLD_HI }} initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: LAND + 0.1, type: "spring", stiffness: 400, damping: 16 }}>
          Critique
        </motion.p>
      </SceneLayout>
    </>
  );
}
