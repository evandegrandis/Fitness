"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SAGE, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const ROLL = 1.5;

/**
 * 18 · « Dix-huit trous » : le green en perspective, le drapeau du 18 qui flotte. La balle roule,
 * prend la pente, ralentit, fait le tour de la lèvre du trou et tombe dedans. Le drapeau passe à l'or.
 */
export default function Streak18({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={SAGE} veil={0.92} at="50% 65%" />
      {/* Le green : une ellipse en perspective, rayée par la tondeuse. */}
      <div aria-hidden className="absolute left-1/2 top-[44%] h-[46%] w-[150%] -translate-x-1/2 rounded-[50%]" style={{ background: "repeating-linear-gradient(100deg, #1d3a20 0 34px, #23452a 34px 68px)", boxShadow: "inset 0 20px 60px rgba(0,0,0,0.6)" }} />
      <div className="absolute left-1/2 top-[56%]">
        {/* Le trou. */}
        <div className="absolute -left-[17px] -top-[6px] h-[12px] w-[34px] rounded-[50%]" style={{ background: "#050605", boxShadow: "inset 0 3px 4px rgba(255,255,255,0.12)" }} />
        {/* Le mât et son drapeau. */}
        <div className="absolute -top-[150px] left-[-1px] h-[150px] w-[3px]" style={{ background: CREAM }} />
        <motion.div className="absolute -top-[150px] left-[2px] origin-left" initial={{ skewY: 0 }} animate={{ skewY: [0, -6, 4, -5, 3, 0] }} transition={{ duration: 3.4, ease: "easeInOut" }}>
          <motion.div className="grid h-[44px] w-[68px] place-items-center font-display text-xl font-bold" style={{ clipPath: "polygon(0 0, 100% 12%, 92% 50%, 100% 88%, 0 100%)" }} initial={{ background: "#c94a3c", color: CREAM }} animate={{ background: ["#c94a3c", "#c94a3c", GOLD], color: [CREAM, CREAM, "#2a1d08"] }} transition={{ duration: ROLL + 0.6, times: [0, 0.8, 1] }}>
            {count}
          </motion.div>
        </motion.div>
        {/* La balle : arrive du bas, prend la pente, tourne sur la lèvre et tombe. */}
        <motion.span
          className="absolute h-[14px] w-[14px] rounded-full"
          style={{ marginLeft: -7, marginTop: -11, background: "radial-gradient(circle at 35% 30%, #fff, #e6e1d6 55%, #9c968a)", boxShadow: "0 3px 3px rgba(0,0,0,0.5)" }}
          initial={{ x: -110, y: 300, scale: 2.2 }}
          animate={{ x: [-110, -60, 4, 12, 4, -4, 0], y: [300, 160, 30, 4, -4, 2, 6], scale: [2.2, 1.6, 1.1, 1, 1, 0.9, 0], opacity: [1, 1, 1, 1, 1, 1, 0] }}
          transition={{ duration: ROLL, times: [0, 0.3, 0.68, 0.8, 0.88, 0.95, 1], ease: "easeOut" }}
        />
        <Shockwave color={GOLD_HI} delay={ROLL} size={180} width={1.5} y={0} />
        <Glow color={GOLD} size={200} delay={ROLL} strength={40} />
      </div>
      <motion.div className="absolute inset-x-0 top-[10%] grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ROLL + 0.1, duration: 0.5 }}>
        <MetalText metal="or" style={{ fontSize: 80, lineHeight: 1, display: "block" }}>
          {count}
        </MetalText>
      </motion.div>
      <div className="absolute inset-x-0 bottom-[8%] flex justify-center px-6">
        <StreakCaption count={count} sub="Dix-huit trous. Le dernier est dedans." accent={GOLD} delay={ROLL + 0.3} />
      </div>
    </>
  );
}
