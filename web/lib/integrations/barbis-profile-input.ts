/**
 * Contrat du profil musculaire que Barbis écrit dans Jeera (`POST /api/barbis/exercise-profile`).
 * Tout ce qui ne respecte pas la taxonomie de l'app est refusé : un muscle inconnu, un
 * coefficient hors de ]0, 1], un doublon, ou un profil sans moteur principal.
 */

import { z } from "zod";

import { FATIGUE_CLASSES, MOVEMENT_PATTERNS } from "@/lib/models/enums";
import { MUSCLE_LEAVES } from "@/lib/models/muscles";

export const EXERCISE_CATEGORIES = ["Push", "Pull", "Legs", "Core", "Arms"] as const;

const leafSchema = z.enum(MUSCLE_LEAVES as [string, ...string[]]);

const barbisProfileSchema = z.object({
  exerciseId: z.string().min(1).max(200),
  muscleMappings: z
    .array(z.object({ muscleGroup: leafSchema, coefficient: z.number().gt(0).lte(1) }))
    .min(1)
    .max(20)
    .refine((mappings) => new Set(mappings.map((m) => m.muscleGroup)).size === mappings.length, "muscle en double")
    .refine((mappings) => mappings.some((m) => m.coefficient >= 0.6), "aucun muscle principal"),
  movementPattern: z.enum(MOVEMENT_PATTERNS as [string, ...string[]]).nullable(),
  fatigueClass: z.enum(FATIGUE_CLASSES as [string, ...string[]]).optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  equivalentToExerciseId: z.string().max(200).nullable().optional(),
  rationale: z.string().max(1000).optional(),
});

export type BarbisProfileInput = z.infer<typeof barbisProfileSchema>;

export function parseBarbisProfile(input: unknown): BarbisProfileInput {
  return barbisProfileSchema.parse(input);
}
