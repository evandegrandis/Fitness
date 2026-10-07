"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/**
 * Entre deux paliers (6, 8, 9, 11…) · « Maillon » : la chaîne des S de la série, un maillon par
 * séance ; le dernier tombe et se verrouille, le compte passe au suivant. Elle grandit à chaque
 * fois : jamais deux fois la même image.
 */
export default function StreakChain({ count }: { count: number }) {
  const ring = count > 9;
  const links = Array.from({ length: count }, (_, index) => {
    if (!ring) {
      const width = 26;
      return { x: (index - (count - 1) / 2) * width, y: 88, rotate: index % 2 ? 90 : 0 };
    }
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * 118, y: Math.sin(angle) * 118, rotate: (angle * 180) / Math.PI + (index % 2 ? 90 : 0) };
  });
  const last = links[count - 1];
  return (
    <>
      <Backdrop tint={GOLD} />
      <SceneLayout caption={<StreakCaption count={count} accent={GOLD} delay={0.95} />}>
        <Glow color={GOLD} size={240} delay={0.6} strength={40} y={ring ? 0 : -20} />
        {links.map((link, index) => {
          const isLast = index === count - 1;
          return (
            <motion.span
              key={index}
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: 32, height: 18, marginLeft: -16, marginTop: -9, border: `2.5px solid ${isLast ? GOLD_HI : index % 2 ? GOLD : CREAM}`, opacity: isLast ? 1 : 0.85 }}
              initial={isLast ? { x: last.x, y: last.y - 160, rotate: link.rotate + 180, opacity: 0 } : { x: link.x, y: link.y, rotate: link.rotate, opacity: 0, scale: 0.6 }}
              animate={{ x: link.x, y: link.y, rotate: link.rotate, opacity: 1, scale: 1 }}
              transition={isLast ? { delay: 0.25, duration: 0.45, ease: "easeIn" } : { delay: 0.02 * index, duration: 0.25 }}
            />
          );
        })}
        <Sparks count={12} color={GOLD_HI} delay={0.68} distance={[30, 70]} size={2.5} seed={count} x={last.x} y={last.y} duration={0.6} />
        <div className="absolute inset-0 grid place-items-center overflow-hidden" style={{ top: ring ? 0 : -50 }}>
          <div className="relative h-[110px] overflow-hidden">
            <motion.div initial={{ y: 0 }} animate={{ y: -110 }} transition={{ delay: 0.7, duration: 0.45, ease: [0.7, 0, 0.3, 1] }}>
              <MetalText metal="creme" style={{ fontSize: 96, lineHeight: "110px", display: "block", textAlign: "center" }}>
                {count - 1}
              </MetalText>
              <MetalText metal="or" style={{ fontSize: 96, lineHeight: "110px", display: "block", textAlign: "center" }}>
                {count}
              </MetalText>
            </motion.div>
          </div>
        </div>
      </SceneLayout>
    </>
  );
}
