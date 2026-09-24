"use client";

import { motion } from "framer-motion";
import { Dumbbell, Flame, Leaf, type LucideIcon } from "lucide-react";
import { MODES, MODE_ORDER, type WorkoutMode } from "@/lib/theme/modes";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { Dumbbell, Flame, Leaf };

/** Sélecteur des 3 modes de séance, avec glow/anim sur la carte sélectionnée. */
export function ModePicker({ value, onChange }: { value: WorkoutMode; onChange: (mode: WorkoutMode) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {MODE_ORDER.map((id) => {
        const meta = MODES[id];
        const Icon = ICONS[meta.icon] ?? Dumbbell;
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "glass relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 transition",
              active ? "glass-strong" : "opacity-70"
            )}
            style={
              active
                ? { boxShadow: `0 0 0 1.5px ${meta.accent}66, 0 10px 30px ${meta.accent}33` }
                : undefined
            }
          >
            {active && (
              <motion.span
                layoutId="mode-picker-glow"
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{ background: `linear-gradient(160deg, ${meta.accent}22, transparent)` }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <Icon size={20} style={{ color: active ? meta.accent : "var(--color-fg-muted)" }} />
            <span className={cn("text-xs font-semibold", active ? "text-(--color-fg)" : "text-(--color-fg-muted)")}>
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
