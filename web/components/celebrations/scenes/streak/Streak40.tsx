"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { EMBER, GOLD, GOLD_HI, Embers, MetalText, seeded, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const WORDS = ["Sésame,", "ouvre-toi."];
const OPEN = 1.2;
const DOOR = "polygon(0 26%, 50% 0, 100% 26%, 100% 100%, 0 100%)";

/**
 * 40 · « Sésame » : Ali Baba et les quarante voleurs. Une paroi de pierre, la formule s'y inscrit
 * mot à mot, la roche gronde et la porte s'enfonce dans le sol : la caverne déborde d'or.
 */
export default function Streak40({ count }: { count: number }) {
  const stones = useMemo(() => {
    const random = seeded(40);
    return Array.from({ length: 26 }, () => ({ x: random() * 100, y: random() * 100, w: 40 + random() * 90, h: 20 + random() * 40, tone: 18 + random() * 14 }));
  }, []);
  return (
    <>
      {/* La paroi de pierre. */}
      <div className="absolute inset-0" style={{ background: "#14110d" }} />
      {stones.map((stone, index) => (
        <span key={index} aria-hidden className="absolute rounded-[40%]" style={{ left: `${stone.x}%`, top: `${stone.y}%`, width: stone.w, height: stone.h, background: `hsl(30 12% ${stone.tone}%)`, opacity: 0.55 }} />
      ))}
      {/* La caverne, derrière la porte : or et lumière, qui déborde une fois ouverte. */}
      <div className="absolute" style={{ left: "22%", right: "22%", top: "22%", bottom: "22%", clipPath: DOOR, background: `radial-gradient(80% 60% at 50% 70%, #fff6d8 0%, ${GOLD_HI} 25%, ${GOLD} 55%, #6a4815 100%)` }} />
      <motion.div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(45% 35% at 50% 55%, color-mix(in srgb, ${GOLD_HI} 55%, transparent), transparent 75%)` }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.75] }} transition={{ delay: OPEN + 0.3, duration: 1.2 }} />
      <Embers count={30} color={GOLD_HI} delay={OPEN + 0.2} from={100} rise={[200, 420]} width={220} seed={41} />
      <div className="absolute inset-x-0 top-[55%]">
        <Sparks count={40} color={GOLD_HI} delay={OPEN + 0.35} distance={[60, 200]} size={5} duration={1.4} fall={40} seed={40} />
      </div>
      {/* La porte : grondement, puis elle s'enfonce. */}
      <motion.div className="absolute" style={{ left: "22%", right: "22%", top: "22%", bottom: "22%", clipPath: DOOR, background: "linear-gradient(180deg, #3a332a, #1e1a15)", borderBottom: `2px solid ${GOLD}` }} initial={{ y: 0, x: 0 }} animate={{ x: [0, 0, -3, 3, -2, 0, 0], y: [0, 0, 0, 0, 0, 0, 520] }} transition={{ duration: OPEN + 0.9, times: [0, OPEN / (OPEN + 0.9) - 0.2, OPEN / (OPEN + 0.9) - 0.15, OPEN / (OPEN + 0.9) - 0.1, OPEN / (OPEN + 0.9) - 0.05, OPEN / (OPEN + 0.9), 1], ease: "easeIn" }}>
        <div className="absolute inset-x-[18%] top-[40%] flex flex-col items-center gap-1">
          {WORDS.map((word, index) => (
            <motion.span key={word} className="font-display text-2xl italic" style={{ color: GOLD_HI, textShadow: `0 0 12px ${EMBER}` }} initial={{ opacity: 0, filter: "brightness(0.4)" }} animate={{ opacity: 1, filter: "brightness(1)" }} transition={{ delay: 0.25 + index * 0.35, duration: 0.4 }}>
              {word}
            </motion.span>
          ))}
        </div>
      </motion.div>
      <motion.div className="absolute inset-x-0 top-[8%] grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: OPEN + 0.5, duration: 0.5 }}>
        <MetalText metal="or" style={{ fontSize: 84, lineHeight: 1, display: "block", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.8))" }}>
          {count}
        </MetalText>
      </motion.div>
      <div className="absolute inset-x-0 bottom-[5%] flex justify-center px-6">
        <motion.div className="rounded-2xl px-4 pb-3" style={{ background: "rgba(7,7,8,0.72)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: OPEN + 0.6, duration: 0.3 }}>
          <StreakCaption count={count} sub="Quarante voleurs, une caverne pleine d'or." accent={GOLD_HI} delay={OPEN + 0.7} />
        </motion.div>
      </div>
    </>
  );
}
