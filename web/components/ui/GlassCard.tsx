import { cn } from "@/lib/utils";

/** Carte en verre dépoli — brique visuelle de base. */
export function GlassCard({
  className,
  strong,
  glow,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean; glow?: boolean }) {
  return (
    <div
      className={cn(
        "glass glass-card",
        strong && "glass-strong",
        glow && "glow-accent",
        className,
      )}
      {...props}
    />
  );
}
