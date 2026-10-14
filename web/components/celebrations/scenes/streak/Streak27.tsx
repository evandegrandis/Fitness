"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, BRONZE, CREAM, EMBER, GOLD, GOLD_HI, Glow, ICE, MetalText, SAGE, SceneLayout, seeded, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const S = 34;
const COS = Math.cos(Math.PI / 6);
/** Projection isométrique, centrée sur le cube 3 × 3 × 3. */
function project(x: number, y: number, z: number) {
  const X = x - 1.5;
  const Y = y - 1.5;
  const Z = z - 1.5;
  return [(X - Y) * COS * S, (X + Y) * 0.5 * S - Z * S] as const;
}
/** Une vignette (carré du cube) rétrécie vers son centre. */
function sticker(corners: Array<[number, number, number]>) {
  const points = corners.map(([x, y, z]) => project(x, y, z));
  const cx = points.reduce((sum, p) => sum + p[0], 0) / 4;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / 4;
  return { d: `M${points.map(([x, y]) => `${(cx + (x - cx) * 0.86).toFixed(1)} ${(cy + (y - cy) * 0.86).toFixed(1)}`).join(" L")}Z`, cx, cy };
}
const FACES: Array<{ solved: string; stickers: ReturnType<typeof sticker>[] }> = [
  { solved: GOLD_HI, stickers: [] },
  { solved: CREAM, stickers: [] },
  { solved: BRONZE, stickers: [] },
];
for (let a = 0; a < 3; a += 1) {
  for (let b = 0; b < 3; b += 1) {
    FACES[0].stickers.push(sticker([[a, b, 3], [a + 1, b, 3], [a + 1, b + 1, 3], [a, b + 1, 3]]));
    FACES[1].stickers.push(sticker([[a, 3, b], [a + 1, 3, b], [a + 1, 3, b + 1], [a, 3, b + 1]]));
    FACES[2].stickers.push(sticker([[3, a, b], [3, a + 1, b], [3, a + 1, b + 1], [3, a, b + 1]]));
  }
}
const SCRAMBLE = [GOLD_HI, CREAM, BRONZE, EMBER, ICE, SAGE];

/**
 * 27 · « Trois au cube » : 27 = 3³, les vingt-sept petits cubes du Rubik's Cube. Les vignettes
 * arrivent en vrac, mélangées, puis se retournent en vague, face par face : le cube est résolu.
 */
export default function Streak27({ count }: { count: number }) {
  const scrambled = useMemo(() => {
    const random = seeded(27);
    return FACES.map(() => Array.from({ length: 9 }, () => ({ color: SCRAMBLE[Math.floor(random() * 6)], dx: (random() - 0.5) * 500, dy: (random() - 0.5) * 600, lag: random() * 0.3 })));
  }, []);
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Trois au cube : vingt-sept." accent={GOLD} delay={2} />}>
        <Glow color={GOLD} size={320} delay={1.6} strength={40} />
        <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ rotate: -8 }} animate={{ rotate: [-8, 4, 0] }} transition={{ duration: 1.8, ease: "easeOut" }}>
          <path d={`M${[project(0, 0, 3), project(3, 0, 3), project(3, 0, 0), project(3, 3, 0), project(0, 3, 0), project(0, 3, 3)].map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}Z`} fill="#0b0a08" />
          {FACES.map((face, f) =>
            face.stickers.map((piece, index) => {
              const scramble = scrambled[f][index];
              const flip = 1.0 + f * 0.18 + index * 0.03;
              return (
                <motion.g key={`${f}-${index}`} initial={{ x: scramble.dx, y: scramble.dy, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ delay: scramble.lag, duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}>
                  <motion.path d={piece.d} initial={{ fill: scramble.color, scaleX: 1 }} animate={{ fill: [scramble.color, scramble.color, face.solved], scaleX: [1, 0, 1] }} transition={{ delay: flip, duration: 0.3, times: [0, 0.5, 1] }} />
                </motion.g>
              );
            }),
          )}
        </motion.svg>
        <Shockwave color={GOLD_HI} delay={1.75} size={340} width={2} />
        <motion.div className="absolute -top-8 left-1/2 flex -translate-x-1/2 items-start" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 56, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
          <span className="ml-3 mt-2 font-display text-2xl" style={{ color: CREAM, opacity: 0.75 }}>
            = 3³
          </span>
        </motion.div>
      </SceneLayout>
    </>
  );
}
