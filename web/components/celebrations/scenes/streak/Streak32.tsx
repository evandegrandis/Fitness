"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const BACK = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"];
const CELL = 32;
/** Les 32 pièces de départ : rangée arrière et pions, des deux côtés. */
const PIECES = [
  ...BACK.map((glyph, col) => ({ glyph, col, row: 0, light: false })),
  ...BACK.map((_, col) => ({ glyph: "♟", col, row: 1, light: false })),
  ...BACK.map((_, col) => ({ glyph: "♟", col, row: 6, light: true })),
  ...BACK.map((glyph, col) => ({ glyph, col, row: 7, light: true })),
];
const ORDER = [3, 4, 2, 5, 1, 6, 0, 7];

/**
 * 32 · « Échiquier » : trente-deux pièces. L'échiquier se pose en perspective, puis les pièces
 * tombent sur leurs cases de départ, des tours vers les rois, les deux camps en miroir ; les deux
 * rois s'allument quand la dernière est en place.
 */
export default function Streak32({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Trente-deux pièces, la partie peut commencer." accent={GOLD} delay={2} />}>
        <Glow color={GOLD} size={340} delay={1.6} strength={30} />
        <div className="absolute inset-0 grid place-items-center" style={{ perspective: 700 }}>
          <motion.div className="relative" style={{ width: CELL * 8, height: CELL * 8, transformStyle: "preserve-3d" }} initial={{ rotateX: 0, scale: 0.7, opacity: 0 }} animate={{ rotateX: 38, scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <div className="absolute inset-0 grid grid-cols-8" style={{ border: `2px solid ${GOLD}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }}>
              {Array.from({ length: 64 }, (_, index) => (
                <span key={index} style={{ background: (Math.floor(index / 8) + index) % 2 ? "#1d1a14" : "#3b3427" }} />
              ))}
            </div>
            {PIECES.map((piece, index) => {
              const rank = piece.row === 0 || piece.row === 7 ? 1 : 0;
              const delay = 0.55 + rank * 0.45 + ORDER.indexOf(piece.col) * 0.05 + (piece.light ? 0.02 : 0);
              const king = piece.glyph === "♚";
              return (
                <motion.span
                  key={index}
                  className="absolute grid place-items-center text-[26px] leading-none"
                  style={{ left: piece.col * CELL, top: piece.row * CELL, width: CELL, height: CELL, color: piece.light ? CREAM : GOLD, transformOrigin: "50% 90%", textShadow: "0 3px 3px rgba(0,0,0,0.7)" }}
                  initial={{ y: -90, opacity: 0, rotateX: -38 }}
                  animate={{ y: [-90, 3, 0], opacity: 1, rotateX: -38 }}
                  transition={{ delay, duration: 0.35, times: [0, 0.8, 1], ease: "easeIn" }}
                >
                  {king ? (
                    <motion.span initial={{ color: piece.light ? CREAM : GOLD }} animate={{ color: GOLD_HI, textShadow: `0 0 14px ${GOLD_HI}` }} transition={{ delay: 1.65, duration: 0.4 }}>
                      {`${piece.glyph}︎`}
                    </motion.span>
                  ) : (
                    `${piece.glyph}︎`
                  )}
                </motion.span>
              );
            })}
          </motion.div>
        </div>
        <Shockwave color={GOLD_HI} delay={1.65} size={380} width={1.5} />
        <motion.div className="absolute inset-x-0 -top-12 grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 72, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
