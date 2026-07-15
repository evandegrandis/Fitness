"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Incrémenteur tactile (poids / reps) — gros boutons, chiffre tabulaire.
 * Zéro-tap-friendly : conçu pour l'usage en séance.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  suffix,
  label,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  label?: string;
  className?: string;
}) {
  const clamp = (v: number) => {
    let n = v;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return Math.round(n * 100) / 100;
  };

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && <span className="text-xs text-[--color-fg-muted]">{label}</span>}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Diminuer"
          onClick={() => onChange(clamp(value - step))}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/6 border border-white/10 active:scale-90 transition"
        >
          <Minus size={18} />
        </button>
        <span className="tnum min-w-16 text-center text-2xl font-bold">
          {value}
          {suffix && <span className="ml-0.5 text-sm text-[--color-fg-muted]">{suffix}</span>}
        </span>
        <button
          type="button"
          aria-label="Augmenter"
          onClick={() => onChange(clamp(value + step))}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/6 border border-white/10 active:scale-90 transition"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
