"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SAGE, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const CARD_W = 104;
const CARD_H = 150;

function Card({ rank, suit, red, x, rotate, delay }: { rank: string; suit: string; red: boolean; x: number; rotate: number; delay: number }) {
  const ink = red ? "#b8332b" : "#14120f";
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: CARD_W, height: CARD_H, marginLeft: -CARD_W / 2, marginTop: -CARD_H / 2, transformStyle: "preserve-3d" }}
      initial={{ x: 220, y: -420, rotate: 60, rotateY: 180 }}
      animate={{ x, y: 0, rotate, rotateY: [180, 180, 0] }}
      transition={{ delay, duration: 0.7, ease: [0.2, 0.8, 0.3, 1], rotateY: { delay, duration: 0.9, times: [0, 0.6, 1] } }}
    >
      <div className="absolute inset-0 rounded-lg" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", background: `repeating-linear-gradient(45deg, #3a0d14 0 6px, #5a1520 6px 12px)`, border: `3px solid ${CREAM}` }} />
      <div className="absolute inset-0 rounded-lg" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", background: `linear-gradient(160deg, #fffdf6, ${CREAM})`, boxShadow: "0 18px 30px rgba(0,0,0,0.55)" }}>
        <span className="absolute left-2 top-1.5 text-center font-display text-lg font-bold leading-none" style={{ color: ink }}>
          {rank}
          <br />
          {suit}
        </span>
        <span className="absolute bottom-1.5 right-2 rotate-180 text-center font-display text-lg font-bold leading-none" style={{ color: ink }}>
          {rank}
          <br />
          {suit}
        </span>
        <span className="absolute inset-0 grid place-items-center font-display text-6xl" style={{ color: ink }}>
          {suit}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * 21 · « Blackjack » : le sabot distribue deux cartes face cachée qui se retournent sur le tapis :
 * l'as, puis le roi. Vingt et un. Les jetons d'or sautent.
 */
export default function Streak21({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={SAGE} veil={0.88} at="50% 50%" />
      <div aria-hidden className="absolute left-1/2 top-[40%] h-[420px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-[50%]" style={{ background: "radial-gradient(closest-side, #173222, #0d1d14 75%, transparent)", border: `1px solid color-mix(in srgb, ${GOLD} 25%, transparent)` }} />
      <SceneLayout caption={<StreakCaption count={count} sub="As et roi : vingt et un." accent={GOLD} delay={1.9} />}>
        <Glow color={GOLD} size={300} delay={1.4} strength={30} />
        <Card rank="A" suit={"♠︎"} red={false} x={-48} rotate={-8} delay={0.1} />
        <Card rank="R" suit={"♥︎"} red x={48} rotate={7} delay={0.55} />
        <Sparks count={16} color={GOLD} delay={1.45} distance={[100, 170]} size={9} duration={1.1} fall={60} seed={21} direction={-90} spread={160} />
        <motion.div className="absolute inset-x-0 -top-10 grid place-items-center" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.4, type: "spring", stiffness: 300, damping: 14 }}>
          <MetalText metal="or" style={{ fontSize: 82, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
        <motion.p className="absolute inset-x-0 bottom-0 text-center font-mono text-[0.7rem] uppercase tracking-[0.32em]" style={{ color: GOLD_HI }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.4 }}>
          Blackjack
        </motion.p>
      </SceneLayout>
    </>
  );
}
