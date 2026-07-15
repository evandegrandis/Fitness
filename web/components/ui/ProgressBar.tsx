import { cn } from "@/lib/utils";

/** Barre de progression avec remplissage dégradé accent. */
export function ProgressBar({
  value,
  className,
  tone,
}: {
  /** 0..1 */
  value: number;
  className?: string;
  /** couleur explicite (sinon dégradé d'accent du mode) */
  tone?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-2 w-full rounded-full bg-white/8 overflow-hidden", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background: tone ?? "linear-gradient(90deg, var(--accent), var(--accent-2))",
        }}
      />
    </div>
  );
}
