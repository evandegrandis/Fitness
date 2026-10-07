"use client";

import { motion } from "framer-motion";
import { GOLD, SILVER } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
/** Quatre séances dans la semaine, chacune au rang A ou S. */
const MEDALS: Record<number, "A" | "S"> = { 0: "A", 2: "S", 3: "A", 5: "S" };

/** semaine-parfaite : la semaine s'étale en sept colonnes ; quatre médailles A ou S y tombent, puis l'accolade d'or la referme. */
export default function SemaineParfaite({ title, description }: SecretProps) {
  let order = 0;
  return (
    <SecretStage tint={SILVER} accent={SILVER} title={title} description={description} captionDelay={1.5}>
      <div className="absolute inset-x-[22px] top-[34px] grid grid-cols-7 gap-1.5">
        {DAYS.map((day, index) => {
          const medal = MEDALS[index];
          const at = medal ? 0.35 + order++ * 0.18 : 0;
          return (
            <div key={index} className="flex flex-col items-center gap-2">
              <motion.span className="font-mono text-[0.62rem] tracking-[0.15em] text-(--color-fg-muted)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }}>
                {day}
              </motion.span>
              <motion.div className="relative h-[156px] w-full rounded-[4px]" style={{ background: "rgba(236,230,216,0.04)", border: "1px solid rgba(236,230,216,0.12)", transformOrigin: "bottom" }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: index * 0.04, duration: 0.3 }}>
                {medal && (
                  <motion.span
                    className="absolute inset-x-0 bottom-2 mx-auto grid h-[34px] w-[34px] place-items-center rounded-full font-display text-lg font-bold"
                    style={{ color: "#0b0b0c", background: medal === "S" ? GOLD : SILVER }}
                    initial={{ y: -150, opacity: 0 }}
                    animate={{ y: [-150, 4, 0], opacity: 1 }}
                    transition={{ delay: at, duration: 0.45, times: [0, 0.8, 1], ease: "easeIn" }}
                  >
                    {medal}
                  </motion.span>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        <motion.path d="M24 234 Q24 246 36 246 L138 246 Q150 246 150 258 Q150 246 162 246 L264 246 Q276 246 276 234" fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.15, duration: 0.5 }} />
      </svg>
    </SecretStage>
  );
}
