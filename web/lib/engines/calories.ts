/**
 * Dépense énergétique estimée d'une séance, en fourchette. Méthode et sources : `CALORIES.md`.
 *
 * Modèle hybride, parce qu'aucune méthode seule ne tient pour la musculation :
 *  - un FOND au MET de station debout/récupération sur tout le temps passé hors série ;
 *  - pour chaque série : un MET qui monte avec la MASSE MUSCULAIRE sollicitée (profil muscles de
 *    l'exercice × volume de chaque muscle, bonus de stabilisation pour les polyarticulaires), plus le
 *    TRAVAIL MÉCANIQUE de la charge (charge × g × amplitude / rendement), le tout modulé par le RIR ;
 *  - la RÉCUPÉRATION immédiate qui suit chaque série (dette d'O2 remboursée pendant le repos).
 * Le cardio loggé dans la séance est ajouté avec les équations de référence (ACSM, Compendium).
 *
 * Moteur pur, recalculé à la lecture : toutes les séances passées en bénéficient, rien n'est stocké.
 */

import type { CardioEntry, Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import type { MovementPattern } from "@/lib/models/enums";
import { MUSCLE_LEAVES, LEAF_TO_PARENT, type MuscleGroup } from "@/lib/models/muscles";
import type { BodyWeightEntry } from "@/lib/engines/body-weight";

export const CALORIES = {
  /** Poids de corps quand rien n'est connu (ni pesée, ni réglage). */
  DEFAULT_BODY_WEIGHT_KG: 75,
  /**
   * MET hors série : debout, on marche jusqu'à la machine, on règle, on parle (Compendium 2024,
   * « debout, parler » ~1,8). 1,5 (immobile) sous-estimait les longues séances : 126 des 154 min
   * de la séance du 25/09/2026 se passent entre les séries.
   */
  BACKGROUND_MET: 1.8,
  /** MET d'une série sur un muscle minuscule (plancher du Compendium, musculation légère). */
  SET_MET_FLOOR: 3.5,
  /** Pente du MET de série par fraction de la masse musculaire totale sollicitée. */
  SET_MET_PER_MUSCLE_FRACTION: 27,
  SET_MET_CAP: 12,
  /** Muscles de gainage absents du profil (érecteurs, psoas, coiffe…) sur un polyarticulaire. */
  COMPOUND_STABILIZATION_BONUS: 0.15,
  /** Durée d'une répétition (concentrique + excentrique), en secondes. */
  SECONDS_PER_REP: 3.5,
  /** Rendement musculaire de la phase concentrique ; l'excentrique est dans le MET de série. */
  MECHANICAL_EFFICIENCY: 0.25,
  /** Coût de la récupération immédiate, en part du coût net de la série (Scott 2011). */
  RECOVERY_RATIO: 0.5,
  /** Une série d'échauffement est plus légère et loin de l'échec. */
  WARMUP_FACTOR: 0.7,
  /** Incertitude sur la part active (au-dessus du repos) : ±25 %. */
  ACTIVE_UNCERTAINTY: 0.25,
  /** Garde-fou d'une séance oubliée ouverte : au plus 8 min par série + 20 min. */
  MAX_MINUTES_PER_SET: 8,
  MAX_EXTRA_MINUTES: 20,
  /** Sans horaires fiables (séance transcrite), ~3,5 min par série, comme l'Historique. */
  ESTIMATED_MINUTES_PER_SET: 3.5,
  /** Rendement brut d'un ergomètre (vélo, rameur) pour convertir les watts. */
  CARDIO_EFFICIENCY: 0.22,
  /** Course : ~1 kcal par kg et par km au-dessus du repos, quelle que soit l'allure. */
  RUNNING_KCAL_PER_KG_KM: 1,
} as const;

const KCAL_PER_JOULE = 1 / 4184;
const G = 9.81;

/**
 * Volume approximatif de chaque muscle fin, deux côtés, chez un homme adulte entraîné (cm³),
 * d'après les études d'IRM de volumes musculaires (Handsfield 2014 membres inférieurs, Holzbaur
 * 2007 membre supérieur). Les muscles absents de la taxonomie (érecteurs, psoas, coiffe, jambier…)
 * complètent `TOTAL_MUSCLE_VOLUME_CM3`. L'ordre de grandeur compte, pas la décimale.
 */
const LEAF_VOLUME_CM3: Record<MuscleGroup, number> = {
  pect_clav: 200,
  pect_stern: 500,
  trap_sup: 200,
  trap_mid: 150,
  trap_inf: 150,
  rhomboides: 150,
  lat_sup: 350,
  lat_inf: 250,
  delt_ant: 230,
  delt_lat: 300,
  delt_post: 230,
  bracchial: 280,
  biceps_long: 150,
  biceps_court: 150,
  triceps_long: 300,
  triceps_lat: 250,
  triceps_med: 190,
  abs_haut: 150,
  abs_bas: 150,
  transverse: 150,
  oblique_ext: 300,
  oblique_int: 200,
  flechisseurs: 300,
  extenseurs: 200,
  brachioradial: 120,
  vaste_lat: 1700,
  vaste_med: 1500,
  droit_femoral: 500,
  biceps_femoral: 600,
  semi_tendineux: 900,
  glut_max: 1700,
  glut_med: 700,
  adducteur_long: 500,
  grand_adducteur: 1200,
  gastrocnemien: 900,
  soleaire: 1000,
};

/** Masse musculaire squelettique totale (~38 % du poids chez l'homme, Janssen 2000) en volume. */
const TOTAL_MUSCLE_VOLUME_CM3 = 28_000;

/** Fraction de la masse musculaire quand l'exercice n'a pas encore de profil. */
const FALLBACK_MUSCLE_FRACTION: Record<MovementPattern | "unknown", number> = {
  squat: 0.19,
  hinge: 0.2,
  horizontal_press: 0.05,
  vertical_press: 0.05,
  horizontal_pull: 0.04,
  vertical_pull: 0.04,
  isolation: 0.02,
  unknown: 0.04,
};

/** Amplitude concentrique typique du point de charge (m). */
const RANGE_OF_MOTION_M: Record<MovementPattern | "unknown", number> = {
  squat: 0.5,
  hinge: 0.5,
  horizontal_press: 0.4,
  vertical_press: 0.5,
  horizontal_pull: 0.4,
  vertical_pull: 0.55,
  isolation: 0.35,
  unknown: 0.4,
};

/** Part du poids de corps déplacée au poids du corps (traction ≈ tout, pompe ≈ 2/3, crunch ≈ 1/3). */
const BODYWEIGHT_SHARE: Record<MovementPattern | "unknown", number> = {
  squat: 0.8,
  hinge: 0.5,
  horizontal_press: 0.65,
  vertical_press: 0.9,
  horizontal_pull: 0.6,
  vertical_pull: 0.95,
  isolation: 0.35,
  unknown: 0.5,
};

/** Cardio sans watts ni distance : MET du Compendium 2011, effort modéré. */
const CARDIO_MET: Record<CardioEntry["activityType"], number> = {
  running: 9,
  rowing: 7,
  cycling: 6.8,
  swimming: 7,
  elliptical: 5,
  stairs: 9,
  other: 5,
};

export type BodyWeightSource = "weigh_in" | "settings" | "default";

export interface ExerciseCalories {
  loggedExerciseId: string;
  exerciseName: string;
  /** Coût des séries et de leur récupération immédiate, hors fond. */
  kcal: number;
  sets: number;
}

export interface SessionCalories {
  /** Estimation centrale, dépense totale pendant la séance (repos inclus), arrondie à 5. */
  kcal: number;
  low: number;
  high: number;
  /** Part au-dessus du métabolisme de repos : celle à ajouter à une dépense journalière. */
  activeKcal: number;
  strengthKcal: number;
  cardioKcal: number;
  /** Minutes réellement comptées (musculation + cardio), après garde-fou. */
  minutes: number;
  bodyWeightKg: number;
  bodyWeightSource: BodyWeightSource;
  exercises: ExerciseCalories[];
}

function patternKey(pattern: MovementPattern | null | undefined): MovementPattern | "unknown" {
  return pattern ?? "unknown";
}

/**
 * Fraction de la masse musculaire totale sollicitée par l'exercice, pondérée par les coefficients
 * de son profil. Un polyarticulaire gaine en plus des muscles hors profil.
 */
export function activeMuscleFraction(exercise: Exercise | undefined): number {
  const pattern = patternKey(exercise?.movementPattern);
  const mappings = exercise?.muscleMappings ?? [];
  if (mappings.length === 0) return FALLBACK_MUSCLE_FRACTION[pattern];
  const known = new Set<string>(MUSCLE_LEAVES);
  const volume = mappings
    .filter((m) => known.has(m.muscleGroup))
    .reduce((sum, m) => sum + Math.min(1, Math.max(0, m.coefficient)) * LEAF_VOLUME_CM3[m.muscleGroup], 0);
  const fraction = volume / TOTAL_MUSCLE_VOLUME_CM3;
  return isCompound(exercise!) ? fraction * (1 + CALORIES.COMPOUND_STABILIZATION_BONUS) : fraction;
}

/** Polyarticulaire : déclaré, ou déduit du profil (deux groupes musculaires sollicités à ≥ 0,5). */
export function isCompound(exercise: Exercise): boolean {
  if (exercise.movementPattern) return exercise.movementPattern !== "isolation";
  const parents = new Set(
    exercise.muscleMappings.filter((m) => m.coefficient >= 0.5 && m.muscleGroup in LEAF_TO_PARENT).map((m) => LEAF_TO_PARENT[m.muscleGroup])
  );
  return parents.size >= 2;
}

/** Charge réellement déplacée (kg) selon le mode de l'exercice. */
export function movedLoadKg(set: LoggedSet, exercise: Exercise | undefined, bodyWeightKg: number): number {
  const bodyShare = bodyWeightKg * BODYWEIGHT_SHARE[patternKey(exercise?.movementPattern)];
  switch (exercise?.setPatternMode) {
    case "bodyweight":
      return bodyShare;
    case "weighted_bodyweight":
      return bodyShare + Math.max(0, set.weight);
    case "assisted_bodyweight":
      return Math.max(0, bodyShare - Math.max(0, set.weight));
    default:
      return Math.max(0, set.weight);
  }
}

/** Plus on s'approche de l'échec, plus on recrute et plus la part anaérobie grimpe. */
export function rirFactor(rir: number | null | undefined): number {
  if (rir === null || rir === undefined) return 1.1;
  if (rir <= 0) return 1.3;
  if (rir === 1) return 1.2;
  if (rir === 2) return 1.1;
  if (rir === 3) return 1;
  return 0.95;
}

/**
 * Récupération après la série, en part de son coût net. Une série courte menée à l'échec est
 * surtout anaérobie : sa dette d'oxygène se paie pendant le repos, et elle croît avec la
 * proximité de l'échec (lactatémie). À l'échec, la récupération coûte autant que la série.
 */
export function recoveryRatio(set: Pick<LoggedSet, "reportedRir" | "setType">): number {
  if (set.setType === "warmup") return CALORIES.RECOVERY_RATIO;
  const rir = set.reportedRir;
  if (rir === null || rir === undefined) return 0.7;
  if (rir <= 0) return 1;
  if (rir === 1) return 0.85;
  if (rir === 2) return 0.7;
  if (rir === 3) return 0.6;
  return CALORIES.RECOVERY_RATIO;
}

/** Coût brut d'une série (kcal) et son temps sous tension (s). */
export function setCost(
  set: LoggedSet,
  exercise: Exercise | undefined,
  bodyWeightKg: number
): { grossKcal: number; seconds: number } {
  const reps = Math.max(0, set.reps);
  const seconds = reps * CALORIES.SECONDS_PER_REP;
  const met = Math.min(
    CALORIES.SET_MET_CAP,
    CALORIES.SET_MET_FLOOR + CALORIES.SET_MET_PER_MUSCLE_FRACTION * activeMuscleFraction(exercise)
  );
  const metKcal = (met * bodyWeightKg * seconds) / 3600;
  const rom = RANGE_OF_MOTION_M[patternKey(exercise?.movementPattern)];
  const mechanicalKcal =
    (reps * movedLoadKg(set, exercise, bodyWeightKg) * G * rom * KCAL_PER_JOULE) / CALORIES.MECHANICAL_EFFICIENCY;
  const intensity = set.setType === "warmup" ? CALORIES.WARMUP_FACTOR : rirFactor(set.reportedRir);
  return { grossKcal: (metKcal + mechanicalKcal) * intensity, seconds };
}

/** Dépense brute d'une activité cardio (kcal). */
export function cardioKcal(entry: CardioEntry, bodyWeightKg: number): number {
  const hours = Math.max(0, entry.durationSeconds) / 3600;
  const resting = bodyWeightKg * hours;
  if (entry.averageWatts && entry.averageWatts > 0) {
    return (entry.averageWatts * entry.durationSeconds * KCAL_PER_JOULE) / CALORIES.CARDIO_EFFICIENCY + resting;
  }
  if (entry.activityType === "running" && entry.distanceKm && entry.distanceKm > 0) {
    return CALORIES.RUNNING_KCAL_PER_KG_KM * bodyWeightKg * entry.distanceKm + resting;
  }
  return CARDIO_MET[entry.activityType] * bodyWeightKg * hours;
}

/** Poids de corps à la date de la séance : dernière pesée connue à ce jour, sinon la plus proche après. */
export function bodyWeightForSession(
  date: Date,
  entries: readonly BodyWeightEntry[],
  settingsWeightKg: number | null | undefined
): { kg: number; source: BodyWeightSource } {
  // Une pesée est datée au jour : celle du matin de la séance compte.
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const chronological = entries
    .filter((e) => Number.isFinite(e.weightKg) && e.weightKg > 0)
    .sort((a, b) => a.measuredOn.getTime() - b.measuredOn.getTime());
  const entry = chronological.filter((e) => e.measuredOn.getTime() < endOfDay).at(-1) ?? chronological[0];
  if (entry) return { kg: entry.weightKg, source: "weigh_in" };
  if (settingsWeightKg && settingsWeightKg > 0) return { kg: settingsWeightKg, source: "settings" };
  return { kg: CALORIES.DEFAULT_BODY_WEIGHT_KG, source: "default" };
}

/**
 * Minutes de séance hors cardio : durée réelle si la séance est close, sinon l'étendue des
 * horodatages de séries, sinon l'estimation par série. Bornée pour qu'une séance oubliée ouverte
 * ne brûle pas des heures de « repos ».
 */
function strengthMinutes(session: WorkoutSession, sets: LoggedSet[], workSeconds: number, cardioMinutes: number): number {
  const count = sets.length;
  let minutes: number;
  if (session.endTime) {
    minutes = (session.endTime.getTime() - session.startTime.getTime()) / 60_000 - cardioMinutes;
  } else {
    const times = sets.map((s) => s.timestamp.getTime()).filter(Number.isFinite);
    const span = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 60_000 : 0;
    minutes = span >= count ? span + 3 : count * CALORIES.ESTIMATED_MINUTES_PER_SET;
  }
  const cap = count > 0 ? count * CALORIES.MAX_MINUTES_PER_SET + CALORIES.MAX_EXTRA_MINUTES : 0;
  return Math.max(workSeconds / 60, Math.min(Math.max(0, minutes), cap));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Estimation de la dépense d'une séance. `exercises` = catalogue (profils musculaires, mode, pattern).
 */
export function estimateSessionCalories(
  session: WorkoutSession,
  exercises: readonly Exercise[],
  bodyWeight: { kg: number; source: BodyWeightSource }
): SessionCalories {
  const kg = bodyWeight.kg;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const allSets: LoggedSet[] = [];
  let setsGross = 0;
  let recovery = 0;
  let workSeconds = 0;
  const perExercise: ExerciseCalories[] = [];

  for (const logged of [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const exercise = byId.get(logged.exerciseId);
    const done = logged.sets.filter((s) => s.completed && s.reps > 0);
    if (done.length === 0) continue;
    let exerciseKcal = 0;
    for (const set of done) {
      const { grossKcal, seconds } = setCost(set, exercise, kg);
      const net = Math.max(0, grossKcal - (CALORIES.BACKGROUND_MET * kg * seconds) / 3600);
      const ratio = recoveryRatio(set);
      setsGross += grossKcal;
      recovery += net * ratio;
      workSeconds += seconds;
      exerciseKcal += grossKcal + net * ratio;
    }
    allSets.push(...done);
    perExercise.push({ loggedExerciseId: logged.id, exerciseName: logged.exerciseName, kcal: Math.round(exerciseKcal), sets: done.length });
  }

  const cardio = session.cardioEntries ?? [];
  const cardioMinutes = cardio.reduce((sum, e) => sum + Math.max(0, e.durationSeconds), 0) / 60;
  const cardioTotal = cardio.reduce((sum, e) => sum + cardioKcal(e, kg), 0);

  const liftMinutes = allSets.length > 0 ? strengthMinutes(session, allSets, workSeconds, cardioMinutes) : 0;
  const background = (CALORIES.BACKGROUND_MET * kg * Math.max(0, liftMinutes - workSeconds / 60)) / 60;
  const strength = setsGross + recovery + background;

  const minutes = liftMinutes + cardioMinutes;
  const total = strength + cardioTotal;
  const resting = (kg * minutes) / 60;
  const active = Math.max(0, total - resting);
  const spread = active * CALORIES.ACTIVE_UNCERTAINTY;

  return {
    kcal: roundTo(total, 5),
    low: roundTo(total - spread, 10),
    high: roundTo(total + spread, 10),
    activeKcal: roundTo(active, 5),
    strengthKcal: Math.round(strength),
    cardioKcal: Math.round(cardioTotal),
    minutes: Math.round(minutes),
    bodyWeightKg: kg,
    bodyWeightSource: bodyWeight.source,
    exercises: perExercise,
  };
}

/** Raccourci : poids à la date de la séance puis estimation. */
export function sessionCalories(
  session: WorkoutSession,
  exercises: readonly Exercise[],
  bodyWeights: readonly BodyWeightEntry[],
  settingsWeightKg: number | null | undefined
): SessionCalories {
  return estimateSessionCalories(session, exercises, bodyWeightForSession(session.date, bodyWeights, settingsWeightKg));
}
