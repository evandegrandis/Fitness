"use client";

import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { ExerciseEditorSheet } from "@/components/exercise/ExerciseEditorSheet";
import { muscleProfileDonors, withDonorProfile } from "@/lib/data/muscle-profile-donors";
import type { Exercise } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveExercise } from "@/lib/sync/save-exercise";

/**
 * Un exercice sans muscles ne compte dans aucun objectif, et rien ne le disait : sept machines
 * créées en salle ont ainsi perdu 17 séries en trois jours. Ce bandeau reste visible tant que le
 * profil manque, là où l'exercice est utilisé, et se répare d'un tap en reprenant les muscles d'un
 * exercice ressemblant. Les séries déjà faites comptent dès que le profil existe : la couverture
 * est recalculée depuis l'historique.
 */
export function MissingMusclesNotice({ exercise }: { exercise: Exercise }) {
  const catalog = useWorkoutStore((s) => s.catalog);
  const donors = useMemo(() => muscleProfileDonors(exercise, catalog), [exercise, catalog]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  if (exercise.muscleMappings.length > 0) return null;

  const adopt = async (donor: Exercise) => {
    setSavingId(donor.id);
    setError(null);
    try {
      await saveExercise(withDonorProfile(exercise, donor));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer ce profil.");
    }
    setSavingId(null);
  };

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
        <CircleAlert size={13} />
        Ne compte dans aucun objectif musculaire
      </p>
      <p className="mt-1 text-[0.7rem] text-[--color-fg-muted]">
        {donors.length > 0
          ? "Reprendre les muscles de :"
          : "Aucun exercice ressemblant dans ton catalogue : choisis les muscles."}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {donors.map((donor) => (
          <button
            key={donor.id}
            type="button"
            disabled={savingId !== null}
            onClick={() => void adopt(donor)}
            className="pill text-[0.7rem] text-[--color-fg] transition active:scale-95 disabled:opacity-50"
          >
            {savingId === donor.id ? "…" : donor.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="pill text-[0.7rem] text-[--color-fg-muted] transition active:scale-95"
        >
          Choisir les muscles
        </button>
      </div>
      <p className="mt-2 text-[0.68rem] text-[--color-fg-faint]">Les séries déjà faites compteront aussi.</p>
      {error && <p className="mt-2 text-[0.7rem] text-[--color-danger]">{error}</p>}
      <ExerciseEditorSheet open={editorOpen} onClose={() => setEditorOpen(false)} exercise={exercise} />
    </div>
  );
}
