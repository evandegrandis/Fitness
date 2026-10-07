"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, EMBER, GOLD, GOLD_HI, Glow, ICE, MetalText, SAGE, SceneLayout, seeded, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

const SECOND = [EMBER, ICE, SAGE, GOLD_HI];

/**
 * Au-delà de 25 (30, 35, 40…) · « Légende » : une couronne d'autant de crans que de S d'affilée
 * s'allume cran par cran, des bras de lumière tournent autour. Tout dépend du compte (nombre de
 * bras, sens, seconde couleur, anneaux, densité) : chaque palier a sa propre image, plus dense.
 */
export default function StreakLegend({ count }: { count: number }) {
  const step = Math.floor(count / 5);
  const armsCount = 2 + (step % 4);
  const direction = step % 2 ? 1 : -1;
  const second = SECOND[step % SECOND.length];
  const rings = Math.min(7, 2 + Math.floor(count / 10));
  const dots = useMemo(() => {
    const random = seeded(count * 13);
    const perArm = Math.min(30, 10 + count / 3);
    return Array.from({ length: Math.round(perArm * armsCount) }, (_, index) => {
      const arm = index % armsCount;
      const t = Math.floor(index / armsCount) / perArm;
      const angle = arm * ((Math.PI * 2) / armsCount) + t * Math.PI * (1.2 + (step % 3) * 0.3) * direction;
      const radius = 30 + t * 100;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, size: 1.2 + random() * 2.4, color: random() > 0.6 ? second : GOLD_HI };
    });
  }, [count, armsCount, direction, second, step]);
  const tickDelay = Math.min(1.2, count * 0.025) / count;
  return (
    <>
      <Backdrop tint={second} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub={`Légende vivante. Prochain palier : ${count + 5}.`} accent={GOLD} delay={1.7} />}>
        <Glow color={second} size={360} delay={0.4} strength={35} />
        <motion.div className="absolute inset-0" initial={{ rotate: 0, opacity: 0 }} animate={{ rotate: 120 * direction, opacity: [0, 1, 1, 0.5] }} transition={{ duration: 3.6, ease: "linear" }}>
          {dots.map((dot, index) => (
            <span key={index} aria-hidden className="absolute rounded-full" style={{ left: "50%", top: "50%", width: dot.size, height: dot.size, marginLeft: dot.x, marginTop: dot.y, background: dot.color }} />
          ))}
        </motion.div>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {Array.from({ length: count }, (_, index) => {
            const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
            const lastOne = index === count - 1;
            return (
              <motion.line
                key={index}
                x1={Math.cos(angle) * 126}
                y1={Math.sin(angle) * 126}
                x2={Math.cos(angle) * (lastOne ? 146 : 138)}
                y2={Math.sin(angle) * (lastOne ? 146 : 138)}
                stroke={lastOne ? "#ffffff" : GOLD}
                strokeWidth={lastOne ? 3 : 2}
                strokeLinecap="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + index * tickDelay, duration: 0.15 }}
              />
            );
          })}
        </svg>
        {Array.from({ length: rings }, (_, ring) => (
          <Shockwave key={ring} color={ring % 2 ? second : GOLD_HI} delay={1.35 + ring * 0.12} size={260 + ring * 70} width={1.6} />
        ))}
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.3, type: "spring", stiffness: 260, damping: 14 }}>
            <MetalText metal="or" style={{ fontSize: 104, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
