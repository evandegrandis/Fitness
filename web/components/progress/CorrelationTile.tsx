"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

/** Interprétation FR d'un coefficient de corrélation de Pearson. */
export function interpretCorrelation(r: number): string {
  const abs = Math.abs(r);
  const strength = abs >= 0.6 ? "forte" : abs >= 0.3 ? "modérée" : "faible";
  const direction = r >= 0 ? "positive" : "négative";
  return `Corrélation ${strength} ${direction}`;
}

export function CorrelationTile({ label, r, className }: { label: string; r: number | null; className?: string }) {
  return (
    <GlassCard className={cn("text-center py-3.5", className)}>
      <p className="text-xs text-[--color-fg-muted]">{label}</p>
      {r === null ? (
        <p className="mt-1.5 text-xs text-[--color-fg-faint]">Pas assez de données</p>
      ) : (
        <>
          <p
            className="tnum mt-1 text-xl font-bold"
            style={{ color: Math.abs(r) >= 0.3 ? "var(--accent)" : "var(--color-fg-muted)" }}
          >
            {r >= 0 ? "+" : ""}
            {r.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-[--color-fg-faint]">{interpretCorrelation(r)}</p>
        </>
      )}
    </GlassCard>
  );
}
