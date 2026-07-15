"use client";

import { Copy, Link2, Repeat, Trash2, Unlink } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkoutStore } from "@/lib/store/workout";

/** Feuille d'actions pour un exercice loggé : lier superset / remplacer / dupliquer / supprimer. */
export function ExerciseActionsSheet({
  loggedExerciseId,
  onClose,
  onReplace,
}: {
  loggedExerciseId: string | null;
  onClose: () => void;
  onReplace: (loggedExerciseId: string) => void;
}) {
  const active = useWorkoutStore((s) => s.active);
  const handleSupersetLink = useWorkoutStore((s) => s.handleSupersetLink);
  const detachFromSupersetGroup = useWorkoutStore((s) => s.detachFromSupersetGroup);
  const duplicateExercise = useWorkoutStore((s) => s.duplicateExercise);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);
  const armedSupersetExerciseId = useWorkoutStore((s) => s.armedSupersetExerciseId);

  const loggedExercise = active?.exercises.find((e) => e.id === loggedExerciseId);
  const isLinked = loggedExercise?.supersetGroupId != null;
  const isArmed = armedSupersetExerciseId === loggedExerciseId;

  return (
    <Sheet open={loggedExerciseId !== null} onClose={onClose}>
      {loggedExercise && (
        <div className="flex flex-col gap-1.5">
          <h2 className="mb-1 font-display text-base font-bold text-[--color-fg]">{loggedExercise.exerciseName}</h2>

          <ActionRow
            icon={isLinked ? Unlink : Link2}
            label={isLinked ? "Détacher du superset" : isArmed ? "Annuler la liaison" : "Lier superset"}
            onClick={() => {
              if (isLinked) {
                detachFromSupersetGroup(loggedExercise.id);
              } else {
                handleSupersetLink(loggedExercise.id);
              }
              onClose();
            }}
          />
          <ActionRow
            icon={Repeat}
            label="Remplacer"
            onClick={() => {
              onReplace(loggedExercise.id);
            }}
          />
          <ActionRow
            icon={Copy}
            label="Dupliquer"
            onClick={() => {
              duplicateExercise(loggedExercise.id);
              onClose();
            }}
          />
          <ActionRow
            icon={Trash2}
            label="Supprimer"
            danger
            onClick={() => {
              removeExercise(loggedExercise.id);
              onClose();
            }}
          />
        </div>
      )}
    </Sheet>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium active:scale-[0.98] transition ${
        danger ? "text-rose-400" : "text-[--color-fg]"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}
