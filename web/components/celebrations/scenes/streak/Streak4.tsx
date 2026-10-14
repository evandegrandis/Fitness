"use client";

import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import {
  Backdrop,
  CREAM,
  GOLD,
  GOLD_HI,
  Glow,
  ICE,
  MetalText,
  SceneLayout,
} from "../../kit";
import { StreakCaption } from "./caption";

/** Les 16 sommets de l'hypercube (±1 sur x, y, z, w) et ses 32 arêtes (un seul bit qui change). */
const VERTICES = Array.from({ length: 16 }, (_, index) =>
  [0, 1, 2, 3].map((bit) => ((index >> bit) & 1 ? 1 : -1)),
);
const EDGES: Array<[number, number, number]> = [];
for (let a = 0; a < 16; a += 1)
  for (let bit = 0; bit < 4; bit += 1)
    if (!((a >> bit) & 1)) EDGES.push([a, a | (1 << bit), bit]);

/** Rotation dans les plans XW et ZW (la quatrième dimension), puis un quart de tour en Y, projetés deux fois. */
function project(angle: number, tilt: number) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosB = Math.cos(angle * 0.6);
  const sinB = Math.sin(angle * 0.6);
  return VERTICES.map(([x0, y0, z0, w0]) => {
    let x = x0 * cosA - w0 * sinA;
    let w = x0 * sinA + w0 * cosA;
    const z1 = z0 * cosB - w * sinB;
    w = z0 * sinB + w * cosB;
    const k4 = 2.6 / (3 - w);
    x *= k4;
    const y = y0 * k4;
    let z = z1 * k4;
    const xr = x * Math.cos(tilt) - z * Math.sin(tilt);
    z = x * Math.sin(tilt) + z * Math.cos(tilt);
    x = xr;
    const yr = y * Math.cos(0.42) - z * Math.sin(0.42);
    z = y * Math.sin(0.42) + z * Math.cos(0.42);
    const k3 = 4.2 / (5.4 - z);
    return [x * k3 * 52, yr * k3 * 52, z] as const;
  });
}

function paths(angle: number, tilt: number): [string, string, string] {
  const points = project(angle, tilt);
  const out: [string, string, string] = ["", "", ""];
  for (const [a, b, bit] of EDGES) {
    const group = bit === 3 ? 2 : a & 8 ? 1 : 0;
    out[group] +=
      `M${points[a][0].toFixed(1)} ${points[a][1].toFixed(1)}L${points[b][0].toFixed(1)} ${points[b][1].toFixed(1)}`;
  }
  return out;
}

/**
 * 4 · « Tesseract » : le cube de la quatrième dimension. L'hypercube filaire tourne dans un plan
 * qu'on ne peut pas voir : le cube intérieur passe dehors, l'extérieur rentre, sans fin.
 */
export default function Streak4({ count }: { count: number }) {
  const reduced = useReducedMotion();
  const group = useRef<SVGGElement>(null);
  const start = useRef<number | null>(null);
  useAnimationFrame((time) => {
    if (reduced) return;
    if (start.current === null) start.current = time;
    const t = (time - start.current) / 1000;
    // Lancé vite, puis il ralentit et continue : la rotation ne s'arrête jamais tout à fait.
    const angle = 0.3 + 2.4 * (1 - Math.exp(-t * 0.9)) + t * 0.35;
    const next = paths(angle, 0.5 + t * 0.12);
    group.current
      ?.querySelectorAll("path")
      .forEach((path, index) => path.setAttribute("d", next[index]));
  });
  const first = paths(0.3, 0.5);
  const colors = [GOLD_HI, CREAM, ICE];
  return (
    <>
      <Backdrop tint={ICE} veil={0.9} />
      <SceneLayout
        caption={
          <StreakCaption
            count={count}
            sub="Quatre S. Le cube de la quatrième dimension."
            accent={GOLD}
            delay={1.5}
          />
        }
      >
        <Glow color={GOLD} size={300} delay={0.3} strength={30} />
        <motion.svg
          aria-hidden
          viewBox="-150 -150 300 300"
          className="absolute inset-0 overflow-visible"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <g ref={group}>
            {first.map((d, index) => (
              <path
                key={index}
                d={d}
                fill="none"
                stroke={colors[index]}
                strokeWidth={index === 2 ? 1 : 1.8}
                strokeOpacity={index === 2 ? 0.55 : 0.95}
                strokeLinecap="round"
              />
            ))}
          </g>
        </motion.svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1], scale: [0.6, 1.1, 1] }}
            transition={{ delay: 0.9, duration: 0.7 }}
          >
            <MetalText
              metal="or"
              style={{
                fontSize: 64,
                lineHeight: 1,
                display: "block",
                filter: "drop-shadow(0 0 12px rgba(0,0,0,0.9))",
              }}
            >
              {count}
            </MetalText>
          </motion.div>
        </div>
      </SceneLayout>
    </>
  );
}
