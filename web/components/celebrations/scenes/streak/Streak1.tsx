"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, CREAM, GOLD, GOLD_HI, ICE, MetalText, SceneLayout, seeded, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/**
 * 1 · « Big Bang » : un point seul tremble dans le noir, puis tout part de lui. Les galaxies
 * s'éloignent d'autant plus vite qu'elles sont loin (loi de Hubble) : l'univers s'étend encore
 * quand le 1 apparaît.
 */
export default function Streak1({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const galaxies = useMemo(() => {
    const random = seeded(101);
    return Array.from({ length: 90 }, () => {
      const angle = random() * Math.PI * 2;
      const distance = 30 + Math.pow(random(), 0.7) * 260;
      const tone = random();
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 1 + random() * (distance > 160 ? 2.6 : 1.8),
        color: tone > 0.82 ? GOLD_HI : tone > 0.64 ? ICE : CREAM,
        lag: random() * 0.12,
      };
    });
  }, []);
  return (
    <>
      <Backdrop tint={GOLD} veil={0.94} delay={0} />
      <SceneLayout caption={<StreakCaption count={count} sub="Tout commence par un point." accent={GOLD} delay={1.9} />}>
        {/* Le point d'avant tout : il tremble, se contracte, puis cède. */}
        <motion.span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "#fff", boxShadow: `0 0 18px 6px ${GOLD_HI}` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1, 1.5, 0.9, 1.7, 0.5, 9], opacity: [0, 1, 1, 1, 1, 1, 0], x: [0, 0, 1, -1, 1, 0, 0] }}
          transition={{ duration: 1.05, times: [0, 0.2, 0.42, 0.55, 0.7, 0.85, 1], ease: "easeInOut" }}
        />
        {!reduced && (
          <motion.div
            aria-hidden
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{ width: 600, height: 600, marginLeft: -300, marginTop: -300, background: `radial-gradient(circle, #fff 0%, ${GOLD_HI} 18%, color-mix(in srgb, ${GOLD} 40%, transparent) 40%, transparent 70%)` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2], opacity: [0, 1, 0] }}
            transition={{ delay: 0.9, duration: 0.9, ease: "easeOut", opacity: { delay: 0.9, duration: 0.9, times: [0, 0.15, 1] } }}
          />
        )}
        <Shockwave color={GOLD_HI} delay={0.95} size={520} width={2} duration={1.3} />
        <Shockwave color={ICE} delay={1.1} size={700} width={1} duration={1.6} />
        <Sparks count={36} color={GOLD_HI} delay={0.95} distance={[150, 320]} size={2} duration={1} seed={11} streak />
        {/* Les galaxies : vitesse proportionnelle à la distance, et elles continuent de s'éloigner. */}
        {!reduced &&
          galaxies.map((galaxy, index) => (
            <motion.span
              key={index}
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: galaxy.size, height: galaxy.size, marginLeft: -galaxy.size / 2, marginTop: -galaxy.size / 2, background: galaxy.color }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x: [0, galaxy.x * 0.7, galaxy.x * 1.15], y: [0, galaxy.y * 0.7, galaxy.y * 1.15], opacity: [0, 1, 0.85] }}
              transition={{ delay: 0.95 + galaxy.lag, duration: 3, times: [0, 0.25, 1], ease: "easeOut" }}
            />
          ))}
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.35, type: "spring", stiffness: 200, damping: 16 }}>
            <MetalText metal="or" style={{ fontSize: 132, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
