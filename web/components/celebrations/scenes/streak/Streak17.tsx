"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/** Cinq, sept, cinq : dix-sept syllabes. */
const LINES = ["Le fer se soulève", "dix-sept fois la même ardeur", "l'aube sur la barre"];
/** L'ensō, cercle tracé d'un seul geste, laissé ouvert. */
const ENSO = "M118 70 C96 26 30 22 2 64 C-24 104 -6 160 44 176 C96 192 150 160 156 112 C160 84 146 64 132 58";

/**
 * 17 · « Haïku » : cinq, sept, cinq, dix-sept syllabes. Le pinceau trace l'ensō d'un seul geste,
 * le haïku s'écrit ligne après ligne, et le sceau rouge vient frapper le bas de la page.
 */
export default function Streak17({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.93} />
      <SceneLayout caption={<StreakCaption count={count} sub="Dix-sept syllabes : un haïku." accent={GOLD} delay={2.3} />}>
        <svg aria-hidden viewBox="-30 0 200 200" className="absolute inset-0 overflow-visible">
          <motion.path d={ENSO} fill="none" stroke={GOLD} strokeWidth="11" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0.9 }} animate={{ pathLength: 1, opacity: 0.55 }} transition={{ duration: 0.9, ease: [0.5, 0, 0.3, 1], opacity: { delay: 0.9, duration: 0.6 } }} />
          <motion.path d={ENSO} fill="none" stroke={GOLD_HI} strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.5, 0, 0.3, 1] }} />
        </svg>
        <Sparks count={10} color={GOLD} delay={0.85} distance={[20, 60]} size={4} seed={17} direction={-40} spread={90} x={110} y={-40} fall={20} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
          {LINES.map((line, index) => (
            <motion.p
              key={index}
              className="whitespace-nowrap font-display text-[1.02rem] italic leading-tight"
              style={{ color: CREAM }}
              initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0.4 }}
              animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
              transition={{ delay: 0.95 + index * 0.42, duration: 0.5, ease: "easeOut" }}
            >
              {line}
            </motion.p>
          ))}
        </div>
        {/* Le sceau : il frappe en bas à droite. */}
        <motion.div
          className="absolute bottom-3 right-4 grid h-12 w-12 place-items-center rounded-[6px] font-display text-xl font-bold"
          style={{ background: "#a3291f", color: CREAM, boxShadow: "inset 0 0 0 2px rgba(236,230,216,0.35)" }}
          initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
          animate={{ scale: 1, opacity: 1, rotate: -6 }}
          transition={{ delay: 2.2, type: "spring", stiffness: 520, damping: 18 }}
        >
          {count}
        </motion.div>
      </SceneLayout>
    </>
  );
}
