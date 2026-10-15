"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/format";
import { holdElapsed, moveScrub, SCRUB, startScrub, type ScrubGesture } from "./scrub-gesture";

/**
 * Incrémenteur tactile (poids / reps), sans boutons +/- (Evan, 26/09/2026 : glisser suffit, les
 * boutons encombraient et se chevauchaient) :
 *  - **appui tenu puis glissé vertical sur le chiffre** = ajuster vite (le geste principal à la
 *    salle). Un glissé sans appui fait défiler la page, comme partout ailleurs : avant le
 *    11/10/2026, la tuile captait tout glissé vertical et un simple défilement changeait la charge
 *    (`scrub-gesture.ts`). La tuile s'allume quand le réglage est armé ;
 *  - tap sur le chevron du dessus ou du dessous = un pas, pour la précision.
 *
 * `variant="tile"` (saisie d'une série) : une tuile pleine largeur, libellé et valeur à gauche,
 * chevrons empilés à droite. Deux tuiles côte à côte tiennent sur ~66 px de haut au lieu de ~100,
 * sans laisser les deux réglages serrés au milieu de la carte (Evan, 26/09/2026).
 */
/** Taille de la valeur d'une tuile : 1,65rem, ou moins si elle ne tient pas dans `100cqw`. */
export function tileValueFontSize(characters: number, withSuffix: boolean): string {
  const suffix = withSuffix ? " - 1.3rem" : "";
  return `min(1.65rem, calc((100cqw${suffix}) / ${(Math.max(1, characters) * 0.6).toFixed(2)}))`;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  suffix,
  label,
  className,
  variant = "stack",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  label?: string;
  className?: string;
  variant?: "stack" | "tile";
}) {
  // -- Réglage au glissé sur le chiffre --
  const scrubElement = useRef<HTMLSpanElement | null>(null);
  const gesture = useRef<ScrubGesture | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubBaseValue = useRef(value);
  const scrubLastValue = useRef(value);
  const latest = useRef({ value, onChange });
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    latest.current = { value, onChange };
  });

  const clamp = (v: number) => {
    let n = v;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return Math.round(n * 100) / 100;
  };
  const clampRef = useRef(clamp);
  useEffect(() => {
    clampRef.current = clamp;
  });

  // Le doigt passe par les événements tactiles natifs : seul un `touchmove` non passif peut
  // empêcher la page de défiler une fois le réglage armé, et rien d'autre ne l'en empêche.
  useEffect(() => {
    const element = scrubElement.current;
    if (!element) return;
    const clearHold = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };
    const arm = () => {
      scrubBaseValue.current = latest.current.value;
      scrubLastValue.current = latest.current.value;
      setScrubbing(true);
    };
    const apply = (steps: number) => {
      const next = clampRef.current(scrubBaseValue.current + steps * step);
      if (next !== scrubLastValue.current) {
        scrubLastValue.current = next;
        latest.current.onChange(next);
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      clearHold();
      if (event.touches.length !== 1) {
        gesture.current = null;
        return;
      }
      const touch = event.touches[0];
      gesture.current = startScrub(touch.clientY, touch.clientX, performance.now(), "touch");
      holdTimer.current = setTimeout(() => {
        if (!gesture.current) return;
        const next = holdElapsed(gesture.current, performance.now());
        gesture.current = next;
        if (next.phase === "scrubbing") arm();
      }, SCRUB.HOLD_MS);
    };
    const onTouchMove = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current) return;
      const touch = event.touches[0];
      const wasScrubbing = current.phase === "scrubbing";
      const { gesture: next, steps } = moveScrub(current, touch.clientY, touch.clientX, performance.now());
      gesture.current = next;
      if (next.phase === "scrolling") {
        clearHold();
        return;
      }
      if (next.phase !== "scrubbing") return;
      if (event.cancelable) event.preventDefault();
      if (!wasScrubbing) arm();
      if (steps !== null) apply(steps);
    };
    const onTouchEnd = () => {
      clearHold();
      gesture.current = null;
      setScrubbing(false);
    };
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);
    return () => {
      clearHold();
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [step]);

  // Souris ou stylet : le glissé règle tout de suite (aucun défilement à protéger).
  const onScrubDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.pointerType === "touch") return;
    gesture.current = startScrub(e.clientY, e.clientX, performance.now(), "mouse");
    scrubBaseValue.current = value;
    scrubLastValue.current = value;
  };
  const onScrubMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || !gesture.current) return;
    const wasScrubbing = gesture.current.phase === "scrubbing";
    const { gesture: next, steps } = moveScrub(gesture.current, e.clientY, e.clientX, performance.now());
    gesture.current = next;
    if (next.phase !== "scrubbing") return;
    if (!wasScrubbing) {
      setScrubbing(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (steps === null) return;
    const nextValue = clamp(scrubBaseValue.current + steps * step);
    if (nextValue !== scrubLastValue.current) {
      scrubLastValue.current = nextValue;
      onChange(nextValue);
    }
  };
  const onScrubEnd = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    gesture.current = null;
    setScrubbing(false);
  };

  // Les chevrons sont la seule affordance visible : cible de 44 px de large, un pas par tap.
  const renderChevron = (dir: 1 | -1, className = "h-7 w-11") => {
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
        className={cn("grid place-items-center text-(--color-fg-muted) transition active:scale-90 disabled:opacity-20", className)}
      >
        <Icon size={16} aria-hidden />
      </button>
    );
  };

  const scrubProps = {
    ref: scrubElement,
    role: "slider",
    "aria-valuenow": value,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-label": label ?? "Valeur",
    tabIndex: 0,
    onPointerDown: onScrubDown,
    onPointerMove: onScrubMove,
    onPointerUp: onScrubEnd,
    onPointerCancel: onScrubEnd,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") onChange(clamp(value + step));
      if (e.key === "ArrowDown") onChange(clamp(value - step));
    },
  } as const;

  if (variant === "tile") {
    return (
      <div
        className={cn(
          "flex min-w-0 items-stretch overflow-hidden rounded-2xl border bg-white/[0.03] transition-colors",
          scrubbing ? "border-[color:var(--accent)]/45" : "border-white/[0.07]",
          className
        )}
      >
        <span {...scrubProps} className="@container flex min-w-0 flex-1 touch-pan-y cursor-ns-resize select-none flex-col justify-center px-3.5 py-2.5 [-webkit-touch-callout:none]">
          {label && <span className="eyebrow !text-[0.58rem]">{label}</span>}
          <span
            className={cn("tnum mt-1 truncate font-bold leading-none tabular-nums transition-transform", scrubbing && "scale-105")}
            // La valeur se lit toujours en entier : pleine taille (1,65rem) tant qu'elle tient, sinon
            // la taille qui la fait tenir dans la largeur de la tuile (chasse fixe : 0,6em par
            // caractère, plus le suffixe « kg » en taille fixe). Cas typique : 111,25 kg.
            style={{ fontSize: tileValueFontSize(formatDecimal(value, 2).length, Boolean(suffix)) }}
          >
            {formatDecimal(value, 2)}
            {suffix && <span className="ml-1 text-sm font-medium text-(--color-fg-muted)">{suffix}</span>}
          </span>
        </span>
        <div className="flex w-11 shrink-0 flex-col border-l border-white/[0.06]">
          {renderChevron(1, "w-full flex-1 border-b border-white/[0.06]")}
          {renderChevron(-1, "w-full flex-1")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && <span className="text-xs text-(--color-fg-muted)">{label}</span>}
      <span
        {...scrubProps}
        className={cn(
          "relative flex touch-pan-y cursor-ns-resize select-none flex-col items-center [-webkit-touch-callout:none]",
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
