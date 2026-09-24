"use client";

import { motion } from "framer-motion";
import type { CoverageStatus, ParentMuscleProgress } from "@/lib/engines/effective-sets";
import { parentShortName } from "@/lib/models/muscles";
import type { CardioProgress } from "@/lib/engines/cardio";

const STATUS_COLOR: Record<CoverageStatus, string> = {
  covered: "var(--color-fg-muted)",
  onTrack: "var(--color-fg-muted)",
  toStrengthen: "var(--color-warning)",
  priority: "var(--color-danger)",
};

const MAX_ROWS = 6;

/**
 * Relevé compact des priorités 7 jours — style éditorial (labels mono,
 * filets fins, valeur alignée à droite) plutôt que des chips empilées.
 * Une ligne par muscle en déficit, triée par urgence, avec une fine barre
 * de progression sous le nom. Affichée sur QuickStart.
 */
export function WeeklyPriority({
  priorities,
  cardio,
}: {
  priorities: ParentMuscleProgress[];
  cardio?: CardioProgress;
}) {
  const rows = priorities.slice(0, MAX_ROWS);
  return (
    <div className="glass glass-card">
      <p className="eyebrow">Objectifs de la semaine</p>
      {rows.length === 0 ? (
        <p className="mt-2.5 text-sm text-(--color-fg)">Tous couverts ✓</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {rows.map((p, i) => (
            <PriorityRow key={p.parent} progress={p} index={i} isLast={i === rows.length - 1} />
          ))}
        </div>
      )}
      {cardio && <CardioRow cardio={cardio} separated={rows.length > 0} />}
    </div>
  );
}

/**
 * Le cardio partage la ligne des objectifs musculaires : même modèle mental, même endroit.
 * Il porte sa propre couleur (vert) pour rester distinguable d'un déficit musculaire.
 */
function CardioRow({ cardio, separated }: { cardio: CardioProgress; separated: boolean }) {
  const done = cardio.remainingMinutes === 0;
  return (
    <div className={separated ? "mt-3 border-t border-white/[0.06] pt-3" : "mt-3"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-(--color-fg-muted)">Cardio</span>
        <span className="tnum text-sm font-semibold" style={{ color: done ? "rgb(110,231,183)" : "var(--color-fg)" }}>
          {cardio.minutes}/{cardio.goalMinutes} min
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: done ? "rgb(110,231,183)" : "rgba(110,231,183,0.55)" }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(cardio.ratio * 100)}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 30 }}
        />
      </div>
    </div>
  );
}

function PriorityRow({
  progress,
  index,
  isLast,
}: {
  progress: ParentMuscleProgress;
  index: number;
  isLast: boolean;
}) {
  const color = STATUS_COLOR[progress.status];
  const label = parentShortName[progress.parent] ?? progress.parent;
  const pct = Math.round(progress.coverage * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 400, damping: 32 }}
      className="flex items-center gap-3 py-2"
      style={!isLast ? { borderBottom: "1px solid var(--line)" } : undefined}
    >
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.1em] text-(--color-fg)">{label}</span>
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${Math.max(pct, 4)}%`, background: color }}
          />
        </div>
      </div>
      <span className="tnum shrink-0 text-sm font-semibold" style={{ color }}>
        {Math.ceil(progress.remaining)}
      </span>
    </motion.div>
  );
}
