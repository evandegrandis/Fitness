"use client";

import { motion } from "framer-motion";
import { Backdrop, EMBER, GOLD, Glow, MetalText, SceneLayout, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const STRIKES = [0.35, 0.85, 1.35];

/** 4 · « Forge » : un marteau frappe trois fois le 4 sur l'enclume ; le métal rougeoie puis passe à l'or. */
export default function Streak4({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={EMBER} />
      <SceneLayout caption={<StreakCaption count={count} sub="Forgée à coups de séries." accent={GOLD} delay={1.55} />}>
        <Glow color={EMBER} size={300} delay={0.3} strength={45} rest={0.5} y={20} />
        {/* Tremblement du choc, à chaque frappe. */}
        <motion.div
          className="absolute inset-0"
          animate={{ x: [0, 0, -5, 4, 0, 0, -5, 4, 0, 0, -7, 6, 0] }}
          transition={{ duration: 1.6, times: [0, 0.22, 0.24, 0.27, 0.3, 0.53, 0.55, 0.58, 0.61, 0.84, 0.86, 0.89, 0.93] }}
        >
          {/* Enclume. */}
          <svg aria-hidden viewBox="0 0 300 300" className="absolute inset-0">
            <path d="M58 212 H242 Q236 230 212 234 L196 236 L204 262 H96 L104 236 L88 234 Q64 230 58 212Z" fill="#17140f" stroke="rgba(216,178,106,0.45)" strokeWidth="1.2" />
            <path d="M58 212 Q30 210 22 200 H58Z" fill="#17140f" stroke="rgba(216,178,106,0.45)" strokeWidth="1.2" />
          </svg>
          <div className="absolute left-1/2 grid place-items-center" style={{ bottom: 86, marginLeft: -70, width: 140 }}>
            <motion.div
              style={{ transformOrigin: "bottom" }}
              animate={{ scaleY: [1, 1, 0.9, 1, 1, 0.9, 1, 1, 0.88, 1], scaleX: [1, 1, 1.06, 1, 1, 1.06, 1, 1, 1.08, 1] }}
              transition={{ duration: 1.6, times: [0, 0.22, 0.24, 0.3, 0.53, 0.55, 0.61, 0.84, 0.86, 0.93] }}
              className="relative"
            >
              <MetalText metal="or" style={{ fontSize: 130, lineHeight: 0.9, display: "block" }}>
                {count}
              </MetalText>
              <motion.span className="absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ duration: 2, times: [0, 0.7, 1] }}>
                <MetalText metal="braise" style={{ fontSize: 130, lineHeight: 0.9, display: "block" }}>
                  {count}
                </MetalText>
              </motion.span>
            </motion.div>
          </div>
          {/* Marteau : pivote autour du bout du manche (270, 104) ; à 0°, la tête tombe sur le chiffre. */}
          <motion.svg
            aria-hidden
            viewBox="0 0 300 300"
            className="absolute inset-0 overflow-visible"
            style={{ transformOrigin: "270px 104px" }}
            initial={{ rotate: 55, opacity: 0 }}
            animate={{ rotate: [55, 0, 42, 0, 42, 0, 60], opacity: [0, 1, 1, 1, 1, 1, 0] }}
            transition={{ duration: 1.9, times: [0, 0.19, 0.33, 0.45, 0.6, 0.72, 1], ease: "easeIn" }}
          >
            <rect x="160" y="100" width="112" height="8" rx="3" fill="#6b5236" />
            <rect x="128" y="76" width="44" height="40" rx="4" fill="#2a2620" stroke="rgba(236,230,216,0.55)" strokeWidth="1.2" />
            <rect x="128" y="110" width="44" height="6" rx="2" fill="rgba(236,230,216,0.25)" />
          </motion.svg>
        </motion.div>
        {STRIKES.map((at, index) => (
          <Sparks key={at} count={10 + index * 5} color={index === 2 ? "#ffe3a3" : "#ffbf69"} delay={at} distance={[50, 110 + index * 25]} spread={150} direction={-90} fall={50} streak size={2} seed={40 + index} duration={0.8} y={-50} />
        ))}
      </SceneLayout>
    </>
  );
}
