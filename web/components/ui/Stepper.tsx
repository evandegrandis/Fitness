"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/format";

const SCRUB_DEAD_ZONE = 12; // px : en-dessous, le scroll natif de la page gagne
const SCRUB_PX_PER_STEP = 18; // px de glissement par cran

/**
 * Incrémenteur tactile (poids / reps), sans boutons +/- (Evan, 26/09/2026 : glisser suffit, les
 * boutons encombraient et se chevauchaient) :
 *  - **scrub vertical sur le chiffre** = glisser haut/bas pour ajuster vite (le geste principal à
 *    la salle). Zone morte de 12 px pour ne pas voler le scroll de page ;
 *  - tap sur le chevron du dessus ou du dessous = un pas, pour la précision.
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

  // Les chevrons sont la seule affordance visible : cible de 44 px de large, un pas par tap.
  const renderChevron = (dir: 1 | -1) => {
    const Icon = dir === 1 ? ChevronUp : ChevronDown;
    const disabled = dir === 1 ? max != null && value >= max : min != null && value <= min;
    return (
      <button
        type="button"
        aria-label={dir === 1 ? "Augmenter" : "Diminuer"}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(clamp(value + dir * step));
        }}
        className="grid h-7 w-11 place-items-center text-(--color-fg-muted) transition active:scale-90 disabled:opacity-20"
      >
        <Icon size={16} aria-hidden />
      </button>
    );
  };

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && <span className="text-xs text-(--color-fg-muted)">{label}</span>}
      <span
        role="slider"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label ?? "Valeur"}
        tabIndex={0}
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubEnd}
        onPointerCancel={onScrubEnd}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onChange(clamp(value + step));
          if (e.key === "ArrowDown") onChange(clamp(value - step));
        }}
        className={cn(
          "relative flex touch-pan-x cursor-ns-resize select-none flex-col items-center",
          scrubbing && "scale-105"
        )}
      >
        {renderChevron(1)}
        <span className="tnum min-w-[4.5rem] text-center text-2xl font-bold tabular-nums leading-none">
          {formatDecimal(value, 2)}
          {suffix && <span className="ml-0.5 text-sm text-(--color-fg-muted)">{suffix}</span>}
        </span>
        {renderChevron(-1)}
      </span>
    </div>
  );
}
