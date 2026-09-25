"use client";

import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronRight, Star } from "lucide-react";
import { SwipeRow } from "@/components/ui/SwipeRow";
import type { Exercise, WorkoutSession } from "@/lib/models/types";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { sessionDurationLabel } from "./historyHelpers";
import { useSessionCalories } from "./SessionCalories";
import { formatDecimal } from "@/lib/format";

function relativeDay(date: Date): string {
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return "Hier";
  return format(date, "EEEE d MMM", { locale: fr });
}

/**
 * Ligne de séance cliquable (→ détail) : jour relatif + heure, badge ⭐ PR,
 * méta (N sets · durée · N exos · N supersets), 2 premiers exos + "+N".
 *
 * Suppression UNIFORMISÉE avec la séance active : swipe DROITE = suppression
 * directe (fond rouge "Supprimer"), sans bouton de confirmation superposé.
 * L'annulation reste possible via le toast d'undo au niveau page
 * (`historique/page.tsx`), donc le geste est réversible.
 */
export function SessionRow({
  session,
  exercises,
  prCount,
  onDelete,
}: {
  session: WorkoutSession;
  exercises: Exercise[];
  prCount: number;
  onDelete: (id: string) => void;
}) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const ordered = session.exercises
    .filter(
      (logged) =>
        physiologicalSetUnits(logged.sets, {
          increment: exerciseById.get(logged.exerciseId)?.smallestIncrement,
        }) > 0
    )
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const totalSets = Math.round(
    ordered.reduce(
      (acc, logged) =>
        acc +
        physiologicalSetUnits(logged.sets, {
          increment: exerciseById.get(logged.exerciseId)?.smallestIncrement,
        }),
      0
    ) * 10
  ) / 10;
  const duration = sessionDurationLabel(session, exercises);
  const calories = useSessionCalories(session, exercises);
  const supersetCount = session.supersetGroups.length;
  const names = ordered.map((e) => e.exerciseName);
  const shown = names.slice(0, 2);
  const extra = names.length - shown.length;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
      <SwipeRow onDelete={() => onDelete(session.id)}>
        <Link
          href={`/historique/${session.id}`}
          draggable={false}
          className="glass glass-card flex items-center gap-3 transition active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-(--color-fg)">
                {relativeDay(session.date)}{" "}
                <span className="text-(--color-fg-faint)">· {format(session.startTime, "HH:mm")}</span>
              </p>
              {prCount > 0 && (
                <span className="pill shrink-0 border-amber-400/40 bg-amber-400/10 text-amber-300">
                  <Star size={11} fill="currentColor" />
                  {prCount}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-(--color-fg-muted)">
              {formatDecimal(totalSets)} séries · {duration} · {ordered.length} exos
              {supersetCount > 0 ? ` · ${supersetCount} superset${supersetCount > 1 ? "s" : ""}` : ""}
              {(session.cardioEntries?.length ?? 0) > 0 ? " · cardio" : ""}
              {calories.kcal > 0 ? ` · ~${calories.kcal} kcal` : ""}
            </p>
            <p className="mt-1 truncate text-xs text-(--color-fg-faint)">
              {shown.join(", ")}
              {extra > 0 && ` +${extra}`}
            </p>
          </div>

          <ChevronRight size={16} className="shrink-0 text-(--color-fg-faint)" />
        </Link>
      </SwipeRow>
    </motion.div>
  );
}
