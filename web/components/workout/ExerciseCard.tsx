"use client";

import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, GripVertical, Link2, MoreVertical, Trash2, Unlink } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwipeRow } from "@/components/ui/SwipeRow";
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
  const handleSupersetLink = useWorkoutStore((s) => s.handleSupersetLink);
  const detachFromSupersetGroup = useWorkoutStore((s) => s.detachFromSupersetGroup);
  const duplicateExercise = useWorkoutStore((s) => s.duplicateExercise);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);

  const [expanded, setExpanded] = useState(true);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sets = orderedSets(loggedExercise);
  const roundLabel = supersetRoundLabel(session, loggedExercise);
  const isArmed = armedSupersetExerciseId === loggedExercise.id;
  // Un AUTRE exercice est armé → cette carte devient une cible de liaison :
  // taper n'importe où dessus finalise le superset (agrandissement de cible).
  const isLinkTarget = armedSupersetExerciseId !== null && !isArmed;

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

  const isLinked = loggedExercise.supersetGroupId !== null;

  return (
    <div ref={setNodeRef} style={style}>
      <SwipeRow
        actions={[
          { label: "Dupliquer", icon: Copy, onClick: () => duplicateExercise(loggedExercise.id) },
          { label: "Supprimer", icon: Trash2, danger: true, onClick: () => removeExercise(loggedExercise.id) },
        ]}
      >
        <GlassCard
          className={cn(
            "flex flex-col gap-3",
            isArmed && "ring-1 ring-[color:var(--accent)]",
            isLinkTarget && "ring-1 ring-[color:#ff8a3d] animate-pulse cursor-pointer",
          )}
          {...(isLinkTarget
            ? {
                onClickCapture: (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSupersetLink(loggedExercise.id);
                },
              }
            : {})}
        >
          <div className="flex items-start justify-between gap-2">
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
                  {...attributes}
                  {...listeners}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  className="shrink-0 grid h-8 w-8 cursor-grab touch-none place-items-center rounded-full text-[--color-fg-faint] active:cursor-grabbing"
                  aria-label="Réordonner"
                >
                  <GripVertical size={16} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLinked) {
                      detachFromSupersetGroup(loggedExercise.id);
                    } else {
                      handleSupersetLink(loggedExercise.id);
                    }
                  }}
                  aria-label={isLinked ? "Détacher du superset" : "Lier en superset"}
                  aria-pressed={isArmed}
                  className={cn(
                    "shrink-0 grid h-8 w-8 place-items-center rounded-full transition active:scale-90",
                    isLinked || isArmed
                      ? "text-white"
                      : "text-[--color-fg-muted]"
                  )}
                  style={
                    isLinked || isArmed
                      ? { background: "rgba(255,138,61,0.22)", color: "#ff8a3d" }
                      : undefined
                  }
                >
                  {isLinked ? <Unlink size={16} /> : <Link2 size={16} />}
                </button>
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
                      loggedExerciseId={loggedExercise.id}
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
          </SwipeRow>
    </div>
  );
}
