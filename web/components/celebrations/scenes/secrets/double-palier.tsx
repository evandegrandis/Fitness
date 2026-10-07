"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, ICE, SILVER, Sparks } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

/** Trois marches ; le jeton saute deux fois, et chaque marche atteinte prend la couleur de son niveau. */
const STEPS = [
  { x: 40, y: 220, w: 80 },
  { x: 110, y: 160, w: 80 },
  { x: 180, y: 100, w: 80 },
];

/** double-palier : un jeton de lumière gravit deux marches d'un coup ; chaque atterrissage allume un chevron, argent puis or. */
export default function DoublePalier({ title, description }: SecretProps) {
  return (
    <SecretStage tint={ICE} accent={GOLD} title={title} description={description} captionDelay={1.6}>
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        {STEPS.map((step, index) => (
          <motion.rect key={index} x={step.x} y={step.y} width={step.w} height={260 - step.y} fill="rgba(236,230,216,0.04)" stroke="rgba(236,230,216,0.3)" strokeWidth="1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.08 }} />
        ))}
        {[1, 2].map((level) => (
          <motion.path key={level} d={`M${STEPS[level].x + 26} ${STEPS[level].y - 30} L${STEPS[level].x + 40} ${STEPS[level].y - 44} L${STEPS[level].x + 54} ${STEPS[level].y - 30}`} fill="none" stroke={level === 1 ? SILVER : GOLD_HI} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: level === 1 ? 0.75 : 1.25, type: "spring", stiffness: 420, damping: 14 }} />
        ))}
      </svg>
      <motion.span
        aria-hidden
        className="absolute h-[22px] w-[22px] rounded-full"
        style={{ left: 69, top: 198, background: "radial-gradient(circle, #ffffff, #f4dca0 60%, #d8b26a)" }}
        initial={{ x: 0, y: 0, scale: 0 }}
        animate={{ x: [0, 0, 35, 70, 70, 105, 140], y: [0, 0, -80, -60, -60, -140, -120], scale: [0, 1, 1, 1, 1, 1, 1] }}
        transition={{ duration: 1.25, times: [0, 0.15, 0.38, 0.55, 0.65, 0.85, 1], ease: "easeOut" }}
      />
      <Sparks count={10} color={SILVER} delay={0.7} distance={[20, 50]} size={2.5} seed={18} x={-70} y={-12} duration={0.5} />
      <Sparks count={14} color={GOLD_HI} delay={1.22} distance={[24, 70]} size={2.5} seed={19} x={0} y={-72} duration={0.6} />
    </SecretStage>
  );
}
