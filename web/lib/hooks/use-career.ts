"use client";

import { careerFor, type Career } from "@/lib/engines/career";
import { useWorkoutStore } from "@/lib/store/workout";

/** Le parcours (rangs, jalons, secrets), calculé une fois par état du store et partagé. */
export function useCareer(): Career {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settings = useWorkoutStore((s) => s.settings);
  return careerFor({ history, catalog, goals, bodyWeights, settings });
}
