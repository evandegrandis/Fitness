"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Une ligne de réglage : libellé à gauche, contrôle à droite. Le même gabarit partout où l'on règle
 * un exercice (menu de séance, « Tous les réglages ») : sur 375 px, trois grands compteurs côte à
 * côte se chevauchaient et sortaient de l'écran (Evan, 26/09/2026).
 */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-(--color-fg)">{label}</span>
        {hint && <span className="block text-[0.7rem] text-(--color-fg-faint)">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

const SCRUB_DEAD_ZONE = 12;
const SCRUB_PX_PER_STEP = 18;

/**
 * Valeur réglable en ligne, sans boutons +/- : on glisse le chiffre vers le haut ou le bas (un pas
 * tous les 18 px), ou on touche le chevron du dessus ou du dessous pour un pas. Même geste que le
 * compteur de séance.
 */
export function InlineStepper({
  label,
  display,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
}: {
  label: string;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement: boolean;
  canIncrement: boolean;
}) {
  const start = useRef<number | null>(null);
  const applied = useRef(0);
  const active = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const step = (dir: 1 | -1) => {
    if (dir === 1 && canIncrement) onIncrement();
    if (dir === -1 && canDecrement) onDecrement();
  };
  const chevron = (dir: 1 | -1) => {
    const Icon = dir === 1 ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        aria-label={`${label} : ${dir === 1 ? "augmenter" : "diminuer"}`}
        disabled={dir === 1 ? !canIncrement : !canDecrement}
        onClick={(event) => {
          event.stopPropagation();
          step(dir);
        }}
        className="grid h-6 w-full place-items-center text-(--color-fg-muted) transition active:scale-90 disabled:opacity-20"
      >
        <Icon size={15} aria-hidden />
      </button>
    );
  };
  return (
    <span
      role="group"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(event) => {
        start.current = event.clientY;
        applied.current = 0;
        active.current = false;
      }}
      onPointerMove={(event) => {
        if (start.current === null) return;
        const dy = start.current - event.clientY; // haut = +
        if (!active.current) {
          if (Math.abs(dy) < SCRUB_DEAD_ZONE) return;
          active.current = true;
          setScrubbing(true);
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        }
        const target = Math.trunc((dy - Math.sign(dy) * SCRUB_DEAD_ZONE) / SCRUB_PX_PER_STEP);
        // Un pas par événement : les rappels lisent l'état du rendu précédent.
        if (target > applied.current) { applied.current += 1; step(1); }
        else if (target < applied.current) { applied.current -= 1; step(-1); }
      }}
      onPointerUp={() => { start.current = null; active.current = false; setScrubbing(false); }}
      onPointerCancel={() => { start.current = null; active.current = false; setScrubbing(false); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") step(1);
        if (event.key === "ArrowDown") step(-1);
      }}
      className={`flex w-[6.5rem] shrink-0 touch-pan-x cursor-ns-resize select-none flex-col items-center transition ${scrubbing ? "scale-105" : ""}`}
    >
      {chevron(1)}
      <output aria-live="polite" className="tnum text-base leading-none text-(--color-fg)">
        {display}
      </output>
      {chevron(-1)}
    </span>
  );
}
