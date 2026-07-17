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
    accent: "#ece6d8",
    accent2: "#a49f92",
    icon: "Dumbbell",
  },
  beast: {
    id: "beast",
    label: "Beast",
    tagline: "Charge agressive",
    accent: "#cf8a5e",
    accent2: "#a86a44",
    icon: "Flame",
  },
  monk: {
    id: "monk",
    label: "Monk",
    tagline: "Comble les déficits, tempo apaisé",
    accent: "#9db487",
    accent2: "#7a8b6f",
    icon: "Leaf",
  },
};

export const MODE_ORDER: WorkoutMode[] = ["normal", "beast", "monk"];
