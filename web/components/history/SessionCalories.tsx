"use client";

import { useMemo } from "react";
import { Flame } from "lucide-react";
import { sessionCalories, type SessionCalories } from "@/lib/engines/calories";
import type { Exercise, WorkoutSession } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";
import { formatDecimal } from "@/lib/format";

/** Estimation de la dépense d'une séance, au poids de corps connu à sa date. */
export function useSessionCalories(session: WorkoutSession, exercises: Exercise[]): SessionCalories {
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settingsWeight = useWorkoutStore((s) => s.settings.bodyWeightKg);
  return useMemo(
    () => sessionCalories(session, exercises, bodyWeights, settingsWeight),
    [session, exercises, bodyWeights, settingsWeight]
  );
}

const WEIGHT_SOURCE_LABEL: Record<SessionCalories["bodyWeightSource"], string> = {
  weigh_in: "dernière pesée",
  settings: "réglages",
  default: "valeur par défaut, ajoute une pesée",
};

/** Carte « Dépense estimée » : fourchette, part active, exercice le plus coûteux. */
export function SessionCaloriesCard({ session, exercises }: { session: WorkoutSession; exercises: Exercise[] }) {
  const estimate = useSessionCalories(session, exercises);
  if (estimate.kcal === 0) return null;
  const top = [...estimate.exercises].sort((a, b) => b.kcal - a.kcal)[0];

  return (
    <div className="glass glass-card flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-400/15 text-orange-300">
        <Flame size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Dépense estimée</p>
        <p className="tnum mt-0.5 font-display text-2xl font-bold text-(--color-fg)">
          ≈ {estimate.kcal} <span className="text-base font-semibold text-(--color-fg-muted)">kcal</span>
        </p>
        {/* Police du texte, chiffres alignés : la police à chasse fixe coupait « au- / dessus ». */}
        <p className="mt-0.5 text-sm tabular-nums text-(--color-fg-muted)">
          {estimate.low !== estimate.high && <>{estimate.low} à {estimate.high} kcal · </>}~{estimate.activeKcal} au-dessus du repos
        </p>
        {top && top.kcal > 0 && (
          // Le chiffre d'abord : un nom de machine long ne doit jamais le couper.
          <p className="mt-1 text-xs text-(--color-fg-faint)">
            Le plus coûteux : ~{top.kcal} kcal, {top.exerciseName}
            {estimate.cardioKcal > 0 ? ` · cardio ~${estimate.cardioKcal} kcal` : ""}
          </p>
        )}
        <p className="mt-0.5 text-xs text-(--color-fg-faint)">
          Pour {formatDecimal(estimate.bodyWeightKg)} kg ({WEIGHT_SOURCE_LABEL[estimate.bodyWeightSource]})
        </p>
      </div>
    </div>
  );
}
