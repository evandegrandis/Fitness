import { cleanWeight } from "@/lib/format";
/**
 * Utilitaires partagés par les 3 couches de l'onglet Progrès — dates locales,
 * découpage en semaines, formatage. Pas de logique métier ici : tout ce qui
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

export interface WeekBucket {
  /** Lundi de la semaine (inclus). */
  start: Date;
  /** Lundi de la semaine suivante (exclu). */
  end: Date;
  label: string;
}

const SHORT_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Étiquette courte "14 juil." pour une semaine (jour de début). */
export function formatWeekLabel(start: Date): string {
  return `${start.getDate()} ${SHORT_MONTHS[start.getMonth()]}`;
}

/**
 * Construit `count` seaux hebdomadaires (ISO, lundi-dimanche) se terminant à
 * la semaine courante — le plus ancien en premier, chronologique pour les
 * graphiques en barres.
 */
export function buildWeekBuckets(referenceDate: Date, count: number): WeekBucket[] {
  const thisWeekStart = startOfIsoWeek(referenceDate);
  const buckets: WeekBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addDays(thisWeekStart, -7 * i);
    const end = addDays(start, 7);
    buckets.push({ start, end, label: formatWeekLabel(start) });
  }
  return buckets;
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

/** Coefficient de corrélation de Pearson. Retourne null si non calculable (variance nulle ou < 3 points). */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}
