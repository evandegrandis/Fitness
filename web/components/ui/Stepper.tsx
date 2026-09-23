"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/format";

const SCRUB_DEAD_ZONE = 12; // px : en-dessous, le scroll natif de la page gagne
const SCRUB_PX_PER_STEP = 18; // px de glissement par cran

/**
 * Incrémenteur tactile (poids / reps). Deux voies d'ajustement :
 *  - tap unique sur +/- = un pas ;
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
  // -- Scrub vertical sur le chiffre --
  const scrubStartY = useRef<number | null>(null);
  const scrubBaseValue = useRef(value);
  const scrubLastValue = useRef(value);
  const scrubActive = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);

  const clamp = (v: number) => {
    let n = v;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return Math.round(n * 100) / 100;
  };

  const onScrubDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    scrubStartY.current = e.clientY;
    scrubBaseValue.current = value;
    scrubLastValue.current = value;
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
    if (next !== scrubLastValue.current) {
      scrubLastValue.current = next;
      onChange(next);
    }
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
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onChange(clamp(value + dir * step));
      }}
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
            {formatDecimal(value, 2)}
            {suffix && <span className="ml-0.5 text-sm text-[--color-fg-muted]">{suffix}</span>}
          </span>
          <ChevronDown size={11} className="opacity-30" />
        </span>
        {renderButton(1, Plus, "Augmenter")}
      </div>
    </div>
  );
}
