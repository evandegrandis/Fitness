/**
 * Perte de reps d'une série à la suivante, apprise par exercice sur l'historique (voir `web/SUGGESTIONS.md`).
 *
 * Audit du 11/10/2026 (31 séances, 439 séries) : à charge égale, Evan perd 2,5 reps [2,1 ; 2,9] au RIR visé
 * d'une série à la suivante, alors que le moteur en retirait une constante par classe de fatigue (1 / 1,5 / 2).
 * Les séries 2+ étaient prévues 1,8 rep trop haut. La perte propre à chaque exercice varie (biceps et deltoïde
 * latéral ~2, abdos ~3, triceps ~3,5) sans que la classe de fatigue ne l'explique.
 *
 * Méthode, pure et refaite depuis l'historique à chaque suggestion :
 *  - une paire = deux séries normales consécutives du même exercice dans une séance, même charge, RIR rapporté
 *    sur les deux, aucune n'étant un complément de série ni arrêtée pour douleur ou matériel, hors 1re séance
 *    de l'exercice (étalonnage). Perte = reps au RIR visé de la 1re - reps au RIR visé de la 2e ;
 *  - chaque paire pèse selon son âge (demi-vie `HALF_LIFE_DAYS`) : le moteur suit les habitudes qui changent ;
 *  - a priori = moyenne pondérée de TOUTES les paires de l'historique, rétrécie vers la constante de la classe
 *    de fatigue (`PRIOR_K`) : un nouvel utilisateur garde les constantes d'origine ;
 *  - perte de l'exercice = moyenne de ses paires rétrécie vers l'a priori (bayésien empirique, poids
 *    W / (W + `SHRINK_K`)) : un nouvel exercice part de l'a priori ;
 *  - bornée à [`MIN`, `MAX`].
 *
 * La constante de classe `FATIGUE_CLASS_PROPERTIES.baseRepDrop` reste la seule source du coût de fatigue
 * de séance (`session-fatigue.ts`) : cette perte apprise ne sert qu'à prévoir la série suivante du même
 * exercice.
 */

import { FATIGUE_CLASS_PROPERTIES, SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet, WorkoutSession } from "@/lib/models/types";
import { orderedSets } from "@/lib/models/types";

/**
 * Réglages choisis par rejeu sur les séries d'avant le 21/09/2026, puis vérifiés sur les séries d'après
 * (`web/SUGGESTIONS.md`). Objet modifiable à l'exécution pour les scripts de réglage uniquement.
 */
export const REP_DROP = {
  /** Poids de l'a priori dans la perte d'un exercice, en « paires équivalentes ». */
  SHRINK_K: 4,
  /** Poids de la constante de classe dans l'a priori, en « paires équivalentes ». */
  PRIOR_K: 5,
  /** Demi-vie d'une paire, en jours. */
  HALF_LIFE_DAYS: 60,
  /** Bornes de la perte retenue. */
  MIN: 0.5,
  MAX: 4,
  /** Bornes d'une paire (une série interrompue ne doit pas dominer la moyenne). */
  PAIR_MIN: -2,
  PAIR_MAX: 6,
  /** Poids minimal des paires propres pour dire « tu perds d'habitude » (sinon c'est l'a priori qui parle). */
  OWN_EVIDENCE_MIN: 3,
  /** RIR visé par les suggestions (même cible que `progression.ts`). */
  TARGET_RIR: 1,
};

export interface RepDropPair {
  exerciseId: string;
  at: Date;
  drop: number;
}

export interface RepDropEstimate {
  /** Reps perdues d'une série à la suivante à charge égale, au RIR visé (bornée). */
  drop: number;
  /** `exercise` : assez de paires propres ; `prior` : surtout l'a priori appris ; `class` : aucune paire, constante d'origine. */
  source: "exercise" | "prior" | "class";
  /** Nombre de paires propres à l'exercice. */
  exercisePairs: number;
  /** Poids de récence cumulé des paires propres. */
  exerciseWeight: number;
  /** Moyenne pondérée des paires propres (null sans paire). */
  exerciseMean: number | null;
  /** A priori vers lequel la perte est rétrécie. */
  prior: number;
  /** Constante d'origine de la classe de fatigue. */
  classDrop: number;
}

const NORMAL = new Set<string>([SetType.work, SetType.topSet, SetType.backoff]);

function repsAtTargetRir(set: LoggedSet): number | null {
  const rir = set.reportedRir;
  if (rir === null || rir === undefined || !Number.isFinite(rir)) return null;
  return set.reps + Math.max(0, Math.min(4, Math.round(rir))) - REP_DROP.TARGET_RIR;
}

function isContinuation(set: LoggedSet): boolean {
  return set.setTechnique != null || (set.logicalSetId != null && set.logicalSetId !== set.id);
}

function disturbed(set: LoggedSet): boolean {
  return set.stopReason === "pain" || set.stopReason === "equipment";
}

/** Paires d'une suite de séries d'un même exercice (ordre de la séance). */
export function pairsFromSets(sets: readonly LoggedSet[], exerciseId: string): RepDropPair[] {
  const pairs: RepDropPair[] = [];
  const done = sets.filter((set) => set.completed && set.setType !== SetType.warmup);
  for (let i = 1; i < done.length; i++) {
    const a = done[i - 1];
    const b = done[i];
    if (!NORMAL.has(a.setType) || !NORMAL.has(b.setType)) continue;
    if (isContinuation(a) || isContinuation(b) || disturbed(a) || disturbed(b)) continue;
    if (Math.abs(a.weight - b.weight) > 1e-9) continue;
    const ra = repsAtTargetRir(a);
    const rb = repsAtTargetRir(b);
    if (ra === null || rb === null) continue;
    pairs.push({ exerciseId, at: b.timestamp, drop: Math.max(REP_DROP.PAIR_MIN, Math.min(REP_DROP.PAIR_MAX, ra - rb)) });
  }
  return pairs;
}

const cache = new WeakMap<readonly WorkoutSession[], RepDropPair[]>();

/** Toutes les paires de l'historique, hors 1re séance de chaque exercice (étalonnage). Mémoïsé par tableau. */
export function repDropPairs(history: readonly WorkoutSession[]): RepDropPair[] {
  const cached = cache.get(history);
  if (cached) return cached;
  const chronological = [...history].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const pairs: RepDropPair[] = [];
  for (const session of chronological) {
    const firstTimeHere = new Set<string>();
    for (const logged of session.exercises) {
      const hasWork = logged.sets.some((set) => set.completed && NORMAL.has(set.setType));
      if (!hasWork) continue;
      if (!seen.has(logged.exerciseId)) firstTimeHere.add(logged.exerciseId);
    }
    for (const logged of session.exercises) {
      if (firstTimeHere.has(logged.exerciseId)) continue;
      pairs.push(...pairsFromSets(orderedSets(logged), logged.exerciseId));
    }
    for (const id of firstTimeHere) seen.add(id);
  }
  cache.set(history, pairs);
  return pairs;
}

function weight(pair: RepDropPair, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - pair.at.getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / REP_DROP.HALF_LIFE_DAYS);
}

/** La constante d'origine, telle que le moteur l'utilisait avant la perte apprise. */
export function classRepDrop(exercise: Pick<Exercise, "fatigueClass">): RepDropEstimate {
  const classDrop = FATIGUE_CLASS_PROPERTIES[exercise.fatigueClass].baseRepDrop;
  return { drop: classDrop, source: "class", exercisePairs: 0, exerciseWeight: 0, exerciseMean: null, prior: classDrop, classDrop };
}

/**
 * Perte de reps apprise pour `exercise`. `history` = séances terminées (sans la séance en cours), `now` =
 * horloge de la suggestion. Sans historique : constante de la classe de fatigue.
 */
export function learnedRepDrop(
  exercise: Pick<Exercise, "id" | "fatigueClass">,
  history: readonly WorkoutSession[] | undefined,
  now: Date
): RepDropEstimate {
  const base = classRepDrop(exercise);
  if (!history || history.length === 0) return base;
  const pairs = repDropPairs(history).filter((pair) => pair.at.getTime() <= now.getTime());
  if (pairs.length === 0) return base;

  let total = 0;
  let totalSum = 0;
  let own = 0;
  let ownSum = 0;
  let ownCount = 0;
  for (const pair of pairs) {
    const w = weight(pair, now);
    total += w;
    totalSum += w * pair.drop;
    if (pair.exerciseId === exercise.id) {
      own += w;
      ownSum += w * pair.drop;
      ownCount += 1;
    }
  }
  const prior = (totalSum + REP_DROP.PRIOR_K * base.classDrop) / (total + REP_DROP.PRIOR_K);
  const estimate = (ownSum + REP_DROP.SHRINK_K * prior) / (own + REP_DROP.SHRINK_K);
  return {
    drop: Math.max(REP_DROP.MIN, Math.min(REP_DROP.MAX, estimate)),
    source: own >= REP_DROP.OWN_EVIDENCE_MIN ? "exercise" : "prior",
    exercisePairs: ownCount,
    exerciseWeight: own,
    exerciseMean: own > 0 ? ownSum / own : null,
    prior,
    classDrop: base.classDrop,
  };
}
