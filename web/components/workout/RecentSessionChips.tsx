"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import type { WorkoutSession } from "@/lib/models/types";

const MAX_CHIPS = 3;

/** Signature de composition d'une séance : ids d'exercices triés, dédupliqués. */
function compositionKey(session: WorkoutSession): string {
  return [...new Set(session.exercises.map((e) => e.exerciseId))].sort().join("|");
}

function formatChipLabel(session: WorkoutSession): string {
  const names = [...new Set(session.exercises.map((e) => e.exerciseName))];
  if (names.length === 0) return "Séance vide";
  if (names.length <= 2) return names.join(" · ");
  return `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;
}

function formatRelativeDate(date: Date): string {
  const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  const weeks = Math.round(days / 7);
  return `Il y a ${weeks}sem`;
}

/**
 * Chips des dernières séances distinctes (dédupliquées par composition
 * d'exercices) — 1 tap pour démarrer une séance identique à une séance
 * récente, sans repasser par "Répéter la dernière" si ce n'est pas la bonne.
 */
export function RecentSessionChips({
  history,
  onStart,
}: {
  history: WorkoutSession[];
  onStart: (session: WorkoutSession) => void;
}) {
  const distinct = useMemo(() => {
    const seen = new Set<string>();
    const result: WorkoutSession[] = [];
    // Ignore la toute dernière séance : déjà couverte par "Répéter la dernière".
    for (const session of history.slice(1)) {
      if (session.exercises.length === 0) continue;
      const key = compositionKey(session);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(session);
      if (result.length >= MAX_CHIPS) break;
    }
    return result;
  }, [history]);

  if (distinct.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Séances récentes</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {distinct.map((session, i) => (
          <motion.button
            key={session.id}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, type: "spring", stiffness: 400, damping: 30 }}
            onClick={() => onStart(session)}
            className="glass flex shrink-0 flex-col items-start gap-0.5 rounded-2xl px-3.5 py-2.5 text-left active:scale-[0.97] transition"
            style={{ maxWidth: "13rem" }}
          >
            <span className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[--color-fg-faint]">
              <CalendarClock size={11} />
              {formatRelativeDate(session.date)}
            </span>
            <span className="truncate text-sm font-semibold text-[--color-fg]">{formatChipLabel(session)}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
