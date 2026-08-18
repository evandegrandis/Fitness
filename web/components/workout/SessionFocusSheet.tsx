"use client";

import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkoutStore } from "@/lib/store/workout";
import { sessionFocus, type SessionFocusRow } from "@/lib/engines/session-focus";
import { parentShortName } from "@/lib/models/muscles";
import type { WorkoutSession } from "@/lib/models/types";

/**
 * « Quoi faire maintenant ? ». Un bouton discret dans l'en-tête, un panneau qui se lit entre deux
 * séries : ce qui reste à couvrir sur 7 jours, ce qui est déjà fait aujourd'hui.
 *
 * Recalculé à l'ouverture depuis la séance en cours, donc il suit ce qui vient d'être loggué.
 */
export function SessionFocusButton({ session }: { session: WorkoutSession }) {
  const [open, setOpen] = useState(false);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);

  const focus = useMemo(
    () => sessionFocus(history, catalog, goals, session),
    [history, catalog, goals, session]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir quoi prioriser maintenant"
        className="pill grid h-11 w-11 shrink-0 place-items-center rounded-full"
      >
        <Target size={17} className="text-[--color-fg-muted]" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel="Priorités de la séance">
        <h2 className="font-display text-lg font-bold text-[--color-fg]">Quoi faire maintenant</h2>

        {focus.priorities.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-[--color-fg-muted]">
              Ce qu&apos;il reste à couvrir sur 7 jours, le plus en retard en premier.
            </p>
            <div className="mt-3 flex flex-col">
              {focus.priorities.map((row, i) => (
                <FocusRow key={row.parent} row={row} isLast={i === focus.priorities.length - 1} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-[--color-fg]">Tous tes objectifs 7 jours sont couverts.</p>
        )}

        {focus.workedToday.length > 0 && (
          <div className="mt-5 border-t border-white/[0.06] pt-3">
            <p className="eyebrow">Déjà fait aujourd&apos;hui</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {focus.workedToday.map((row) => (
                <span key={row.parent} className="pill text-xs text-[--color-fg-muted]">
                  {parentShortName[row.parent]} · {row.doneThisSession}
                </span>
              ))}
            </div>
          </div>
        )}

        {focus.dormantCount > 0 && (
          <p className="mt-4 text-[0.7rem] text-[--color-fg-faint]">
            {focus.dormantCount} groupe{focus.dormantCount > 1 ? "s" : ""} en retard mais sans séance
            depuis un mois : hors programme, donc non suggéré{focus.dormantCount > 1 ? "s" : ""}.
          </p>
        )}
      </Sheet>
    </>
  );
}

function FocusRow({ row, isLast }: { row: SessionFocusRow; isLast: boolean }) {
  const pct = Math.min(100, Math.round(row.coverage * 100));
  return (
    <div className={isLast ? "py-2" : "border-b border-white/[0.06] py-2"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-[--color-fg]">
          {parentShortName[row.parent]}
        </span>
        <span className="tnum text-xs text-[--color-fg-muted]">
          {row.doneThisSession > 0 && (
            <span style={{ color: "rgb(110,231,183)" }}>+{row.doneThisSession} · </span>
          )}
          {Math.round(row.remaining * 10) / 10} à faire
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
}
