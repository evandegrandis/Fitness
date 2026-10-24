/**
 * Ce que la carte de saisie dit autour de la cible à battre (24/10/2026). Une seule source par chiffre :
 *
 * - « À 90 kg, cette cible vaut 10 reps » : la CIBLE affichée ramenée à la charge choisie par la règle de l'app
 *   (`repsAtLoad`, 7,5 % de charge = 1 rep, celle qui juge « battre »). Avant, la ligne reprojetait la prévision
 *   brute du moteur, sans la marge d'ambition et parfois depuis une autre charge : 80 × 12 proposé et « à 90 kg,
 *   le moteur prévoit 8 » côte à côte (22/10), 4 reps pour 10 kg là où la règle en donne 1,7. La prévision reste
 *   enregistrée pour l'apprentissage (`predictedRepsAtActualWeight`), elle n'est plus affichée.
 * - « À 72 kg, tu fais d'habitude 7 reps (au mieux 9) » : tiré de SES séries réelles à cette charge. Avant,
 *   « tu fais d'habitude 8 à 9 ici » était la prévision du moteur arrondie, + 1 : à 72 kg au tirage horizontal il
 *   avait fait 7, 9, 7, 7.
 */
import { normalRecordSets } from "@/lib/engines/records";
import { effectiveEffort, repsAtLoad, versusReference } from "@/lib/engines/versus";
import { formatLoad } from "@/lib/format";
import { orderedSets, sessionsNewestFirst, type Exercise, type WorkoutSession } from "@/lib/models/types";

export const TARGET_DISPLAY = {
  /** Recherche des reps qui tiennent la cible plus légère : au moins jusque-là (ou 4 fois les reps de la cible). */
  MAX_REPS: 100,
} as const;

export const LOAD_HABIT = {
  /** Séries lues : les plus récentes à cette charge, dans cette fenêtre. */
  WINDOW_DAYS: 56,
  MAX_SETS: 6,
} as const;

const DAY_MS = 86_400_000;

/**
 * Reps que vaut la cible à une autre charge, cohérentes avec la règle qui juge « battre » (`versusReference`) :
 * - plus léger : le plus petit nombre de reps qui TIENT la cible (la règle ramène la série à la charge de la cible,
 *   7,5 % de SA charge = 1 rep, reps dans la fourchette) ; une rep de moins serait « en dessous » ;
 * - plus lourd : la cible ramenée à cette charge (7,5 % de la charge de la cible = 1 rep, le calcul d'Evan :
 *   80 × 12 vaut 10 reps à 90 kg), au moins le bas de la fourchette (en dessous, la règle dit « en dessous »).
 * Faire ce que dit la ligne ne donne donc jamais « en dessous ».
 */
export function targetRepsAtLoad(exercise: Exercise, target: { weight: number; reps: number }, load: number): number {
  const gap = effectiveEffort(exercise, load) - effectiveEffort(exercise, target.weight);
  if (Math.abs(gap) < 0.01) return target.reps;
  if (gap > 0) {
    const reps = repsAtLoad(exercise, target, load);
    return Math.max(exercise.repTargetMin, reps >= 0 ? Math.floor(reps + 0.5) : 0);
  }
  const limit = Math.max(TARGET_DISPLAY.MAX_REPS, target.reps * 4);
  for (let reps = 1; reps < limit; reps += 1) {
    if (versusReference(exercise, { weight: load, reps }, target) !== "below") return reps;
  }
  return limit;
}

function where(load: number): string {
  return load > 0 ? `À ${formatLoad(load)}` : "Au poids du corps";
}

function repsWord(reps: number): string {
  return `${reps} rep${reps > 1 ? "s" : ""}`;
}

/** La ligne affichée quand la charge choisie n'est pas celle de la cible. */
export function atLoadText(exercise: Exercise, target: { weight: number; reps: number }, load: number): string {
  const reps = targetRepsAtLoad(exercise, target, load);
  const heavier = effectiveEffort(exercise, load) > effectiveEffort(exercise, target.weight);
  const floored = heavier && Math.floor(repsAtLoad(exercise, target, load) + 0.5) < exercise.repTargetMin;
  return `${where(load)}, cette cible vaut ${repsWord(reps)} (${floored ? "le bas de ta fourchette" : "7,5 % de charge = 1 rep"}).`;
}

export interface LoadHabit {
  load: number;
  /** Reps des séries de travail faites à cette charge, la plus récente d'abord. */
  reps: number[];
  /** Médiane basse des reps (ce qu'il fait le plus souvent), `null` sans série. */
  typical: number | null;
  best: number | null;
  /** Date de la plus récente, `null` sans série. */
  lastAt: Date | null;
}

/**
 * Ses séries réelles à cette charge sur l'exercice : séances terminées, séries de travail (ni échauffement, ni
 * complément, ni finisher, ni série arrêtée pour douleur), les `MAX_SETS` plus récentes des `WINDOW_DAYS` derniers
 * jours, toutes positions dans la séance.
 */
export function loadHabit(exercise: Exercise, history: readonly WorkoutSession[], load: number, now: Date): LoadHabit {
  const since = now.getTime() - LOAD_HABIT.WINDOW_DAYS * DAY_MS;
  const found: { reps: number; at: Date }[] = [];
  for (const session of sessionsNewestFirst(history.filter((candidate) => !candidate.isActive))) {
    if (found.length >= LOAD_HABIT.MAX_SETS || session.date.getTime() < since) break;
    const sets = session.exercises.filter((logged) => logged.exerciseId === exercise.id).flatMap((logged) => orderedSets(logged));
    const atLoad = normalRecordSets(sets, exercise)
      .filter((set) => Math.abs(set.weight - load) < 0.01)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    for (const set of atLoad) {
      if (found.length < LOAD_HABIT.MAX_SETS) found.push({ reps: set.reps, at: set.timestamp });
    }
  }
  const reps = found.map((entry) => entry.reps);
  const sorted = [...reps].sort((a, b) => a - b);
  return {
    load,
    reps,
    typical: sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)] : null,
    best: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    lastAt: found[0]?.at ?? null,
  };
}

/** « À 72 kg, tu fais d'habitude 7 reps (au mieux 9) », « À 66 kg, tu as fait 10 reps le 06/10 », ou rien de fait. */
export function loadHabitText(habit: LoadHabit): string {
  if (habit.typical === null || habit.best === null || habit.lastAt === null) {
    return `${habit.load > 0 ? `Aucune série à ${formatLoad(habit.load)}` : "Aucune série au poids du corps"} ces 8 dernières semaines`;
  }
  if (habit.reps.length === 1) {
    const day = habit.lastAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    return `${where(habit.load)}, tu as fait ${repsWord(habit.typical)} le ${day}`;
  }
  return `${where(habit.load)}, tu fais d'habitude ${repsWord(habit.typical)}${habit.best > habit.typical ? ` (au mieux ${habit.best})` : ""}`;
}
