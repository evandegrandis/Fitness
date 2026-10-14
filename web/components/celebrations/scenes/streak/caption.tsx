"use client";

import { Backdrop, Caption, GOLD, MetalText, SceneLayout } from "../../kit";

const UNITS = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS: Record<number, string> = { 10: "dix", 20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante" };

/** Un nombre en toutes lettres, de 1 à 69 (au-delà : en chiffres). */
export function frenchNumber(count: number): string {
  if (count <= 16) return UNITS[count] ?? String(count);
  if (count < 20) return `dix-${UNITS[count - 10]}`;
  if (count >= 70) return String(count);
  const tens = Math.floor(count / 10) * 10;
  const unit = count % 10;
  if (unit === 0) return TENS[tens];
  return unit === 1 ? `${TENS[tens]} et un` : `${TENS[tens]}-${UNITS[unit]}`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Légende commune des scènes de série : « Douze S d'affilée » et la phrase de la scène. */
export function StreakCaption({ count, sub, accent, delay = 0.9 }: { count: number; sub?: string; accent: string; delay?: number }) {
  return (
    <Caption
      kicker="Série de S"
      title={count === 1 ? "Premier S" : `${capitalized(frenchNumber(count))} S d'affilée`}
      sub={sub ?? "La série continue."}
      accent={accent}
      delay={delay}
    />
  );
}

/** Repli quand la scène n'a pas pu être chargée (hors réseau) : le compte et sa légende. */
export function StreakFallback({ count }: { count: number }) {
  return (
    <>
      <Backdrop tint={GOLD} />
      <SceneLayout caption={<StreakCaption count={count} accent={GOLD} delay={0.3} />}>
        <div className="absolute inset-0 grid place-items-center">
          <MetalText metal="or" style={{ fontSize: 120, lineHeight: 1 }}>
            {count}
          </MetalText>
        </div>
      </SceneLayout>
    </>
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
