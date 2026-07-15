"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Sélecteur segmenté avec pastille animée (matched geometry via layoutId).
 * Utilisé pour le switch de couches Progrès et les tris.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId = "segmented",
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  layoutId?: string;
  className?: string;
}) {
  return (
    <div className={cn("glass flex rounded-full p-1", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              active ? "text-[#06070d]" : "text-[--color-fg-muted]",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full btn-accent"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
