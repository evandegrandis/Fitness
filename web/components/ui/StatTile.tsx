import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/format";

/**
 * Taille du chiffre selon sa longueur : une tuile d'une rangée de quatre ne laisse qu'une
 * soixantaine de pixels. « 947,3 » débordait de sa case en grand chiffre (26/09/2026) : le chiffre
 * rétrécit plutôt que de sortir.
 */
export function statValueSize(text: string): string {
  const length = text.length;
  if (length <= 3) return "text-2xl";
  if (length === 4) return "text-xl";
  return "text-lg";
}

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
  // Un nombre passé tel quel s'affiche à la française (916,8 et non 916.8).
  const shown = typeof value === "number" ? formatDecimal(value) : value;
  const size = typeof shown === "string" ? statValueSize(shown) : "text-2xl";
  return (
    <div className={cn("glass glass-card min-w-0 px-2 py-4 text-center", className)}>
      <p className={cn("tnum whitespace-nowrap font-bold leading-8", size, accent && "text-accent-gradient")}>{shown}</p>
      <p className="mt-1 text-xs text-(--color-fg-muted)">{label}</p>
    </div>
  );
}
