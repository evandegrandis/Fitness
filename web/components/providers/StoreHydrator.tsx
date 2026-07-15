"use client";

import { useEffect, useRef } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import type { AllData } from "@/lib/db/queries";

/**
 * Hydrate le store client : réhydrate d'abord la séance en cours depuis
 * localStorage (persist skipHydration), puis injecte les données de référence
 * fraîchement lues côté serveur.
 */
export function StoreHydrator({ data }: { data: AllData }) {
  const rehydrated = useRef(false);

  useEffect(() => {
    if (!rehydrated.current) {
      rehydrated.current = true;
      void useWorkoutStore.persist.rehydrate();
    }
    useWorkoutStore.getState().hydrate({
      catalog: data.exercises,
      history: data.sessions,
      goals: data.goals,
      settings: data.settings,
      templates: data.templates,
      recoveryCheckins: data.recoveryCheckins,
    });
  }, [data]);

  return null;
}
