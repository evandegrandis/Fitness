"use client";

import { motion } from "framer-motion";
import { Backdrop, GOLD, GOLD_HI, Glow, MetalText, SceneLayout, Shockwave } from "../../kit";
import { StreakCaption } from "./caption";

/** Les quarante fauteuils de l'Académie, en trois rangs sous la Coupole. */
const ROWS = [
  { r: 74, n: 10 },
  { r: 102, n: 13 },
  { r: 130, n: 17 },
];
const SEATS = ROWS.flatMap(({ r, n }) =>
  Array.from({ length: n }, (_, index) => {
    const a = Math.PI + ((index + 0.5) / n) * Math.PI;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8 + 70, angle: (a * 180) / Math.PI + 90 };
  }),
).sort((a, b) => a.x - b.x);
const FILL = 0.04;

function Seat({ gold = false }: { gold?: boolean }) {
  return (
    <g>
      <rect x="-6" y="-9" width="12" height="7" rx="2.5" fill={gold ? GOLD_HI : "#7a2e2a"} />
      <rect x="-7" y="-3" width="14" height="6" rx="2" fill={gold ? GOLD : "#5a201d"} />
    </g>
  );
}

/**
 * 41 · « Le 41e fauteuil » : l'Académie française a quarante sièges ; le quarante et unième est
 * celui des grands qui n'y sont jamais entrés (Molière, Diderot…). Les quarante s'allument sous
 * la Coupole, puis un fauteuil d'or apparaît au centre.
 */
export default function Streak41({ count }: { count: number }) {
  const gold = SEATS.length * FILL + 0.3;
  return (
    <>
      <Backdrop tint={GOLD} veil={0.92} />
      <SceneLayout caption={<StreakCaption count={count} sub="Le 41e fauteuil : celui des immortels jamais élus." accent={GOLD} delay={gold + 0.6} />}>
        <svg aria-hidden viewBox="-150 -150 300 300" className="absolute inset-0 overflow-visible">
          {/* La Coupole. */}
          <motion.path d="M-120 -10 C-120 -110 120 -110 120 -10" fill="none" stroke={GOLD} strokeWidth="1.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
          {[-80, -40, 0, 40, 80].map((x) => (
            <motion.line key={x} x1={x} y1={-10 - Math.sqrt(Math.max(0, 1 - (x / 120) ** 2)) * 75} x2={x * 0.2} y2="-90" stroke={GOLD} strokeOpacity="0.35" strokeWidth="1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }} />
          ))}
          <motion.circle cy="-92" r="8" fill="none" stroke={GOLD_HI} strokeWidth="1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} />
          {/* Le rayon de lumière de la lanterne vers le centre. */}
          <motion.path d="M-8 -86 L-34 60 L34 60 L8 -86Z" fill={GOLD_HI} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.22, 0.14] }} transition={{ delay: gold, duration: 1 }} />
          {SEATS.map((seat, index) => (
            <motion.g key={index} transform={`translate(${seat.x.toFixed(1)} ${seat.y.toFixed(1)}) rotate(${seat.angle.toFixed(0)})`} initial={{ opacity: 0.12 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + index * FILL, duration: 0.2 }}>
              <Seat />
            </motion.g>
          ))}
          <motion.g initial={{ opacity: 0, scale: 0.2, y: 80 }} animate={{ opacity: 1, scale: 2.2, y: 52 }} transition={{ delay: gold, type: "spring", stiffness: 220, damping: 14 }}>
            <Seat gold />
          </motion.g>
        </svg>
        <Glow color={GOLD} size={200} delay={gold} strength={45} y={50} />
        <div className="absolute left-1/2 top-[202px]">
          <Shockwave color={GOLD_HI} delay={gold + 0.1} size={180} width={1.5} />
        </div>
        <motion.div className="absolute inset-x-0 top-[90px] grid place-items-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: gold + 0.2, type: "spring", stiffness: 260, damping: 15 }}>
          <MetalText metal="or" style={{ fontSize: 60, lineHeight: 1, display: "block" }}>
            {count}
            <sup className="text-2xl">e</sup>
          </MetalText>
        </motion.div>
      </SceneLayout>
    </>
  );
}
