"use client";

import type { BenchmarkTone, ExerciseBenchmark } from "@/lib/engines/benchmark";
import { formatDerivedWeight, formatWeight } from "@/components/progress/utils";

/** Couleur sémantique par palier — mapping unique CSS <- tone (benchmark.ts reste agnostique UI). */
const TONE_COLOR: Record<BenchmarkTone, string> = {
  below: "var(--color-warning)",
  progressing: "var(--color-success)",
  elite: "var(--accent)",
};

/**
 * Jauge AVANCÉ → ÉLITE : situe la charge actuelle d'Evan entre les deux
 * bornes du bandeau de référence de l'exercice. Rend `null` si l'exercice
 * n'a pas de benchmark renseigné (25/28 exercices en ont).
 */
export function BenchmarkGauge({
  benchmark,
  increment = 0.5,
}: {
  benchmark: ExerciseBenchmark;
  /** `smallestIncrement` de l'exercice — arrondit l'affichage de la charge courante. */
  increment?: number;
}) {
  if (!benchmark.hasBenchmark || benchmark.low == null || benchmark.high == null || benchmark.position == null || !benchmark.level) {
    return null;
  }

  const clamped = Math.max(0, Math.min(1, benchmark.position));
  const color = TONE_COLOR[benchmark.level.tone];

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <div className="mb-1.5 flex items-center justify-between text-[0.62rem] uppercase tracking-wide text-[--color-fg-faint]">
        <span>Avancé · {formatWeight(benchmark.low)}kg</span>
        <span>Élite · {formatWeight(benchmark.high)}kg</span>
      </div>
      <div className="relative h-2 rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{ width: `${clamped * 100}%`, background: color, opacity: 0.5 }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[left] duration-500"
          style={{ left: `${clamped * 100}%`, background: color, borderColor: "var(--color-ink-950)" }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <span
          className="pill"
          style={{ color, borderColor: `${color}55`, background: `${color}14` }}
        >
          {benchmark.level.label}
        </span>
        <span className="tnum text-xs text-[--color-fg-muted]">
          {formatDerivedWeight(benchmark.currentLoad, increment)}kg
          {benchmark.level.tone === "below" && (benchmark.gapToAdvanced ?? 0) > 0 && (
            <span className="text-[--color-fg-faint]"> · encore {formatDerivedWeight(benchmark.gapToAdvanced!, increment)}kg → avancé</span>
          )}
          {benchmark.level.tone === "progressing" && (benchmark.gapToElite ?? 0) > 0 && (
            <span className="text-[--color-fg-faint]"> · encore {formatDerivedWeight(benchmark.gapToElite!, increment)}kg → élite</span>
          )}
        </span>
      </div>
    </div>
  );
}
