"use client";

import { useEffect } from "react";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * Applique le thème de mode (Normal / Beast / Monk) au niveau du document via
 * l'attribut [data-mode], que le CSS traduit en accents/halo/fond.
 * Utilise le mode de la séance active si présente, sinon le mode sélectionné.
 */
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const active = useWorkoutStore((s) => s.active);
  const activeMode = useWorkoutStore((s) => s.activeMode);
  const selectedStartMode = useWorkoutStore((s) => s.selectedStartMode);

  const mode = active ? activeMode : selectedStartMode;

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return <>{children}</>;
}
