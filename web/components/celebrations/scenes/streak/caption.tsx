"use client";

import { Caption } from "../../kit";
import { nextStreakMilestone } from "./milestones";

const WORDS: Record<number, string> = { 2: "Deux", 3: "Trois", 4: "Quatre", 5: "Cinq", 7: "Sept", 10: "Dix", 15: "Quinze", 20: "Vingt", 25: "Vingt-cinq" };

/** Légende commune des scènes de série : « 5 S d'affilée » et la phrase de la scène. */
export function StreakCaption({ count, sub, accent, delay = 0.9 }: { count: number; sub?: string; accent: string; delay?: number }) {
  return (
    <Caption
      kicker="Série de S"
      title={`${WORDS[count] ?? count} S d'affilée`}
      sub={sub ?? `La série continue. Prochain palier : ${nextStreakMilestone(count)}.`}
      accent={accent}
      delay={delay}
    />
  );
}

/** Médaillon S : le motif de toutes les scènes de série. */
export function SMedal({ size = 64, ring = "#d8b26a" }: { size?: number; ring?: string }) {
  return (
    <span
      className="grid place-items-center rounded-full"
      style={{ width: size, height: size, border: `1.5px solid ${ring}`, background: "radial-gradient(circle at 50% 35%, #2a2418, #0c0b09 70%)", boxShadow: `0 0 0 4px rgba(7,7,8,0.9), 0 0 0 5px color-mix(in srgb, ${ring} 35%, transparent)` }}
    >
      <span
        className="font-display font-bold"
        style={{ fontSize: size * 0.56, lineHeight: 1, backgroundImage: "linear-gradient(180deg, #fbeec4 0%, #ecc97f 40%, #c99a4c 65%, #8f6a2c 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", transform: "translateY(2px)" }}
      >
        S
      </span>
    </span>
  );
}
