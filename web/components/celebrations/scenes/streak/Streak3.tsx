"use client";

import { motion } from "framer-motion";
import { Backdrop, Embers, GOLD, GOLD_HI, Glow, SceneLayout } from "../../kit";
import { SMedal, StreakCaption } from "./caption";

const PILLARS = [
  { x: -78, height: 120, delay: 0.1 },
  { x: 78, height: 120, delay: 0.3 },
  { x: 0, height: 178, delay: 0.55 },
];

/** 3 · « Trois piliers » : trois colonnes de lumière montent l'une après l'autre, un S sur chacune. */
export default function Streak3({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} />
      <SceneLayout caption={<StreakCaption count={count} sub="Trois piliers. La série tient debout." accent={GOLD} delay={1.05} />}>
        <Glow color={GOLD} size={300} delay={0.75} strength={40} y={30} />
        <Embers count={18} color={GOLD_HI} delay={0.6} width={260} from={120} rise={[120, 240]} band={30} seed={3} />
        {PILLARS.map((pillar, index) => (
          <div key={index} className="absolute" style={{ left: "50%", bottom: 34, marginLeft: pillar.x - 14, width: 28 }}>
            <motion.div
              className="w-full rounded-t-sm"
              style={{ height: pillar.height, transformOrigin: "bottom", background: "linear-gradient(0deg, rgba(216,178,106,0.05), rgba(244,220,160,0.75))" }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: pillar.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.div
              className="absolute left-1/2"
              style={{ bottom: pillar.height + 6, marginLeft: -26 }}
              initial={{ opacity: 0, y: 30, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: pillar.delay + 0.35, type: "spring", stiffness: 320, damping: 16 }}
            >
              <SMedal size={52} />
            </motion.div>
          </div>
        ))}
        <motion.div
          className="absolute inset-x-6 h-px"
          style={{ bottom: 34, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5 }}
        />
      </SceneLayout>
    </>
  );
}
