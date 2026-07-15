"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import type { LoggedSet, WorkoutSession } from "@/lib/models/types";
import { ExerciseCard } from "./ExerciseCard";

/** Liste réordonnable (drag) des exercices de la séance active. */
export function ExerciseList({
  session,
  onEditSet,
  onOpenActions,
  onAddExercise,
}: {
  session: WorkoutSession;
  onEditSet: (loggedExerciseId: string, set: LoggedSet) => void;
  onOpenActions: (loggedExerciseId: string) => void;
  onAddExercise: () => void;
}) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const moveExercise = useWorkoutStore((s) => s.moveExercise);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ordered = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const ids = ordered.map((e) => e.id);
  const byId = new Map(ordered.map((e) => [e.id, e]));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = ordered.findIndex((e) => e.id === active.id);
    const toIndex = ordered.findIndex((e) => e.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    moveExercise(fromIndex, toIndex);
  };

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const loggedExercise = byId.get(id);
            if (!loggedExercise) return null;
            const exercise = catalog.find((e) => e.id === loggedExercise.exerciseId);
            return (
              <ExerciseCard
                key={id}
                loggedExercise={loggedExercise}
                exercise={exercise}
                session={session}
                onEditSet={(set) => onEditSet(loggedExercise.id, set)}
                onOpenActions={onOpenActions}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={onAddExercise}
        className="glass flex items-center justify-center gap-2 rounded-2xl border-dashed py-3.5 text-sm font-semibold text-[--color-fg-muted] active:scale-[0.98] transition"
        style={{ borderStyle: "dashed" }}
      >
        <Plus size={16} />
        Ajouter un exercice
      </button>
    </div>
  );
}
