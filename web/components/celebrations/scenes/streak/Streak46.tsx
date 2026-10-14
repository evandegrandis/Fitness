"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, CREAM, GOLD, GOLD_HI, ICE, MetalText, SAGE, SceneLayout, seeded } from "../../kit";
import { StreakCaption } from "./caption";

const ROW_SIZES = [6, 6, 6, 5];
const SNAP = 1.0;

/** Un chromosome : deux chromatides en X, plus court pour les dernières paires. */
function Chromosome({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="-6 -12 12 24" width={size * 0.5} height={size} aria-hidden className="overflow-visible">
      <path d="M-4 -11 C-1 -4 -1 4 -4 11 M4 -11 C1 -4 1 4 4 11" stroke={color} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle r="1.6" fill={color} />
    </svg>
  );
}

/**
 * 46 · « Caryotype » : quarante-six chromosomes, vingt-trois paires. Ils flottent en désordre,
 * puis chacun trouve son double et les paires se rangent en caryotype, des plus grands aux plus
 * petits ; la vingt-troisième paire s'allume en or.
 */
export default function Streak46({ count }: { count: number }) {
  const slots = useMemo(() => {
    const random = seeded(46);
    const out: Array<{ x: number; y: number; size: number; pair: number; fromX: number; fromY: number; spin: number }> = [];
    let pair = 0;
    ROW_SIZES.forEach((n, row) => {
      for (let col = 0; col < n; col += 1) {
        const size = 34 - pair * 0.9;
        for (const twin of [-1, 1]) {
          out.push({ x: (col - (n - 1) / 2) * 46 + twin * 7, y: (row - 1.5) * 52 + 10, size, pair, fromX: (random() - 0.5) * 340, fromY: (random() - 0.5) * 520, spin: (random() - 0.5) * 540 });
        }
        pair += 1;
      }
    });
    return out;
  }, []);
  return (
    <>
      <Backdrop tint={SAGE} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Quarante-six chromosomes, vingt-trois paires." accent={ICE} delay={SNAP + 1.1} />}>
        {slots.map((slot, index) => (
          <motion.div
            key={index}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ marginLeft: slot.x, marginTop: slot.y }}
            initial={{ x: slot.fromX, y: slot.fromY, rotate: slot.spin, opacity: 0 }}
            animate={{ x: [slot.fromX, slot.fromX * 0.8, 0], y: [slot.fromY, slot.fromY * 0.8, 0], rotate: [slot.spin, slot.spin * 0.7, 0], opacity: [0, 1, 1] }}
            transition={{ duration: SNAP + slot.pair * 0.025, times: [0, 0.35, 1], ease: [0.5, 0, 0.2, 1] }}
          >
            <Chromosome size={slot.size} color={slot.pair === 22 ? GOLD_HI : slot.pair % 2 ? CREAM : ICE} />
          </motion.div>
        ))}
        <motion.div className="absolute" style={{ left: 150 + slots[45].x - 12, top: 150 + slots[45].y - 26, width: 38, height: 52, border: `1px solid ${GOLD}`, borderRadius: 8 }} initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: SNAP + 0.6, duration: 0.4 }} />
        <motion.div className="absolute inset-x-0 -top-12 grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: SNAP + 0.7, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 72, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
