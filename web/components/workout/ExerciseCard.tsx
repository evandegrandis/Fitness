"use client";

import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Link2, MoreVertical } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { buildRecords } from "@/lib/engines/records";
import { useWorkoutStore } from "@/lib/store/workout";
import { orderedSets, type Exercise, type LoggedExercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";
import { completedWorkSets } from "@/lib/models/types";
import { SetRow } from "./SetRow";
import { SetEntry } from "./SetEntry";
import { cn } from "@/lib/utils";

function supersetRoundLabel(session: WorkoutSession, loggedExercise: LoggedExercise): string | null {
  const group = session.supersetGroups.find((g) => g.id === loggedExercise.supersetGroupId);
  if (!group) return null;
  const memberIdx = group.memberOrder.indexOf(loggedExercise.id) + 1;
  const round = completedWorkSets(loggedExercise).length + 1;
  return `SS · r${round} · ${memberIdx}/${group.memberOrder.length}`;
}

function lastSessionSetFor(exerciseId: string, history: WorkoutSession[]): LoggedSet | null {
  for (const session of history) {
    for (const logged of session.exercises) {
      if (logged.exerciseId === exerciseId) {
        const sets = completedWorkSets(logged);
        if (sets.length > 0) return sets[sets.length - 1];
      }
    }
  }
  return null;
}

export function ExerciseCard({
  loggedExercise,
  exercise,
  session,
  onEditSet,
  onOpenActions,
}: {
  loggedExercise: LoggedExercise;
  exercise: Exercise | undefined;
  session: WorkoutSession;
  onEditSet: (set: LoggedSet) => void;
  onOpenActions: (loggedExerciseId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loggedExercise.id });
  const logSet = useWorkoutStore((s) => s.logSet);
  const suggestion = useWorkoutStore((s) => s.suggestion);
  const warmupSuggestion = useWorkoutStore((s) => s.warmupSuggestion);
  const justHitRecord = useWorkoutStore((s) => s.justHitRecord);
  const history = useWorkoutStore((s) => s.history);
  const armedSupersetExerciseId = useWorkoutStore((s) => s.armedSupersetExerciseId);

  const [expanded, setExpanded] = useState(true);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sets = orderedSets(loggedExercise);
  const roundLabel = supersetRoundLabel(session, loggedExercise);
  const isArmed = armedSupersetExerciseId === loggedExercise.id;

  // Dépend de `loggedExercise` (pas juste son id) pour recalculer après chaque set loggué.
  const currentSuggestion = useMemo(() => suggestion(loggedExercise.id), [suggestion, loggedExercise]);
  const currentWarmup = useMemo(() => warmupSuggestion(loggedExercise.id), [warmupSuggestion, loggedExercise]);
  const lastSet = useMemo(
    () => (exercise ? lastSessionSetFor(exercise.id, history) : null),
    [exercise, history]
  );
  // Calcul PUR (pas d'écriture de store en render) — évite le setState-in-render.
  const exerciseRecords = useMemo(() => {
    if (!exercise) return undefined;
    const historicalSets = history
      .filter((s) => !s.isActive)
      .flatMap((s) => s.exercises)
      .filter((e) => e.exerciseId === exercise.id)
      .flatMap((e) => e.sets);
    return buildRecords(exercise, historicalSets);
  }, [exercise, history]);

  if (!exercise) return null;

  return (
    <div ref={setNodeRef} style={style}>
      <GlassCard className={cn("flex flex-col gap-3", isArmed && "ring-1 ring-[color:var(--accent)]")}>
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-0.5 shrink-0 cursor-grab touch-none text-[--color-fg-faint] active:cursor-grabbing"
            aria-label="Réordonner"
          >
            <GripVertical size={18} />
          </button>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate font-display text-base font-bold text-[--color-fg]">{exercise.name}</h3>
              {roundLabel && (
                <span className="pill shrink-0" style={{ color: "#ff8a3d", background: "rgba(255,138,61,0.12)" }}>
                  <Link2 size={11} />
                  {roundLabel}
                </span>
              )}
            </div>
            {exercise.machineSetting && (
              <p className="truncate text-xs text-[--color-fg-muted]">{exercise.machineSetting}</p>
            )}
            {lastSet && (
              <p className="truncate text-xs text-[--color-fg-faint]">
                Dernière séance : {lastSet.weight > 0 ? `${lastSet.weight}kg` : "BW"} × {lastSet.reps}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenActions(loggedExercise.id)}
            className="shrink-0 grid h-8 w-8 place-items-center rounded-full text-[--color-fg-muted] active:scale-90 transition"
            aria-label="Actions"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {sets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {sets.map((set) => (
              <SetRow key={set.id} set={set} isRecord={justHitRecord[set.id]} onTap={() => onEditSet(set)} />
            ))}
          </div>
        )}

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <SetEntry
                key={completedWorkSets(loggedExercise).length}
                exercise={exercise}
                suggestion={currentSuggestion}
                warmup={currentWarmup}
                lastSessionSet={lastSet}
                onLogSet={(input) => logSet(loggedExercise.id, input)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!expanded && exerciseRecords && !exerciseRecords.isEmpty && (
          <p className="text-xs text-[--color-fg-faint]">
            Record : {exerciseRecords.heaviestValidated}kg × {exerciseRecords.repsAtHeaviestValidated}
          </p>
        )}
      </GlassCard>
    </div>
  );
}
