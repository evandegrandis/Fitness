/**
 * La cible à battre : ce que l'app AFFICHE et enregistre (`suggestedWeight` / `suggestedReps`), construite
 * sur la prévision du moteur (`suggest()`, sans biais, voir `web/SUGGESTIONS.md`).
 *
 * Evan, 11/10/2026 : « je vois la suggestion affichée comme quelque chose à battre -> son but est de me
 * pousser à donner le meilleur de moi-même, constamment me dépasser en charges ou reps ». Deux couches :
 *  - la PRÉVISION (interne) dit ce qu'il fera : elle sert à la reprojection quand il change le poids
 *    (`predictedRepsAtActualWeight`), au décalage appris et au bilan ; on la veut juste ;
 *  - la CIBLE (affichée) garde la charge qu'il porte et vise les reps qu'il bat environ une fois sur deux
 *    (Atkinson, 1957 : motivation maximale à probabilité de réussite intermédiaire ; Locke et Latham :
 *    un objectif difficile mais atteignable bat un objectif facile).
 *
 * Charge : celle de la dernière série du même exercice (1re série : celle du moteur). Elle ne baisse que
 * si la prévision à cette charge tombe nettement sous la fourchette (seuil appris sur son comportement :
 * il garde sa charge tant que la prévision reste au-dessus de repMin − 2,7), d'un ou deux crans au plus.
 * Après une série LOURDE (reps au RIR visé sous la fourchette, charge au-dessus de sa charge de travail
 * habituelle), il redescend : la cible prend alors la charge de la prévision (retour ou amorce du moteur),
 * jamais « 145 × 4 » après 150 × 6. Montées de charge du moteur et test de plateau : inchangés.
 *
 * Reps : prévision à cette charge + marge d'ambition. La marge est apprise sur les séries récentes
 * enregistrées par ce moteur (prévision stockée contre reps faites, « battre » au sens de
 * `setVersusSuggestion`), par contexte (1re série, séries suivantes), rétrécie vers le global puis vers
 * un a priori, bornée à [−1 ; 2], et corrigée par une boucle de long terme, par contexte, sur les cibles
 * réellement battues (au-delà de 55 % elle monte, sous 45 % elle baisse). Pure, recalculée à chaque
 * suggestion. La marge peut être négative : une prévision juste n'est battue qu'environ 45 % du temps.
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import { effTotal, type LoadMode } from "@/lib/engines/predict";
import { setVersusSuggestion } from "@/lib/engines/versus";
import { SetPatternMode as SPM, SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import { orderedSets } from "@/lib/models/types";

/**
 * Réglages choisis par rejeu sur les séries d'avant le 21/09/2026, vérifiés après (`web/SUGGESTIONS.md`).
 * Objet modifiable à l'exécution pour les scripts de réglage uniquement.
 */
export const TARGET = {
  /** Demi-vie d'une série dans l'apprentissage de la marge, en jours. */
  HALF_LIFE_DAYS: 28,
  /** Poids du global dans la marge d'un contexte, en « séries équivalentes ». */
  SHRINK_K: 10,
  /** Poids de l'a priori dans la courbe globale, en « séries équivalentes ». */
  PRIOR_K: 10,
  /**
   * A priori : part des séries qui battent une cible = prévision − 1, + 0, + 1, + 2 reps (mesurée sur
   * l'historique d'Evan avant le 21/09/2026, 272 séries : 0,64 / 0,45 / 0,25 / 0,11).
   */
  PRIOR_BEAT_M1: 0.64,
  PRIOR_BEAT_0: 0.45,
  PRIOR_BEAT_1: 0.25,
  PRIOR_BEAT_2: 0.11,
  /** Probabilité visée de battre la cible. */
  GOAL: 0.5,
  /** Bornes de la marge, en reps. */
  MIN: -1,
  MAX: 2,
  /** Boucle de long terme : au-delà / en deçà de ces parts de cibles battues, la marge bouge d'un pas. */
  LOOP_HIGH: 0.55,
  LOOP_LOW: 0.45,
  LOOP_STEP: 0.5,
  /** Poids minimal de cibles jugées pour que la boucle agisse. */
  LOOP_MIN_WEIGHT: 8,
  /** La charge tenue ne décroche que si la prévision y tombe sous repMin moins ce nombre de reps. */
  LOWER_BELOW_MIN: 2.7,
  /** Crans de décrochage au plus. */
  MAX_LOWER_STEPS: 2,
  /** Série lourde : sa charge dépasse la charge de travail habituelle d'au moins ce nombre de crans. */
  HEAVY_MIN_STEPS: 1,
  /**
   * Après une série lourde, la cible redescend au moins de cette part de la charge (sa baisse médiane quand il
   * redescend après une série lourde, avant le 21/09/2026 : 11,1 %, 13 cas), sauf si la prévision (retour ou
   * amorce du moteur) est déjà plus légère.
   */
  HEAVY_RETURN_PCT: 0.11,
};

/** Première version du moteur dont les séries portent une PRÉVISION (et non une cible) dans `predictedRepsAtActualWeight`. */
const FIRST_TARGET_VERSION: [number, number] = [2, 3];

function versionAtLeast(version: string | null | undefined): boolean {
  const match = /web-v(\d+)\.(\d+)/.exec(version ?? "");
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major > FIRST_TARGET_VERSION[0] || (major === FIRST_TARGET_VERSION[0] && minor >= FIRST_TARGET_VERSION[1]);
}

interface TargetSample {
  at: number;
  first: boolean;
  reps: number;
  predicted: number;
  beat: boolean | null;
  /** Série faite à la charge de la cible : la seule où la marge (des reps) décide du verdict. */
  atTargetLoad: boolean;
}

const NORMAL = new Set<string>([SetType.work, SetType.topSet, SetType.backoff]);
const cache = new WeakMap<readonly WorkoutSession[], TargetSample[]>();

function isContinuation(set: LoggedSet): boolean {
  return set.setTechnique != null || (set.logicalSetId != null && set.logicalSetId !== set.id);
}

/** Séries enregistrées par un moteur à deux couches, hors 1re séance de chaque exercice. Mémoïsé par tableau. */
function targetSamples(history: readonly WorkoutSession[], catalog: readonly Exercise[]): TargetSample[] {
  const cached = cache.get(history);
  if (cached) return cached;
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const chronological = [...history].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const samples: TargetSample[] = [];
  for (const session of chronological) {
    const firstTimeHere = new Set<string>();
    for (const logged of session.exercises) {
      if (!seen.has(logged.exerciseId) && logged.sets.some((set) => set.completed && NORMAL.has(set.setType))) {
        firstTimeHere.add(logged.exerciseId);
      }
    }
    for (const logged of session.exercises) {
      const exercise = byId.get(logged.exerciseId);
      if (!exercise || firstTimeHere.has(logged.exerciseId)) continue;
      const sets = orderedSets(logged).filter((set) => set.completed && NORMAL.has(set.setType) && !isContinuation(set));
      sets.forEach((set, index) => {
        if (!versionAtLeast(set.suggestionEngineVersion) || set.predictedRepsAtActualWeight == null) return;
        const verdict = setVersusSuggestion(exercise, set);
        samples.push({
          at: set.timestamp.getTime(),
          first: index === 0,
          reps: set.reps,
          predicted: set.predictedRepsAtActualWeight,
          beat: verdict === null ? null : verdict === "beat",
          atTargetLoad: set.suggestedWeight != null && Math.abs(set.suggestedWeight - set.weight) < 1e-9,
        });
      });
    }
    for (const id of firstTimeHere) seen.add(id);
  }
  cache.set(history, samples);
  return samples;
}

export interface AmbitionMargin {
  /** Reps ajoutées à la prévision pour former la cible. */
  margin: number;
  /** Part pondérée des cibles récentes battues (null sans assez de cibles jugées). */
  beatRate: number | null;
  /** Poids de récence cumulé des séries du contexte. */
  weight: number;
}

/** Marge d'ambition pour une 1re série (`first`) ou une série suivante, à `now`. */
export function ambitionMargin(
  history: readonly WorkoutSession[] | undefined,
  catalog: readonly Exercise[] | undefined,
  first: boolean,
  now: Date
): AmbitionMargin {
  // Marges candidates −1, 0, 1, 2 reps : part des séries qui auraient battu la prévision + marge.
  const margins = [-1, 0, 1, 2];
  const prior = [TARGET.PRIOR_BEAT_M1, TARGET.PRIOR_BEAT_0, TARGET.PRIOR_BEAT_1, TARGET.PRIOR_BEAT_2];
  const all = history && catalog ? targetSamples(history, catalog).filter((s) => s.at <= now.getTime()) : [];
  const curve = (samples: TargetSample[]) => {
    const sums = margins.map(() => 0);
    let total = 0;
    for (const s of samples) {
      const w = Math.pow(0.5, Math.max(0, now.getTime() - s.at) / 86_400_000 / TARGET.HALF_LIFE_DAYS);
      total += w;
      margins.forEach((k, i) => {
        if (s.reps >= s.predicted + k + 1) sums[i] += w;
      });
    }
    return { total, beat: sums.map((v) => (total > 0 ? v / total : 0)) };
  };
  const g = curve(all);
  const c = curve(all.filter((s) => s.first === first));
  const global = prior.map((p, k) => (g.total * g.beat[k] + TARGET.PRIOR_K * p) / (g.total + TARGET.PRIOR_K));
  const context = global.map((p, k) => (c.total * c.beat[k] + TARGET.SHRINK_K * p) / (c.total + TARGET.SHRINK_K));
  // Plus petite marge (interpolée entre −1, 0, 1 et 2 reps) dont la probabilité d'être battue ne dépasse pas l'objectif.
  let margin = margins[margins.length - 1];
  if (context[0] <= TARGET.GOAL) margin = margins[0];
  else {
    for (let i = 0; i < margins.length - 1; i++) {
      if (context[i + 1] <= TARGET.GOAL) {
        margin = margins[i] + (context[i] - TARGET.GOAL) / Math.max(1e-9, context[i] - context[i + 1]);
        break;
      }
    }
  }
  // Boucle de long terme sur les cibles réellement affichées et jugées, faites à la charge de la cible (ailleurs,
  // le verdict dépend de la charge choisie, pas des reps visées), dans ce contexte (à défaut, tous contextes).
  const realized = (samples: TargetSample[]) => {
    let judged = 0;
    let beaten = 0;
    for (const s of samples) {
      if (s.beat === null || !s.atTargetLoad) continue;
      const w = Math.pow(0.5, Math.max(0, now.getTime() - s.at) / 86_400_000 / TARGET.HALF_LIFE_DAYS);
      judged += w;
      if (s.beat) beaten += w;
    }
    return judged >= TARGET.LOOP_MIN_WEIGHT ? beaten / judged : null;
  };
  const beatRate = realized(all.filter((s) => s.first === first)) ?? realized(all);
  if (beatRate !== null && beatRate > TARGET.LOOP_HIGH) margin += TARGET.LOOP_STEP;
  if (beatRate !== null && beatRate < TARGET.LOOP_LOW) margin -= TARGET.LOOP_STEP;
  return { margin: Math.max(TARGET.MIN, Math.min(TARGET.MAX, margin)), beatRate, weight: c.total };
}

function loadModeOf(exercise: Exercise): LoadMode {
  if (exercise.setPatternMode === SPM.weightedBodyweight) return "weighted_bodyweight";
  if (exercise.setPatternMode === SPM.assistedBodyweight) return "assisted_bodyweight";
  return "external";
}

function stepEasier(load: number, increment: number, exercise: Exercise): number {
  if (exercise.setPatternMode === SPM.assistedBodyweight) return load + increment;
  return Math.max(0, load - increment);
}

/** Charge de travail habituelle : médiane des séries de travail des 5 dernières séances (plus récente en premier). */
export function usualWorkingLoad(historyNewestFirst: readonly LoggedSet[][]): number | null {
  const loads = historyNewestFirst
    .slice(0, 5)
    .flat()
    .filter((set) => set.completed && NORMAL.has(set.setType))
    .map((set) => set.weight)
    .sort((a, b) => a - b);
  if (loads.length === 0) return null;
  const mid = Math.floor(loads.length / 2);
  return loads.length % 2 ? loads[mid] : (loads[mid - 1] + loads[mid]) / 2;
}

/**
 * Série lourde : reps au RIR visé sous la fourchette, à une charge au-dessus de sa charge de travail
 * habituelle (d'au moins `HEAVY_MIN_STEPS` crans). Rejeu avant le 21/09 : après une telle série, il
 * redescend 63 % du temps (27 séries), contre 25 % ailleurs ; après le 21/09 : 74 % (19 séries).
 */
export function isHeavySet(
  repsAtTargetRir: number,
  load: number,
  usualLoad: number | null,
  exercise: Exercise,
  increment: number,
  bodyweightKg: number | undefined
): boolean {
  if (usualLoad === null || exercise.setPatternMode === SPM.bodyweight) return false;
  const mode = loadModeOf(exercise);
  return (
    repsAtTargetRir < exercise.repTargetMin &&
    effTotal(load, mode, bodyweightKg) >= effTotal(usualLoad, mode, bodyweightKg) + TARGET.HEAVY_MIN_STEPS * increment - 1e-9
  );
}

/** Charge de retour après une série lourde : la prévision du moteur, ou plus léger d'au moins `HEAVY_RETURN_PCT`. */
export function heavyReturnLoad(predictionLoad: number, heavyLoad: number, exercise: Exercise, increment: number): number {
  if (exercise.setPatternMode === SPM.assistedBodyweight || !(increment > 0)) return predictionLoad;
  const steps = Math.max(1, Math.ceil((heavyLoad * TARGET.HEAVY_RETURN_PCT) / increment - 1e-9));
  return Math.min(predictionLoad, Math.max(0, heavyLoad - steps * increment));
}

export interface TargetInput {
  /** La prévision du moteur (charge et reps au RIR visé). */
  weight: number;
  reps: number;
  /** true quand le moteur pousse en charge (montée, promotion, test de plateau) : la cible reste la sienne. */
  push: boolean;
  /**
   * Prévision à la charge de la dernière série quand le moteur en a prévu une autre : reps de cette série au
   * RIR visé moins la perte de reps apprise. Reprojeter la prévision d'une charge lointaine (120 × 11 après
   * 150 × 6) vers la charge tenue donnerait n'importe quoi.
   */
  anchor?: { load: number; reps: number } | null;
}

/**
 * Charge et reps de la cible. `lastLoad` = charge de la dernière série du même exercice aujourd'hui (null
 * pour une 1re série). Les reps prévues à une autre charge suivent la règle du moteur (7,5 % = 1 rep).
 */
export function targetFromPrediction(
  input: TargetInput,
  exercise: Exercise,
  lastLoad: number | null,
  margin: number,
  increment: number,
  bodyweightKg: number | undefined,
  /** false après une série lourde : la charge de retour est déjà choisie. */
  mayLower = true
): { weight: number; reps: number; predictedReps: number; lowered: number } {
  if (input.push) return { weight: input.weight, reps: input.reps, predictedReps: input.reps, lowered: 0 };
  const mode = loadModeOf(exercise);
  const base = input.anchor ?? { load: input.weight, reps: input.reps };
  const from = effTotal(base.load, mode, bodyweightKg);
  const kgPerRep = Math.max(increment, ALGO_V2.REP_SLOPE_PCT * Math.max(1, from));
  const predictedAt = (load: number) => base.reps + (from - effTotal(load, mode, bodyweightKg)) / kgPerRep;
  let load = lastLoad ?? input.weight;
  let lowered = 0;
  while (
    mayLower &&
    lastLoad !== null &&
    lowered < TARGET.MAX_LOWER_STEPS &&
    predictedAt(load) < exercise.repTargetMin - TARGET.LOWER_BELOW_MIN &&
    exercise.setPatternMode !== SPM.bodyweight
  ) {
    const next = stepEasier(load, increment, exercise);
    if (Math.abs(next - load) < 1e-9) break;
    load = next;
    lowered += 1;
  }
  const predictedReps = predictedAt(load);
  const reps = Math.max(1, Math.round(predictedReps + margin));
  return { weight: load, reps, predictedReps, lowered };
}
