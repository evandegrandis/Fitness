import standardsJson from "@/data/strength_standards_corrected.json";
import { estimated1RM } from "@/lib/engines/e1rm";
import { workingSetsOf } from "@/lib/engines/lifecycle";
import { normalRecordSets } from "@/lib/engines/records";
import { SetType, type BenchmarkUnit } from "@/lib/models/enums";
import type { Exercise, LoggedSet, UserSettings } from "@/lib/models/types";

/**
 * BENCHMARK_LEVEL_SPEC.md — moteur de repères de force StrengthLevel.
 *
 * Source de vérité = `data/strength_standards_corrected.json` (§1, complété au fil de l'eau par
 * Evan/Opus — NE JAMAIS inventer une table pour un exercice qui n'y figure pas encore : ces
 * exercices restent `hasBenchmark:false`, dégradation gracieuse, et s'activent automatiquement
 * dès que le JSON gagne l'entrée correspondante, sans changement de code ici).
 *
 * Chaque entrée du JSON est un point de référence UNIQUE au poids de corps du profil de sourcing
 * (`_meta.profile.bodyWeightKg`, actuellement 80 kg) — PAS une courbe multi-poids. Le moteur
 * n'active donc le repère absolu que pour ce poids exact (avec une tolérance purement flottante),
 * sans interpolation/scaling inventé, et le précise via `profileLabel`. Les deux anciennes tables embarquées (Plate loaded
 * lat raise / Lateral raises), qui AVAIENT une courbe complète par poids, ont été migrées dans le
 * JSON en P3.1 en extrayant leur ligne bodyweight=80 exacte (déjà sourcée strengthlevel.com,
 * mêmes valeurs, zéro chiffre inventé) — voir `_meta.engineNote` du JSON.
 */

// ---------------------------------------------------------------------------
// Types JSON (miroir de BENCHMARK_LEVEL_SPEC.md §1)
// ---------------------------------------------------------------------------

export type StandardConvention = "per_arm" | "total" | "added" | "reps";

interface StandardEntry {
  slSlug: string;
  unit: BenchmarkUnit;
  convention: StandardConvention;
  isMachine: boolean;
  /** 5 valeurs (kg), un point par palier — présent si `unit` est `load` ou `reps_and_load`. */
  load?: number[];
  /** 5 valeurs (reps), un point par palier — présent si `unit` est `reps` ou `reps_and_load`. */
  reps?: number[];
  /** Conversion explicite de la charge saisie dans Jeera vers l'unité du standard publié. */
  loggedLoadMultiplier?: number;
  loadNote?: string;
  caveat?: string;
}

const STANDARDS = (standardsJson as { standards: Record<string, StandardEntry> }).standards;
const META = (standardsJson as {
  _meta: { profile: { gender: "male" | "female"; bodyWeightKg: number; ageYears: number }; dataCutoff?: string };
})._meta;

const DATA_CUTOFF = META.dataCutoff ?? "2026-03-05";

// ---------------------------------------------------------------------------
// Niveaux/percentiles publiés par StrengthLevel.
// ---------------------------------------------------------------------------

export const STRENGTH_LEVEL_KEYS = ["beginner", "novice", "intermediate", "advanced", "elite"] as const;
export type StrengthLevelKey = (typeof STRENGTH_LEVEL_KEYS)[number];
export type BenchmarkTone = "below" | StrengthLevelKey;

export interface StrengthThresholds {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
}

export interface BenchmarkLevel {
  key: "below_beginner" | StrengthLevelKey;
  label: string;
  tone: BenchmarkTone;
}

export interface BenchmarkSource {
  title: string;
  url: string;
  /** Convention appliquée aux logs Jeera pour rendre la comparaison explicite. */
  loadConvention: string;
  dataCutoff: string;
}

/**
 * Une jauge (un axe : charge OU reps) déjà résolue pour un couple exercice+profil+valeur.
 * `currentValue` est en kg pour l'axe "load" (e1RM StrengthLevel) et en reps bruts pour l'axe "reps".
 */
export interface BenchmarkGaugeData {
  axis: "load" | "reps";
  currentValue: number;
  thresholds: StrengthThresholds;
  position: number;
  level: BenchmarkLevel;
  nextLevel: StrengthLevelKey | null;
  gapToNext: number | null;
}

export interface ExerciseBenchmark {
  hasBenchmark: boolean;
  /** Jauge "principale" — conservée pour compat API (BenchmarkGauge.tsx, ExercisesLayer.tsx, ProgressInsights.tsx). */
  currentE1RM: number;
  thresholds: StrengthThresholds | null;
  position: number | null;
  level: BenchmarkLevel | null;
  nextLevel: StrengthLevelKey | null;
  gapToNext: number | null;
  source: BenchmarkSource | null;
  profileLabel: string | null;
  /** BENCHMARK_LEVEL_SPEC.md §2 (P3.1) — additifs, ne changent rien pour les consommateurs existants. */
  unit: BenchmarkUnit | null;
  /** Axe réellement utilisé par la jauge principale ci-dessus ("load" => currentE1RM en kg, "reps" => currentE1RM est un compte de reps brut, pas un e1RM). */
  primaryAxis: "load" | "reps" | null;
  isMachine: boolean;
  caveat: string | null;
  /** BENCHMARK_LEVEL_SPEC.md §2.2 (P3.2) — jauge secondaire (unit "reps_and_load" uniquement, ex. tractions lestées), `null` sinon. */
  secondary: BenchmarkGaugeData | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_LABELS: Record<StrengthLevelKey, string> = {
  beginner: "Débutant",
  novice: "Novice",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
  elite: "Élite",
};

const CONVENTION_LABELS: Record<StandardConvention, string> = {
  per_arm: "charge d'un bras, sans doubler",
  total: "charge totale",
  added: "charge ajoutée au poids de corps",
  reps: "répétitions au poids de corps",
};

/** La table actuelle ne contient qu'une ligne H80 : aucune marge anthropométrique n'est inventée. */
const SOURCE_WEIGHT_TOLERANCE_KG = 1e-6;

/** Formule documentée par StrengthLevel pour convertir un set en 1RM estimé. */
export function strengthLevelEstimated1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const epley = weight * (1 + reps / 30);
  const brzycki = reps < 37 ? weight * (36 / (37 - reps)) : epley;
  if (reps < 8) return brzycki;
  if (reps > 10) return epley;
  const epleyShare = (reps - 8) / 2;
  return brzycki * (1 - epleyShare) + epley * epleyShare;
}

function isFiveTuple(values: number[] | undefined): values is [number, number, number, number, number] {
  return Array.isArray(values) && values.length === 5 && values.every((v) => Number.isFinite(v));
}

function arrayToThresholds(values: [number, number, number, number, number]): StrengthThresholds {
  return { beginner: values[0], novice: values[1], intermediate: values[2], advanced: values[3], elite: values[4] };
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function sourceFor(entry: StandardEntry): BenchmarkSource {
  const multiplier =
    entry.loggedLoadMultiplier != null && Number.isFinite(entry.loggedLoadMultiplier) && entry.loggedLoadMultiplier > 0
      ? entry.loggedLoadMultiplier
      : 1;
  return {
    title: `StrengthLevel · ${humanizeSlug(entry.slSlug)}`,
    url: `https://strengthlevel.com/strength-standards/${entry.slSlug}/kg`,
    loadConvention:
      entry.loadNote ??
      (multiplier === 1
        ? CONVENTION_LABELS[entry.convention]
        : `charge saisie ×${multiplier} vers ${CONVENTION_LABELS[entry.convention]}`),
    dataCutoff: DATA_CUTOFF,
  };
}

function standardEntryFor(exercise: Pick<Exercise, "strengthStandardKey">): StandardEntry | null {
  const key = exercise.strengthStandardKey;
  if (!key) return null;
  return STANDARDS[key] ?? null;
}

/** true si un repère StrengthLevel est disponible dans le JSON pour cet exercice (§9, jamais de crash). */
export function supportsStrengthLevelBenchmark(exercise: Pick<Exercise, "strengthStandardKey">): boolean {
  return standardEntryFor(exercise) !== null;
}

/** Axe publié en priorité pour cet exercice, indépendamment du profil utilisateur. */
export function benchmarkPrimaryAxisFor(
  exercise: Pick<Exercise, "strengthStandardKey">
): "load" | "reps" | null {
  const entry = standardEntryFor(exercise);
  if (!entry) return null;
  if (isFiveTuple(entry.load)) return "load";
  if (isFiveTuple(entry.reps)) return "reps";
  return null;
}

/** Axes réellement publiés, dans l'ordre de présentation par défaut. */
export function benchmarkAxesFor(
  exercise: Pick<Exercise, "strengthStandardKey">
): Array<"load" | "reps"> {
  const entry = standardEntryFor(exercise);
  if (!entry) return [];
  return [
    ...(isFiveTuple(entry.load) ? (["load"] as const) : []),
    ...(isFiveTuple(entry.reps) ? (["reps"] as const) : []),
  ];
}

/** BENCHMARK_LEVEL_SPEC.md §4 (P3.4) — résumé d'une entrée du JSON, pour le sélecteur de l'éditeur. */
export interface StandardSummary {
  key: string;
  unit: BenchmarkUnit;
  convention: StandardConvention;
  isMachine: boolean;
  slSlug: string;
}

/**
 * Toutes les clés `strengthStandardKey` CONNUES du JSON, triées FR — alimente le sélecteur de
 * `ExerciseEditorSheet.tsx` (§4 : "un exo mappé entre AUTOMATIQUEMENT dans jauge + feu +
 * anti-plateau"). Nouvelle entrée ajoutée au JSON par Evan => apparaît ici automatiquement au
 * prochain chargement, aucun code à changer.
 */
export function listKnownStandards(): StandardSummary[] {
  return Object.entries(STANDARDS)
    .map(([key, entry]): StandardSummary => ({
      key,
      unit: entry.unit,
      convention: entry.convention,
      isMachine: entry.isMachine,
      slSlug: entry.slSlug,
    }))
    .sort((a, b) => a.key.localeCompare(b.key, "fr"));
}

/**
 * Position continue sur les cinq paliers (0 = débutant, 1 = élite).
 * Chaque intervalle publié occupe un quart de la jauge; la valeur reste non
 * clampée afin que l'appelant distingue sous-débutant et au-dessus d'élite.
 */
export function benchmarkPosition(currentValue: number, thresholds: StrengthThresholds): number {
  const values = STRENGTH_LEVEL_KEYS.map((key) => thresholds[key]);
  if (currentValue < values[0]) {
    return values[0] > 0 ? (currentValue / values[0] - 1) * 0.25 : -0.25;
  }
  for (let index = 0; index < values.length - 1; index += 1) {
    if (currentValue < values[index + 1]) {
      const span = values[index + 1] - values[index];
      const within = span > 0 ? (currentValue - values[index]) / span : 0;
      return (index + within) / (values.length - 1);
    }
  }
  const lastSpan = values[4] - values[3];
  return 1 + (lastSpan > 0 ? (currentValue - values[4]) / lastSpan : 0);
}

export function benchmarkLevel(currentValue: number, thresholds: StrengthThresholds): BenchmarkLevel {
  if (currentValue < thresholds.beginner) return { key: "below_beginner", label: "Sous le palier débutant", tone: "below" };
  let achieved: StrengthLevelKey = "beginner";
  for (const key of STRENGTH_LEVEL_KEYS) {
    if (currentValue >= thresholds[key]) achieved = key;
  }
  return { key: achieved, label: LEVEL_LABELS[achieved], tone: achieved };
}

/** Rang entier du palier (0 = sous débutant, 5 = élite) — comparaison "franchit-il le palier suivant ?" (§3, P3.3). */
export function strengthLevelRank(key: BenchmarkLevel["key"]): number {
  if (key === "below_beginner") return 0;
  return STRENGTH_LEVEL_KEYS.indexOf(key) + 1;
}

function nextLevelOf(currentValue: number, thresholds: StrengthThresholds): StrengthLevelKey | null {
  return STRENGTH_LEVEL_KEYS.find((key) => currentValue < thresholds[key]) ?? null;
}

function buildGauge(axis: "load" | "reps", currentValue: number, thresholds: StrengthThresholds): BenchmarkGaugeData {
  const nextLevel = nextLevelOf(currentValue, thresholds);
  return {
    axis,
    currentValue,
    thresholds,
    position: benchmarkPosition(currentValue, thresholds),
    level: benchmarkLevel(currentValue, thresholds),
    nextLevel,
    gapToNext: nextLevel ? Math.max(0, thresholds[nextLevel] - currentValue) : 0,
  };
}

/**
 * Distance sans unité jusqu'au prochain palier. Elle repose sur la position normalisée de la
 * jauge, jamais sur un écart brut (qui rendrait 1 rep artificiellement comparable à 1 kg).
 */
export function normalizedDistanceToNext(
  gauge: Pick<BenchmarkGaugeData, "position" | "nextLevel">
): number | null {
  if (gauge.nextLevel === null) return null;
  const targetIndex = STRENGTH_LEVEL_KEYS.indexOf(gauge.nextLevel);
  if (targetIndex < 0) return null;
  const targetPosition = targetIndex / (STRENGTH_LEVEL_KEYS.length - 1);
  return Math.max(0, targetPosition - gauge.position);
}

// ---------------------------------------------------------------------------
// resolveStandard — thresholds seuls, sans valeur mesurée (utilisé par P3.3 pour tester
// un poids/reps hypothétique sans avoir à fabriquer un "set" fictif).
// ---------------------------------------------------------------------------

export interface ResolvedStandard {
  entry: StandardEntry;
  source: BenchmarkSource;
  isMachine: boolean;
  caveat: string | null;
  profileLabel: string;
  /** Axe utilisable en priorité (load si présent, sinon reps). */
  primaryAxis: "load" | "reps";
  primaryThresholds: StrengthThresholds;
  /** reps_and_load uniquement : l'autre axe, si également valide. */
  secondaryAxis: "reps" | null;
  secondaryThresholds: StrengthThresholds | null;
}

/**
 * Résout la table de seuils pour un exercice + un profil, sans valeur mesurée. `null` si pas de
 * `strengthStandardKey` connu OU profil hors de la plage adulte documentée par StrengthLevel
 * (25–40 ans) OU différent du profil homme/80 kg réellement sourcé. Il n'existe qu'un point H80,
 * donc un autre poids masque la jauge absolue au lieu de prétendre interpoler.
 */
export function resolveStandard(
  exercise: Pick<Exercise, "strengthStandardKey">,
  profile: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">
): ResolvedStandard | null {
  const entry = standardEntryFor(exercise);
  if (!entry) return null;

  const { bodyWeightKg, gender, ageYears } = profile;
  // StrengthLevel indique que 25–40 ans est sa référence adulte ; le JSON n'est sourcé que pour
  // le genre ET le poids de `_meta.profile`. Hors de ce point H80, on masque le repère plutôt que
  // d'inventer une interpolation à partir d'une seule ligne.
  const profileSupported =
    bodyWeightKg != null &&
    Math.abs(bodyWeightKg - META.profile.bodyWeightKg) <= SOURCE_WEIGHT_TOLERANCE_KG &&
    gender === META.profile.gender &&
    ageYears != null &&
    ageYears >= 25 &&
    ageYears <= 40;
  if (!profileSupported) return null;

  const hasLoad = isFiveTuple(entry.load);
  const hasReps = isFiveTuple(entry.reps);
  if (!hasLoad && !hasReps) return null;

  const primaryAxis: "load" | "reps" = hasLoad ? "load" : "reps";
  const primaryThresholds = arrayToThresholds((hasLoad ? entry.load : entry.reps) as [number, number, number, number, number]);
  const dualAxis = hasLoad && hasReps;

  return {
    entry,
    source: sourceFor(entry),
    isMachine: entry.isMachine,
    caveat: entry.caveat ?? null,
    profileLabel: `Référence ${META.profile.gender === "male" ? "Homme" : "Femme"} · ${META.profile.bodyWeightKg} kg · 25–40 ans · profil ${ageYears} ans`,
    primaryAxis,
    primaryThresholds,
    secondaryAxis: dualAxis ? "reps" : null,
    secondaryThresholds: dualAxis ? arrayToThresholds(entry.reps as [number, number, number, number, number]) : null,
  };
}

/**
 * Convertit un set Jeera dans l'unité d'un axe publié. Centralise notamment la conversion Plate
 * loaded « charge saisie par bras ×2 vers charge totale » afin que jauge et signal de niveau
 * puissent employer exactement la même règle data-driven.
 */
export function strengthStandardValueForSet(
  resolved: ResolvedStandard,
  set: { weight: number; reps: number },
  axis: "load" | "reps" = resolved.primaryAxis
): number {
  if (axis === "reps") return set.reps > 0 ? set.reps : 0;
  const multiplier =
    resolved.entry.loggedLoadMultiplier != null &&
    Number.isFinite(resolved.entry.loggedLoadMultiplier) &&
    resolved.entry.loggedLoadMultiplier > 0
      ? resolved.entry.loggedLoadMultiplier
      : 1;
  return strengthLevelEstimated1RM(set.weight * multiplier, set.reps);
}

/**
 * Éligibilité physique d'un set à un axe StrengthLevel. L'axe reps publié est
 * une performance PDC stricte ; l'axe load est une charge externe/ajoutée
 * positive et ne doit jamais interpréter une assistance comme du lest.
 */
export function strengthStandardAxisSupportsSet(
  exercise: Pick<Exercise, "setPatternMode"> | Partial<Pick<Exercise, "setPatternMode">>,
  set: { weight: number; reps: number },
  axis: "load" | "reps"
): boolean {
  if (set.reps <= 0) return false;
  if (axis === "reps") return set.weight === 0;
  return set.weight > 0 && exercise.setPatternMode !== "assisted_bodyweight";
}

// ---------------------------------------------------------------------------
// exerciseBenchmark — API existante conservée (§2 "étendre l'existant, garder l'API")
// ---------------------------------------------------------------------------

const EMPTY_BENCHMARK: ExerciseBenchmark = {
  hasBenchmark: false,
  currentE1RM: 0,
  thresholds: null,
  position: null,
  level: null,
  nextLevel: null,
  gapToNext: null,
  source: null,
  profileLabel: null,
  unit: null,
  primaryAxis: null,
  isMachine: false,
  caveat: null,
  secondary: null,
};

/**
 * Repère StrengthLevel pour un set donné. Charge/reps/reps_and_load :
 *   - `load` : e1RM du set comparé à `entry.load` (5 paliers, kg).
 *   - `reps` : `set.reps` brut comparé à `entry.reps` (5 paliers, reps) — pas de formule e1RM.
 *   - `reps_and_load` : les deux ; la jauge "principale" (champs plats, compat API) est celle qui a
 *     une valeur mesurable (`load` prioritaire si le set a une charge > 0, sinon `reps`) ; l'autre,
 *     si elle a aussi une valeur mesurable, est exposée dans `secondary` (P3.2, machines/tractions
 *     lestées "les deux").
 */
export function exerciseBenchmark(
  exercise: Pick<Exercise, "strengthStandardKey"> & Partial<Pick<Exercise, "setPatternMode">>,
  set: { weight: number; reps: number },
  profile: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">
): ExerciseBenchmark {
  const resolved = resolveStandard(exercise, profile);
  if (!resolved) return EMPTY_BENCHMARK;

  return buildExerciseBenchmark(
    resolved,
    {
      load: strengthStandardAxisSupportsSet(exercise, set, "load") ? set : null,
      reps: strengthStandardAxisSupportsSet(exercise, set, "reps") ? set : null,
    }
  );
}

type BenchmarkSetValue = { weight: number; reps: number };

function buildExerciseBenchmark(
  resolved: ResolvedStandard,
  setsByAxis: { load: BenchmarkSetValue | null; reps: BenchmarkSetValue | null }
): ExerciseBenchmark {
  const setForAxis = (axis: "load" | "reps"): BenchmarkSetValue | null => setsByAxis[axis];

  const valueForAxis = (axis: "load" | "reps"): number => {
    const set = setForAxis(axis);
    return set ? strengthStandardValueForSet(resolved, set, axis) : 0;
  };

  const primaryValue = valueForAxis(resolved.primaryAxis);
  const secondaryValue = resolved.secondaryAxis ? valueForAxis(resolved.secondaryAxis) : 0;

  const primaryValid = primaryValue > 0;
  const secondaryValid = resolved.secondaryAxis != null && resolved.secondaryThresholds != null && secondaryValue > 0;

  // Si l'axe principal (load par défaut) n'a pas de valeur mesurable mais que le secondaire
  // (reps) en a une (ex. tractions lestées faites à charge ajoutée <= 0, donc e1RM non défini) —
  // on fait remonter le secondaire en position "principale" pour ne jamais masquer une jauge
  // pourtant valide derrière un axe inapplicable à CE set précis.
  const usePrimaryAsIs = primaryValid || !secondaryValid;
  const mainAxis = usePrimaryAsIs ? resolved.primaryAxis : resolved.secondaryAxis!;
  const mainValue = usePrimaryAsIs ? primaryValue : secondaryValue;
  const mainThresholds = usePrimaryAsIs ? resolved.primaryThresholds : resolved.secondaryThresholds!;
  const mainValid = usePrimaryAsIs ? primaryValid : secondaryValid;

  const otherAxis = usePrimaryAsIs ? resolved.secondaryAxis : resolved.primaryAxis;
  const otherValue = usePrimaryAsIs ? secondaryValue : primaryValue;
  const otherThresholds = usePrimaryAsIs ? resolved.secondaryThresholds : resolved.primaryThresholds;
  const otherValid = usePrimaryAsIs ? secondaryValid : primaryValid;

  if (!mainValid) return EMPTY_BENCHMARK;

  const mainGauge = buildGauge(mainAxis, mainValue, mainThresholds);
  const secondaryGauge = otherValid && otherAxis && otherThresholds ? buildGauge(otherAxis, otherValue, otherThresholds) : null;

  return {
    hasBenchmark: true,
    currentE1RM: mainGauge.currentValue,
    thresholds: mainGauge.thresholds,
    position: mainGauge.position,
    level: mainGauge.level,
    nextLevel: mainGauge.nextLevel,
    gapToNext: mainGauge.gapToNext,
    source: resolved.source,
    profileLabel: resolved.profileLabel,
    unit: resolved.entry.unit,
    primaryAxis: mainGauge.axis,
    isMachine: resolved.isMachine,
    caveat: resolved.caveat,
    secondary: secondaryGauge,
  };
}

export function strengthLevelLabel(key: StrengthLevelKey): string {
  return LEVEL_LABELS[key];
}

// ---------------------------------------------------------------------------
// bestBenchmarkSet — le set repère d'une séance pour le chemin benchmark/niveau.
// ---------------------------------------------------------------------------

/**
 * Meilleur set repère parmi les seuls sets normaux complétés (`work`, `top_set`, `backoff`). Le
 * filtre est répété ici même si l'appelant utilise `completedBenchmarkSets` : un finisher ne doit
 * pouvoir entrer dans un benchmark StrengthLevel par AUCUN chemin. L'axe `reps` choisit le plus
 * grand nombre de reps ; l'axe `load` utilise la formule e1RM StrengthLevel puis les reps en
 * départage.
 */
export function bestBenchmarkSet(sets: LoggedSet[], axis: "load" | "reps" = "load"): LoggedSet | null {
  const eligible = sets.filter(
    (set) =>
      set.completed &&
      (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff) &&
      (axis === "reps" ? set.weight === 0 : set.weight > 0)
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, set) => {
    if (axis === "reps") return set.reps > best.reps ? set : best;
    const bestValue = strengthLevelEstimated1RM(best.weight, best.reps);
    const setValue = strengthLevelEstimated1RM(set.weight, set.reps);
    if (setValue > bestValue) return set;
    if (setValue === bestValue && set.reps > best.reps) return set;
    return best;
  });
}

export interface BestBenchmarkSets {
  load: LoggedSet | null;
  reps: LoggedSet | null;
}

/**
 * Sélection indépendante des deux axes sur les sets normaux. Les continuations
 * immédiates de drop/rest-pause ne peuvent pas devenir un second repère.
 */
export function bestBenchmarkSets(exercise: Exercise, sets: LoggedSet[]): BestBenchmarkSets {
  const normal = normalRecordSets(sets, exercise);
  return {
    load:
      exercise.setPatternMode === "assisted_bodyweight"
        ? null
        : bestBenchmarkSet(normal, "load"),
    reps: bestBenchmarkSet(normal, "reps"),
  };
}

/** Repère complet construit à partir du meilleur set propre à chaque axe. */
export function exerciseBenchmarkForSets(
  exercise: Exercise,
  sets: LoggedSet[],
  profile: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">
): ExerciseBenchmark {
  const resolved = resolveStandard(exercise, profile);
  if (!resolved) return EMPTY_BENCHMARK;
  const best = bestBenchmarkSets(exercise, sets);
  return buildExerciseBenchmark(resolved, best);
}

// ---------------------------------------------------------------------------
// personalProgress — BENCHMARK_LEVEL_SPEC.md §2 (P3.2), "les deux" pour les machines.
// ---------------------------------------------------------------------------

/**
 * Marqueur de progression PERSONNELLE (indépendant de StrengthLevel — utile en particulier pour
 * les machines `isMachine:true`, dont le stack ne correspond à aucun standard universel : voir
 * `resolveStandard().caveat`). Position 0..1 de l'e1RM le plus récent dans [min,max] observé sur
 * TOUT l'historique fourni de cet exercice (percentile, pas un palier absolu).
 */
export interface PersonalProgress {
  hasData: boolean;
  currentE1RM: number;
  minE1RM: number;
  maxE1RM: number;
  /** (current-min)/(max-min), clampé [0,1] ; 0.5 (neutre) si un seul point ou aucune variation observée. */
  percentile: number;
}

const EMPTY_PERSONAL_PROGRESS: PersonalProgress = { hasData: false, currentE1RM: 0, minE1RM: 0, maxE1RM: 0, percentile: 0.5 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Pure — aucun accès horloge/DB. `history` = les `LoggedSet` (toutes séances confondues, séance
 * active exclue par l'appelant comme pour `RecordsEngine.buildRecords`) DÉJÀ filtrés sur CET
 * exercice (même convention que `buildRecords(exercise, historicalSets)`). Ne retient que les sets
 * de travail chargés (`workingSetsOf` — work/top_set complétés, poids > 0 ; les bodyweight purs
 * n'ont pas d'e1RM comparable ici). `exercise` n'est pas lu aujourd'hui (aucune règle par exercice
 * requise pour ce calcul) — conservé dans la signature pour matcher l'API du spec §2 et rester
 * cohérent avec les fonctions sœurs (`exerciseBenchmark`, `resolveStandard`) qui prennent toutes
 * l'exercice en premier paramètre.
 */
export function personalProgress(_exercise: Pick<Exercise, "id">, history: LoggedSet[]): PersonalProgress {
  const working = workingSetsOf(history).filter((s) => s.weight > 0);
  if (working.length === 0) return EMPTY_PERSONAL_PROGRESS;

  // Ordre chronologique défensif : "la perf du jour" = l'e1RM du set le plus RÉCENT fourni,
  // indépendamment de l'ordre dans lequel l'appelant a construit `history`.
  const chronological = [...working].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const e1rms = chronological.map((s) => estimated1RM(s.weight, s.reps));
  const currentE1RM = e1rms[e1rms.length - 1];
  const minE1RM = Math.min(...e1rms);
  const maxE1RM = Math.max(...e1rms);
  const span = maxE1RM - minE1RM;

  return {
    hasData: true,
    currentE1RM,
    minE1RM,
    maxE1RM,
    percentile: span > 0 ? clamp01((currentE1RM - minE1RM) / span) : 0.5,
  };
}
