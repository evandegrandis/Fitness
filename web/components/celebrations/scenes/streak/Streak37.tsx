"use client";

import { motion, useAnimationFrame } from "framer-motion";
import { useMemo, useRef } from "react";
import { Backdrop, CREAM, GOLD, SceneLayout, seeded } from "../../kit";
import { StreakCaption } from "./caption";

/** Palette d'une caméra thermique : du froid (violet) au chaud (blanc). */
const THERMAL = "linear-gradient(180deg, #ffffff 0%, #fff1a8 18%, #ffbf3c 36%, #f2662e 56%, #b11f5a 76%, #3b0f5c 100%)";
const HEAT = 1.6;

/**
 * 37 · « 37 °C » : la température du corps. L'écran passe en caméra thermique ; des taches de
 * chaleur dérivent et se rassemblent pendant que le relevé monte de 20 °C à 37,0 °C, et le chiffre
 * finit chauffé à blanc.
 */
export default function Streak37({ count }: { count: number }) {
  const readout = useRef<HTMLSpanElement>(null);
  const start = useRef<number | null>(null);
  useAnimationFrame((time) => {
    if (start.current === null) start.current = time;
    const t = Math.min(1, (time - start.current) / 1000 / HEAT);
    const eased = 1 - Math.pow(1 - t, 3);
    if (readout.current) readout.current.textContent = (20 + eased * 17).toFixed(1).replace(".", ",");
  });
  const blobs = useMemo(() => {
    const random = seeded(37);
    return Array.from({ length: 9 }, () => ({ x: (random() - 0.5) * 360, y: (random() - 0.5) * 520, size: 160 + random() * 160, hot: random() }));
  }, []);
  return (
    <>
      <Backdrop tint="#3b0f5c" veil={0.92} />
      {blobs.map((blob, index) => (
        <motion.div
          key={index}
          aria-hidden
          className="absolute left-1/2 top-[42%] rounded-full"
          style={{ width: blob.size, height: blob.size, marginLeft: -blob.size / 2, marginTop: -blob.size / 2, background: `radial-gradient(circle, ${blob.hot > 0.5 ? "#ffbf3c" : "#f2662e"} 0%, ${blob.hot > 0.5 ? "#f2662e" : "#b11f5a"} 30%, rgba(59,15,92,0.5) 60%, transparent 72%)` }}
          initial={{ x: blob.x, y: blob.y, opacity: 0, scale: 0.6 }}
          animate={{ x: blob.x * 0.25, y: blob.y * 0.18, opacity: [0, 0.75, 0.55], scale: 1 }}
          transition={{ duration: HEAT + 0.8, ease: [0.3, 0.6, 0.3, 1] }}
        />
      ))}
      {/* Mire et relevé de la caméra. */}
      <div className="absolute inset-x-6 top-[calc(env(safe-area-inset-top)+3.2rem)] flex justify-between font-mono text-[0.68rem] uppercase tracking-[0.2em]" style={{ color: CREAM }}>
        <span>● Thermique</span>
        <span>
          <span ref={readout}>20,0</span> °C
        </span>
      </div>
      <div aria-hidden className="absolute right-6 top-[30%] h-40 w-2 rounded-full" style={{ background: THERMAL }} />
      <SceneLayout caption={<StreakCaption count={count} sub="37 °C : la température du corps." accent={GOLD} delay={HEAT + 0.3} />}>
        <div aria-hidden className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2" style={{ background: CREAM, opacity: 0.6 }} />
        <div aria-hidden className="absolute left-1/2 top-1/2 h-10 w-px -translate-y-1/2" style={{ background: CREAM, opacity: 0.6 }} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, duration: 1.2 }}>
            <motion.span
              className="block font-display font-bold"
              style={{ fontSize: 150, lineHeight: 1, backgroundImage: THERMAL, backgroundSize: "100% 400%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
              initial={{ backgroundPosition: "0% 100%" }}
              animate={{ backgroundPosition: "0% 0%" }}
              transition={{ duration: HEAT + 0.3, ease: "easeOut" }}
            >
              {count}
            </motion.span>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
