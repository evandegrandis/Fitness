"use client";

import { motion } from "framer-motion";
import { Glow, Rays } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const PEACH = "#f0b48a";

/** aube : l'horizon se trace, le soleil se lève derrière, le ciel passe de la nuit à la pêche. */
export default function Aube({ title, description }: SecretProps) {
  return (
    <SecretStage tint="#e8906a" accent={PEACH} title={title} description={description}>
      <motion.div
        aria-hidden
        className="absolute inset-[18px] overflow-hidden rounded-[6px]"
        style={{ background: "linear-gradient(180deg, #151a33 0%, #3b2b4a 55%, #c9775a 100%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0.9] }}
        transition={{ duration: 1.6 }}
      />
      <Rays count={14} color="#ffd9a8" delay={0.9} spin={8} duration={2.6} peak={0.5} inner={60} outer={170} y={40} />
      <Glow color={PEACH} size={300} delay={0.6} strength={50} y={40} />
      <div className="absolute inset-x-[18px] top-[18px] overflow-hidden" style={{ height: 172 }}>
        <motion.div
          className="absolute left-1/2 rounded-full"
          style={{ width: 104, height: 104, marginLeft: -52, top: 120, background: "radial-gradient(circle, #fff3d6 0%, #ffcf8a 50%, #f08a5a 100%)" }}
          initial={{ y: 70 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.3, duration: 1.4, ease: [0.2, 0.7, 0.3, 1] }}
        />
      </div>
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0">
        <motion.line x1="30" y1="190" x2="270" y2="190" stroke={PEACH} strokeWidth="1.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
        {[0, 1, 2].map((index) => (
          <motion.line key={index} x1={70 + index * 12} y1={205 + index * 12} x2={230 - index * 12} y2={205 + index * 12} stroke={PEACH} strokeWidth="0.8" opacity={0.5 - index * 0.12} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }} />
        ))}
        {[0, 1].map((index) => (
          <motion.path
            key={index}
            d="M-7 0 Q-3 -4 0 0 Q3 -4 7 0"
            fill="none"
            stroke="#2a1c22"
            strokeWidth="1.6"
            initial={{ x: 70 + index * 30, y: 110 + index * 14, opacity: 0 }}
            animate={{ x: 150 + index * 50, y: 92 + index * 10, opacity: [0, 1, 1] }}
            transition={{ delay: 1 + index * 0.2, duration: 1.8 }}
          />
        ))}
      </svg>
    </SecretStage>
  );
}
