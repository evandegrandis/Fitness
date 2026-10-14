"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, MetalText, SceneLayout } from "../../kit";
import { StreakCaption } from "./caption";

const WHITE = 14;
const KEY_W = 21;
/** Touches noires (index de la touche blanche à leur gauche) sur deux octaves. */
const BLACK = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
/** L'arpège du premier prélude (do, mi, sol, do, mi), joué deux fois, puis l'accord. */
const ARPEGGIO = [0, 2, 4, 7, 9, 4, 7, 9, 0, 2, 4, 7, 9, 4, 7, 9];
const NOTE = 0.1;

/**
 * 48 · « Le Clavier bien tempéré » : quarante-huit préludes et fugues de Bach, dans toutes les
 * tonalités. Le clavier joue l'arpège du premier prélude en do majeur, chaque touche s'allume et
 * lâche une note d'or qui monte ; l'accord final fait sonner tout le clavier.
 */
export default function Streak48({ count }: { count: number }) {
  const chord = 0.3 + ARPEGGIO.length * NOTE;
  return (
    <>
      <Backdrop tint={GOLD} veil={0.93} />
      <SceneLayout caption={<StreakCaption count={count} sub="Bach : quarante-huit préludes et fugues." accent={GOLD} delay={chord + 0.4} />}>
        <Glow color={GOLD} size={300} delay={chord} strength={35} y={60} />
        <div className="absolute left-1/2 top-[150px] -translate-x-1/2" style={{ width: WHITE * KEY_W, height: 120 }}>
          {Array.from({ length: WHITE }, (_, index) => {
            const hits = ARPEGGIO.map((key, step) => (key === index ? 0.3 + step * NOTE : -1)).filter((at) => at >= 0);
            return (
              <div key={index} className="absolute top-0" style={{ left: index * KEY_W, width: KEY_W - 2, height: 120 }}>
                <motion.div className="h-full w-full origin-top rounded-b-[4px]" style={{ background: `linear-gradient(180deg, #d8d1c1, ${CREAM})` }} initial={{ scaleY: 1 }} animate={hits.length ? { scaleY: [1, ...hits.flatMap(() => [0.96, 1]), 0.97, 1] } : { scaleY: [1, 0.97, 1] }} transition={{ duration: chord + 0.4, times: hits.length ? [0, ...hits.flatMap((at) => [at / (chord + 0.4), (at + NOTE) / (chord + 0.4)]), chord / (chord + 0.4), 1] : [0, chord / (chord + 0.4), 1] }} />
                {hits.map((at, k) => (
                  <motion.span key={k} aria-hidden className="absolute inset-0 rounded-b-[4px]" style={{ background: GOLD_HI }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0] }} transition={{ delay: at, duration: 0.45 }} />
                ))}
                {hits.map((at, k) => (
                  <motion.span key={`n${k}`} aria-hidden className="absolute left-1/2 top-0 -ml-[3px] h-[6px] w-[6px] rounded-full" style={{ background: GOLD_HI, boxShadow: `0 0 8px ${GOLD_HI}` }} initial={{ y: 0, opacity: 0 }} animate={{ y: -150 - k * 12, x: (index - 7) * 4, opacity: [0, 1, 0] }} transition={{ delay: at, duration: 1.2, ease: "easeOut" }} />
                ))}
                <motion.span aria-hidden className="absolute inset-0 rounded-b-[4px]" style={{ background: GOLD }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.7, 0.25] }} transition={{ delay: chord + Math.abs(index - 7) * 0.02, duration: 0.8 }} />
              </div>
            );
          })}
          {BLACK.map((left) => (
            <div key={left} className="absolute top-0 rounded-b-[3px]" style={{ left: (left + 1) * KEY_W - 7, width: 12, height: 74, background: "linear-gradient(180deg, #1a1814, #050505)", boxShadow: "0 3px 4px rgba(0,0,0,0.6)" }} />
          ))}
        </div>
        <motion.div className="absolute inset-x-0 top-0 grid place-items-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: chord, duration: 0.5 }}>
          <MetalText metal="or" style={{ fontSize: 96, lineHeight: 1, display: "block" }}>
            {count}
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
