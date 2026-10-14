"use client";

import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { useMemo, useRef } from "react";
import { Backdrop, CREAM, GOLD, GOLD_HI, ICE, MetalText, NIGHT, Rays, SAGE, seeded, Shockwave, Sparks } from "../../kit";
import { StreakCaption } from "./caption";

const WARP = 0.9;
const COMPUTE = [1.25, 3.05];
const ANSWER = 3.25;
const YEARS = 7_500_000;

/**
 * 42 · « Pensée Profonde » : dans Le Guide du voyageur galactique, l'ordinateur Pensée Profonde
 * calcule pendant 7,5 millions d'années la réponse à la grande question sur la vie, l'univers et
 * le reste. Saut en hyperespace, terminal, compteur d'années en accéléré, puis la réponse : 42.
 */
export default function Streak42({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const years = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  useAnimationFrame((time) => {
    if (start.current === null) start.current = time;
    const t = (time - start.current) / 1000;
    const progress = Math.min(1, Math.max(0, (t - COMPUTE[0]) / (COMPUTE[1] - COMPUTE[0])));
    const eased = Math.pow(progress, 2.2);
    if (years.current) years.current.textContent = Math.round(eased * YEARS).toLocaleString("fr-FR");
    if (bar.current) bar.current.style.transform = `scaleX(${eased})`;
  });
  const streaks = useMemo(() => {
    const random = seeded(42);
    return Array.from({ length: 60 }, () => ({ angle: random() * 360, from: 20 + random() * 60, length: 60 + random() * 140, lag: random() * 0.35, color: random() > 0.8 ? GOLD_HI : random() > 0.5 ? ICE : CREAM }));
  }, []);
  return (
    <>
      <Backdrop tint={NIGHT} veil={0.95} />
      {/* Hyperespace : les étoiles s'étirent en traits depuis le centre. */}
      {!reduced && (
        <div className="absolute left-1/2 top-[42%]">
          {streaks.map((star, index) => (
            <span key={index} aria-hidden className="absolute left-0 top-0" style={{ transform: `rotate(${star.angle.toFixed(1)}deg)` }}>
              <motion.span
                className="absolute left-0 top-0 h-px origin-left"
                style={{ width: star.length, background: `linear-gradient(90deg, transparent, ${star.color})` }}
                initial={{ x: 0, scaleX: 0, opacity: 0 }}
                animate={{ scaleX: [0, 1, 0.2], opacity: [0, 1, 0], x: [star.from * 0.2, star.from * 3, star.from * 6] }}
                transition={{ delay: star.lag, duration: WARP, ease: "easeIn" }}
              />
            </span>
          ))}
        </div>
      )}
      <motion.div aria-hidden className="absolute inset-0" style={{ background: "#fff" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0] }} transition={{ delay: WARP + 0.1, duration: 0.3 }} />
      {/* Le terminal de Pensée Profonde. */}
      <motion.div
        className="absolute left-1/2 top-[30%] w-[19.5rem] -translate-x-1/2 rounded-lg p-4 font-mono text-[0.72rem] leading-relaxed"
        style={{ background: "rgba(10,14,10,0.92)", border: `1px solid color-mix(in srgb, ${SAGE} 50%, transparent)`, color: SAGE, boxShadow: `0 0 30px color-mix(in srgb, ${SAGE} 15%, transparent)` }}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.94, 1, 1, 1.04] }}
        transition={{ delay: WARP + 0.15, duration: ANSWER - WARP + 0.1, times: [0, 0.08, 0.9, 1] }}
      >
        <p className="text-[0.6rem] uppercase tracking-[0.25em]" style={{ color: GOLD }}>
          Pensée Profonde
        </p>
        <motion.p className="mt-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: WARP + 0.3 }}>
          &gt; La grande question sur la vie, l&apos;univers et le reste
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4, 1] }} transition={{ delay: COMPUTE[0], duration: 0.8, repeat: 2 }}>
          &gt; Calcul en cours…
        </motion.p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(157,180,135,0.18)" }}>
          <div ref={bar} className="h-full w-full origin-left" style={{ background: SAGE, transform: "scaleX(0)" }} />
        </div>
        <p className="mt-2 text-right tabular-nums" style={{ color: CREAM }}>
          <span ref={years}>0</span> ans
        </p>
      </motion.div>
      {/* La réponse. */}
      <div className="absolute inset-x-0 top-[24%] grid place-items-center">
        <div className="relative grid h-[260px] w-[260px] place-items-center">
          <Rays count={24} color={GOLD_HI} delay={ANSWER} inner={60} outer={260} spin={20} duration={2.2} peak={0.5} />
          <Shockwave color={GOLD_HI} delay={ANSWER} size={420} width={2.5} />
          <Shockwave color={ICE} delay={ANSWER + 0.15} size={600} width={1} duration={1.3} />
          <Sparks count={40} color={GOLD_HI} delay={ANSWER} distance={[120, 240]} size={2.5} seed={4242} streak />
          <motion.div initial={{ opacity: 0, scale: 0.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: ANSWER, type: "spring", stiffness: 200, damping: 12 }}>
            <MetalText metal="or" style={{ fontSize: 168, lineHeight: 1, display: "block" }}>
              {count}
            </MetalText>
          </motion.div>
        </div>
      </div>
      <div className="absolute inset-x-0 top-[60%] flex justify-center px-6">
        <StreakCaption count={count} sub="La réponse, après 7,5 millions d'années de calcul. Pas de panique." accent={GOLD} delay={ANSWER + 0.4} />
      </div>
    </>
  );
}
