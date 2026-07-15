"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { useWorkoutStore } from "@/lib/store/workout";
import type { Exercise, LoggedSet } from "@/lib/models/types";

type Target = { loggedExerciseId: string; set: LoggedSet };

/** Feuille d'édition d'un set déjà loggué : ajuster poids/reps ou supprimer. */
export function EditSetSheet({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const active = useWorkoutStore((s) => s.active);

  const loggedExercise = active?.exercises.find((e) => e.id === target?.loggedExerciseId);
  const exercise = loggedExercise ? catalog.find((e) => e.id === loggedExercise.exerciseId) : undefined;

  return (
    <Sheet open={target !== null} onClose={onClose}>
      {/* key = set.id force un remount (donc un état frais) à chaque set différent */}
      {target && <EditSetForm key={target.set.id} target={target} exercise={exercise} onClose={onClose} />}
    </Sheet>
  );
}

function EditSetForm({
  target,
  exercise,
  onClose,
}: {
  target: Target;
  exercise: Exercise | undefined;
  onClose: () => void;
}) {
  const editSet = useWorkoutStore((s) => s.editSet);
  const deleteSet = useWorkoutStore((s) => s.deleteSet);

  const [weight, setWeight] = useState(target.set.weight);
  const [reps, setReps] = useState(target.set.reps);

  const increment = exercise && exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 2.5;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base font-bold text-[--color-fg]">Modifier le set</h2>
      <div className="flex items-center justify-center gap-6">
        <Stepper label="Poids" value={weight} onChange={setWeight} step={increment} min={0} suffix="kg" />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            deleteSet(target.loggedExerciseId, target.set.id);
            onClose();
          }}
          className="glass flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-rose-400 active:scale-[0.97] transition"
        >
          <Trash2 size={16} />
          Supprimer
        </button>
        <button
          type="button"
          onClick={() => {
            editSet(target.set.id, { weight, reps });
            onClose();
          }}
          className="btn-accent flex-[2] py-3 text-sm active:scale-[0.97] transition"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
