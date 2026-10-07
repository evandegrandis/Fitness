"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Glow, ICE, NIGHT, seeded } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

/** minuit : les aiguilles d'une horloge se rejoignent sur 12, le croissant de lune se lève. */
export default function Minuit({ title, description }: SecretProps) {
  const stars = useMemo(() => {
    const random = seeded(12);
    return Array.from({ length: 26 }, () => ({ x: 20 + random() * 260, y: 20 + random() * 260, lag: random() * 1.6, size: 1 + random() * 1.5 }));
  }, []);
  return (
    <SecretStage tint={NIGHT} accent={ICE} title={title} description={description} veil={0.86}>
      {stars.map((star, index) => (
        <motion.span key={index} aria-hidden className="absolute rounded-full bg-white" style={{ left: star.x, top: star.y, width: star.size, height: star.size }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.7, 0.25, 0.6] }} transition={{ delay: star.lag, duration: 2 }} />
      ))}
      <Glow color={ICE} size={260} delay={1} strength={25} />
      <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
        <motion.circle r="96" fill="rgba(10,14,28,0.7)" stroke="rgba(188,214,234,0.6)" strokeWidth="1.2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
          const long = index % 3 === 0;
          return <line key={index} x1={Math.cos(angle) * (long ? 80 : 86)} y1={Math.sin(angle) * (long ? 80 : 86)} x2={Math.cos(angle) * 92} y2={Math.sin(angle) * 92} stroke={index === 0 ? "#ffffff" : "rgba(188,214,234,0.7)"} strokeWidth={long ? 2 : 1} />;
        })}
        <circle r="4" fill="#ffffff" />
        <motion.circle r="96" fill="none" stroke="#ffffff" strokeWidth="2" initial={{ opacity: 0, scale: 1 }} animate={{ opacity: [0, 0.9, 0], scale: [1, 1.25] }} transition={{ delay: 1.1, duration: 0.8 }} />
      </svg>
      {/* Aiguilles : rotation autour du centre du cadran (pied de l'aiguille). */}
      {[
        { length: 54, width: 4, from: -95, color: "#e8eef6" },
        { length: 80, width: 2, from: -300, color: "#ffffff" },
      ].map((hand) => (
        <motion.span
          key={hand.length}
          aria-hidden
          className="absolute rounded-full"
          style={{ left: 150 - hand.width / 2, top: 150 - hand.length, width: hand.width, height: hand.length + 8, background: hand.color, transformOrigin: `50% ${hand.length}px` }}
          initial={{ rotate: hand.from }}
          animate={{ rotate: 0 }}
          transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
        />
      ))}
      {/* Croissant : un disque clair masqué par un disque de la couleur de la nuit. */}
      <motion.div className="absolute" style={{ left: 196, top: 4 }} initial={{ opacity: 0, y: 20, rotate: -20 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 1.15, duration: 0.8 }}>
        <div className="relative h-[54px] w-[54px] rounded-full" style={{ background: "radial-gradient(circle at 35% 40%, #ffffff, #c9d8ea)" }}>
          <div className="absolute h-[50px] w-[50px] rounded-full" style={{ left: 14, top: -6, background: "#0c1020" }} />
        </div>
      </motion.div>
    </SecretStage>
  );
}
