"use client";

import { motion, useAnimationFrame } from "framer-motion";
import { useRef } from "react";
import { Backdrop, CREAM, GOLD, GOLD_HI, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const STEPS = 39;
const CLIMB = 1.9;
/** Marche k en perspective : de plus en plus petite et haute vers le point de fuite. */
function step(k: number) {
  const depth = Math.pow(0.935, k);
  return { y: 130 - (1 - depth) * 250, w: 260 * depth, h: Math.max(1.5, 14 * depth) };
}

/**
 * 39 · « Les 39 marches » : le film d'Hitchcock. Un escalier monte vers le point de fuite ; une
 * lumière gravit les marches une à une, le compteur suit, l'escalier se creuse comme dans un
 * travelling compensé, et en haut, la porte s'ouvre sur l'or.
 */
export default function Streak39({ count }: { count: number }) {
  const counter = useRef<HTMLSpanElement>(null);
  const start = useRef<number | null>(null);
  useAnimationFrame((time) => {
    if (start.current === null) start.current = time;
    const t = Math.min(1, Math.max(0, ((time - start.current) / 1000 - 0.2) / CLIMB));
    if (counter.current) counter.current.textContent = String(Math.max(1, Math.round(t * STEPS)));
  });
  const top = step(STEPS);
  return (
    <>
      <Backdrop tint={GOLD} veil={0.94} />
      <SceneLayout caption={<StreakCaption count={count} sub="Les 39 marches." accent={GOLD} delay={CLIMB + 0.4} />}>
        {/* Travelling compensé : l'escalier s'étire pendant qu'on s'en éloigne. */}
        <motion.div className="absolute inset-0" style={{ originY: "85%" }} initial={{ scaleY: 0.82, scaleX: 1.1 }} animate={{ scaleY: [0.82, 1.12, 1], scaleX: [1.1, 0.92, 1] }} transition={{ duration: CLIMB + 0.4, ease: "easeInOut" }}>
          {/* La porte en haut. */}
          <motion.div className="absolute left-1/2 overflow-hidden" style={{ top: 150 + top.y - 46, width: 30, height: 46, marginLeft: -15, border: `1px solid ${GOLD}` }} initial={{ boxShadow: "0 0 0 rgba(0,0,0,0)" }} animate={{ boxShadow: `0 0 40px 10px ${GOLD_HI}` }} transition={{ delay: CLIMB, duration: 0.4 }}>
            <div className="absolute inset-0" style={{ background: GOLD_HI }} />
            <motion.div className="absolute inset-0 origin-left" style={{ background: "#1c1914" }} initial={{ scaleX: 1 }} animate={{ scaleX: 0.12 }} transition={{ delay: CLIMB, duration: 0.5, ease: "easeOut" }} />
          </motion.div>
          {Array.from({ length: STEPS }, (_, k) => {
            const s = step(k);
            const lit = 0.2 + (k / STEPS) * CLIMB;
            return (
              <motion.div
                key={k}
                className="absolute left-1/2 rounded-[1px]"
                style={{ top: 150 + s.y, width: s.w, height: s.h, marginLeft: -s.w / 2 }}
                initial={{ backgroundColor: "#2a2620", opacity: 0.4 + 0.6 * Math.pow(0.95, k) }}
                animate={{ backgroundColor: ["#2a2620", GOLD_HI, k % 5 === 4 ? GOLD : "#5a4f3c"] }}
                transition={{ delay: lit, duration: 0.5, times: [0, 0.15, 1] }}
              />
            );
          })}
          {/* Les rampes qui fuient. */}
          <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
            <path d={`M20 ${150 + 120} L${150 - top.w / 2} ${150 + top.y - 20} M280 ${150 + 120} L${150 + top.w / 2} ${150 + top.y - 20}`} stroke={CREAM} strokeOpacity="0.3" strokeWidth="1.5" />
          </svg>
        </motion.div>
        <div className="absolute -top-8 left-0 flex items-baseline gap-2">
          <span ref={counter} className="font-mono text-2xl tabular-nums" style={{ color: GOLD_HI }}>
            1
          </span>
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em]" style={{ color: GOLD }}>
            marches
          </span>
        </div>
        <motion.div className="absolute -right-2 -top-12" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: CLIMB + 0.1, type: "spring", stiffness: 260, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 72, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
