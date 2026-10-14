"use client";

import { motion } from "framer-motion";
import { Backdrop, CREAM, GOLD, GOLD_HI, MetalText, NIGHT, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

/** La tour Eiffel en silhouette : flèche, deux plateformes, quatre pieds et la grande arche. */
const TOWER = "M0 -250 L4 -214 L9 -168 L19 -166 L19 -158 L15 -158 L28 -100 L44 -98 L44 -88 L38 -88 L78 0 L48 0 C40 -34 -40 -34 -48 0 L-78 0 L-38 -88 L-44 -88 L-44 -98 L-28 -100 L-15 -158 L-19 -158 L-19 -166 L-9 -168 L-4 -214Z";
/** Bouquets : bleu, blanc, rouge, puis l'or. */
const BURSTS = [
  { x: -95, y: -250, color: "#5b8fd6", at: 0.35 },
  { x: 90, y: -300, color: CREAM, at: 0.7 },
  { x: -20, y: -360, color: "#e0564f", at: 1.05 },
  { x: 110, y: -200, color: "#5b8fd6", at: 1.4 },
  { x: -120, y: -150, color: "#e0564f", at: 1.6 },
  { x: 10, y: -270, color: GOLD_HI, at: 1.85 },
];

/**
 * 14 · « 14 Juillet » : la nuit tombe sur la tour Eiffel, les bouquets bleu, blanc, rouge partent
 * l'un après l'autre en retombant, la tour scintille, et le grand bouquet final est d'or.
 */
export default function Streak14({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={NIGHT} veil={0.9} at="50% 30%" />
      {BURSTS.map((burst, index) => (
        <div key={index} className="absolute left-1/2" style={{ top: "78%", marginLeft: burst.x, marginTop: burst.y }}>
          {/* La fusée qui monte, puis le bouquet qui retombe. */}
          <motion.span className="absolute h-8 w-[2px] rounded-full" style={{ background: `linear-gradient(180deg, ${GOLD_HI}, transparent)` }} initial={{ y: -burst.y, opacity: 0 }} animate={{ y: [-burst.y, 0], opacity: [0, 1, 0] }} transition={{ delay: burst.at - 0.45, duration: 0.45, ease: "easeOut" }} />
          <Sparks count={index === 5 ? 44 : 30} color={burst.color} delay={burst.at} distance={[50, index === 5 ? 140 : 95]} size={2.6} duration={1.4} fall={34} seed={14 + index} streak />
          <Sparks count={16} color={GOLD_HI} delay={burst.at + 0.1} distance={[20, 60]} size={2} duration={1.2} fall={20} seed={40 + index} />
        </div>
      ))}
      <motion.div className="absolute left-1/2 top-[18%] -translate-x-1/2" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.95, type: "spring", stiffness: 220, damping: 14 }}>
        <MetalText metal="or" style={{ fontSize: 70, lineHeight: 1, display: "block" }}>
          {count}
        </MetalText>
      </motion.div>
      <svg aria-hidden viewBox="-100 -260 200 262" className="absolute bottom-[22%] left-1/2 h-[42%] -translate-x-1/2 overflow-visible">
        <path d={TOWER} fill="#0b0a09" stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.8" />
        {Array.from({ length: 28 }, (_, index) => {
          const y = -10 - ((index * 37) % 230);
          const half = y > -88 ? 40 + (y + 88) * 0.4 : y > -158 ? 15 + (y + 158) * 0.2 : Math.max(3, 9 + (y + 168) * 0.1);
          const x = (((index * 53) % 100) / 50 - 1) * half * 0.8;
          return <motion.circle key={index} cx={x} cy={y} r="1.6" fill="#fff" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0, 1, 0, 1] }} transition={{ delay: 1.2 + (index % 7) * 0.08, duration: 1.6 }} />;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-[22%]" style={{ background: "linear-gradient(180deg, #0b0a09, #070708)" }} />
      <div className="absolute inset-x-0 bottom-[6%] flex justify-center px-6">
        <StreakCaption count={count} sub="Quatorze S, un 14 Juillet." accent={GOLD} delay={2.1} />
      </div>
    </>
  );
}
