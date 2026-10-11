"use client";

import { useMemo } from "react";
import { Check, Plus, Target } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkoutStore } from "@/lib/store/workout";
import {
  focusGroups,
  focusRowDue,
  sessionFocus,
  type FocusGroup,
  type SessionFocusExerciseSuggestion,
  type SessionFocusRow,
} from "@/lib/engines/session-focus";
import type { WeekStatus } from "@/lib/engines/week-status";
import { parentShortName } from "@/lib/models/muscles";
import { formatDecimal } from "@/lib/format";
import type { WorkoutSession } from "@/lib/models/types";
import { WeekStatusRow } from "./WeekStatusRow";

/** Le bouton discret de l'en-tête de séance ; le panneau est piloté par l'en-tête. */
export function SessionFocusButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Voir quoi prioriser maintenant"
      className="pill grid h-11 w-11 shrink-0 place-items-center rounded-full"
    >
      <Target size={17} className="text-(--color-fg-muted)" />
    </button>
  );
}

/**
 * « Quoi faire maintenant ? ». Un panneau qui se lit entre deux séries, sur iPhone :
 *   1. la semaine (palier, séries qui manquent pour le suivant et où elles comptent) ;
 *   2. le haut du corps, muscle par muscle, ce qui reste à faire aujourd'hui ;
 *   3. les jambes, à part, repliables pour la semaine (« Pas de jambes cette semaine ») : le choix ne
 *      touche ni les objectifs ni les paliers, il retire seulement les jambes des pistes.
 *
 * Recalculé depuis la séance en cours, donc il suit ce qui vient d'être loggué.
 */
export function SessionFocusSheet({
  open,
  onClose,
  session,
  week,
  lowerBodyOff,
  onExerciseSelected,
}: {
  open: boolean;
  onClose: () => void;
  session: WorkoutSession;
  week: WeekStatus;
  lowerBodyOff: boolean;
  onExerciseSelected?: (loggedExerciseId: string) => void;
}) {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const addExercise = useWorkoutStore((s) => s.addExercise);
  const setLowerBodyOff = useWorkoutStore((s) => s.setLowerBodyOff);

  const focus = useMemo(() => sessionFocus(history, catalog, goals, session), [history, catalog, goals, session]);
  const groups = useMemo(() => focusGroups(focus), [focus]);

  const chooseExercise = (suggestion: SessionFocusExerciseSuggestion) => {
    const current = useWorkoutStore.getState().active;
    if (!current) return;
    const existing = current.exercises.find((logged) => logged.exerciseId === suggestion.exerciseId);
    if (existing) {
      onExerciseSelected?.(existing.id);
      onClose();
      return;
    }
    const previousIds = new Set(current.exercises.map((logged) => logged.id));
    addExercise(suggestion.exerciseId);
    const added = useWorkoutStore.getState().active?.exercises.find((logged) => !previousIds.has(logged.id));
    if (added) onExerciseSelected?.(added.id);
    onClose();
  };

  const sessionsLeft = focus.weekPlan.sessionsLeftIncludingToday;

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="Priorités de la séance">
      <h2 className="font-display text-lg font-bold text-(--color-fg)">Quoi faire maintenant</h2>

      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        <WeekStatusRow status={week} lowerBodyOff={lowerBodyOff} bordered={false} />
      </div>

      {(
        <>
          <p className="mt-3 text-xs leading-snug text-(--color-fg-muted)">
            {sessionsLeft > 1
              ? `Séance ${focus.weekPlan.sessionsDoneThisWeek + 1} sur ${focus.weekPlan.habitualSessionsPerWeek} habituelles : chaque muscle montre ta part du jour (trait clair).`
              : "Dernière séance habituelle de la semaine : tout ce qui reste est pour aujourd'hui."}
          </p>

          <FocusSection
            title="Haut du corps"
            group={groups.upper}
            sessionsLeft={sessionsLeft}
            onSuggestion={chooseExercise}
            empty="Haut du corps : objectifs de la semaine couverts."
          />

          {(groups.lower.rows.length > 0 || lowerBodyOff) && (
            <section className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">
                  Jambes
                  {lowerBodyOff ? (
                    <span className="font-sans normal-case tracking-normal text-(--color-fg-faint)"> · pas cette semaine</span>
                  ) : (
                    <span className="tnum text-(--color-fg-faint)"> · {formatDecimal(groups.lower.due)} à faire</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setLowerBodyOff(!lowerBodyOff)}
                  aria-pressed={lowerBodyOff}
                  className="pill min-h-9 shrink-0 active:scale-95 transition"
                  style={lowerBodyOff ? { color: "var(--accent)" } : undefined}
                >
                  {lowerBodyOff ? "Les remettre" : "Pas cette semaine"}
                </button>
              </div>
              {lowerBodyOff ? (
                <p className="mt-2 text-[0.7rem] leading-snug text-(--color-fg-faint)">
                  Repliées jusqu&apos;à dimanche. Tes objectifs ne changent pas : leurs séries comptent toujours dans le palier.
                </p>
              ) : (
                <div className="mt-1 flex flex-col">
                  {groups.lower.rows.map((row, i) => (
                    <FocusRow
                      key={row.parent}
                      row={row}
                      sessionsLeft={sessionsLeft}
                      isLast={i === groups.lower.rows.length - 1}
                      onSuggestion={chooseExercise}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {(focus.workedToday.length > 0 || focus.tracked.length > 0) && (
            <div className="mt-5 space-y-1.5 border-t border-white/[0.06] pt-3 text-[0.72rem] leading-snug text-(--color-fg-faint)">
              {focus.workedToday.length > 0 && (
                <p>
                  <span className="text-(--color-fg-muted)">Déjà fait aujourd&apos;hui : </span>
                  {focus.workedToday.map((row) => `${parentShortName[row.parent].toLowerCase()} ${formatDecimal(row.doneThisSession)}`).join(" · ")}
                </p>
              )}
              {focus.tracked.length > 0 && (
                <p>
                  <span className="text-(--color-fg-muted)">Suivi, sans objectif : </span>
                  {focus.tracked.map((row) => `${parentShortName[row.parent].toLowerCase()} ${formatDecimal(row.effectiveSets)}`).join(" · ")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function FocusSection({
  title,
  group,
  sessionsLeft,
  onSuggestion,
  empty,
}: {
  title: string;
  group: FocusGroup;
  sessionsLeft: number;
  onSuggestion: (suggestion: SessionFocusExerciseSuggestion) => void;
  empty: string;
}) {
  return (
    <section className="mt-4">
      <p className="eyebrow">
        {title}
        {group.rows.length > 0 && <span className="tnum text-(--color-fg-faint)"> · {formatDecimal(group.due)} à faire</span>}
      </p>
      {group.rows.length > 0 ? (
        <div className="mt-1 flex flex-col">
          {group.rows.map((row, i) => (
            <FocusRow key={row.parent} row={row} sessionsLeft={sessionsLeft} isLast={i === group.rows.length - 1} onSuggestion={onSuggestion} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-(--color-fg)">{empty}</p>
      )}
    </section>
  );
}

/**
 * Une ligne par muscle, trois lignes de texte au plus : le muscle et ce qui reste à faire
 * aujourd'hui ; la barre de la semaine (le trait clair marque la fin de la part du jour) avec
 * séries faites / objectif ; les exercices qui le comblent, en un tap.
 */
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
  const due = focusRowDue(row, sessionsLeft);
  // Repères de séance : ce qui restait au début de la séance, découpé en autant de parts qu'il
  // reste de séances habituelles. Le premier trait (clair) est la fin de la part du jour.
  const ticks: { left: number; today: boolean }[] = [];
  if (row.goalSets > 0 && sessionsLeft > 1) {
    for (let k = 1; k < sessionsLeft; k += 1) {
      const position = (row.doneBeforeSession + k * row.todayShare) / row.goalSets;
      if (position > 0 && position < 1) ticks.push({ left: position * 100, today: k === 1 });
    }
  }
  const todayReached = due < 0.05;
  return (
    <div className={`${isLast ? "py-2.5" : "border-b border-white/[0.06] py-2.5"} ${row.isDormant ? "opacity-55" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-[0.7rem] uppercase tracking-wide text-(--color-fg)">{parentShortName[row.parent]}</span>
          {row.doneThisSession >= 0.5 && (
            <span className="tnum text-[0.68rem]" style={{ color: "rgb(110,231,183)" }}>
              +{formatDecimal(row.doneThisSession)} auj.
            </span>
          )}
        </span>
        <span className="tnum shrink-0 text-xs" style={{ color: todayReached ? "rgb(110,231,183)" : "var(--color-fg)" }}>
          {todayReached ? "fait pour aujourd'hui" : `${formatDecimal(Math.round(due * 10) / 10)} à faire`}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="relative flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
          </div>
          {ticks.map((tick) => (
            <span
              key={tick.left}
              aria-hidden
              className="absolute -top-[3px] h-3 w-[2px] -translate-x-1/2 rounded-full"
              style={{ left: `${tick.left}%`, background: tick.today ? "var(--color-fg)" : "rgba(255,255,255,0.28)" }}
            />
          ))}
        </div>
        <span className="tnum shrink-0 text-[0.68rem] text-(--color-fg-faint)">
          {formatDecimal(Math.round(row.effectiveSets * 10) / 10)} / {row.goalSets}
        </span>
      </div>
      {!row.isDormant && row.suggestedExercises.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.suggestedExercises.map((suggestion) => (
            <button
              key={suggestion.exerciseId}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="pill inline-flex min-h-8 items-center gap-1 font-sans text-[0.72rem] normal-case tracking-normal text-(--color-fg-muted) active:scale-95 transition"
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
