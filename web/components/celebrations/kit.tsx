"use client";

/**
 * Primitives des célébrations : voile, halos, ondes, éclats, rayons, braises, légende.
 *
 * Tout s'anime en transformées et en opacité (60 i/s sur iPhone) : aucun flou animé, aucune
 * ombre recalculée. Les primitives décoratives disparaissent avec `prefers-reduced-motion` ; il
 * reste l'emblème et sa légende, en fondu.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useId, useMemo, type CSSProperties, type ReactNode } from "react";

export const INK = "#070708";
export const CREAM = "#ece6d8";
export const MUTED = "#a49f92";
export const GOLD = "#d8b26a";
export const GOLD_HI = "#f4dca0";
export const BRONZE = "#c3875a";
export const SILVER = "#c9ced6";
export const SAGE = "#9db487";
export const EMBER = "#e0794a";
export const NIGHT = "#1d2a4a";
export const ICE = "#bcd6ea";

/** Dégradés métalliques pour les grands chiffres et lettres (texte découpé). */
export const METAL = {
  or: "linear-gradient(180deg, #fbeec4 0%, #ecc97f 38%, #c99a4c 62%, #8f6a2c 100%)",
  argent: "linear-gradient(180deg, #ffffff 0%, #dde2e8 40%, #a9b0b9 66%, #6f757d 100%)",
  bronze: "linear-gradient(180deg, #f6d1ad 0%, #d99a66 40%, #a96a3f 68%, #6e4224 100%)",
  creme: "linear-gradient(180deg, #ffffff 0%, #ece6d8 55%, #b9b2a2 100%)",
  braise: "linear-gradient(180deg, #fff1c9 0%, #ffbf69 35%, #e0794a 70%, #8a2f1a 100%)",
} as const;

/** Générateur pseudo-aléatoire déterministe : même rendu à chaque passage (rendu pur). */
export function seeded(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function centered(width: number, height: number, x = 0, y = 0): CSSProperties {
  return { position: "absolute", left: "50%", top: "50%", width, height, marginLeft: -width / 2 + x, marginTop: -height / 2 + y };
}

/** Voile plein écran : encre, avec un halo teinté autour de la scène. */
export function Backdrop({ tint, veil = 0.86, at = "50% 40%", delay = 0 }: { tint: string; veil?: number; at?: string; delay?: number }) {
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0"
      style={{
        background: `radial-gradient(130% 75% at ${at}, color-mix(in srgb, ${tint} 20%, rgba(7,7,8,${veil})) 0%, rgba(7,7,8,${veil}) 58%, rgba(7,7,8,${Math.min(1, veil + 0.08)}) 100%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
    />
  );
}

/** Mise en page d'une scène : la scène (carré centré) puis la légende dessous. */
export function SceneLayout({ children, caption, size = 300, lift = 40 }: { children: ReactNode; caption?: ReactNode; size?: number; lift?: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6" style={{ paddingBottom: lift }}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {children}
      </div>
      {caption}
    </div>
  );
}

/** Halo radial qui s'ouvre puis se pose. */
export function Glow({
  color,
  size = 260,
  delay = 0,
  strength = 55,
  peak = 1,
  rest = 0.45,
  duration = 1.4,
  x = 0,
  y = 0,
}: {
  color: string;
  size?: number;
  delay?: number;
  strength?: number;
  peak?: number;
  rest?: number;
  duration?: number;
  x?: number;
  y?: number;
}) {
  return (
    <motion.div
      aria-hidden
      className="rounded-full"
      style={{ ...centered(size, size, x, y), background: `radial-gradient(circle, color-mix(in srgb, ${color} ${strength}%, transparent) 0%, transparent 68%)` }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: [0, peak, rest], scale: [0.5, 1.12, 1] }}
      transition={{ delay, duration, times: [0, 0.35, 1], ease: "easeOut" }}
    />
  );
}

/** Onde de choc : un anneau fin qui s'élargit et s'éteint. */
export function Shockwave({
  color,
  delay = 0,
  size = 280,
  width = 1.5,
  duration = 1,
  x = 0,
  y = 0,
}: {
  color: string;
  delay?: number;
  size?: number;
  width?: number;
  duration?: number;
  x?: number;
  y?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden
      className="rounded-full"
      style={{ ...centered(size, size, x, y), border: `${width}px solid ${color}` }}
      initial={{ scale: 0.12, opacity: 0 }}
      animate={{ scale: 1, opacity: [0, 0.95, 0] }}
      transition={{ delay, duration, ease: EASE_OUT, opacity: { delay, duration, times: [0, 0.12, 1] } }}
    />
  );
}

/** Éclats radiaux (points ou traits) projetés depuis le centre. */
export function Sparks({
  count,
  color,
  delay = 0,
  distance = [90, 150],
  size = 3,
  duration = 0.9,
  seed = 1,
  streak = false,
  spread = 360,
  direction = -90,
  fall = 0,
  x = 0,
  y = 0,
}: {
  count: number;
  color: string;
  delay?: number;
  distance?: readonly [number, number];
  size?: number;
  duration?: number;
  seed?: number;
  streak?: boolean;
  spread?: number;
  direction?: number;
  /** Chute en fin de course (gravité), en px. */
  fall?: number;
  x?: number;
  y?: number;
}) {
  const reduced = useReducedMotion();
  const parts = useMemo(() => {
    const random = seeded(seed);
    const full = spread >= 360;
    return Array.from({ length: count }, (_, index) => {
      const step = spread / count;
      const angle = direction - (full ? 0 : spread / 2) + step * (index + (full ? 0 : 0.5)) + (random() - 0.5) * step * 0.9;
      const radians = (angle * Math.PI) / 180;
      const d = distance[0] + random() * (distance[1] - distance[0]);
      return { x: Math.cos(radians) * d, y: Math.sin(radians) * d, angle, lag: random() * 0.1, scale: 0.6 + random() * 0.8 };
    });
  }, [count, seed, spread, direction, distance]);
  if (reduced) return null;
  const width = streak ? size * 5 : size;
  return (
    <>
      {parts.map((part, index) => (
        <motion.span
          key={index}
          aria-hidden
          className="rounded-full"
          style={{ ...centered(width, size, x, y), background: color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: streak ? part.angle : 0 }}
          animate={{ x: part.x, y: [0, part.y, part.y + fall], opacity: [0, 1, 0], scale: [0.3, part.scale, 0.2], rotate: streak ? part.angle : 0 }}
          transition={{ delay: delay + part.lag, duration, ease: [0.2, 0.8, 0.3, 1], y: { delay: delay + part.lag, duration, times: [0, 0.6, 1] } }}
        />
      ))}
    </>
  );
}

/** Soleil de rayons qui tourne lentement en s'éteignant. */
export function Rays({
  count,
  color,
  delay = 0,
  inner = 46,
  outer = 190,
  spread = 0.07,
  spin = 22,
  duration = 2.6,
  peak = 0.5,
  y = 0,
}: {
  count: number;
  color: string;
  delay?: number;
  inner?: number;
  outer?: number;
  /** Demi-ouverture de chaque rayon, en radians. */
  spread?: number;
  spin?: number;
  duration?: number;
  peak?: number;
  y?: number;
}) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const d = useMemo(() => {
    let path = "";
    for (let index = 0; index < count; index += 1) {
      const a = (index / count) * Math.PI * 2;
      const p = (r: number, da: number) => `${(Math.cos(a + da) * r).toFixed(1)} ${(Math.sin(a + da) * r).toFixed(1)}`;
      path += `M${p(inner, -spread * 0.3)} L${p(outer, -spread)} L${p(outer, spread)} L${p(inner, spread * 0.3)}Z`;
    }
    return path;
  }, [count, inner, outer, spread]);
  if (reduced) return null;
  const box = outer * 2 + 20;
  return (
    <motion.svg
      aria-hidden
      viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
      style={centered(box, box, 0, y)}
      initial={{ opacity: 0, rotate: 0, scale: 0.7 }}
      animate={{ opacity: [0, peak, peak * 0.6, 0], rotate: spin, scale: [0.7, 1, 1.04] }}
      transition={{ delay, duration, ease: "easeOut", opacity: { delay, duration, times: [0, 0.25, 0.7, 1] } }}
    >
      <defs>
        <radialGradient id={id} cx="0" cy="0" r={outer} gradientUnits="userSpaceOnUse">
          <stop offset={inner / outer} stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
    </motion.svg>
  );
}

/** Particules qui montent (braises, poussière d'or, bulles de lumière). */
export function Embers({
  count,
  color,
  delay = 0,
  width = 340,
  from = 260,
  rise = [180, 360],
  duration = [1.6, 2.6],
  size = [2, 4],
  seed = 7,
  drift = 26,
  stagger = 0.9,
  band = 160,
}: {
  count: number;
  color: string;
  delay?: number;
  width?: number;
  /** Hauteur de départ sous le centre, en px. */
  from?: number;
  rise?: readonly [number, number];
  duration?: readonly [number, number];
  size?: readonly [number, number];
  seed?: number;
  drift?: number;
  stagger?: number;
  /** Hauteur de la bande de départ : les braises ne partent pas toutes de la même ligne. */
  band?: number;
}) {
  const reduced = useReducedMotion();
  const parts = useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: count }, () => ({
      x: (random() - 0.5) * width,
      y: (random() - 0.5) * band,
      lift: rise[0] + random() * (rise[1] - rise[0]),
      drift: (random() - 0.5) * 2 * drift,
      time: duration[0] + random() * (duration[1] - duration[0]),
      lag: random() * stagger,
      size: size[0] + random() * (size[1] - size[0]),
    }));
  }, [count, seed, width, rise, duration, size, drift, stagger, band]);
  if (reduced) return null;
  return (
    <>
      {parts.map((part, index) => (
        <motion.span
          key={index}
          aria-hidden
          className="rounded-full"
          style={{ ...centered(part.size, part.size, part.x, from + part.y), background: color }}
          initial={{ y: 0, x: 0, opacity: 0 }}
          animate={{ y: -part.lift, x: part.drift, opacity: [0, 1, 0.8, 0] }}
          transition={{ delay: delay + part.lag, duration: part.time, ease: "easeOut", opacity: { delay: delay + part.lag, duration: part.time, times: [0, 0.15, 0.7, 1] } }}
        />
      ))}
    </>
  );
}

/** Texte au dégradé métallique (lettres de rang, grands chiffres). */
export function MetalText({ metal, children, style, className = "" }: { metal: keyof typeof METAL; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <span
      className={`font-display font-bold ${className}`}
      style={{ backgroundImage: METAL[metal], WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", ...style }}
    >
      {children}
    </span>
  );
}

/** Légende éditoriale : surtitre mono entre deux filets, titre serif, phrase. */
export function Caption({
  kicker,
  title,
  sub,
  accent,
  color = CREAM,
  delay = 0.5,
  size = 2.1,
}: {
  kicker: string;
  title: ReactNode;
  sub?: ReactNode;
  accent: string;
  color?: string;
  delay?: number;
  /** Taille du titre, en rem. */
  size?: number;
}) {
  return (
    <div className="relative mt-3 flex w-full max-w-[21rem] flex-col items-center text-center">
      <motion.p
        className="flex items-center gap-2.5 font-mono text-[0.62rem] uppercase tracking-[0.24em]"
        style={{ color: accent }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
      >
        <span className="h-px w-7" style={{ background: accent, opacity: 0.55 }} />
        {kicker}
        <span className="h-px w-7" style={{ background: accent, opacity: 0.55 }} />
      </motion.p>
      <motion.h2
        className="mt-2 font-display font-bold leading-[1.04]"
        style={{ color, fontSize: `${size}rem`, letterSpacing: "-0.012em" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.08, duration: 0.5, ease: EASE_OUT }}
      >
        {title}
      </motion.h2>
      {sub && (
        <motion.p
          className="mt-2 max-w-[18rem] text-[0.86rem] leading-snug"
          style={{ color: MUTED }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.22, duration: 0.4 }}
        >
          {sub}
        </motion.p>
      )}
    </div>
  );
}

/** Cadre éditorial à coins (signature des secrets) : quatre équerres qui viennent se poser. */
export function CornerFrame({ color, size = 300, delay = 0, inset = 6 }: { color: string; size?: number; delay?: number; inset?: number }) {
  const corners = [
    { left: inset, top: inset, borderLeft: true, borderTop: true, from: { x: -14, y: -14 } },
    { right: inset, top: inset, borderRight: true, borderTop: true, from: { x: 14, y: -14 } },
    { left: inset, bottom: inset, borderLeft: true, borderBottom: true, from: { x: -14, y: 14 } },
    { right: inset, bottom: inset, borderRight: true, borderBottom: true, from: { x: 14, y: 14 } },
  ];
  return (
    <div aria-hidden className="absolute" style={{ left: "50%", top: "50%", width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}>
      {corners.map((corner, index) => (
        <motion.span
          key={index}
          className="absolute h-4 w-4"
          style={{
            left: corner.left,
            right: corner.right,
            top: corner.top,
            bottom: corner.bottom,
            borderLeft: corner.borderLeft ? `1px solid ${color}` : undefined,
            borderRight: corner.borderRight ? `1px solid ${color}` : undefined,
            borderTop: corner.borderTop ? `1px solid ${color}` : undefined,
            borderBottom: corner.borderBottom ? `1px solid ${color}` : undefined,
          }}
          initial={{ opacity: 0, ...corner.from }}
          animate={{ opacity: 0.8, x: 0, y: 0 }}
          transition={{ delay: delay + index * 0.04, duration: 0.5, ease: EASE_OUT }}
        />
      ))}
    </div>
  );
}

export { EASE_OUT };
