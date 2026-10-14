"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { CREAM, GOLD, GOLD_HI, Glow, MetalText, seeded } from "../../kit";
import { StreakCaption } from "./caption";

const CUT = 0.85;
/** Les deux moitiés de l'écran de part et d'autre de la diagonale du coup de sabre. */
const UPPER = "polygon(0 0, 100% 0, 100% 34%, 0 66%)";
const LOWER = "polygon(0 66%, 100% 34%, 100% 100%, 0 100%)";

function Face() {
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: "radial-gradient(80% 60% at 50% 45%, #1d1814, #070708 80%)" }}>
      <p className="font-display text-[3.4rem] font-bold leading-[1.05]" style={{ color: CREAM, writingMode: "vertical-rl", letterSpacing: "0.1em" }}>
        四十七士
      </p>
    </div>
  );
}

/**
 * 47 · « Les 47 rōnin » : la légende japonaise des quarante-sept samouraïs restés fidèles à
 * leur maître. Le nom en kanji, un éclair : le sabre tranche l'écran en diagonale, les deux
 * moitiés glissent et s'écartent, le 47 apparaît sous une pluie de pétales de cerisier.
 */
export default function Streak47({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const petals = useMemo(() => {
    const random = seeded(47);
    return Array.from({ length: 26 }, () => ({ x: random() * 100, drift: (random() - 0.5) * 120, fall: 400 + random() * 500, spin: (random() - 0.5) * 720, lag: random() * 1.2, size: 6 + random() * 6 }));
  }, []);
  return (
    <>
      <div className="absolute inset-0" style={{ background: "#070708" }} />
      <Glow color={GOLD} size={420} delay={CUT + 0.1} strength={40} y={-30} />
      <motion.div className="absolute inset-x-0 top-[26%] grid place-items-center" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: CUT + 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <MetalText metal="or" style={{ fontSize: 150, lineHeight: 1, display: "block" }}>
          {count}
        </MetalText>
      </motion.div>
      <div className="absolute inset-x-0 top-[56%] flex justify-center px-6">
        <StreakCaption count={count} sub="Les 47 rōnin : fidèles jusqu'au bout." accent={GOLD} delay={CUT + 0.6} />
      </div>
      {!reduced &&
        petals.map((petal, index) => (
          <motion.span
            key={index}
            aria-hidden
            className="absolute top-[-20px] rounded-[60%_0_60%_0]"
            style={{ left: `${petal.x}%`, width: petal.size, height: petal.size * 0.8, background: "linear-gradient(135deg, #f6d6dc, #e7a9b6)" }}
            initial={{ y: 0, x: 0, rotate: 0, opacity: 0 }}
            animate={{ y: petal.fall, x: petal.drift, rotate: petal.spin, opacity: [0, 0.9, 0.9, 0] }}
            transition={{ delay: CUT + 0.3 + petal.lag, duration: 2.6, ease: "linear" }}
          />
        ))}
      {/* Les deux moitiés : tranchées, elles glissent le long de la coupe puis s'ouvrent. */}
      <motion.div className="absolute inset-0" style={{ clipPath: UPPER }} initial={{ x: 0, y: 0 }} animate={{ x: [0, 0, 26, 60], y: [0, 0, -12, -560] }} transition={{ delay: CUT, duration: 1.1, times: [0, 0.05, 0.35, 1], ease: "easeIn" }}>
        <Face />
      </motion.div>
      <motion.div className="absolute inset-0" style={{ clipPath: LOWER }} initial={{ x: 0, y: 0 }} animate={{ x: [0, 0, -26, -60], y: [0, 0, 12, 560] }} transition={{ delay: CUT, duration: 1.1, times: [0, 0.05, 0.35, 1], ease: "easeIn" }}>
        <Face />
      </motion.div>
      {/* L'éclair du sabre. */}
      <motion.div aria-hidden className="absolute left-[-10%] top-1/2 h-[3px] w-[120%] origin-center" style={{ rotate: -Math.atan2(0.32 * 844, 390) * (180 / Math.PI), background: `linear-gradient(90deg, transparent, #fff 30%, ${GOLD_HI} 70%, transparent)`, boxShadow: `0 0 18px 4px ${GOLD_HI}` }} initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ delay: CUT - 0.12, duration: 0.45, times: [0, 0.3, 1] }} />
    </>
  );
}
