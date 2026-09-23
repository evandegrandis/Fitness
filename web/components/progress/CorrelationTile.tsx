"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

export interface CorrelationReadout {
  title: string;
  detail: string;
  reliable: boolean;
}

/** Lecture prudente : un petit échantillon ne devient jamais une recommandation causale. */
export function correlationReadout(r: number | null, sampleCount: number): CorrelationReadout {
  if (r === null || sampleCount < 3) {
    return { title: "Pas assez de données", detail: "Continue à remplir le bilan après les séances.", reliable: false };
  }
  if (sampleCount < 20) {
    return {
      title: "Pas assez de recul",
      detail: `${sampleCount} séances utilisables · résultat encore trop instable`,
      reliable: false,
    };
  }
  const abs = Math.abs(r);
  if (abs < 0.3) {
    return { title: "Aucune tendance claire", detail: "Les performances varient sans lien net avec ce facteur.", reliable: false };
  }
  return {
    title: r > 0 ? "Tendance positive possible" : "Tendance négative possible",
    detail: "Signal à surveiller sur davantage de séances : ce n'est pas une preuve de cause.",
    reliable: true,
  };
}

export function CorrelationTile({
  label,
  r,
  sampleCount,
  className,
}: {
  label: string;
  r: number | null;
  sampleCount: number;
  className?: string;
}) {
  const readout = correlationReadout(r, sampleCount);
  return (
    <GlassCard className={cn("py-3.5", className)}>
      <p className="text-xs text-[--color-fg-muted]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[--color-fg]">{readout.title}</p>
      <p className="mt-1 text-[0.68rem] leading-relaxed text-[--color-fg-faint]">{readout.detail}</p>
      {r !== null && (
        <details className="mt-2 text-[0.65rem] text-[--color-fg-faint]">
          <summary className="cursor-pointer">Voir le chiffre technique</summary>
          <p className="mt-1 tnum">
            r = {r >= 0 ? "+" : ""}{r.toFixed(2)} · {sampleCount} séances
          </p>
        </details>
      )}
    </GlassCard>
  );
}
