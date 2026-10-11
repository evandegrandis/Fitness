/**
 * La semaine en un coup d'œil, PENDANT la séance (Evan, 11/10/2026 : « il y avait écrit, après ma
 * séance, que j'étais à 3 séries d'une semaine or. Si j'avais su ça durant la séance, j'en aurais
 * fait 3 de plus »).
 *
 * Une seule définition du palier, partagée par l'accueil (`WeekSummary`), l'en-tête de séance, « Quoi
 * faire maintenant » et le bilan (`session-insights.ts`) : part des objectifs atteinte, chaque muscle
 * plafonné à son objectif (`WEEK_TIERS`). Une série ne rapproche du palier suivant que sur un muscle
 * encore SOUS son objectif : d'où `where`, la liste des muscles où elle compte, haut du corps
 * d'abord. Le score, les objectifs et les paliers ne changent jamais ici ; mettre les jambes de côté
 * (`lowerBodyOff`) ne fait que les retirer des pistes proposées.
 *
 * Moteur pur : aucune écriture.
 */

import { weeklyProgress, type ParentMuscleProgress } from "@/lib/engines/effective-sets";
import { nextWeekTier, setsToNextTier, weekTier, type WeekTier, WEEK_TIERS } from "@/lib/engines/progress-stats";
import { isLowerBodyParent, type MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";

/** En deçà, le reste d'un muscle est du bruit d'arrondi (même seuil que « Quoi faire maintenant »). */
const MIN_REMAINING = 0.5;

export interface WeekStatusOptions {
  /** Jambes mises de côté cette semaine : elles ne sont plus proposées comme piste. */
  lowerBodyOff?: boolean;
}

export interface WeekStatus {
  /** Part des objectifs atteinte, chaque muscle plafonné à son objectif (0..1). */
  score: number;
  tier: WeekTier | null;
  next: (typeof WEEK_TIERS)[number] | null;
  /** Séries comptées qui manquent pour le palier suivant ; `null` à l'or. */
  setsToNext: number | null;
  /** Somme des objectifs (dénominateur du score). */
  goalTotal: number;
  /** Lignes des muscles à objectif. */
  rows: ParentMuscleProgress[];
  /** Où une série compte encore : haut du corps par reste décroissant, puis jambes (sauf mises de côté). */
  where: { parent: MuscleParent; remaining: number }[];
  /** Reste total des jambes (même mises de côté), pour le dire en une fois. */
  lowerBodyRemaining: number;
  /** Séries encore comptables sur les pistes proposées (`where`). */
  countable: number;
  /** Le palier suivant tient dans les pistes proposées. Faux quand il faudrait les jambes coupées. */
  nextReachable: boolean;
}

export function weekStatusFromRows(rows: readonly ParentMuscleProgress[], options: WeekStatusOptions = {}): WeekStatus {
  const goalRows = rows.filter((row) => row.goalSets > 0);
  const goalTotal = goalRows.reduce((sum, row) => sum + row.goalSets, 0);
  const score = goalTotal > 0 ? goalRows.reduce((sum, row) => sum + Math.min(row.effectiveSets, row.goalSets), 0) / goalTotal : 0;
  const open = goalRows.filter((row) => row.remaining >= MIN_REMAINING);
  const upper = open.filter((row) => !isLowerBodyParent(row.parent)).sort((a, b) => b.remaining - a.remaining);
  const lower = open.filter((row) => isLowerBodyParent(row.parent)).sort((a, b) => b.remaining - a.remaining);
  const where = [...upper, ...(options.lowerBodyOff ? [] : lower)].map((row) => ({ parent: row.parent, remaining: row.remaining }));
  const countable = where.reduce((sum, row) => sum + row.remaining, 0);
  const setsToNext = setsToNextTier(score, goalTotal);
  return {
    score,
    tier: weekTier(score),
    next: nextWeekTier(score),
    setsToNext,
    goalTotal,
    rows: goalRows,
    where,
    lowerBodyRemaining: lower.reduce((sum, row) => sum + row.remaining, 0),
    countable,
    nextReachable: setsToNext !== null && setsToNext <= countable + 1e-9,
  };
}

export function weekStatus(
  history: WorkoutSession[],
  catalog: Exercise[],
  goals: MuscleGoal[],
  referenceDate: Date,
  liveSession?: WorkoutSession | null,
  options: WeekStatusOptions = {}
): WeekStatus {
  return weekStatusFromRows(weeklyProgress(history, catalog, goals, referenceDate, liveSession), options);
}

/** Clé de la semaine civile (lundi, heure locale), pour retenir un choix « cette semaine ». */
export function weekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Libellés de la ligne Semaine (en-tête de séance, « Quoi faire maintenant »). */
export function weekStatusText(status: WeekStatus, shortName: (parent: MuscleParent) => string, options: WeekStatusOptions = {}) {
  const tierLabel = status.tier ? WEEK_TIERS.find((entry) => entry.tier === status.tier)!.label.toLowerCase() : null;
  const title = tierLabel ? `Semaine ${tierLabel}` : "Vers le bronze";
  const n = status.setsToNext;
  const nextLabel = status.next?.label.toLowerCase() ?? null;
  const next = nextLabel && n !== null ? `${nextLabel} dans ${n} série${n > 1 ? "s" : ""}` : "le plus haut palier";
  let where: string | null = null;
  let places: string | null = null;
  if (nextLabel && n !== null) {
    if (status.nextReachable) {
      const list = status.where.slice(0, 3).map((row) => `${shortName(row.parent)} ${Math.max(1, Math.round(row.remaining))}`);
      places = list.length > 0 ? list.join(" · ") : null;
      where = places ? `Restent : ${places}` : null;
    } else {
      where = options.lowerBodyOff
        ? `${status.next!.label} hors de portée sans les jambes (${Math.floor(status.countable)} séries possibles en haut)`
        : `${status.next!.label} hors de portée cette semaine`;
    }
  }
  /** Le palier suivant est à portée de main : la ligne passe à sa couleur. */
  const near = n !== null && n <= 3 && status.nextReachable;
  return { title, next, where, places, near };
}
