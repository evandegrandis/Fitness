"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Target } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkoutStore } from "@/lib/store/workout";
import {
  sessionFocus,
  type SessionFocusExerciseSuggestion,
  type SessionFocusRow,
} from "@/lib/engines/session-focus";
import { parentShortName } from "@/lib/models/muscles";
import { formatDecimal } from "@/lib/format";
import type { WorkoutSession } from "@/lib/models/types";

/**
 * « Quoi faire maintenant ? ». Un bouton discret dans l'en-tête, un panneau qui se lit entre deux
 * séries : ce qui reste à construire cette semaine, ce qui est déjà fait aujourd'hui.
 *
 * Recalculé à l'ouverture depuis la séance en cours, donc il suit ce qui vient d'être loggué.
 */
export function SessionFocusButton({
  session,
  onExerciseSelected,
}: {
  session: WorkoutSession;
  onExerciseSelected?: (loggedExerciseId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const addExercise = useWorkoutStore((s) => s.addExercise);

  const focus = useMemo(
    () => sessionFocus(history, catalog, goals, session),
    [history, catalog, goals, session]
  );

  const chooseExercise = (suggestion: SessionFocusExerciseSuggestion) => {
    const current = useWorkoutStore.getState().active;
    if (!current) return;
    const existing = current.exercises.find(
      (logged) => logged.exerciseId === suggestion.exerciseId
    );
    if (existing) {
      onExerciseSelected?.(existing.id);
      setOpen(false);
      return;
    }

    const previousIds = new Set(current.exercises.map((logged) => logged.id));
    addExercise(suggestion.exerciseId);
    const added = useWorkoutStore
      .getState()
      .active?.exercises.find((logged) => !previousIds.has(logged.id));
    if (added) onExerciseSelected?.(added.id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir quoi prioriser maintenant"
        className="pill grid h-11 w-11 shrink-0 place-items-center rounded-full"
      >
        <Target size={17} className="text-(--color-fg-muted)" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel="Priorités de la séance">
        <h2 className="font-display text-lg font-bold text-(--color-fg)">Quoi faire maintenant</h2>

        {focus.priorities.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-(--color-fg-muted)">
              {focus.weekPlan.sessionsLeftIncludingToday > 1
                ? `Séance ${focus.weekPlan.sessionsDoneThisWeek + 1} sur ${focus.weekPlan.habitualSessionsPerWeek} habituelles : le trait clair marque ta part du jour.`
                : "Dernière séance habituelle de la semaine : tout le reste est pour aujourd'hui."}
            </p>
            <div className="mt-3 flex flex-col">
              {focus.priorities.map((row, i) => (
                <FocusRow
                  key={row.parent}
                  row={row}
                  sessionsLeft={focus.weekPlan.sessionsLeftIncludingToday}
                  isLast={i === focus.priorities.length - 1}
                  onSuggestion={chooseExercise}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-(--color-fg)">Tous tes objectifs de la semaine sont couverts.</p>
        )}

        {focus.workedToday.length > 0 && (
          <div className="mt-5 border-t border-white/[0.06] pt-3">
            <p className="eyebrow">Déjà fait aujourd&apos;hui</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {focus.workedToday.map((row) => (
                <span key={row.parent} className="pill text-xs text-(--color-fg-muted)">
                  {parentShortName[row.parent]} · {formatDecimal(row.doneThisSession)}
                </span>
              ))}
            </div>
          </div>
        )}

        {focus.tracked.length > 0 && (
          <div className="mt-5 border-t border-white/[0.06] pt-3">
            <p className="eyebrow">Suivi, sans objectif</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {focus.tracked.map((row) => (
                <span key={row.parent} className="pill text-xs text-(--color-fg-muted)">
                  {parentShortName[row.parent]} · {formatDecimal(row.effectiveSets)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[0.7rem] text-(--color-fg-faint)">
              Volume de la semaine, à titre indicatif : aucun quota, rien à rattraper.
            </p>
          </div>
        )}

        {focus.dormantCount > 0 && (
          <p className="mt-4 text-[0.7rem] text-(--color-fg-faint)">
            {focus.dormantCount} groupe{focus.dormantCount > 1 ? "s" : ""} sans travail récent : conservé{focus.dormantCount > 1 ? "s" : ""} à titre informatif, tout en bas.
          </p>
        )}
      </Sheet>
    </>
  );
}

function FocusRow({
  row,
  sessionsLeft,
  isLast,
  onSuggestion,
}: {
  row: SessionFocusRow;
  sessionsLeft: number;
  isLast: boolean;
  onSuggestion: (suggestion: SessionFocusExerciseSuggestion) => void;
}) {
  const pct = Math.min(100, Math.round(row.coverage * 100));
  const lastTrained = row.daysSinceLastTrained === null
    ? "jamais enregistré"
    : row.daysSinceLastTrained === 0
      ? "travaillé aujourd’hui"
      : `il y a ${row.daysSinceLastTrained} j`;
  // Repères de séance : ce qui restait au début de la séance, découpé en autant de parts qu'il
  // reste de séances habituelles. Le premier trait (clair) est la fin de la part du jour.
  const ticks: { left: number; today: boolean }[] = [];
  if (row.goalSets > 0 && sessionsLeft > 1) {
    for (let k = 1; k < sessionsLeft; k += 1) {
      const position = (row.doneBeforeSession + k * row.todayShare) / row.goalSets;
      if (position > 0 && position < 1) ticks.push({ left: position * 100, today: k === 1 });
    }
  }
  const todayReached = row.doneThisSession >= row.todayShare - 0.05;
  return (
    <div className={`${isLast ? "py-3" : "border-b border-white/[0.06] py-3"} ${row.isDormant ? "opacity-55" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-(--color-fg)">
          {parentShortName[row.parent]}
        </span>
        <span className="tnum text-xs text-(--color-fg-muted)">
          {row.doneThisSession > 0 && (
            <span style={{ color: "rgb(110,231,183)" }}>+{formatDecimal(row.doneThisSession)} · </span>
          )}
          {formatDecimal(row.remaining)} à faire
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[0.68rem] text-(--color-fg-faint)">
        <span className="tnum">{formatDecimal(row.effectiveSets)} / {row.goalSets} cette semaine</span>
        {sessionsLeft > 1 && row.todayShare > 0 ? (
          <span className="tnum" style={todayReached ? { color: "rgb(110,231,183)" } : undefined}>
            aujourd&apos;hui {formatDecimal(row.doneThisSession)} / {formatDecimal(row.todayShare)}
          </span>
        ) : (
          <span>{row.isDormant ? "hors routine · " : ""}{lastTrained}</span>
        )}
      </div>
      <div className="relative mt-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
        {ticks.map((tick) => (
          <span
            key={tick.left}
            aria-hidden
            className="absolute -top-[3px] h-3 w-[2px] -translate-x-1/2 rounded-full"
            style={{
              left: `${tick.left}%`,
              background: tick.today ? "var(--color-fg)" : "rgba(255,255,255,0.28)",
            }}
          />
        ))}
      </div>
      {!row.isDormant && row.suggestedExercises.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.suggestedExercises.map((suggestion) => (
            <button
              key={suggestion.exerciseId}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="pill inline-flex items-center gap-1 text-[0.68rem] text-(--color-fg-muted) active:scale-95 transition"
            >
              {suggestion.inCurrentSession ? <Check size={11} /> : <Plus size={11} />}
              {suggestion.exerciseName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
