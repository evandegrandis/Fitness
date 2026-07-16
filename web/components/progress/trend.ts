/**
 * Dérive un badge de tendance court ("Plateau 3 séances", "+8% ce mois", …)
 * à partir d'une série de points d'exercice déjà disponible (poids du
 * meilleur set / séance). Aucune nouvelle source de données : purement une
 * lecture différente de ce qui alimente déjà `ExerciseLineChart`.
 */

export interface TrendPoint {
  date: Date;
  weight: number;
}

export type TrendTone = "up" | "down" | "flat";

export interface TrendBadge {
  label: string;
  tone: TrendTone;
}

const PLATEAU_EPSILON = 1e-6;
const MS_PER_DAY = 86_400_000;

/**
 * Compare le dernier point à la fenêtre récente pour produire un libellé
 * FR compact. Règles :
 *  - < 2 points → pas de tendance affichable (null).
 *  - 3+ dernières séances à poids identique → "Plateau N séances".
 *  - sinon variation % entre le premier et le dernier point sur ~30 jours
 *    (ou toute la série si plus courte) → "+X% ce mois" / "-X% ce mois".
 *  - variation quasi nulle mais pas un plateau strict → "Stable".
 */
export function trendBadge(points: TrendPoint[]): TrendBadge | null {
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = sorted[sorted.length - 1];

  // Plateau : les N dernières séances (>=3) ont exactement le même poids.
  let plateauCount = 1;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (Math.abs(sorted[i].weight - last.weight) < PLATEAU_EPSILON) {
      plateauCount++;
    } else {
      break;
    }
  }
  if (plateauCount >= 3) {
    return { label: `Plateau ${plateauCount} séances`, tone: "flat" };
  }

  // Fenêtre récente ~30 jours (ou toute la série si plus courte).
  const windowStart = new Date(last.date.getTime() - 30 * MS_PER_DAY);
  const windowed = sorted.filter((p) => p.date >= windowStart);
  const reference = windowed.length >= 2 ? windowed[0] : sorted[0];

  if (reference.weight <= 0) return null;

  const deltaPct = ((last.weight - reference.weight) / reference.weight) * 100;
  const rounded = Math.round(Math.abs(deltaPct));

  if (rounded === 0) {
    return { label: "Stable", tone: "flat" };
  }

  const sign = deltaPct > 0 ? "+" : "-";
  return { label: `${sign}${rounded}% ce mois`, tone: deltaPct > 0 ? "up" : "down" };
}
