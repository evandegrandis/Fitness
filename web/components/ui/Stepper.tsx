"use client";

import { useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Incrémenteur tactile (poids / reps). Tap unique = un pas ; **appui maintenu =
 * répétition accélérée** (le pas grossit après quelques répétitions) → on
 * ajuste vite sans marteler le bouton. Grosses cibles tactiles (44 px).
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
  const workingValue = useRef(value); // source de vérité pendant un appui maintenu
  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatCount = useRef(0);

  const clamp = (v: number) => {
    let n = v;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return Math.round(n * 100) / 100;
  };

  const applyStep = (dir: 1 | -1) => {
    // Accélération : gros pas après plusieurs répétitions.
    const factor = repeatCount.current > 14 ? 8 : repeatCount.current > 7 ? 3 : 1;
    const next = clamp(workingValue.current + dir * step * factor);
    workingValue.current = next;
    onChange(next);
  };

  const start = (dir: 1 | -1) => {
    repeatCount.current = 0;
    workingValue.current = value; // reseed depuis la valeur courante à chaque appui
    applyStep(dir); // effet immédiat (couvre le tap simple)
    holdTimeout.current = setTimeout(() => {
      repeatInterval.current = setInterval(() => {
        repeatCount.current += 1;
        applyStep(dir);
      }, 85);
    }, 360);
  };

  const stop = () => {
    if (holdTimeout.current) clearTimeout(holdTimeout.current);
    if (repeatInterval.current) clearInterval(repeatInterval.current);
    holdTimeout.current = null;
    repeatInterval.current = null;
  };

  const renderButton = (dir: 1 | -1, Icon: typeof Minus, aria: string) => (
    <button
      type="button"
      aria-label={aria}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        start(dir);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="grid h-11 w-11 shrink-0 select-none place-items-center rounded-full border border-white/10 bg-white/6 transition active:scale-90"
    >
      <Icon size={20} />
    </button>
  );

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && <span className="text-xs text-[--color-fg-muted]">{label}</span>}
      <div className="flex items-center gap-2">
        {renderButton(-1, Minus, "Diminuer")}
        <span className="tnum min-w-[3.5rem] text-center text-2xl font-bold tabular-nums">
          {value}
          {suffix && <span className="ml-0.5 text-sm text-[--color-fg-muted]">{suffix}</span>}
        </span>
        {renderButton(1, Plus, "Augmenter")}
      </div>
    </div>
  );
}
