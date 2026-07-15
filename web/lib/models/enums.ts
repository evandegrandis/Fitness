/**
 * Enums du domaine Jeera, portés depuis les fichiers Swift :
 *   - Jeera/Models/SetPatternMode.swift  (SetPatternMode, FatigueClass, SetType)
 *   - Jeera/Models/ProgressionPolicy.swift (ProgressionPolicy)
 *
 * Convention : chaque enum est modélisé en `as const` (objet) + union de
 * chaînes littérales dérivée par `typeof`. Les rawValues correspondent EXACTEMENT
 * à ceux persistés côté Swift / présents dans l'export JSON (jeera_backup.json).
 */

// ---------------------------------------------------------------------------
// SetPatternMode
// ---------------------------------------------------------------------------

/** Miroir de `SetPatternMode` (Swift). RawValues = valeurs persistées. */
export const SetPatternMode = {
  straight: "straight",
  topSetBackoff: "top_set_backoff",
  ramping: "ramping",
  bodyweight: "bodyweight",
  weightedBodyweight: "weighted_bodyweight",
  assistedBodyweight: "assisted_bodyweight",
} as const;

export type SetPatternMode = (typeof SetPatternMode)[keyof typeof SetPatternMode];

export const SET_PATTERN_MODES: SetPatternMode[] = Object.values(SetPatternMode);

/** Nom d'affichage complet (reste en anglais côté Swift d'origine — conservé tel quel). */
export const setPatternModeDisplayName: Record<SetPatternMode, string> = {
  straight: "Straight Sets",
  top_set_backoff: "Top Set + Backoffs",
  ramping: "Ramping",
  bodyweight: "Bodyweight",
  weighted_bodyweight: "Weighted Bodyweight",
  assisted_bodyweight: "Assisted Bodyweight",
};

export const setPatternModeShortName: Record<SetPatternMode, string> = {
  straight: "Straight",
  top_set_backoff: "Top + Back",
  ramping: "Ramp",
  bodyweight: "BW",
  weighted_bodyweight: "Weighted BW",
  assisted_bodyweight: "Assisted",
};

/**
 * Miroir de `SetPatternMode.usesWeight` (Swift) : tous les modes utilisent le
 * poids sauf `bodyweight` pur.
 */
export function usesWeight(mode: SetPatternMode): boolean {
  return mode !== SetPatternMode.bodyweight;
}

// ---------------------------------------------------------------------------
// FatigueClass
// ---------------------------------------------------------------------------

/**
 * Miroir de `FatigueClass` (Swift). Les rawValues persistés sont des codes
 * courts ("H"/"M"/"L") — on garde les valeurs internes lisibles en anglais
 * ("heavy"/"medium"/"light") et on fournit des convertisseurs vers/depuis le
 * raw JSON, comme demandé.
 */
export const FatigueClass = {
  heavy: "heavy",
  medium: "medium",
  light: "light",
} as const;

export type FatigueClass = (typeof FatigueClass)[keyof typeof FatigueClass];

export const FATIGUE_CLASSES: FatigueClass[] = Object.values(FatigueClass);

/** rawValue Swift ("H" / "M" / "L") pour chaque FatigueClass. */
export const fatigueClassRaw: Record<FatigueClass, "H" | "M" | "L"> = {
  heavy: "H",
  medium: "M",
  light: "L",
};

/** Convertit une valeur brute JSON ("H"/"M"/"L") en FatigueClass. Défaut: medium. */
export function fatigueClassFromRaw(raw: string | null | undefined): FatigueClass {
  switch (raw) {
    case "H":
      return FatigueClass.heavy;
    case "M":
      return FatigueClass.medium;
    case "L":
      return FatigueClass.light;
    default:
      return FatigueClass.medium;
  }
}

/** Convertit un FatigueClass en rawValue Swift ("H"/"M"/"L"). */
export function fatigueClassToRaw(fatigueClass: FatigueClass): "H" | "M" | "L" {
  return fatigueClassRaw[fatigueClass];
}

/**
 * Propriétés associées à chaque FatigueClass (miroir de `baseRepDrop` et
 * `usesStrictPromotion` en Swift). Utilisé par le moteur de progression.
 */
export interface FatigueClassProperties {
  /** Chute de reps attendue au set suivant à charge égale (algo §3.2). */
  baseRepDrop: number;
  /** Règle de promotion stricte (2 des 3 dernières expositions) vs normale (1 des 2 dernières). */
  usesStrictPromotion: boolean;
}

export const FATIGUE_CLASS_PROPERTIES: Record<FatigueClass, FatigueClassProperties> = {
  heavy: { baseRepDrop: 2.0, usesStrictPromotion: true },
  medium: { baseRepDrop: 1.5, usesStrictPromotion: false },
  light: { baseRepDrop: 1.0, usesStrictPromotion: false },
};

// ---------------------------------------------------------------------------
// SetType
// ---------------------------------------------------------------------------

/** Miroir de `SetType` (Swift). RawValues = valeurs persistées. */
export const SetType = {
  warmup: "warmup",
  work: "work",
  backoff: "backoff",
  topSet: "top_set",
} as const;

export type SetType = (typeof SetType)[keyof typeof SetType];

export const SET_TYPES: SetType[] = Object.values(SetType);

export const setTypeDisplayName: Record<SetType, string> = {
  warmup: "Warmup",
  work: "Work",
  backoff: "Backoff",
  top_set: "Top Set",
};

/** Étiquette courte affichée sur le badge du set ("W"/""/"B"/"T"). */
export const setTypeShortLabel: Record<SetType, string> = {
  warmup: "W",
  work: "",
  backoff: "B",
  top_set: "T",
};

// ---------------------------------------------------------------------------
// ProgressionPolicy
// ---------------------------------------------------------------------------

/** Miroir de `ProgressionPolicy` (Swift). RawValues = valeurs persistées. */
export const ProgressionPolicy = {
  generic: "generic",
  overreachJump: "overreachJump",
  testThenPromote: "testThenPromote",
  voluntaryCap: "voluntaryCap",
} as const;

export type ProgressionPolicy = (typeof ProgressionPolicy)[keyof typeof ProgressionPolicy];

export const PROGRESSION_POLICIES: ProgressionPolicy[] = Object.values(ProgressionPolicy);

export const progressionPolicyDisplayName: Record<ProgressionPolicy, string> = {
  generic: "Standard",
  overreachJump: "Saut overreach",
  testThenPromote: "Test puis promotion",
  voluntaryCap: "Cap de reps",
};

export const progressionPolicyDescription: Record<ProgressionPolicy, string> = {
  generic: "Double progression classique",
  overreachJump: "Plateau → surcharge directe",
  testThenPromote: "S2 teste +1 cran, succès → promotion",
  voluntaryCap: "Reps plafonnées à voluntaryRepCap",
};

// ---------------------------------------------------------------------------
// SuggestionMode
// ---------------------------------------------------------------------------

/**
 * Mode de suggestion retourné par le moteur de progression (utilisé plus tard
 * par `lib/engines/`). Pas d'équivalent direct persisté en Swift — reflète le
 * scoring de candidats décrit dans CLAUDE.md :
 *   recordAttempt(+35) > transitionMode(+30) > fallbackHypertrophy(+22) > plateauBreak(+18)
 */
export const SuggestionMode = {
  recordAttempt: "recordAttempt",
  fallbackHypertrophy: "fallbackHypertrophy",
  plateauBreak: "plateauBreak",
  transitionMode: "transitionMode",
} as const;

export type SuggestionMode = (typeof SuggestionMode)[keyof typeof SuggestionMode];

export const SUGGESTION_MODES: SuggestionMode[] = Object.values(SuggestionMode);
