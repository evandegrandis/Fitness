import { cleanWeight } from "@/lib/format";
/**
 * Utilitaires partagés par l'onglet Progrès : dates locales, formatage. Pas de logique métier ici : tout ce qui
 * touche à la couverture/records/e1RM vient de `lib/engines/*`.
 */

/** Début de journée locale (miroir de `startOfDay` dans effective-sets.ts). */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Lundi de la semaine ISO contenant `date`. */
export function startOfIsoWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

/** Formate un poids sans décimale inutile (miroir `cleanWeight` Swift/store). */
export function formatWeight(weight: number): string {
  return cleanWeight(weight);
}

/**
 * Arrondit un poids DÉRIVÉ (e1RM, moyenne, etc.) au plus proche multiple de
 * `increment` (le `smallestIncrement` de l'exercice, ou 0.5 kg par défaut).
 * Évite les affichages du type "133.33 kg" issus de calculs (Epley, moyennes)
 * qui ne correspondent à aucun poids réellement chargeable.
 */
export function roundToIncrement(weight: number, increment = 0.5): number {
  const step = increment > 0 ? increment : 0.5;
  return Math.round(weight / step) * step;
}

/** Formate un poids dérivé : arrondi au `smallestIncrement` puis mis en forme sans décimale inutile. */
export function formatDerivedWeight(weight: number, increment = 0.5): string {
  return formatWeight(roundToIncrement(weight, increment));
}

/** Date courte "14/07" pour les axes de graphiques. */
export function formatShortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}
