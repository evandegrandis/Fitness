"use client";

import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { useMemo, useRef } from "react";
import { Backdrop, GOLD, GOLD_HI, MetalText, SAGE, SceneLayout, seeded } from "../../kit";
import { StreakCaption } from "./caption";

const HEXA = "0123456789ABCDEF";
const TARGET = "0x10";
/** Chaque caractère se fige l'un après l'autre (en secondes). */
const LOCK = [0.7, 0.95, 1.2, 1.45];

/**
 * 16 · « 0x10 » : seize s'écrit 10 en hexadécimal, la base des machines. Des colonnes de chiffres
 * hexadécimaux défilent, la lecture tourne comme un décodeur et se fige caractère par caractère
 * sur 0x10, puis la traduction s'affiche : 16.
 */
export default function Streak16({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const readout = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const columns = useMemo(() => {
    const random = seeded(16);
    return Array.from({ length: 13 }, (_, index) => ({ x: index * 8 - 2, speed: 40 + random() * 80, offset: random() * 300, opacity: 0.12 + random() * 0.3 }));
  }, []);
  useAnimationFrame((time) => {
    if (start.current === null) start.current = time;
    const t = (time - start.current) / 1000;
    const random = seeded(Math.floor(t * 24) + 1);
    readout.current?.querySelectorAll("span").forEach((span, index) => {
      span.textContent = t >= LOCK[index] || reduced ? TARGET[index] : index === 1 ? "x" : HEXA[Math.floor(random() * 16)];
      span.style.color = t >= LOCK[index] || reduced ? GOLD_HI : "rgba(157,180,135,0.85)";
    });
    if (reduced) return;
    rain.current?.querySelectorAll<HTMLDivElement>("[data-col]").forEach((column, index) => {
      const col = columns[index];
      column.style.transform = `translateY(${(((t * col.speed + col.offset) % 300) - 300).toFixed(1)}px)`;
    });
  });
  const strings = useMemo(() => {
    const random = seeded(61);
    return columns.map(() => Array.from({ length: 34 }, () => HEXA[Math.floor(random() * 16)]).join("\n"));
  }, [columns]);
  return (
    <>
      <Backdrop tint={SAGE} veil={0.93} />
      <div ref={rain} aria-hidden className="absolute inset-0 overflow-hidden" style={{ maskImage: "radial-gradient(60% 50% at 50% 42%, black, transparent)", WebkitMaskImage: "radial-gradient(60% 50% at 50% 42%, black, transparent)" }}>
        {columns.map((column, index) => (
          <div key={index} data-col className="absolute top-0 whitespace-pre font-mono text-[15px] leading-[18px]" style={{ left: `${column.x}%`, color: SAGE, opacity: column.opacity }}>
            {strings[index] + "\n" + strings[index]}
          </div>
        ))}
      </div>
      <SceneLayout caption={<StreakCaption count={count} sub="0x10 : seize, en hexadécimal." accent={GOLD} delay={1.9} />}>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center">
            <motion.div ref={readout} className="flex rounded-lg px-4 py-2 font-mono text-[64px] font-bold leading-none" style={{ background: "rgba(7,7,8,0.75)", border: `1px solid color-mix(in srgb, ${GOLD} 45%, transparent)` }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
              {TARGET.split("").map((_, index) => (
                <span key={index} className="inline-block w-[0.62em] text-center">
                  {TARGET[index]}
                </span>
              ))}
            </motion.div>
            <motion.div className="mt-4 flex items-baseline gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6, duration: 0.4 }}>
              <span className="font-mono text-2xl" style={{ color: SAGE }}>
                =
              </span>
              <MetalText metal="or" style={{ fontSize: 72, lineHeight: 1, display: "block" }}>
                {count}
              </MetalText>
            </motion.div>
          </div>
        </div>
      </SceneLayout>
    </>
  );
}
