import { MovementPattern, type MovementPattern as MovementPatternT } from "@/lib/models/enums";
import { MuscleGroup, type MuscleGroup as MuscleGroupT } from "@/lib/models/muscles";
import type { Exercise, MuscleMapping } from "@/lib/models/types";

/**
 * Profils de repli réservés aux noms de machines que l'utilisateur a déjà
 * identifiés sans ambiguïté. Les coefficients ne sont pas de nouvelles
 * estimations : chaque profil recopie un exercice déjà présent dans le
 * catalogue historique, indiqué par `copiedFrom`.
 *
 * Le repli ne s'applique JAMAIS à un exercice déjà mappé. Une correction
 * manuelle dans l'éditeur reste donc prioritaire.
 */
export interface KnownMuscleProfile {
  aliases: readonly string[];
  copiedFrom: string;
  category: string;
  movementPattern: MovementPatternT;
  muscleMappings: readonly Readonly<MuscleMapping>[];
}

export const KNOWN_MUSCLE_PROFILES: readonly KnownMuscleProfile[] = [
  {
    aliases: ["Upper back", "Upper back machine", "Machine upper back"],
    copiedFrom: "Tirage horizontal large",
    category: "Pull",
    movementPattern: MovementPattern.horizontalPull,
    muscleMappings: [
      { muscleGroup: MuscleGroup.deltPost, coefficient: 1 },
      { muscleGroup: MuscleGroup.rhomboides, coefficient: 1 },
      { muscleGroup: MuscleGroup.trapMid, coefficient: 1 },
      { muscleGroup: MuscleGroup.trapSup, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.trapInf, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.latSup, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.latInf, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.bicepsLong, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.bicepsCourt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.brachioradial, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.obliqueExt, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.obliqueInt, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Low row", "Low row machine", "Machine low row"],
    copiedFrom: "Pulley serré",
    category: "Pull",
    movementPattern: MovementPattern.horizontalPull,
    muscleMappings: [
      { muscleGroup: MuscleGroup.latSup, coefficient: 1 },
      { muscleGroup: MuscleGroup.latInf, coefficient: 1 },
      { muscleGroup: MuscleGroup.rhomboides, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.trapMid, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.trapInf, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.deltPost, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.bicepsLong, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.bicepsCourt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.brachioradial, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.flechisseurs, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Pullover machine", "Pull-over machine", "Machine pullover"],
    copiedFrom: "Pull-over poulie haute",
    category: "Pull",
    movementPattern: MovementPattern.isolation,
    muscleMappings: [
      { muscleGroup: MuscleGroup.latSup, coefficient: 1 },
      { muscleGroup: MuscleGroup.latInf, coefficient: 0.8 },
      { muscleGroup: MuscleGroup.trapInf, coefficient: 0.3 },
    ],
  },
  // Machines identifiées le 17/09/2026 (récupération de l'outbox téléphone) :
  // chaque profil recopie l'exercice historique équivalent du catalogue Neon.
  {
    aliases: ["Chest Press LifeFitness", "Chest press Life Fitness"],
    copiedFrom: "Chest Press",
    category: "Push",
    movementPattern: MovementPattern.horizontalPress,
    muscleMappings: [
      { muscleGroup: MuscleGroup.pectStern, coefficient: 1 },
      { muscleGroup: MuscleGroup.pectClav, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.deltAnt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLat, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsMed, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLong, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.deltLat, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Isolateral incline press", "Iso-lateral incline press", "Incline press isolateral"],
    copiedFrom: "Chest press incliné Technogym",
    category: "Push",
    movementPattern: MovementPattern.horizontalPress,
    muscleMappings: [
      { muscleGroup: MuscleGroup.pectClav, coefficient: 1 },
      { muscleGroup: MuscleGroup.pectStern, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.deltAnt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLat, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsMed, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLong, coefficient: 0.3 },
    ],
  },
  {
    aliases: ["Pectoral fly LifeFitness", "Pectoral fly", "Pec fly LifeFitness", "Pec fly machine"],
    copiedFrom: "Pec deck",
    category: "Push",
    movementPattern: MovementPattern.isolation,
    muscleMappings: [
      { muscleGroup: MuscleGroup.pectClav, coefficient: 1 },
      { muscleGroup: MuscleGroup.pectStern, coefficient: 1 },
      { muscleGroup: MuscleGroup.deltAnt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLat, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.tricepsMed, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Pulldown LifeFitness", "Pulldown", "Lat pulldown", "Lat pulldown LifeFitness"],
    copiedFrom: "Tirage vertical prise large",
    category: "Pull",
    movementPattern: MovementPattern.verticalPull,
    muscleMappings: [
      { muscleGroup: MuscleGroup.latSup, coefficient: 1 },
      { muscleGroup: MuscleGroup.latInf, coefficient: 0.7 },
      { muscleGroup: MuscleGroup.rhomboides, coefficient: 0.4 },
      { muscleGroup: MuscleGroup.trapMid, coefficient: 0.4 },
      { muscleGroup: MuscleGroup.bicepsLong, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.bracchial, coefficient: 0.3 },
    ],
  },
  {
    aliases: ["Abdominal LifeFitness", "Abdominal machine", "Machine abdominaux", "Ab crunch machine"],
    copiedFrom: "Crunch déclinés",
    category: "Core",
    movementPattern: MovementPattern.isolation,
    muscleMappings: [
      { muscleGroup: MuscleGroup.absBas, coefficient: 1 },
      { muscleGroup: MuscleGroup.absHaut, coefficient: 1 },
      { muscleGroup: MuscleGroup.obliqueExt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.obliqueInt, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.droitFemoral, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Calf Extension", "Calf Extension LifeFitness", "Extension mollets", "Mollets machine"],
    copiedFrom: "Mollets debout",
    category: "Legs",
    movementPattern: MovementPattern.isolation,
    muscleMappings: [
      { muscleGroup: MuscleGroup.gastrocnemien, coefficient: 1 },
      { muscleGroup: MuscleGroup.soleaire, coefficient: 0.6 },
    ],
  },
] as const;

/** Normalisation tolérante aux accents, tirets et espaces, mais pas au fuzzy matching. */
export function normalizeCatalogExerciseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PROFILE_BY_ALIAS = new Map<string, KnownMuscleProfile>(
  KNOWN_MUSCLE_PROFILES.flatMap((profile) =>
    profile.aliases.map((alias) => [normalizeCatalogExerciseName(alias), profile] as const)
  )
);

export function knownMuscleProfileForName(name: string): KnownMuscleProfile | null {
  return PROFILE_BY_ALIAS.get(normalizeCatalogExerciseName(name)) ?? null;
}

function cloneMappings(mappings: readonly Readonly<MuscleMapping>[]): MuscleMapping[] {
  return mappings.map((mapping) => ({
    muscleGroup: mapping.muscleGroup as MuscleGroupT,
    coefficient: mapping.coefficient,
  }));
}

/**
 * Complète un exercice connu uniquement lorsqu'il n'a aucun mapping. Le nom,
 * les réglages matériels et toute configuration explicite restent intacts.
 */
export function withKnownMuscleProfile(exercise: Exercise): Exercise {
  if (exercise.muscleMappings.length > 0) return exercise;
  const profile = knownMuscleProfileForName(exercise.name);
  if (!profile) return exercise;
  const category = exercise.category.trim();
  return {
    ...exercise,
    category: category.length === 0 || normalizeCatalogExerciseName(category) === "autre"
      ? profile.category
      : exercise.category,
    movementPattern: exercise.movementPattern ?? profile.movementPattern,
    muscleMappings: cloneMappings(profile.muscleMappings),
  };
}
