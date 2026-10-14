"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { GOLD, GOLD_HI, Backdrop, Embers, MetalText, Rays, seeded, Shockwave, Sparks } from "../../kit";
import { StreakCaption, SMedal } from "./caption";

const GATHER = 1.5;
const FLOOD = 1.7;

/**
 * 50 · « Noces d'or » : un demi-siècle de S. Les cinquante médaillons de la série surgissent
 * partout dans l'écran, tournent en spirale et se rassemblent en couronne ; l'or liquide monte
 * alors du bas jusqu'à tout recouvrir, et le 50 sort en relief.
 */
export default function Streak50({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const medals = useMemo(() => {
    const random = seeded(50);
    return Array.from({ length: 50 }, (_, index) => {
      const a = (index / 50) * Math.PI * 2;
      const scatter = random() * Math.PI * 2;
      const far = 160 + random() * 260;
      return { x: Math.cos(a) * 128, y: Math.sin(a) * 128, fromX: Math.cos(scatter) * far, fromY: Math.sin(scatter) * far * 1.6, lag: random() * 0.5 };
    });
  }, []);
  return (
    <>
      <Backdrop tint={GOLD} veil={0.95} />
      {/* L'or liquide : monte du bas avec une surface ondulée. */}
      <motion.div aria-hidden className="absolute inset-x-0 bottom-0 h-[115%]" style={{ background: `linear-gradient(180deg, ${GOLD_HI} 0%, ${GOLD} 30%, #8f6a2c 70%, #4a3410 100%)` }} initial={{ y: "100%" }} animate={{ y: "8%" }} transition={{ delay: FLOOD, duration: 1.2, ease: [0.3, 0, 0.2, 1] }}>
        <motion.div className="absolute -top-5 left-[-10%] h-10 w-[120%]" style={{ background: `radial-gradient(30px 14px at 25px 14px, ${GOLD_HI} 98%, transparent) repeat-x`, backgroundSize: "50px 20px" }} animate={reduced ? undefined : { x: [0, -50] }} transition={{ duration: 0.8, repeat: 4, ease: "linear" }} />
        <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(180deg, transparent 0 22px, rgba(255,255,255,0.08) 22px 24px)" }} />
      </motion.div>
      <div className="absolute left-1/2 top-[38%]">
        {/* La couronne des cinquante médaillons. */}
        {medals.map((medal, index) => (
          <motion.div key={index} className="absolute -ml-[11px] -mt-[11px]" initial={{ x: medal.fromX, y: medal.fromY, scale: 0, rotate: -180 }} animate={{ x: [medal.fromX, medal.x * 1.3, medal.x], y: [medal.fromY, medal.y * 1.3, medal.y], scale: [0, 1.2, 1], rotate: 0 }} transition={{ delay: medal.lag, duration: GATHER - medal.lag * 0.6, times: [0, 0.7, 1], ease: "easeInOut" }}>
            <SMedal size={22} />
          </motion.div>
        ))}
        <Shockwave color={GOLD_HI} delay={GATHER} size={300} width={3} />
        <Shockwave color={GOLD_HI} delay={FLOOD + 1.1} size={520} width={2} duration={1.3} />
        <Sparks count={50} color={GOLD_HI} delay={GATHER} distance={[140, 260]} size={3} seed={5050} streak />
        <div className="absolute">
          <Rays count={20} color={GOLD_HI} delay={FLOOD + 0.9} inner={90} outer={300} spin={24} duration={2.4} peak={0.55} />
        </div>
        <motion.div className="absolute -translate-x-1/2 -translate-y-1/2" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: [0.4, 1.15, 1] }} transition={{ delay: GATHER - 0.1, duration: 0.7 }}>
          <MetalText metal="or" style={{ fontSize: 150, lineHeight: 1, display: "block", filter: "drop-shadow(0 6px 0 #5a3d12) drop-shadow(0 12px 20px rgba(0,0,0,0.6))" }}>
            {count}
          </MetalText>
        </motion.div>
      </div>
      <Embers count={30} color="#fff6d0" delay={FLOOD + 0.8} from={300} rise={[200, 500]} width={360} seed={500} />
      <div className="absolute inset-x-0 top-[62%] flex justify-center px-6">
        <div className="rounded-2xl px-4 pb-3" style={{ background: "rgba(7,7,8,0.55)" }}>
          <StreakCaption count={count} sub="Un demi-siècle de S : les noces d'or." accent={GOLD_HI} delay={FLOOD + 1} />
        </div>
      </div>
    </>
  );
}
