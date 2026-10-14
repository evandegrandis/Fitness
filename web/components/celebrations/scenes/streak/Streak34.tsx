"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34];

/** Pavage de Fibonacci : chaque carré s'ajoute à droite, dessous, à gauche, dessus ; un quart de cercle par carré. */
const TILES = (() => {
  let [x0, y0, x1, y1] = [0, 0, 1, 1];
  const tiles = [{ x: 0, y: 0, s: 1, dir: 3 }];
  FIB.slice(1).forEach((s, index) => {
    const dir = index % 4;
    if (dir === 0) {
      tiles.push({ x: x1, y: y0, s, dir });
      x1 += s;
    } else if (dir === 1) {
      tiles.push({ x: x0, y: y1, s, dir });
      y1 += s;
    } else if (dir === 2) {
      tiles.push({ x: x0 - s, y: y0, s, dir });
      x0 -= s;
    } else {
      tiles.push({ x: x0, y: y0 - s, s, dir });
      y0 -= s;
    }
  });
  const unit = 280 / Math.max(x1 - x0, y1 - y0);
  const ox = -((x0 + x1) / 2) * unit;
  const oy = -((y0 + y1) / 2) * unit;
  return tiles.map(({ x, y, s, dir }) => {
    const [X, Y, S] = [x * unit + ox, y * unit + oy, s * unit];
    const from = [[X, Y], [X + S, Y], [X + S, Y + S], [X, Y + S]][dir];
    const to = [[X + S, Y + S], [X, Y + S], [X, Y], [X + S, Y]][dir];
    return { X, Y, S, n: s, arc: `M${from[0].toFixed(1)} ${from[1].toFixed(1)} A${S.toFixed(1)} ${S.toFixed(1)} 0 0 1 ${to[0].toFixed(1)} ${to[1].toFixed(1)}` };
  });
})();
const at = (index: number) => 0.1 + Math.pow(index, 1.25) * 0.11;

/**
 * 34 · « Fibonacci » : 1, 1, 2, 3, 5, 8, 13, 21, 34. Les carrés s'ajoutent l'un après l'autre
 * en tournant, chacun la somme des deux d'avant, et la spirale d'or les traverse jusqu'au 34.
 */
export default function Streak34({ count }: { count: number }) {
  const end = at(TILES.length - 1) + 0.4;
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="1, 1, 2, 3, 5, 8, 13, 21, 34 : la suite de Fibonacci." accent={GOLD} delay={end + 0.3} />}>
        <Glow color={GOLD} size={320} delay={end} strength={30} />
        <motion.svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible" initial={{ scale: 2.6, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: end, ease: [0.4, 0, 0.2, 1] }}>
          {TILES.map((tile, index) => (
            <g key={index}>
              <motion.rect x={tile.X} y={tile.Y} width={tile.S} height={tile.S} fill={index === TILES.length - 1 ? "rgba(216,178,106,0.08)" : "none"} stroke={CREAM} strokeOpacity="0.35" strokeWidth={0.8} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at(index), duration: 0.25 }} />
              {tile.n >= 3 && (
                <motion.text x={tile.X + tile.S / 2} y={tile.Y + tile.S / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(30, tile.S * 0.32)} fill={CREAM} fillOpacity={tile.n === 34 ? 0 : 0.45} fontFamily="ui-monospace, monospace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at(index) + 0.1, duration: 0.3 }}>
                  {tile.n}
                </motion.text>
              )}
              <motion.path d={tile.arc} fill="none" stroke={GOLD_HI} strokeWidth="2.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: at(index) + 0.05, duration: Math.max(0.12, at(index + 1) - at(index)), ease: "linear" }} />
            </g>
          ))}
        </motion.svg>
        <div className="absolute" style={{ left: 150 + TILES[8].X + TILES[8].S / 2, top: 150 + TILES[8].Y + TILES[8].S / 2, transform: "translate(-50%, -50%)" }}>
          <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: end, type: "spring", stiffness: 260, damping: 15 }}>
            <MetalText metal="or" style={{ fontSize: 76, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
