"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, Glow, INK, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const W = 160;
const H = 256;
/** Le papillon, emblème de la métamorphose : quatre ailes et un corps. */
const BUTTERFLY = "M0 -4 C-18 -44 -62 -48 -56 -14 C-52 6 -22 6 0 2 C22 6 52 6 56 -14 C62 -48 18 -44 0 -4Z M0 6 C-16 10 -44 18 -36 40 C-28 56 -8 34 0 14 C8 34 28 56 36 40 C44 18 16 10 0 6Z";

/**
 * 13 · « Arcane XIII » : au tarot, le treizième arcane n'a pas de nom. Il ne parle pas de fin mais de
 * transformation. La carte tombe face cachée, se retourne en 3D, et le papillon s'y déploie.
 */
export default function Streak13({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} veil={0.9} />
      <SceneLayout caption={<StreakCaption count={count} sub="L'arcane XIII : la transformation." accent={GOLD} delay={1.9} />}>
        <Glow color={GOLD} size={340} delay={1.1} strength={35} />
        <div className="absolute inset-0 grid place-items-center" style={{ perspective: 900 }}>
          <motion.div
            className="relative"
            style={{ width: W, height: H, transformStyle: "preserve-3d" }}
            initial={{ y: -420, rotateZ: -24, rotateY: 0 }}
            animate={{ y: [-420, 0, 0, -6, 0], rotateZ: [-24, 4, 0, 0, 0], rotateY: [0, 0, 0, 180, 180] }}
            transition={{ duration: 1.7, times: [0, 0.35, 0.45, 0.8, 1], ease: [0.3, 0.7, 0.3, 1] }}
          >
            {/* Dos : losanges d'or. */}
            <div className="absolute inset-0 rounded-xl" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", border: `2px solid ${GOLD}`, background: `repeating-linear-gradient(45deg, #15120c 0 10px, #241d12 10px 20px), ${INK}`, boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
              <div className="absolute inset-3 rounded-lg" style={{ border: `1px solid ${GOLD}`, opacity: 0.6 }} />
              <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ border: `1.5px solid ${GOLD_HI}` }} />
            </div>
            {/* Face : l'arcane sans nom. */}
            <div className="absolute inset-0 flex flex-col items-center justify-between rounded-xl py-3" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", background: `linear-gradient(180deg, ${CREAM}, #d8cfb9)`, border: `2px solid ${GOLD}`, boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
              <span className="font-display text-2xl font-bold tracking-[0.12em]" style={{ color: "#3a2a12" }}>
                XIII
              </span>
              <svg viewBox="-70 -60 140 120" width="128" height="110" aria-hidden className="overflow-visible">
                <motion.circle r="54" fill="none" stroke="#8f6a2c" strokeWidth="1" strokeDasharray="2 4" initial={{ rotate: 0 }} animate={{ rotate: 90 }} transition={{ delay: 1.3, duration: 3, ease: "linear" }} />
                <motion.g initial={{ scaleX: 0.05, opacity: 0 }} animate={{ scaleX: [0.05, 1, 0.82, 1], opacity: 1 }} transition={{ delay: 1.45, duration: 1, times: [0, 0.4, 0.7, 1] }}>
                  <path d={BUTTERFLY} fill="url(#arcane-wing)" stroke="#5b3f15" strokeWidth="1.2" />
                  <line x1="0" y1="-10" x2="0" y2="26" stroke="#3a2a12" strokeWidth="3" strokeLinecap="round" />
                </motion.g>
                <defs>
                  <linearGradient id="arcane-wing" x1="0" y1="-1" x2="0" y2="1">
                    <stop offset="0" stopColor="#f4dca0" />
                    <stop offset="1" stopColor="#b5832f" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em]" style={{ color: "#5b3f15" }}>
                L&apos;arcane sans nom
              </span>
            </div>
          </motion.div>
        </div>
        <Sparks count={22} color={GOLD_HI} delay={1.5} distance={[120, 190]} size={2.5} seed={13} />
      </SceneLayout>
    </>
  );
}
