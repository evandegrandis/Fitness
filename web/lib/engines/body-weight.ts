/**
 * Lecture de l'historique de poids : tendance, vitesse de perte, jalons.
 *
 * Deux principes, tous deux imposés par les données plutôt que par l'esthétique :
 *
 *  1. **On ne montre jamais le poids brut comme signal.** Une pesée varie de ±1,5 kg d'un jour à
 *     l'autre (sel, glycogène, transit) — soit largement plus que la perte hebdomadaire visée.
 *     Lire le poids brut, c'est lire du bruit, et se décourager un jour sur deux. Tout ce qui est
 *     interprété ici passe par une moyenne mobile 7 jours.
 *
 *  2. **La vitesse compte autant que la direction.** Trop lent n'avance pas ; trop rapide coûte du
 *     muscle (Garthe et al. : 0,7 %/sem préserve mieux composition et performance que 1,4 %/sem).
 *     D'où un couloir cible plutôt qu'un objectif unique.
 *
 * Moteur pur : aucune écriture, aucun état dérivé persisté (ALGO_SPEC_HARDENED §0.2).
 */

export interface BodyWeightEntry {
  id: string;
  measuredOn: Date;
  weightKg: number;
}

/** Couloir de perte hebdomadaire, en % du poids corporel. */
export const WEIGHT_TREND = {
  /** En deçà, la perte est trop lente pour être distinguée du bruit de mesure. */
  MIN_WEEKLY_LOSS_PCT: 0.4,
  /** Au-delà, le risque de perte de masse maigre grimpe (Garthe et al.). */
  MAX_WEEKLY_LOSS_PCT: 0.7,
  /** Fenêtre de lissage : absorbe un cycle hebdomadaire complet (week-end inclus). */
  SMOOTHING_DAYS: 7,
  /** Deux points de tendance espacés d'au moins ça pour estimer une vitesse crédible. */
  MIN_DAYS_FOR_RATE: 10,
} as const;

/**
 * Jalons de perte, en % du poids de départ. Bornés à −7 % : c'est la zone où la littérature
 * observe déjà les gains métaboliques (Magkos et al. dès −5 %), et fixer une cible plus lointaine
 * transformerait un objectif atteignable en échec permanent.
 */
export const WEIGHT_MILESTONES_PCT = [5, 7] as const;

export type WeightRateVerdict = "too_fast" | "on_track" | "too_slow" | "gaining" | "unknown";

export interface WeightTrendPoint {
  date: Date;
  /** Moyenne mobile centrée sur les SMOOTHING_DAYS jours précédents (bornes incluses). */
  smoothedKg: number;
  rawKg: number | null;
}

export interface WeightTrend {
  points: WeightTrendPoint[];
  /** Dernière valeur lissée — la seule à afficher comme « ton poids ». */
  currentKg: number | null;
  startKg: number | null;
  deltaKg: number | null;
  deltaPct: number | null;
  /** Vitesse récente, en % du poids par semaine (négatif = perte). */
  weeklyPct: number | null;
  verdict: WeightRateVerdict;
  /** Jalons franchis, en % (5, 7…). */
  reachedMilestones: number[];
  /** Prochain jalon et kilos restants pour l'atteindre. */
  nextMilestonePct: number | null;
  kgToNextMilestone: number | null;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 86_400_000;

/** Ordonne et déduplique par jour civil (la dernière pesée du jour fait foi). */
export function normalizeEntries(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  const byDay = new Map<number, BodyWeightEntry>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.weightKg) || entry.weightKg <= 0) continue;
    byDay.set(startOfDay(entry.measuredOn), entry);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, entry]) => entry);
}

/**
 * Moyenne mobile sur les 7 derniers jours *calendaires* — pas sur les 7 dernières pesées : quelqu'un
 * qui se pèse deux fois par semaine ne doit pas se retrouver avec une fenêtre d'un mois.
 */
export function smoothedSeries(entries: BodyWeightEntry[]): WeightTrendPoint[] {
  const ordered = normalizeEntries(entries);
  return ordered.map((entry) => {
    const until = startOfDay(entry.measuredOn);
    const from = until - (WEIGHT_TREND.SMOOTHING_DAYS - 1) * DAY_MS;
    const window = ordered.filter((candidate) => {
      const day = startOfDay(candidate.measuredOn);
      return day >= from && day <= until;
    });
    const mean = window.reduce((sum, w) => sum + w.weightKg, 0) / window.length;
    return { date: entry.measuredOn, smoothedKg: Math.round(mean * 100) / 100, rawKg: entry.weightKg };
  });
}

function verdictFor(weeklyPct: number | null): WeightRateVerdict {
  if (weeklyPct === null) return "unknown";
  if (weeklyPct > 0.1) return "gaining";
  const loss = -weeklyPct;
  if (loss > WEIGHT_TREND.MAX_WEEKLY_LOSS_PCT) return "too_fast";
  if (loss < WEIGHT_TREND.MIN_WEEKLY_LOSS_PCT) return "too_slow";
  return "on_track";
}

/**
 * @param entries pesées, dans n'importe quel ordre
 * @param since   origine du calcul (début de phase). Sans elle, tout l'historique est utilisé.
 */
export function buildWeightTrend(entries: BodyWeightEntry[], since?: Date | null): WeightTrend {
  const all = smoothedSeries(entries);
  const points = since ? all.filter((p) => startOfDay(p.date) >= startOfDay(since)) : all;

  const first = points[0] ?? null;
  const last = points.at(-1) ?? null;
  if (!first || !last) {
    return {
      points,
      currentKg: null,
      startKg: null,
      deltaKg: null,
      deltaPct: null,
      weeklyPct: null,
      verdict: "unknown",
      reachedMilestones: [],
      nextMilestonePct: WEIGHT_MILESTONES_PCT[0],
      kgToNextMilestone: null,
    };
  }

  const deltaKg = Math.round((last.smoothedKg - first.smoothedKg) * 100) / 100;
  const deltaPct = Math.round((deltaKg / first.smoothedKg) * 1000) / 10;

  // Vitesse mesurée sur toute la fenêtre disponible : sur deux points rapprochés, le bruit
  // résiduel dominerait la pente et ferait osciller le verdict d'une pesée à l'autre.
  const spanDays = (startOfDay(last.date) - startOfDay(first.date)) / DAY_MS;
  const weeklyPct =
    spanDays >= WEIGHT_TREND.MIN_DAYS_FOR_RATE
      ? Math.round(((deltaKg / first.smoothedKg) * 100 * (7 / spanDays)) * 100) / 100
      : null;

  const lossPct = -deltaPct;
  const reachedMilestones = WEIGHT_MILESTONES_PCT.filter((m) => lossPct >= m);
  const nextMilestonePct = WEIGHT_MILESTONES_PCT.find((m) => lossPct < m) ?? null;
  const kgToNextMilestone =
    nextMilestonePct === null
      ? null
      : Math.max(0, Math.round((last.smoothedKg - first.smoothedKg * (1 - nextMilestonePct / 100)) * 100) / 100);

  return {
    points,
    currentKg: last.smoothedKg,
    startKg: first.smoothedKg,
    deltaKg,
    deltaPct,
    weeklyPct,
    verdict: verdictFor(weeklyPct),
    reachedMilestones: [...reachedMilestones],
    nextMilestonePct,
    kgToNextMilestone,
  };
}

/** Poids le plus récent, pour les calculs qui ont besoin d'une valeur unique (repères, PDC). */
export function latestBodyWeight(entries: BodyWeightEntry[]): number | null {
  const ordered = normalizeEntries(entries);
  return ordered.at(-1)?.weightKg ?? null;
}
