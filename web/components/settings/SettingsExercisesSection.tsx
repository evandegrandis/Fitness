"use client";

import { useState } from "react";
import { ChevronRight, Dumbbell } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import type { Exercise } from "@/lib/models/types";
import { ExerciseList } from "@/components/exercise/ExerciseList";

/** Entrée "Exercices" dans Réglages — ouvre la gestion complète du catalogue en Sheet plein écran. */
export function SettingsExercisesSection({ catalog }: { catalog: Exercise[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <GlassCard>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5">
            <Dumbbell size={16} style={{ color: "var(--accent)" }} />
            <div className="text-left">
              <p className="text-sm font-semibold text-(--color-fg)">Exercices</p>
              <p className="text-xs text-(--color-fg-muted)">{catalog.length} dans le catalogue</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-(--color-fg-faint)" />
        </button>
      </GlassCard>

      <Sheet open={open} onClose={() => setOpen(false)} full>
        <h2 className="font-display text-lg font-bold text-(--color-fg)">Gestion des exercices</h2>
        <div className="mt-4">
          <ExerciseList catalog={catalog} />
        </div>
      </Sheet>
    </>
  );
}
