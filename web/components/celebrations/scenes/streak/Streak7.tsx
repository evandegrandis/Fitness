"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, GOLD_HI, Glow, ICE, MetalText, NIGHT, SceneLayout, seeded } from "../../kit";
import { StreakCaption } from "./caption";

/** La Grande Ourse : sept étoiles, la casserole puis le manche. */
const STARS = [
  [70, 170], [112, 160], [150, 178], [196, 190], [206, 238], [262, 236], [266, 186],
] as const;
const PATH = [0, 1, 2, 3, 4, 5, 6, 3];

/** 7 · « Sept étoiles » : la Grande Ourse s'allume étoile par étoile, puis se relie. */
export default function Streak7({ count }: { count: number }) {
  const field = useMemo(() => {
    const random = seeded(77);
    return Array.from({ length: 40 }, () => ({ x: random() * 340 - 20, y: random() * 320 - 10, size: 0.8 + random() * 1.4, lag: random() * 1.5 }));
  }, []);
  const d = PATH.map((star, index) => `${index ? "L" : "M"}${STARS[star][0]} ${STARS[star][1]}`).join(" ");
  return (
    <>
      <Backdrop tint={NIGHT} veil={0.8} at="50% 35%" />
      <SceneLayout caption={<StreakCaption count={count} sub="Sept S, sept étoiles : la Grande Ourse." accent={ICE} delay={1.7} />}>
        {field.map((star, index) => (
          <motion.span
            key={index}
            aria-hidden
            className="absolute rounded-full bg-white"
            style={{ left: star.x, top: star.y, width: star.size, height: star.size }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0.2, 0.5] }}
            transition={{ delay: star.lag * 0.4, duration: 2.6 }}
          />
        ))}
        <Glow color={ICE} size={260} delay={1.2} strength={25} y={40} />
        <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
          <motion.path d={d} fill="none" stroke="rgba(188,214,234,0.55)" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.05, duration: 0.8, ease: "easeInOut" }} />
          {STARS.map(([x, y], index) => (
            <g key={index} transform={`translate(${x} ${y})`}>
              <motion.circle r="14" fill="rgba(188,214,234,0.18)" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.6, 1], opacity: [0, 1, 0.6] }} transition={{ delay: 0.15 * index + 0.1, duration: 0.6 }} />
              <motion.path
                d="M0 -9 L2 -2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2 -2Z"
                fill={index === 6 ? GOLD_HI : "#f2f6fb"}
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15 * index + 0.1, type: "spring", stiffness: 420, damping: 12 }}
              />
            </g>
          ))}
        </svg>
        <motion.div className="absolute left-0 right-0 top-2 grid place-items-center" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.6 }}>
          <MetalText metal="argent" style={{ fontSize: 92, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
