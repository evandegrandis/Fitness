"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Link2, Plus } from "lucide-react";
import { useWorkoutStore } from "@/lib/store/workout";
import type { LoggedExercise, WorkoutSession, LoggedSet } from "@/lib/models/types";
import { ExerciseCard } from "./ExerciseCard";

/** Un item de la liste rendue : soit un exercice seul, soit un bloc superset groupé. */
type ListItem =
  | { kind: "solo"; exercise: LoggedExercise }
  | { kind: "superset"; groupId: string; members: LoggedExercise[] };

/** Regroupe les exercices ordonnés en items solo / superset contigus, en respectant l'ordre du groupe. */
function buildListItems(ordered: LoggedExercise[], session: WorkoutSession): ListItem[] {
  const items: ListItem[] = [];
  const seenGroups = new Set<string>();

  for (const ex of ordered) {
    if (ex.supersetGroupId === null) {
      items.push({ kind: "solo", exercise: ex });
      continue;
    }
    if (seenGroups.has(ex.supersetGroupId)) continue;
    seenGroups.add(ex.supersetGroupId);

    const group = session.supersetGroups.find((g) => g.id === ex.supersetGroupId);
    const byId = new Map(ordered.map((e) => [e.id, e]));
    const members = group
      ? group.memberOrder.map((id) => byId.get(id)).filter((m): m is LoggedExercise => m !== undefined)
      : [ex];
    items.push({ kind: "superset", groupId: ex.supersetGroupId, members });
  }

  return items;
}

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
  const items = buildListItems(ordered, session);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = ordered.findIndex((e) => e.id === active.id);
    const toIndex = ordered.findIndex((e) => e.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    moveExercise(fromIndex, toIndex);
  };

  const renderCard = (loggedExercise: LoggedExercise) => {
    const exercise = catalog.find((e) => e.id === loggedExercise.exerciseId);
    return (
      <ExerciseCard
        key={loggedExercise.id}
        loggedExercise={loggedExercise}
        exercise={exercise}
        session={session}
        onEditSet={(set) => onEditSet(loggedExercise.id, set)}
        onOpenActions={onOpenActions}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item) =>
            item.kind === "solo" ? (
              renderCard(item.exercise)
            ) : (
              <div
                key={item.groupId}
                className="flex flex-col gap-2 rounded-[1.75rem] border p-2"
                style={{ borderColor: "rgba(255,138,61,0.35)", background: "rgba(255,138,61,0.05)" }}
              >
                <div className="flex items-center gap-1.5 px-1.5 pt-0.5 text-xs font-semibold" style={{ color: "#ff8a3d" }}>
                  <Link2 size={12} />
                  Superset · {item.members.length} exercices
                </div>
                <div className="flex flex-col gap-2">{item.members.map((member) => renderCard(member))}</div>
              </div>
            )
          )}
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
