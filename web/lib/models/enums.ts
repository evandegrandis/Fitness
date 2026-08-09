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
  /** Bloc de fin de séance, conservé dans l'historique mais exclu des ancres normales. */
  finisher: "finisher",
} as const;

export type SetType = (typeof SetType)[keyof typeof SetType];

export const SET_TYPES: SetType[] = Object.values(SetType);

export const setTypeDisplayName: Record<SetType, string> = {
  warmup: "Warmup",
  work: "Work",
  backoff: "Backoff",
  top_set: "Top Set",
  finisher: "Finisher",
};

/** Étiquette courte affichée sur le badge du set ("W"/""/"B"/"T"). */
export const setTypeShortLabel: Record<SetType, string> = {
  warmup: "W",
  work: "",
  backoff: "B",
  top_set: "T",
  finisher: "F",
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
// MovementPattern
// ---------------------------------------------------------------------------

/**
 * VARIATION_CYCLING_SPEC §5 — pattern de mouvement d'un `Exercise`, clé de
 * carry-over pour la rotation de variation (§6 : filtre dur
 * `movementPattern === current.movementPattern`). Pas d'équivalent Swift —
 * nouveau champ nullable, dégradation gracieuse si `null` (fallback sur le
 * recouvrement musculaire seul, jamais de crash, cf. §9).
 */
export const MovementPattern = {
  horizontalPress: "horizontal_press",
  verticalPress: "vertical_press",
  horizontalPull: "horizontal_pull",
  verticalPull: "vertical_pull",
  squat: "squat",
  hinge: "hinge",
  isolation: "isolation",
} as const;

export type MovementPattern = (typeof MovementPattern)[keyof typeof MovementPattern];

export const MOVEMENT_PATTERNS: MovementPattern[] = Object.values(MovementPattern);

export const movementPatternDisplayName: Record<MovementPattern, string> = {
  horizontal_press: "Poussée horizontale",
  vertical_press: "Poussée verticale",
  horizontal_pull: "Tirage horizontal",
  vertical_pull: "Tirage vertical",
  squat: "Squat",
  hinge: "Hinge (charnière de hanche)",
  isolation: "Isolation",
};

// ---------------------------------------------------------------------------
// ResistanceProfile
// ---------------------------------------------------------------------------

/**
 * VARIATION_CYCLING_SPEC §5.2 — où l'exercice est le plus dur dans l'amplitude de
 * mouvement. Sert à cibler le point faible mesuré de l'utilisateur (§6, `weakPointFit`).
 * Pas d'équivalent Swift — nouveau champ nullable, dégradation gracieuse si `null`
 * (`weakPointFit` reste neutre, cf. §9). P2.1 : seed par défaut `null` partout (pas de
 * tagging manuel des 29 exos, à la différence de `movementPattern` en P1.4 — décision
 * tracée dans VARIATION_CYCLING_IMPL.md P2.1).
 */
export const ResistanceProfile = {
  bottom: "bottom",
  mid: "mid",
  lockout: "lockout",
  even: "even",
} as const;

export type ResistanceProfile = (typeof ResistanceProfile)[keyof typeof ResistanceProfile];

export const RESISTANCE_PROFILES: ResistanceProfile[] = Object.values(ResistanceProfile);

export const resistanceProfileDisplayName: Record<ResistanceProfile, string> = {
  bottom: "Bas (départ du mouvement)",
  mid: "Milieu",
  lockout: "Lockout (fin du mouvement)",
  even: "Uniforme",
};

/**
 * VARIATION_CYCLING_SPEC §5.3/§8 — point faible MESURÉ (capture 1-tap « où ça a calé ? »
 * à l'entrée en plateau), persisté sur `LoggedExercise.plateauWeakPoint` — seule donnée
 * utilisateur réellement nouvelle à persister (input brut, pas un état dérivé : ne viole
 * pas l'invariant de pureté HARDENED §0.2). Sous-ensemble de `ResistanceProfile` :
 * `"even"` n'est pas une réponse valide au tap (un plateau cale toujours sur une portion
 * précise de l'amplitude, jamais "uniformément").
 */
export const PLATEAU_WEAK_POINTS = [
  ResistanceProfile.bottom,
  ResistanceProfile.mid,
  ResistanceProfile.lockout,
] as const;

export type PlateauWeakPoint = (typeof PLATEAU_WEAK_POINTS)[number];

export const plateauWeakPointDisplayName: Record<PlateauWeakPoint, string> = {
  bottom: resistanceProfileDisplayName.bottom,
  mid: resistanceProfileDisplayName.mid,
  lockout: resistanceProfileDisplayName.lockout,
};

// ---------------------------------------------------------------------------
// BenchmarkUnit
// ---------------------------------------------------------------------------

/**
 * BENCHMARK_LEVEL_SPEC.md §1 — unité du repère StrengthLevel d'un `Exercise` :
 *   - `load` : charge (kg), comparée via e1RM (`lib/engines/benchmark.ts`).
 *   - `reps` : nombre de reps au poids de corps, comparé directement (pas de formule e1RM).
 *   - `reps_and_load` : les deux (ex. tractions lestées) — jauge poids ET jauge reps.
 * Pas d'équivalent Swift — nouveau champ nullable sur `Exercise` (`benchmarkUnit`), miroir de
 * `data/strength_standards_corrected.json::standards[key].unit`. `null` = pas de repère (§9,
 * dégradation gracieuse) OU repère `benchmarkLow`/`benchmarkHigh` legacy sans unité connue.
 */
export const BenchmarkUnit = {
  load: "load",
  reps: "reps",
  repsAndLoad: "reps_and_load",
} as const;

export type BenchmarkUnit = (typeof BenchmarkUnit)[keyof typeof BenchmarkUnit];

export const BENCHMARK_UNITS: BenchmarkUnit[] = Object.values(BenchmarkUnit);

export const benchmarkUnitDisplayName: Record<BenchmarkUnit, string> = {
  load: "Charge (kg)",
  reps: "Reps",
  reps_and_load: "Reps + charge lestée",
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
