/**
 * Modes de séance — miroir de WorkoutMode (iOS).
 * Chaque mode pilote l'accent visuel via l'attribut [data-mode] sur <html>.
 */
export type WorkoutMode = "normal" | "beast" | "monk";

export interface ModeMeta {
  id: WorkoutMode;
  label: string;
  tagline: string;
  /** couleur d'accent principale (pour icônes/aperçus hors CSS var) */
  accent: string;
  accent2: string;
  icon: string; // nom d'icône lucide
}

export const MODES: Record<WorkoutMode, ModeMeta> = {
  normal: {
    id: "normal",
    label: "Normal",
    tagline: "Progression standard",
    accent: "#34e0ea",
    accent2: "#a78bfa",
    icon: "Dumbbell",
  },
  beast: {
    id: "beast",
    label: "Beast",
    tagline: "Charge agressive",
    accent: "#ff8a3d",
    accent2: "#ff4d4d",
    icon: "Flame",
  },
  monk: {
    id: "monk",
    label: "Monk",
    tagline: "Comble les déficits, tempo apaisé",
    accent: "#34d399",
    accent2: "#2dd4bf",
    icon: "Leaf",
  },
};

export const MODE_ORDER: WorkoutMode[] = ["normal", "beast", "monk"];
