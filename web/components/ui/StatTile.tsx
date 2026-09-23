import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/format";

/** Tuile de statistique : grand chiffre + label. */
export function StatTile({
  value,
  label,
  accent,
  className,
}: {
  value: React.ReactNode;
  label: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("glass glass-card text-center py-4", className)}>
      <p className={cn("tnum text-2xl font-bold", accent && "text-accent-gradient")}>
        {/* Un nombre passé tel quel s'affiche à la française (916,8 et non 916.8). */}
        {typeof value === "number" ? formatDecimal(value) : value}
      </p>
      <p className="mt-1 text-xs text-[--color-fg-muted]">{label}</p>
    </div>
  );
}
