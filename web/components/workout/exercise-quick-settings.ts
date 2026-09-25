import type { Exercise } from "@/lib/models/types";

/**
 * Les réglages qu'on touche vraiment en pleine séance : ceux qui changent la prochaine suggestion ou
 * le prochain repos. Le reste (pattern, profil de résistance, standard…) vit dans « Tous les
 * réglages ».
 */
export type QuickSettings = Pick<
  Exercise,
  "machineSetting" | "repTargetMin" | "repTargetMax" | "smallestIncrement" | "maxLoad" | "suggestedRestSeconds"
>;

export function quickSettingsOf(exercise: Exercise): QuickSettings {
  return {
    machineSetting: exercise.machineSetting,
    repTargetMin: exercise.repTargetMin,
    repTargetMax: exercise.repTargetMax,
    smallestIncrement: exercise.smallestIncrement,
    maxLoad: exercise.maxLoad ?? null,
    suggestedRestSeconds: exercise.suggestedRestSeconds,
  };
}

export function quickSettingsChanged(before: QuickSettings, after: QuickSettings): boolean {
  return (
    before.machineSetting.trim() !== after.machineSetting.trim() ||
    before.repTargetMin !== after.repTargetMin ||
    before.repTargetMax !== after.repTargetMax ||
    before.smallestIncrement !== after.smallestIncrement ||
    (before.maxLoad ?? null) !== (after.maxLoad ?? null) ||
    before.suggestedRestSeconds !== after.suggestedRestSeconds
  );
}

/**
 * Applique les réglages rapides sur la version la PLUS RÉCENTE de l'exercice, pas sur celle lue à
 * l'ouverture de la feuille : Barbis peut poser les muscles d'une machine pendant que la feuille
 * est ouverte, et les écraser avec une copie périmée ferait perdre son profil.
 */
export function applyQuickSettings(latest: Exercise, settings: QuickSettings): Exercise {
  const repTargetMin = Math.max(1, Math.round(settings.repTargetMin));
  const repTargetMax = Math.max(repTargetMin, Math.round(settings.repTargetMax));
  return {
    ...latest,
    machineSetting: settings.machineSetting.trim(),
    repTargetMin,
    repTargetMax,
    smallestIncrement: settings.smallestIncrement > 0 ? settings.smallestIncrement : latest.smallestIncrement,
    maxLoad: settings.maxLoad != null && settings.maxLoad > 0 ? settings.maxLoad : null,
    suggestedRestSeconds: settings.suggestedRestSeconds,
  };
}

/** 90 → « 1:30 », 120 → « 2:00 » : le format du minuteur de repos. */
export function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
