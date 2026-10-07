"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { CREAM, GOLD, GOLD_HI, Shockwave } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const TICKS = 90;

/** volume : un cadran de 90 crans se remplit d'un trait, le compteur grimpe de 0 à 90, du crème à l'or. */
export default function Volume({ title, description }: SecretProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (value) => Math.round(value));
  useEffect(() => {
    const controls = animate(count, TICKS, { delay: 0.2, duration: 1.3, ease: [0.3, 0, 0.2, 1] });
    return () => controls.stop();
  }, [count]);
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description} captionDelay={1.6}>
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
          const long = index % 10 === 9;
          // Même courbe que le compteur : le cran n s'allume quand le compteur passe n.
          const t = 0.2 + 1.3 * (1 - Math.pow(1 - (index + 1) / TICKS, 1.6));
          return (
            <motion.line
              key={index}
              x1={Math.cos(angle) * (long ? 98 : 104)}
              y1={Math.sin(angle) * (long ? 98 : 104)}
              x2={Math.cos(angle) * 116}
              y2={Math.sin(angle) * 116}
              stroke={index > 80 ? GOLD_HI : index > 50 ? GOLD : CREAM}
              strokeWidth={long ? 2.4 : 1.4}
              strokeLinecap="round"
              initial={{ opacity: 0.1 }}
              animate={{ opacity: 1 }}
              transition={{ delay: t, duration: 0.08 }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <motion.span className="block font-display text-[5.2rem] font-bold leading-none tabular-nums" style={{ color: GOLD_HI }}>
            {rounded}
          </motion.span>
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-(--color-fg-muted)">séries cette semaine</span>
        </div>
      </div>
      <Shockwave color={GOLD_HI} delay={1.5} size={290} width={2} />
    </SecretStage>
  );
}
