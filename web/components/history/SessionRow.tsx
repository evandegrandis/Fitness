"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronRight, Star, Trash2 } from "lucide-react";
import { completedWorkSets, type WorkoutSession } from "@/lib/models/types";
import { cn } from "@/lib/utils";

function relativeDay(date: Date): string {
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return "Hier";
  return format(date, "EEEE d MMM", { locale: fr });
}

function durationLabel(session: WorkoutSession): string | null {
  if (!session.endTime) return null;
  const minutes = Math.round((session.endTime.getTime() - session.startTime.getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/**
 * Ligne de séance cliquable (→ détail) : jour relatif + heure, badge ⭐ PR,
 * méta (N sets · durée · N exos · N supersets), 2 premiers exos + "+N".
 * Le geste "supprimer" est exposé via un bouton de suppression avec confirmation.
 */
export function SessionRow({
  session,
  prCount,
  onDelete,
}: {
  session: WorkoutSession;
  prCount: number;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const totalSets = ordered.reduce((acc, e) => acc + completedWorkSets(e).length, 0);
  const duration = durationLabel(session);
  const supersetCount = session.supersetGroups.length;
  const names = ordered.map((e) => e.exerciseName);
  const shown = names.slice(0, 2);
  const extra = names.length - shown.length;

  function handleDeleteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onDelete(session.id);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="relative"
    >
      <Link
        href={`/historique/${session.id}`}
        className="glass glass-card flex items-center gap-3 transition active:scale-[0.99]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[--color-fg]">
              {relativeDay(session.date)} <span className="text-[--color-fg-faint]">· {format(session.startTime, "HH:mm")}</span>
            </p>
            {prCount > 0 && (
              <span className="pill shrink-0 border-amber-400/40 bg-amber-400/10 text-amber-300">
                <Star size={11} fill="currentColor" />
                {prCount}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[--color-fg-muted]">
            {totalSets} sets{duration ? ` · ${duration}` : ""} · {ordered.length} exos
            {supersetCount > 0 ? ` · ${supersetCount} superset${supersetCount > 1 ? "s" : ""}` : ""}
          </p>
          <p className="mt-1 truncate text-xs text-[--color-fg-faint]">
            {shown.join(", ")}
            {extra > 0 && ` +${extra}`}
          </p>
        </div>

        <button
          type="button"
          onClick={handleDeleteClick}
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full border transition",
            confirming
              ? "border-rose-400/50 bg-rose-400/15 text-rose-300"
              : "border-white/10 bg-white/5 text-[--color-fg-faint]"
          )}
          aria-label="Supprimer la séance"
        >
          <Trash2 size={14} />
        </button>
        <ChevronRight size={16} className="shrink-0 text-[--color-fg-faint]" />
      </Link>
      {confirming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-x-3 -bottom-2 flex justify-end gap-2"
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirming(false);
            }}
            className="pill bg-white/10 text-[10px]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleDeleteClick}
            className="pill border-rose-400/50 bg-rose-400/20 text-[10px] text-rose-200"
          >
            Confirmer la suppression
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
