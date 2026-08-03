"use client";

import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Flame, GripVertical, Link2, Repeat, Unlink } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SwipeRow } from "@/components/ui/SwipeRow";
import { buildRecords } from "@/lib/engines/records";
import { compositeSetBlocks, effectiveSetUnits } from "@/lib/engines/set-structure";
import { useWorkoutStore } from "@/lib/store/workout";
import { orderedSets, type Exercise, type LoggedExercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";
import { completedWorkSets } from "@/lib/models/types";
import { SetRow } from "./SetRow";
import { SetEntry } from "./SetEntry";
import { cn } from "@/lib/utils";
import { SetType } from "@/lib/models/enums";

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
  expanded,
  onToggleExpanded,
  onBecameActive,
  onDuplicate,
  onEditSet,
  onReplace,
}: {
  loggedExercise: LoggedExercise;
  exercise: Exercise | undefined;
  session: WorkoutSession;
  expanded: boolean;
  onToggleExpanded: () => void;
  onBecameActive: () => void;
  onDuplicate: () => void;
  onEditSet: (set: LoggedSet) => void;
  onReplace: (loggedExerciseId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loggedExercise.id });
  const [handleArmed, setHandleArmed] = useState(false);
  const logSet = useWorkoutStore((s) => s.logSet);
  const suggestion = useWorkoutStore((s) => s.suggestion);
  const warmupSuggestion = useWorkoutStore((s) => s.warmupSuggestion);
  const justHitRecord = useWorkoutStore((s) => s.justHitRecord);
  const history = useWorkoutStore((s) => s.history);
  const armedSupersetExerciseId = useWorkoutStore((s) => s.armedSupersetExerciseId);
  const handleSupersetLink = useWorkoutStore((s) => s.handleSupersetLink);
  const detachFromSupersetGroup = useWorkoutStore((s) => s.detachFromSupersetGroup);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sets = orderedSets(loggedExercise);
  const finisherSets = sets.filter((set) => set.setType === SetType.finisher);
  const normalSets = sets.filter((set) => set.setType !== SetType.finisher);
  const compositeBlocks = compositeSetBlocks(normalSets, { increment: exercise?.smallestIncrement }).filter(
    (block) => block.sets.length > 1
  );
  const compositeByLeadId = new Map(compositeBlocks.map((block) => [block.leadSet.id, block]));
  const compositeContinuationIds = new Set(compositeBlocks.flatMap((block) => block.sets.slice(1).map((set) => set.id)));
  const effectiveCount = Math.round(
    effectiveSetUnits(completedWorkSets(loggedExercise), { increment: exercise?.smallestIncrement }) * 10
  ) / 10;
  const currentLastSet = sets.at(-1);
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
          { label: "Dupliquer", icon: Copy, onClick: onDuplicate },
          { label: "Remplacer", icon: Repeat, onClick: () => onReplace(loggedExercise.id) },
        ]}
        onDelete={() => removeExercise(loggedExercise.id)}
      >
        <GlassCard
          className={cn(
            "flex flex-col",
            expanded ? "gap-3" : "gap-2 py-3",
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
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer text-left"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-display text-base font-bold text-[--color-fg]">{exercise.name}</span>
                {roundLabel && (
                  <span className="pill shrink-0" style={{ color: "#ff8a3d", background: "rgba(255,138,61,0.12)" }}>
                    <Link2 size={11} />
                    {roundLabel}
                  </span>
                )}
              </span>
              {exercise.machineSetting && (
                <span className="block truncate text-xs text-[--color-fg-muted]">{exercise.machineSetting}</span>
              )}
              {lastSet && (
                <span className="block truncate text-xs text-[--color-fg-faint]">
                  Dernière séance : {lastSet.weight > 0 ? `${lastSet.weight}kg` : "BW"} × {lastSet.reps}
                </span>
              )}
            </button>
            <button
              type="button"
              {...attributes}
              {...listeners}
              data-drag-handle="true"
              onPointerDown={(e) => {
                setHandleArmed(true);
                listeners?.onPointerDown?.(e);
              }}
              onPointerUp={() => setHandleArmed(false)}
              onPointerLeave={() => setHandleArmed(false)}
              onPointerCancel={() => setHandleArmed(false)}
              className={cn(
                "shrink-0 grid h-8 w-8 touch-none place-items-center rounded-full text-[--color-fg-faint] transition",
                handleArmed ? "scale-90 cursor-grabbing text-[--color-fg]" : "cursor-grab"
              )}
              aria-label="Réordonner (appui maintenu)"
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
                isLinked || isArmed ? "text-white" : "text-[--color-fg-muted]"
              )}
              style={
                isLinked || isArmed
                  ? { background: "rgba(255,138,61,0.22)", color: "#ff8a3d" }
                  : undefined
              }
            >
              {isLinked ? <Unlink size={16} /> : <Link2 size={16} />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-3 overflow-hidden"
              >
                {normalSets.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {normalSets.map((set) => {
                      if (compositeContinuationIds.has(set.id)) return null;
                      const block = compositeByLeadId.get(set.id);
                      if (!block) {
                        return <SetRow key={set.id} set={set} isRecord={justHitRecord[set.id]} onTap={() => onEditSet(set)} />;
                      }
                      return (
                        <div key={set.id} className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.035] p-2">
                          <div className="mb-1.5 px-1 text-[0.68rem] font-semibold text-sky-200">
                            {block.kind === "drop_set" ? "Drop set" : "Rest-pause"} · {block.totalReps}/10 reps · {Math.round(block.effectiveSetUnits * 10) / 10} série{block.effectiveSetUnits === 1 ? "" : "s"} effective{block.effectiveSetUnits === 1 ? "" : "s"}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {block.sets.map((blockSet) => (
                              <SetRow
                                key={blockSet.id}
                                set={blockSet}
                                isRecord={justHitRecord[blockSet.id]}
                                onTap={() => onEditSet(blockSet)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {finisherSets.length > 0 && (
                  <div className="rounded-2xl border border-rose-300/25 bg-rose-300/[0.045] p-2">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-rose-200">
                      <Flame size={12} />
                      Finisher · hors prévision
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {finisherSets.map((set) => (
                        <SetRow key={set.id} set={set} isRecord={undefined} onTap={() => onEditSet(set)} />
                      ))}
                    </div>
                  </div>
                )}
                <SetEntry
                  key={sets.length}
                  loggedExerciseId={loggedExercise.id}
                  exercise={exercise}
                  suggestion={currentSuggestion}
                  warmup={currentWarmup}
                  lastSessionSet={lastSet}
                  onLogSet={(input) => {
                    onBecameActive();
                    logSet(loggedExercise.id, input);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {!expanded && (
            <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-[--color-fg-faint]">
              <span className="truncate">
                {currentLastSet
                  ? `${effectiveCount} série${effectiveCount === 1 ? "" : "s"} effective${effectiveCount === 1 ? "" : "s"} · dernière ${currentLastSet.weight > 0 ? `${currentLastSet.weight}kg` : "BW"} × ${currentLastSet.reps}${currentLastSet.setType === SetType.finisher ? " · finisher" : ""}`
                  : "À faire"}
              </span>
              {exerciseRecords && !exerciseRecords.isEmpty && (
                <span className="shrink-0">
                  Record {exerciseRecords.heaviestValidated}kg × {exerciseRecords.repsAtHeaviestValidated}
                </span>
              )}
            </div>
          )}
        </GlassCard>
      </SwipeRow>
    </div>
  );
}
