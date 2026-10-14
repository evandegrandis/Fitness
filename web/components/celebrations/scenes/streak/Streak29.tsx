"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/** Les feuilles arrachées, de dessus vers dessous, avant la dernière. */
const TORN = [25, 26, 27, 28];
const PAGE = "absolute inset-0 flex flex-col items-center overflow-hidden rounded-md";

function Sheet({ day, gold = false }: { day: number; gold?: boolean }) {
  return (
    <>
      <div className="h-9 w-full text-center font-mono text-[0.72rem] uppercase leading-9 tracking-[0.3em]" style={{ background: gold ? GOLD : "#8a2a32", color: gold ? "#2a1d08" : CREAM }}>
        Février
      </div>
      <span className="mt-2 font-display text-[92px] font-bold leading-none" style={{ color: gold ? "#3a2a12" : "#1c1a16" }}>
        {day}
      </span>
      <span className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.2em]" style={{ color: gold ? "#7a5a20" : "#6b665c" }}>
        {gold ? "Bissextile" : "Jour ordinaire"}
      </span>
    </>
  );
}

/**
 * 29 · « 29 février » : le jour en plus, qui ne revient que tous les quatre ans. Les feuilles
 * de l'éphéméride s'arrachent et s'envolent, 25, 26, 27, 28… et dessous, le 29 février, en or.
 */
export default function Streak29({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="Le 29 février : le jour en plus." accent={GOLD} delay={1.9} />}>
        <Glow color={GOLD} size={300} delay={1.4} strength={40} />
        <div className="absolute left-1/2 top-1/2 h-[200px] w-[170px] -translate-x-1/2 -translate-y-1/2">
          {/* Le socle de l'éphéméride et ses anneaux. */}
          <div className="absolute -inset-2 top-4 rounded-lg" style={{ background: "#1c1914", border: "1px solid rgba(236,230,216,0.12)" }} />
          <div className={PAGE} style={{ background: `linear-gradient(180deg, #fbf3dc, ${GOLD_HI})` }}>
            <Sheet day={count} gold />
          </div>
          {TORN.map((day, index) => {
            const at = 0.25 + (TORN.length - 1 - index) * 0.26;
            const side = index % 2 ? 1 : -1;
            return (
              <motion.div
                key={day}
                className={PAGE}
                style={{ background: `linear-gradient(180deg, #f6f0e2, ${CREAM})`, transformOrigin: "50% 0%", boxShadow: "0 2px 0 rgba(0,0,0,0.25)" }}
                initial={{ rotate: 0, x: 0, y: 0, opacity: 1 }}
                animate={{ rotate: [0, side * 8, side * 50], x: [0, side * 6, side * 300], y: [0, 6, 160], opacity: [1, 1, 0] }}
                transition={{ delay: at, duration: 0.7, times: [0, 0.2, 1], ease: [0.5, 0, 0.6, 1] }}
              >
                <Sheet day={day} />
              </motion.div>
            );
          })}
          {[40, 130].map((x) => (
            <span key={x} className="absolute -top-2 h-5 w-2.5 rounded-full" style={{ left: x - 5, background: "#4b463d", border: "1px solid #6b665c" }} />
          ))}
        </div>
        <Sparks count={20} color={GOLD_HI} delay={1.35} distance={[120, 180]} size={2.5} seed={29} />
        <motion.div className="absolute -right-4 -top-8" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.45, type: "spring", stiffness: 260, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 60, lineHeight: 1, display: "block" }}>
            +1
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
