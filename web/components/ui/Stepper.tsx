"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const SCRUB_DEAD_ZONE = 12; // px : en-dessous, le scroll natif de la page gagne
const SCRUB_PX_PER_STEP = 18; // px de glissement par cran

/**
 * Incrémenteur tactile (poids / reps). Trois voies d'ajustement :
 *  - tap unique sur +/- = un pas ;
 *  - appui maintenu sur +/- = répétition accélérée (grands écarts) ;
 *  - **scrub vertical sur le chiffre** = glisser haut/bas pour ajuster vite
 *    (le geste principal à la salle). Zone morte de 12 px pour ne pas voler le
 *    scroll de page ; chevrons fantômes persistants comme affordance.
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

  // -- Scrub vertical sur le chiffre --
  const scrubStartY = useRef<number | null>(null);
  const scrubBaseValue = useRef(value);
  const scrubActive = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);

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

  const onScrubDown = (e: React.PointerEvent) => {
    scrubStartY.current = e.clientY;
    scrubBaseValue.current = value;
    scrubActive.current = false;
  };
  const onScrubMove = (e: React.PointerEvent) => {
    if (scrubStartY.current === null) return;
    const dy = scrubStartY.current - e.clientY; // haut = +
    if (!scrubActive.current) {
      if (Math.abs(dy) < SCRUB_DEAD_ZONE) return; // laisse le scroll de page gagner
      scrubActive.current = true;
      setScrubbing(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const steps = Math.trunc((dy - Math.sign(dy) * SCRUB_DEAD_ZONE) / SCRUB_PX_PER_STEP);
    const next = clamp(scrubBaseValue.current + steps * step);
    if (next !== value) onChange(next);
  };
  const onScrubEnd = () => {
    scrubStartY.current = null;
    if (scrubActive.current) {
      scrubActive.current = false;
      setScrubbing(false);
    }
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
        <span
          role="slider"
          aria-valuenow={value}
          aria-label={label ?? "Valeur"}
          tabIndex={0}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubEnd}
          onPointerCancel={onScrubEnd}
          className={cn(
            "relative flex touch-pan-x cursor-ns-resize select-none flex-col items-center",
            scrubbing && "scale-105"
          )}
        >
          <ChevronUp size={11} className="opacity-30" />
          <span className="tnum min-w-[3.5rem] text-center text-2xl font-bold tabular-nums leading-none">
            {value}
            {suffix && <span className="ml-0.5 text-sm text-[--color-fg-muted]">{suffix}</span>}
          </span>
          <ChevronDown size={11} className="opacity-30" />
        </span>
        {renderButton(1, Plus, "Augmenter")}
      </div>
    </div>
  );
}
