"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { Backdrop, CREAM, GOLD_HI, ICE, MetalText, seeded } from "../../kit";
import { StreakCaption } from "./caption";

/** La semelle de la botte lunaire, vue de dessus : contour et rainures. */
const SOLE = "M-22 -62 C-6 -72 18 -66 22 -44 C25 -24 20 -6 18 14 C16 36 20 54 8 64 C-6 72 -22 62 -22 44 C-22 24 -26 4 -26 -18 C-26 -40 -30 -56 -22 -62Z";

/**
 * 11 · « Apollo 11 » : le sol de la Lune, la Terre qui se lève sur l'horizon, et une botte qui
 * imprime son empreinte dans la poussière. Un petit pas.
 */
export default function Streak11({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const dust = useMemo(() => {
    const random = seeded(1969);
    return Array.from({ length: 26 }, () => ({ x: (random() - 0.5) * 40, dx: (random() - 0.5) * 220, up: 30 + random() * 70, size: 1.5 + random() * 2.5, lag: random() * 0.1 }));
  }, []);
  const stars = useMemo(() => {
    const random = seeded(11);
    return Array.from({ length: 50 }, () => ({ x: random() * 100, y: random() * 55, size: 0.6 + random() * 1.3 }));
  }, []);
  return (
    <>
      <Backdrop tint={ICE} veil={0.96} />
      {stars.map((star, index) => (
        <span key={index} aria-hidden className="absolute rounded-full bg-white" style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: 0.5 }} />
      ))}
      {/* La Terre se lève au-dessus de l'horizon. */}
      <motion.div
        aria-hidden
        className="absolute right-[12%] top-[13%] h-24 w-24 rounded-full"
        style={{ background: "radial-gradient(circle at 35% 35%, #d9ecf7, #6aa1cf 40%, #2d5a8c 70%, #0d1d33)", boxShadow: "0 0 40px rgba(127,176,216,0.35)" }}
        initial={{ y: 70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 3.2, ease: [0.2, 0.6, 0.3, 1] }}
      >
        <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(110deg, transparent 45%, rgba(7,7,8,0.85) 62%)" }} />
      </motion.div>
      <motion.div className="absolute left-[12%] top-[12%]" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.6 }}>
        <MetalText metal="argent" style={{ fontSize: 96, lineHeight: 1, display: "block" }}>
          {count}
        </MetalText>
      </motion.div>
      <div className="absolute inset-x-0 top-[34%] flex justify-center px-6">
        <StreakCaption count={count} sub="Apollo 11. Un petit pas." accent={ICE} delay={1.8} />
      </div>
      {/* Le sol lunaire, courbe de l'horizon. */}
      <div aria-hidden className="absolute inset-x-[-20%] bottom-0 top-[58%] rounded-t-[50%]" style={{ background: "radial-gradient(120% 90% at 50% 0%, #8d8a83 0%, #5b5953 40%, #262521 100%)" }}>
        {[[22, 14, 40], [70, 22, 26], [33, 62, 54], [78, 66, 34], [14, 44, 28]].map(([x, y, size], index) => (
          <span key={index} className="absolute rounded-[50%]" style={{ left: `${x}%`, top: `${y}%`, width: size, height: size * 0.4, background: "radial-gradient(closest-side, rgba(0,0,0,0.4), rgba(0,0,0,0.1) 70%, rgba(255,255,255,0.08))" }} />
        ))}
      </div>
      <div className="absolute left-1/2 top-[79%]">
        {/* L'empreinte, en perspective sur le sol. */}
        <div className="absolute" style={{ left: -60, top: -118, transform: "perspective(500px) rotateX(55deg) rotateZ(-12deg)" }}>
          <svg viewBox="-40 -80 80 160" width="120" height="236" aria-hidden className="overflow-visible">
            <motion.path d={SOLE} fill="#2e2c28" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95, duration: 0.15 }} />
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.98, duration: 0.2 }} stroke="#6e6a61" strokeWidth="3.5" strokeLinecap="round">
              {Array.from({ length: 11 }, (_, index) => (
                <line key={index} x1="-17" x2="15" y1={-52 + index * 11} y2={-52 + index * 11} />
              ))}
            </motion.g>
            <motion.path d={SOLE} fill="none" stroke="#b9b4a8" strokeWidth="2" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ delay: 1, duration: 0.3 }} />
          </svg>
        </div>
        {/* La botte descend, se pose, repart. */}
        <motion.div className="absolute" style={{ left: -60, top: -118 }} initial={{ y: -300, opacity: 0, scale: 1.3 }} animate={{ y: [-300, 0, 0, -380], opacity: [0, 1, 1, 0], scale: [1.3, 1, 1, 1.3] }} transition={{ duration: 1.6, times: [0, 0.58, 0.68, 1], ease: "easeInOut" }}>
          <div style={{ transform: "perspective(500px) rotateX(55deg) rotateZ(-12deg)" }}>
            <svg viewBox="-40 -80 80 160" width="120" height="236" aria-hidden>
              <path d={SOLE} fill={CREAM} stroke="#b9b2a2" strokeWidth="3" />
            </svg>
          </div>
        </motion.div>
        {!reduced &&
          dust.map((grain, index) => (
            <motion.span
              key={index}
              aria-hidden
              className="absolute rounded-full"
              style={{ width: grain.size, height: grain.size, marginLeft: grain.x, background: "#cfc9bb" }}
              initial={{ x: 0, y: 0, opacity: 0 }}
              animate={{ x: grain.dx, y: [0, -grain.up, 10], opacity: [0, 0.9, 0] }}
              transition={{ delay: 0.93 + grain.lag, duration: 1.3, ease: "easeOut" }}
            />
          ))}
        <motion.span aria-hidden className="absolute -left-36 h-px w-72" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_HI}, transparent)` }} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: [0, 0.8, 0], scaleX: 1 }} transition={{ delay: 0.95, duration: 0.8 }} />
      </div>
    </>
  );
}
