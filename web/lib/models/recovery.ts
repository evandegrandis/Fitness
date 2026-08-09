import type { RecoveryCheckinInput } from "@/lib/models/types";

export type RecoveryValues = Pick<
  RecoveryCheckinInput,
  "tookCreatine" | "proteinTargetMet" | "sleepHours" | "hadAlcohol"
>;

/** `false` est une réponse confirmée; seul `null` signifie inconnu. */
export function hasAnyRecoveryValue(value: RecoveryValues): boolean {
  return (
    value.tookCreatine !== null ||
    value.proteinTargetMet !== null ||
    value.sleepHours !== null ||
    value.hadAlcohol !== null
  );
}

/**
 * Un nouveau draft vide est ignoré. Un draft vide déjà persisté doit, lui,
 * être envoyé afin que la Server Action supprime l'ancienne ligne par date.
 */
export function shouldPersistRecoveryValues(existingId: string | null, value: RecoveryValues): boolean {
  return existingId !== null || hasAnyRecoveryValue(value);
}
