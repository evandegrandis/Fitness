"use client";

import { motion } from "framer-motion";
import { GOLD, GOLD_HI, Shockwave, Sparks } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

/** Lingot en perspective : dessus clair, face, flanc sombre. */
function Ingot() {
  return (
    <svg width="168" height="70" viewBox="0 0 168 70" aria-hidden className="overflow-visible">
      <path d="M26 4 H142 L164 30 H4 Z" fill="#fbe7ad" />
      <path d="M4 30 H164 L156 66 H12 Z" fill="url(#lingot)" />
      <path d="M4 30 L26 4" stroke="#fff6dc" strokeWidth="1" />
      <text x="84" y="54" textAnchor="middle" className="font-display" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.12em" }} fill="rgba(90,62,20,0.75)">
        OR
      </text>
      <defs>
        <linearGradient id="lingot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9c46f" />
          <stop offset="1" stopColor="#9c7430" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** or-massif : deux lingots tombent et s'empilent avec un choc sourd ; un reflet traverse la pile. */
export default function OrMassif({ title, description }: SecretProps) {
  return (
    <SecretStage tint={GOLD} accent={GOLD} title={title} description={description}>
      <motion.div className="absolute inset-0" animate={{ y: [0, 0, 5, 0, 0, 6, 0] }} transition={{ duration: 1.2, times: [0, 0.38, 0.42, 0.5, 0.78, 0.82, 0.9] }}>
        {[0, 1].map((level) => (
          <motion.div key={level} className="absolute left-1/2" style={{ marginLeft: -84, top: 178 - level * 60 }} initial={{ y: -360, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: level * 0.48, duration: 0.42, ease: "easeIn" }}>
            <Ingot />
          </motion.div>
        ))}
        <div className="absolute left-1/2 overflow-hidden" style={{ marginLeft: -84, top: 118, width: 168, height: 130, clipPath: "polygon(15% 0, 85% 0, 100% 20%, 95% 50%, 100% 66%, 92% 100%, 8% 100%, 0 66%, 5% 50%, 0 20%)" }}>
          <motion.div className="absolute -inset-y-6 w-14" style={{ rotate: 22, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)" }} initial={{ x: -80 }} animate={{ x: 240 }} transition={{ delay: 1.15, duration: 0.6, ease: "easeInOut" }} />
        </div>
      </motion.div>
      <Sparks count={12} color={GOLD_HI} delay={0.42} distance={[40, 100]} spread={160} direction={-90} fall={30} size={2.5} seed={22} y={92} duration={0.7} />
      <Sparks count={16} color={GOLD_HI} delay={0.9} distance={[50, 120]} spread={160} direction={-90} fall={30} size={2.5} seed={23} y={32} duration={0.8} />
      <Shockwave color={GOLD} delay={0.9} size={300} y={40} />
    </SecretStage>
  );
}
