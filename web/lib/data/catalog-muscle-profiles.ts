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
  {
    // Technogym Selection : machine d'élévations latérales assises, pas une machine à deltoïde
    // postérieur (celle-ci est combinée au pec deck chez Technogym).
    aliases: ["Delts machine", "Machine deltoides", "Delts"],
    copiedFrom: "Lateral raises",
    category: "Push",
    movementPattern: MovementPattern.isolation,
    muscleMappings: [
      { muscleGroup: MuscleGroup.deltLat, coefficient: 1 },
      { muscleGroup: MuscleGroup.trapInf, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.trapSup, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.deltAnt, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.deltPost, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Shoulder press", "Shoulder press machine", "Machine shoulder press"],
    copiedFrom: "Shoulder press",
    category: "Push",
    movementPattern: MovementPattern.verticalPress,
    muscleMappings: [
      { muscleGroup: MuscleGroup.deltAnt, coefficient: 1 },
      { muscleGroup: MuscleGroup.deltLat, coefficient: 1 },
      { muscleGroup: MuscleGroup.trapSup, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLat, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsLong, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.tricepsMed, coefficient: 0.3 },
      { muscleGroup: MuscleGroup.pectClav, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.trapInf, coefficient: 0.1 },
    ],
  },
  {
    aliases: ["Leg press", "Leg press machine", "Machine leg press"],
    copiedFrom: "Presse à cuisses",
    category: "Legs",
    movementPattern: MovementPattern.squat,
    muscleMappings: [
      { muscleGroup: MuscleGroup.vasteLat, coefficient: 1 },
      { muscleGroup: MuscleGroup.vasteMed, coefficient: 1 },
      { muscleGroup: MuscleGroup.droitFemoral, coefficient: 0.6 },
      { muscleGroup: MuscleGroup.glutMax, coefficient: 0.6 },
    ],
  },
  {
    aliases: ["Leg curl", "Leg curl machine", "Machine leg curl", "Ischios machine"],
    copiedFrom: "Leg curl",
    category: "Legs",
    movementPattern: MovementPattern.isolation,
    muscleMappings: [
      { muscleGroup: MuscleGroup.bicepsFemoral, coefficient: 1 },
      { muscleGroup: MuscleGroup.semiTendineux, coefficient: 1 },
      { muscleGroup: MuscleGroup.droitFemoral, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.glutMax, coefficient: 0.1 },
      { muscleGroup: MuscleGroup.transverse, coefficient: 0.1 },
    ],
  },
  {
    // « Vertical Traction » est le nom Technogym du tirage vertical guidé, prise large.
    aliases: ["Vertical traction", "Traction verticale machine"],
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
    // Prise serrée neutre : même amplitude que la supination, un peu moins de biceps court.
    aliases: [
      "Tirage vertical serre neutre",
      "Tirage vertical neutre",
      "Tirage vertical prise serree neutre",
    ],
    copiedFrom: "Tirage vertical supination",
    category: "Pull",
    movementPattern: MovementPattern.verticalPull,
    muscleMappings: [
      { muscleGroup: MuscleGroup.latInf, coefficient: 1 },
      { muscleGroup: MuscleGroup.latSup, coefficient: 0.7 },
      { muscleGroup: MuscleGroup.bicepsLong, coefficient: 0.5 },
      { muscleGroup: MuscleGroup.bicepsCourt, coefficient: 0.4 },
      { muscleGroup: MuscleGroup.bracchial, coefficient: 0.3 },
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

/**
 * Marques de machines. Evan nomme ses exercices d'après la machine qu'il a sous les yeux
 * (« Low Row Technogym », « Leg curl LifeFitness ») parce que les charges affichées ne sont PAS
 * comparables d'une marque à l'autre : ces exercices restent distincts, chacun avec son
 * historique, ses records et sa progression.
 *
 * Ce repli ne sert qu'à retrouver le PROFIL MUSCULAIRE, qui, lui, ne dépend pas du constructeur :
 * un low row reste un low row. Sans ça, chaque nouvelle machine créait un exercice orphelin dont
 * les séries ne comptaient dans aucun objectif.
 */
const MACHINE_BRANDS = [
  "technogym",
  "life fitness",
  "lifefitness",
  "hammer strength",
  "hammer",
  "cybex",
  "matrix",
  "precor",
  "panatta",
  "nautilus",
  "gym 80",
  "gym80",
  "atlantis",
  "watson",
];

/** Retire la marque de machine du nom normalisé, où qu'elle se trouve. */
function stripMachineBrand(normalized: string): string {
  let result = ` ${normalized} `;
  for (const brand of MACHINE_BRANDS) {
    result = result.split(` ${brand} `).join(" ");
  }
  return result.trim().replace(/\s+/g, " ");
}

export function knownMuscleProfileForName(name: string): KnownMuscleProfile | null {
  const normalized = normalizeCatalogExerciseName(name);
  const exact = PROFILE_BY_ALIAS.get(normalized);
  if (exact) return exact;
  const withoutBrand = stripMachineBrand(normalized);
  if (withoutBrand === normalized || withoutBrand.length === 0) return null;
  return PROFILE_BY_ALIAS.get(withoutBrand) ?? null;
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
