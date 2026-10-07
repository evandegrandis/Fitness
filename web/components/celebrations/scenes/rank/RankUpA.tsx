"use client";

import { motion } from "framer-motion";
import { Backdrop, Caption, EASE_OUT, Glow, ICE, MetalText, SceneLayout, Shockwave, SILVER, Sparks } from "../../kit";

/** Huit facettes d'un losange taillé, du centre vers le bord. */
const R = 96;
const POINTS = Array.from({ length: 8 }, (_, index) => {
  const angle = (index / 8) * Math.PI * 2 - Math.PI / 2;
  // Losange : rayon plus long en haut et en bas.
  const radius = index % 4 === 0 ? R * 1.18 : index % 2 === 0 ? R * 0.92 : R * 0.86;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
});
const FACETS = POINTS.map((point, index) => {
  const next = POINTS[(index + 1) % 8];
  const mid = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
  const length = Math.hypot(mid[0], mid[1]);
  return { d: `M0 0 L${point[0].toFixed(1)} ${point[1].toFixed(1)} L${next[0].toFixed(1)} ${next[1].toFixed(1)}Z`, dx: mid[0] / length, dy: mid[1] / length, shade: [0.22, 0.12, 0.3, 0.16, 0.26, 0.1, 0.2, 0.34][index] };
});

/**
 * Passage au rang A, « taille » : huit facettes d'argent arrivent de l'extérieur et s'emboîtent en
 * gemme, la lettre se pose dessus, un reflet froid la balaie. Plus vive que B.
 */
export default function RankUpA() {
  return (
    <>
      <Backdrop tint={ICE} veil={0.84} />
      <SceneLayout
        size={260}
        caption={<Caption kicker="Rang en séance" title="Rang A" sub="Taillé dans l'argent. Prochain palier : S." accent={SILVER} delay={0.85} />}
      >
        <Glow color={ICE} size={300} delay={0.5} strength={40} rest={0.35} />
        <svg aria-hidden viewBox="-130 -130 260 260" className="absolute inset-0 overflow-visible">
          <motion.path
            d={`M${POINTS.map((point) => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" L")}Z`}
            fill="rgba(12,14,18,0.82)"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          />
          {FACETS.map((facet, index) => (
            <motion.path
              key={index}
              d={facet.d}
              fill={`rgba(225,232,240,${(facet.shade * 0.55).toFixed(3)})`}
              stroke="rgba(235,240,246,0.55)"
              strokeWidth="0.8"
              initial={{ x: facet.dx * 120, y: facet.dy * 120, rotate: index % 2 ? 35 : -35, opacity: 0 }}
              animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              transition={{ delay: 0.04 * index, duration: 0.55, ease: EASE_OUT }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.div initial={{ scale: 1.35, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, duration: 0.45, ease: EASE_OUT }}>
            <MetalText metal="argent" style={{ fontSize: 132, lineHeight: 1, display: "block", transform: "translateY(4px)" }}>
              A
            </MetalText>
          </motion.div>
        </div>
        {/* Reflet : une bande claire qui traverse la gemme. */}
        <div className="absolute inset-[26px] overflow-hidden" style={{ clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }}>
          <motion.div
            aria-hidden
            className="absolute -inset-y-10 w-16"
            style={{ left: "50%", marginLeft: -32, rotate: 20, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }}
            initial={{ x: -190 }}
            animate={{ x: 190 }}
            transition={{ delay: 0.85, duration: 0.6, ease: "easeInOut" }}
          />
        </div>
        <Shockwave color={SILVER} delay={0.55} size={300} />
        <Shockwave color={ICE} delay={0.7} size={360} width={1} />
        <Sparks count={14} color="#eef2f7" delay={0.55} distance={[110, 170]} streak size={2} seed={11} duration={0.8} />
      </SceneLayout>
    </>
  );
}
