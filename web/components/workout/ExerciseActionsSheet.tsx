"use client";

import { Repeat } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * Feuille d'actions pour un exercice loggé. Superset (bouton lien sur la
 * carte), Dupliquer/Supprimer (swipe sur la carte) ont été sortis d'ici pour
 * réduire le nombre de taps — ce sheet ne garde que "Remplacer".
 */
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

  const loggedExercise = active?.exercises.find((e) => e.id === loggedExerciseId);

  return (
    <Sheet open={loggedExerciseId !== null} onClose={onClose}>
      {loggedExercise && (
        <div className="flex flex-col gap-1.5">
          <h2 className="mb-1 font-display text-base font-bold text-(--color-fg)">{loggedExercise.exerciseName}</h2>

          <ActionRow
            icon={Repeat}
            label="Remplacer"
            onClick={() => {
              onReplace(loggedExercise.id);
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
        danger ? "text-rose-400" : "text-(--color-fg)"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}
