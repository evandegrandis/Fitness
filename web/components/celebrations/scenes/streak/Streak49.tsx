"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, seeded, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const PAN = 2.0;

/**
 * 49 · « 1849 » : la ruée vers l'or de Californie (les « forty-niners »). La batée tourne, l'eau
 * et le sable débordent par le bord et s'en vont ; il ne reste au fond que les pépites, qui
 * scintillent une à une.
 */
export default function Streak49({ count }: { count: number }) {
  const { sand, nuggets } = useMemo(() => {
    const random = seeded(1849);
    const sand = Array.from({ length: 70 }, () => {
      const a = random() * Math.PI * 2;
      const r = 20 + random() * 80;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, out: a, size: 2 + random() * 3, lag: random() * 0.8, tone: 30 + random() * 25 };
    });
    const nuggets = Array.from({ length: 7 }, (_, index) => ({ x: (random() - 0.5) * 60, y: (random() - 0.5) * 26, size: 5 + random() * 6, twinkle: PAN + 0.1 + index * 0.12 }));
    return { sand, nuggets };
  }, []);
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="1849 : la ruée vers l'or." accent={GOLD} delay={PAN + 0.6} />}>
        <Glow color={GOLD} size={260} delay={PAN} strength={40} y={30} />
        <motion.div className="absolute inset-0" initial={{ rotate: 0, x: 0 }} animate={{ rotate: [0, 8, -8, 6, -5, 0], x: [0, 10, -10, 8, -6, 0] }} transition={{ duration: PAN, ease: "easeInOut" }}>
          {/* La batée, vue en perspective. */}
          <div className="absolute left-1/2 top-[56%] h-[130px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-[50%]" style={{ background: "radial-gradient(60% 60% at 50% 45%, #2b2620, #4a433a 60%, #6b6255 72%, #2a251f 80%)", boxShadow: "0 18px 30px rgba(0,0,0,0.6), inset 0 -6px 0 #1a1612" }} />
          <motion.div aria-hidden className="absolute left-1/2 top-[56%] h-[96px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-[50%]" style={{ background: "radial-gradient(closest-side, rgba(127,176,216,0.35), rgba(127,176,216,0.08))" }} initial={{ opacity: 1 }} animate={{ opacity: 0.15 }} transition={{ duration: PAN }} />
          {/* Le sable : tourne, puis déborde et s'en va. */}
          {sand.map((grain, index) => (
            <motion.span
              key={index}
              aria-hidden
              className="absolute left-1/2 top-[56%] rounded-full"
              style={{ width: grain.size, height: grain.size, marginLeft: grain.x, marginTop: grain.y, background: `hsl(32 30% ${grain.tone}%)` }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: [0, Math.cos(grain.out + 1) * 20, Math.cos(grain.out) * 170], y: [0, Math.sin(grain.out + 1) * 10, Math.sin(grain.out) * 90 + 60], opacity: [1, 1, 0] }}
              transition={{ delay: 0.3 + grain.lag, duration: 1.1, ease: "easeIn" }}
            />
          ))}
          {/* Les pépites restent au fond. */}
          {nuggets.map((nugget, index) => (
            <span key={index} className="absolute left-1/2 top-[56%]" style={{ marginLeft: nugget.x, marginTop: nugget.y }}>
              <span className="absolute rounded-[40%]" style={{ width: nugget.size, height: nugget.size * 0.8, left: -nugget.size / 2, top: -nugget.size * 0.4, background: `radial-gradient(circle at 35% 30%, #fff6d0, ${GOLD_HI} 40%, #9c6a22)` }} />
              <motion.span aria-hidden className="absolute -left-[9px] -top-[9px] h-[18px] w-[18px]" style={{ background: `conic-gradient(from 0deg, transparent 0 40deg, #fff 45deg, transparent 50deg 130deg, #fff 135deg, transparent 140deg 220deg, #fff 225deg, transparent 230deg 310deg, #fff 315deg, transparent 320deg)`, borderRadius: "50%" }} initial={{ scale: 0, opacity: 0, rotate: 0 }} animate={{ scale: [0, 1.6, 0], opacity: [0, 1, 0], rotate: 45 }} transition={{ delay: nugget.twinkle, duration: 0.5 }} />
            </span>
          ))}
        </motion.div>
        <div className="absolute left-1/2 top-[56%]">
          <Sparks count={18} color={GOLD_HI} delay={PAN + 0.1} distance={[60, 130]} size={2} seed={49} spread={160} direction={-90} />
        </div>
        <motion.div className="absolute inset-x-0 top-0 grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: PAN, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 84, lineHeight: 1, display: "block" }}>
            <span style={{ fontSize: 40, verticalAlign: "top", opacity: 0.6 }}>18</span>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
