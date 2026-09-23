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

/** Nom d'affichage complet, en français comme le reste de l'interface. */
export const setPatternModeDisplayName: Record<SetPatternMode, string> = {
  straight: "Séries droites",
  top_set_backoff: "Série lourde + séries allégées",
  ramping: "Montée pyramidale",
  bodyweight: "Poids du corps",
  weighted_bodyweight: "Poids du corps lesté",
  assisted_bodyweight: "Poids du corps assisté",
};

export const setPatternModeShortName: Record<SetPatternMode, string> = {
  straight: "Droites",
  top_set_backoff: "Lourde + allégées",
  ramping: "Pyramide",
  bodyweight: "PDC",
  weighted_bodyweight: "PDC lesté",
  assisted_bodyweight: "PDC assisté",
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
// StopReason (raison d'arrêt d'une série)
// ---------------------------------------------------------------------------

/**
 * Pourquoi une série s'est arrêtée, quand ce n'est PAS l'échec musculaire visé.
 * Issu de oui.rtf (point #7, nerf ulnaire) : une série interrompue pour douleur
 * ou matériel ne reflète pas la vraie capacité → ne doit pas entraîner le modèle
 * de performance (cf. `stopReasonTrainsModel`). Nouveau champ nullable sur
 * `LoggedSet.stopReason` — `null` = arrêt normal (musculaire volontaire au RIR visé),
 * comportement historique inchangé.
 */
export const StopReason = {
  /** Arrêt musculaire volontaire (RIR visé atteint) — série représentative. */
  muscular: "muscular",
  /** Technique / forme cassée avant l'échec musculaire. */
  technique: "technique",
  /** Douleur ou symptôme (ex. nerf ulnaire) — série NON représentative. */
  pain: "pain",
  /** Contrainte matérielle (charge indisponible, machine prise…) — NON représentative. */
  equipment: "equipment",
} as const;

export type StopReason = (typeof StopReason)[keyof typeof StopReason];

export const STOP_REASONS: StopReason[] = Object.values(StopReason);

export const stopReasonDisplayName: Record<StopReason, string> = {
  muscular: "Musculaire",
  technique: "Technique",
  pain: "Douleur",
  equipment: "Matériel",
};

/**
 * Une série arrêtée pour douleur/matériel n'est pas une mesure valide de la
 * capacité : elle est exclue des baselines de performance, records et ancres de
 * progression. Un arrêt musculaire (défaut) ou technique reste représentatif.
 */
export function stopReasonTrainsModel(reason: StopReason | null | undefined): boolean {
  return reason !== StopReason.pain && reason !== StopReason.equipment;
}

// ---------------------------------------------------------------------------
// RIR (reps in reserve) rapporté
// ---------------------------------------------------------------------------

/**
 * Options de RIR proposées après/pendant une série (oui.rtf point #1). L'estimation
 * du RIR gagne en fiabilité près de l'échec ; au-delà, `4` signifie « 4+ » (borne
 * inférieure), sans fausse précision entre 5/6/7. `LoggedSet.reportedRir` : entier
 * 0..4 ou `null` (non rapporté). Jamais présélectionné, facultatif, non bloquant.
 */
export const REPORTED_RIR_MIN = 0;
export const REPORTED_RIR_MAX = 4;
export const REPORTED_RIR_OPTIONS = [0, 1, 2, 3, 4] as const;

/** Libellé court d'un RIR (4 = « 4+ »). */
export function reportedRirLabel(rir: number): string {
  return rir >= REPORTED_RIR_MAX ? `${REPORTED_RIR_MAX}+` : String(rir);
}

// ---------------------------------------------------------------------------
// TrainingPhase
// ---------------------------------------------------------------------------

/**
 * Intention d'entraînement du moment. Elle n'agit PAS sur les suggestions de charge — le moteur
 * reste dérivé de l'historique — mais sur leur interprétation : en déficit, maintenir sa charge
 * est le résultat visé, alors que le détecteur de plateau y verrait une stagnation à corriger.
 */
export const TrainingPhase = {
  /** Déficit calorique : la priorité est de préserver la charge, pas de la battre. */
  cut: "cut",
  maintain: "maintain",
  bulk: "bulk",
} as const;

export type TrainingPhase = (typeof TrainingPhase)[keyof typeof TrainingPhase];

export const TRAINING_PHASES: TrainingPhase[] = Object.values(TrainingPhase);

export const trainingPhaseDisplayName: Record<TrainingPhase, string> = {
  cut: "Sèche",
  maintain: "Maintien",
  bulk: "Prise",
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
  lockout: "Fin (verrouillage)",
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

/**
 * Libellés du point faible selon le mouvement. Les trois valeurs stockées restent les mêmes
 * (début, milieu, fin de l'amplitude concentrique), mais « Lockout » ne veut rien dire sur une
 * élévation latérale ou un tirage : chaque famille de mouvement a ses mots.
 */
export function plateauWeakPointLabel(point: PlateauWeakPoint, pattern: MovementPattern | null): string {
  switch (pattern) {
    case "horizontal_press":
    case "vertical_press":
      return { bottom: "Bas (départ de la poussée)", mid: "Milieu", lockout: "Fin (verrouillage des bras)" }[point];
    case "squat":
    case "hinge":
      return { bottom: "Bas (sortie du bas)", mid: "Milieu", lockout: "Fin (verrouillage)" }[point];
    case "horizontal_pull":
    case "vertical_pull":
      return { bottom: "Début (bras tendus)", mid: "Milieu", lockout: "Fin (contraction)" }[point];
    default:
      return { bottom: "Début du mouvement", mid: "Milieu", lockout: "Fin (contraction)" }[point];
  }
}

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
