"use client";

import { motion } from "framer-motion";
import { Embers, GOLD_HI } from "../../kit";
import { SecretStage, type SecretProps } from "./stage";

const WHEAT = "#e3c27a";
/** Cinq épis en gerbe, liés en bas ; deux grains par épi s'allument : dix records. */
const STALKS = [-30, -15, 0, 15, 30];

/** moisson : une gerbe de blé pousse et s'évase ; ses dix grains s'allument d'or un à un, puis le lien se noue. */
export default function Moisson({ title, description }: SecretProps) {
  return (
    <SecretStage tint={WHEAT} accent={WHEAT} title={title} description={description} captionDelay={1.6}>
      <Embers count={16} color={GOLD_HI} delay={1.2} width={220} from={40} rise={[120, 220]} band={80} seed={13} />
      <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0 overflow-visible">
        {STALKS.map((deg, index) => (
          <motion.g key={deg} style={{ originX: 0.5, originY: 1 }} initial={{ rotate: 0, scaleY: 0 }} animate={{ rotate: deg, scaleY: 1 }} transition={{ delay: index * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <line x1="150" y1="250" x2="150" y2="96" stroke="#b49650" strokeWidth="2" />
            {Array.from({ length: 6 }, (_, grain) => (
              <g key={grain}>
                <ellipse cx="143" cy={110 + grain * 11} rx="5" ry="8" transform={`rotate(-25 143 ${110 + grain * 11})`} fill="#5b4a26" />
                <ellipse cx="157" cy={110 + grain * 11} rx="5" ry="8" transform={`rotate(25 157 ${110 + grain * 11})`} fill="#5b4a26" />
              </g>
            ))}
            {[0, 1].map((lit) => (
              <motion.ellipse key={lit} cx={lit ? 157 : 143} cy={110 + (lit ? 22 : 0)} rx="5" ry="8" transform={`rotate(${lit ? 25 : -25} ${lit ? 157 : 143} ${110 + (lit ? 22 : 0)})`} fill={GOLD_HI} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.85] }} transition={{ delay: 0.75 + (index * 2 + lit) * 0.07, duration: 0.3 }} />
            ))}
            <path d="M150 96 L150 80" stroke="#b49650" strokeWidth="1" />
          </motion.g>
        ))}
        <motion.path d="M132 214 Q150 222 168 214" fill="none" stroke={WHEAT} strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 1.35, duration: 0.35 }} />
      </svg>
    </SecretStage>
  );
}
