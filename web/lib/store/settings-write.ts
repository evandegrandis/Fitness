import type { UserSettings } from "@/lib/models/types";

/**
 * Construit une écriture du singleton à partir de l'état GLOBAL le plus frais.
 * Les cartes « Corps » et « Préférences » restent montées en parallèle avec
 * chacune un draft local; réécrire leur objet complet obsolète ferait perdre
 * silencieusement les champs modifiés dans l'autre carte.
 */
export function mergeSettingsPatch(
  current: UserSettings,
  patch: Partial<UserSettings>
): UserSettings {
  return { ...current, ...patch };
}
