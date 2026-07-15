"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useWorkoutStore } from "@/lib/store/workout";
import { MusclesLayer } from "@/components/progress/MusclesLayer";
import { ExercisesLayer } from "@/components/progress/ExercisesLayer";
import { GlobalLayer } from "@/components/progress/GlobalLayer";

type Layer = "muscles" | "exercices" | "global";

const LAYER_OPTIONS: { value: Layer; label: string }[] = [
  { value: "muscles", label: "Muscles" },
  { value: "exercices", label: "Exercices" },
  { value: "global", label: "Global" },
];

export default function ProgresPage() {
  const [layer, setLayer] = useState<Layer>("muscles");
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);

  const ready = hasHydratedStorage;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 pb-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-accent-gradient">Progrès</h1>
        <p className="mt-1 text-sm text-[--color-fg-muted]">Ta progression, en détail.</p>
      </header>

      <SegmentedControl
        options={LAYER_OPTIONS}
        value={layer}
        onChange={setLayer}
        layoutId="progres-layer"
        className="mb-5"
      />

      {!ready ? (
        <ProgresSkeleton />
      ) : (
        <motion.div
          key={layer}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {layer === "muscles" && <MusclesLayer />}
          {layer === "exercices" && <ExercisesLayer />}
          {layer === "global" && <GlobalLayer />}
        </motion.div>
      )}
    </main>
  );
}

function ProgresSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="glass glass-card h-20 animate-pulse">
          <div className="h-3 w-1/3 rounded-full bg-white/10" />
          <div className="mt-3 h-2 w-full rounded-full bg-white/6" />
        </div>
      ))}
    </div>
  );
}
