/**
 * Variantes d'exercices (dur/facile) — voir `web/ALGO_SPEC_HARDENED.md` §7.4, §9.
 *
 * Config statique par NOM d'exercice (pas de champ modèle/DB, cf. consigne de
 * périmètre) : un exercice "dur" peut être lié à une variante plus "facile"
 * vers laquelle l'algo propose une bascule si le plancher de reps n'est pas
 * tenu (`VARIANT_SWITCH_FLOOR`, §7.4).
 */

/** nom exact de l'exercice dur -> nom exact de la variante facile. */
export const VARIANT_LINKS: Record<string, string> = {
  "Ab roller debout": "Ab roller genoux",
};

/** Nom de la variante plus facile liée à `exerciseName`, ou null si aucune. */
export function easierVariantName(exerciseName: string): string | null {
  return VARIANT_LINKS[exerciseName] ?? null;
}
