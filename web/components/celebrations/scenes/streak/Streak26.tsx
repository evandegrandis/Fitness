"use client";

import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { Backdrop, GOLD, GOLD_HI, MetalText, SceneLayout, seeded } from "../../kit";
import { StreakCaption } from "./caption";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Chaque palette se fige à son tour, de A à Z. */
const settle = (index: number) => 0.45 + index * 0.05;

/**
 * 26 · « De A à Z » : vingt-six lettres. Un tableau d'affichage de gare à palettes : les vingt-six
 * cases claquent en faisant défiler les lettres et s'arrêtent une à une sur l'alphabet ; le Z s'allume en or.
 */
export default function Streak26({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const board = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  useAnimationFrame((time) => {
    if (start.current === null) start.current = time;
    const t = (time - start.current) / 1000;
    const random = seeded(Math.floor(t * 18) + 3);
    board.current?.querySelectorAll<HTMLSpanElement>("[data-flap]").forEach((flap, index) => {
      const done = reduced || t >= settle(index);
      flap.textContent = done ? ALPHABET[index] : ALPHABET[Math.floor(random() * 26)];
      flap.style.transform = done ? "scaleY(1)" : `scaleY(${0.7 + random() * 0.3})`;
    });
  });
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Vingt-six lettres, de A à Z." accent={GOLD} delay={2.1} />}>
        <motion.div className="absolute -top-2 left-1/2 -translate-x-1/2" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 76, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
        <div ref={board} className="absolute inset-x-[-14px] top-[96px] grid grid-cols-7 gap-[5px] rounded-lg p-2" style={{ background: "#0d0c0b", border: "1px solid rgba(236,230,216,0.12)" }}>
          {ALPHABET.split("").map((letter, index) => (
            <motion.div
              key={letter}
              className="relative grid h-[38px] place-items-center overflow-hidden rounded-[4px] font-mono text-[22px] font-bold"
              style={{ background: "linear-gradient(180deg, #24211c 49%, #0a0908 50%, #1b1915 51%)", color: index === 25 ? "#1a1408" : "#ece6d8", gridColumn: index === 21 ? "2" : undefined }}
              animate={index === 25 ? { backgroundColor: ["#24211c", GOLD], boxShadow: ["0 0 0 rgba(0,0,0,0)", `0 0 18px ${GOLD_HI}`] } : undefined}
              transition={{ delay: settle(25) + 0.1, duration: 0.3 }}
            >
              {index === 25 && <motion.span aria-hidden className="absolute inset-0" style={{ background: GOLD }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: settle(25) + 0.1, duration: 0.3 }} />}
              <span data-flap className="relative inline-block origin-center">
                {letter}
              </span>
            </motion.div>
          ))}
        </div>
      </SceneLayout>
    </>
  );
}
