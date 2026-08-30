/**
 * Records de force pour un exercice, miroir exact de
 * `Jeera/Engines/RecordsEngine.swift`.
 *
 * Les records sont calculés à partir de séances TERMINÉES uniquement (jamais
 * de la séance active — sinon chaque premier set de chaque séance
 * ressemblerait à un "record"). On ne considère que les sets qui passent la
 * validation : reps >= exercise.repTargetMin (sauf branche bodyweight).
 */

import { estimated1RM, bestE1RM } from "@/lib/engines/e1rm";
import { immediateCompositeKind } from "@/lib/engines/set-structure";
import { orderedSets, type Exercise, type LoggedExercise, type LoggedSet } from "@/lib/models/types";
import { SetType, stopReasonTrainsModel } from "@/lib/models/enums";

// ---------------------------------------------------------------------------
// ExerciseRecords
// ---------------------------------------------------------------------------

/** Miroir de `ExerciseRecords` (Swift). */
export interface ExerciseRecords {
  /** Poids le plus lourd soulevé pour reps >= repTargetMin. */
  heaviestValidated: number;
  /** Reps à ce poids le plus lourd (affichage "85 kg x 6"). */
  repsAtHeaviestValidated: number;
  /** Poids le plus lourd jamais complété (tout nombre de reps). */
  heaviestEver: number;
  /** Pour chaque poids, le meilleur nombre de reps (sets validés uniquement). */
  bestRepsByWeight: Record<number, number>;
  /** Meilleur nombre de reps sur un set bodyweight pur (weight == 0). */
  bestBodyweightReps: number;
  /** Meilleur e1RM Epley parmi les sets validés. */
  bestE1RM: number;
  /** true si aucun historique préalable. */
  isEmpty: boolean;
}

export const EMPTY_RECORDS: ExerciseRecords = {
  heaviestValidated: 0,
  repsAtHeaviestValidated: 0,
  heaviestEver: 0,
  bestRepsByWeight: {},
  bestBodyweightReps: 0,
  bestE1RM: 0,
  isEmpty: true,
};

/** Miroir de `RecordKind` (Swift). */
export type RecordKind =
  | "heaviestWeight"
  | "estimated1RM"
  | "repsAtWeight"
  | "bodyweightReps"
  | "finisherReps";

/**
 * Piste volontairement séparée des PR normaux : un finisher ne doit jamais
 * modifier heaviest/e1RM/repsAtWeight, mais peut battre son propre meilleur
 * nombre de reps à charge identique.
 */
export interface FinisherRecords {
  bestRepsByWeight: Record<string, number>;
}

export const EMPTY_FINISHER_RECORDS: FinisherRecords = { bestRepsByWeight: {} };

function finisherWeightKey(weight: number): string {
  return String(Math.round(weight * 100) / 100);
}

export function buildFinisherRecords(historicalSets: LoggedSet[]): FinisherRecords {
  const bestRepsByWeight: Record<string, number> = {};
  for (const set of historicalSets) {
    if (!set.completed || set.setType !== SetType.finisher) continue;
    const key = finisherWeightKey(set.weight);
    bestRepsByWeight[key] = Math.max(bestRepsByWeight[key] ?? 0, set.reps);
  }
  return { bestRepsByWeight };
}

export function isFinisherRepRecord(set: LoggedSet, prior: FinisherRecords): boolean {
  return (
    set.completed &&
    set.setType === SetType.finisher &&
    set.reps > (prior.bestRepsByWeight[finisherWeightKey(set.weight)] ?? 0)
  );
}

/** Classification dédiée, volontairement impossible à confondre avec un PR normal. */
/**
 * Toujours `null` depuis le 18/08/2026 : décision d'Evan, et c'est la bonne.
 *
 * Un record sur un finisher crée une incitation inversée — pour battre un record à hautes reps,
 * il faut BAISSER la charge, donc la récompense pousse exactement dans le sens contraire de la
 * progression. Le finisher est un travail de volume en fin de séance, pas une mesure de capacité.
 *
 * `isFinisherRepRecord` / `buildFinisherRecords` restent exportés : ils servent aux tests et
 * pourraient nourrir une statistique descriptive, mais plus jamais une étoile ni une célébration.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- signature conservée : les appelants
   (bilan, achievements) restent inchangés, la porte se ferme ici en un seul endroit. */
export function classifyFinisher(_set: LoggedSet, _prior: FinisherRecords): RecordKind | null {
  return null;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * Marge minimale d'amélioration relative sur l'e1RM précédent pour compter
 * comme un PR. Assez petite pour capter une vraie progression (80→82 = +2.5%)
 * mais assez grande pour éviter de flaguer chaque variation d'un demi-kilo.
 * Exportée (BENCHMARK_LEVEL_SPEC.md §3, P3.3) : `progression.ts::suggest()` réutilise EXACTEMENT
 * cette marge pour `readyForPR`, afin que le signal feu ne promette jamais un PR qui ne se
 * matérialiserait pas en étoile une fois le set réellement loggé (source de vérité unique).
 */
export const K_E1RM_PR_THRESHOLD = 1.02;

const WORK_KINDS = new Set<string>([SetType.work, SetType.topSet, SetType.backoff]);

/**
 * Une performance pondérée est dominée s'il existe déjà un set au moins aussi
 * lourd ET avec au moins autant de reps (avec au moins une dimension
 * strictement meilleure). Dans ce cas, elle n'apporte aucune information de
 * performance nouvelle et ne doit jamais recevoir d'étoile.
 */
function isDominatedByRecordMap(
  weight: number,
  reps: number,
  bestRepsByWeight: Record<number, number>
): boolean {
  return Object.entries(bestRepsByWeight).some(([recordWeightRaw, recordReps]) => {
    const recordWeight = Number(recordWeightRaw);
    return (
      recordWeight >= weight &&
      recordReps >= reps &&
      (recordWeight > weight || recordReps > reps)
    );
  });
}

function isDominatedBySets(set: LoggedSet, candidates: LoggedSet[], exercise: Exercise): boolean {
  return candidates.some(
    (candidate) =>
      candidate.id !== set.id &&
      candidate.weight > 0 &&
      candidate.reps >= exercise.repTargetMin &&
      candidate.weight >= set.weight &&
      candidate.reps >= set.reps &&
      (candidate.weight > set.weight || candidate.reps > set.reps)
  );
}

/**
 * Séries autorisées à porter un record normal. Une continuation immédiate de
 * drop-set/rest-pause appartient au bloc logique précédent : elle contribue au
 * volume, mais ne peut jamais devenir un second PR ni modifier les records
 * utilisés par la progression.
 *
 * L'ordre reçu est conservé volontairement. Les appelants historiques
 * concatènent les séances/occurrences ; le retour des slots à zéro empêche une
 * fusion accidentelle entre deux séances.
 */
export function normalRecordSets(sets: LoggedSet[], exercise: Exercise): LoggedSet[] {
  const leads: LoggedSet[] = [];
  const seenLogicalSetIds = new Set<string>();
  let previousWorkSet: LoggedSet | undefined;

  for (const set of sets) {
    if (!set.completed || set.reps <= 0 || !WORK_KINDS.has(set.setType)) continue;
    // oui.rtf #7 (nerf ulnaire) : une série arrêtée pour douleur/matériel n'est pas une mesure
    // valide de la capacité — jamais un record ni une ancre de performance. Elle reste dans
    // l'historique (volume/affichage) mais n'entraîne pas le modèle.
    if (!stopReasonTrainsModel(set.stopReason)) continue;
    const logicalSetId = set.logicalSetId ?? null;
    const continuesExplicitLogicalSet =
      logicalSetId !== null &&
      (seenLogicalSetIds.has(logicalSetId) || leads.some((lead) => lead.id === logicalSetId));
    const continuesPrevious =
      continuesExplicitLogicalSet ||
      (logicalSetId === null &&
        previousWorkSet !== undefined &&
        previousWorkSet.supersetRoundIndex === set.supersetRoundIndex &&
        immediateCompositeKind(previousWorkSet, set, { increment: exercise.smallestIncrement }) !== null);
    if (!continuesPrevious) leads.push(set);
    if (logicalSetId !== null) seenLogicalSetIds.add(logicalSetId);
    previousWorkSet = set;
  }

  return leads;
}

/**
 * Set source du record de charge all-time affiché pendant la séance.
 * Pour un exercice uniquement au poids du corps, le record est le maximum de reps.
 * Pour une charge externe, la charge la plus haute gagne puis les reps départagent.
 */
export function allTimeRecordSet(exercise: Exercise, sets: LoggedSet[]): LoggedSet | null {
  const candidates = normalRecordSets(sets, exercise);
  if (candidates.length === 0) return null;
  const weighted = candidates.filter((set) => set.weight > 0);
  const pool = weighted.length > 0 ? weighted : candidates.filter((set) => set.weight === 0);
  if (pool.length === 0) return null;
  return pool.reduce((best, current) => {
    if (current.weight > best.weight) return current;
    if (Math.abs(current.weight - best.weight) < 1e-9 && current.reps > best.reps) return current;
    return best;
  });
}

export const RecordsEngine = {
  /**
   * Construit un résumé compact des records d'un exercice à partir de ses
   * sets historiques. `historicalSets` ne doit PAS inclure les sets de la
   * séance actuellement active.
   */
  buildRecords(exercise: Exercise, historicalSets: LoggedSet[]): ExerciseRecords {
    const completedWork = normalRecordSets(historicalSets, exercise);

    // Records pondérés : reps validées (>= repTargetMin) ET poids > 0.
    const weightedValidated = completedWork.filter((s) => s.weight > 0 && s.reps >= exercise.repTargetMin);

    // Piste bodyweight : tout set BW complété compte (weight == 0). Pas de
    // porte sur repTargetMin pour que les premières séances BW produisent
    // déjà des PR.
    const bwSets = completedWork.filter((s) => s.weight === 0);
    const bestBWReps = bwSets.reduce((max, s) => Math.max(max, s.reps), 0);

    // Piste e1RM : tous les sets pondérés validés.
    const bestE1RMValue = bestE1RM(weightedValidated).e1rm;

    const allWeighted = completedWork.filter((s) => s.weight > 0);
    const heaviestEver = allWeighted.reduce((max, s) => Math.max(max, s.weight), 0);

    if (weightedValidated.length === 0 && bestBWReps <= 0 && heaviestEver <= 0) {
      return EMPTY_RECORDS;
    }

    const bestRepsByWeight: Record<number, number> = {};
    for (const set of weightedValidated) {
      const current = bestRepsByWeight[set.weight] ?? 0;
      if (set.reps > current) {
        bestRepsByWeight[set.weight] = set.reps;
      }
    }

    let heaviest: LoggedSet | undefined;
    for (const set of weightedValidated) {
      if (!heaviest || set.weight > heaviest.weight) heaviest = set;
    }

    return {
      heaviestValidated: heaviest?.weight ?? 0,
      repsAtHeaviestValidated: heaviest?.reps ?? 0,
      heaviestEver,
      bestRepsByWeight,
      bestBodyweightReps: bestBWReps,
      bestE1RM: bestE1RMValue,
      isEmpty: false,
    };
  },

  /**
   * Classifie si un set qui vient d'être loggé bat un record existant.
   * Retourne null si le set n'est pas un record.
   *
   * L'ordre compte — le plus "impressionnant" gagne si plusieurs s'appliquent :
   *   1. heaviestWeight (nouveau sommet)
   *   2. estimated1RM (nouveau e1RM avec marge >= 2%, évite le flapping)
   *   3. repsAtWeight (plus de reps à un poids déjà atteint)
   *   4. bodyweightReps (exercices BW : plus de reps que jamais)
   */
  classify(set: LoggedSet, exercise: Exercise, priorRecords: ExerciseRecords): RecordKind | null {
    if (!set.completed || !WORK_KINDS.has(set.setType)) return null;

    // Branche bodyweight : PR de reps si strictement plus que tout précédent
    // compte de reps BW. Pas de porte repTargetMin pour que le tout premier
    // "meilleur" set BW compte déjà comme progression.
    if (set.weight === 0) {
      if (set.reps > priorRecords.bestBodyweightReps) {
        return "bodyweightReps";
      }
      return null;
    }

    // Nouveau PR de poids : strictement plus lourd que tout ce qui a jamais
    // été complété. Pas de porte de reps minimum — un nouveau record absolu
    // EST un record.
    if (set.weight > priorRecords.heaviestEver) {
      return "heaviestWeight";
    }

    // Les records restants nécessitent des reps validées (assez de reps pour
    // être un set de qualité).
    if (set.reps < exercise.repTargetMin) return null;

    // Exemple réel : 16 x 8 n'est pas un record si 18 x 9 existe déjà. Le
    // meilleur nombre de reps à une charge exacte n'est intéressant que sur la
    // frontière de Pareto poids/reps.
    if (isDominatedByRecordMap(set.weight, set.reps, priorRecords.bestRepsByWeight)) {
      return null;
    }

    // Nouveau PR e1RM avec une marge significative.
    const newE1RM = estimated1RM(set.weight, set.reps);
    if (priorRecords.bestE1RM > 0 && newE1RM > priorRecords.bestE1RM * K_E1RM_PR_THRESHOLD) {
      return "estimated1RM";
    }

    // PR de reps à un poids déjà soulevé.
    const prior = priorRecords.bestRepsByWeight[set.weight];
    if (prior !== undefined && set.reps > prior) {
      return "repsAtWeight";
    }

    return null;
  },

  /**
   * Détermine si un set terminé dans l'historique doit être affiché avec une
   * étoile de record. Appeler avec la liste COMPLÈTE des sets historiques (y
   * compris le set lui-même). Un set gagne une étoile si le retirer de
   * l'historique changerait le meilleur record à ce poids.
   */
  isRecordSet(set: LoggedSet, amongSets: LoggedSet[], exercise: Exercise): boolean {
    if (!set.completed || !WORK_KINDS.has(set.setType)) return false;

    const eligible = normalRecordSets(amongSets, exercise);
    if (!eligible.some((candidate) => candidate.id === set.id)) return false;
    const others = eligible.filter((candidate) => candidate.id !== set.id);

    if (set.weight === 0) {
      const priorBWMax = others
        .filter((s) => s.completed && s.weight === 0)
        .reduce((max, s) => Math.max(max, s.reps), 0);
      return set.reps > priorBWMax;
    }

    // Poids le plus lourd jamais atteint ailleurs — étoile quel que soit le
    // nombre de reps.
    const heaviestElsewhere = others
      .filter((s) => s.completed && s.weight > 0)
      .reduce((max, s) => Math.max(max, s.weight), 0);
    if (set.weight > heaviestElsewhere) {
      return true;
    }

    // PR de reps à un poids donné (sets validés uniquement).
    if (set.reps < exercise.repTargetMin) return false;

    if (isDominatedBySets(set, eligible, exercise)) return false;

    const priorAtWeight = others
      .filter((s) => s.completed && s.weight === set.weight && s.reps >= exercise.repTargetMin)
      .reduce((max, s) => Math.max(max, s.reps), 0);

    return set.reps > priorAtWeight;
  },

  /**
   * Pour l'UI d'historique, on ne veut pas étoiler chaque PR intermédiaire
   * immédiatement dépassé plus tard dans la même séance. On ne garde que les
   * sets record qui comptent encore après la fin de toute la séance. Pour les
   * charges externes, chaque compromis non dominé poids/reps est légitime
   * (20 x 7 et 18 x 9), mais jamais un point strictement dominé (16 x 8).
   */
  displayedRecordSetIDs(loggedExercise: LoggedExercise, amongSets: LoggedSet[], exercise: Exercise): Set<string> {
    const candidates = normalRecordSets(orderedSets(loggedExercise), exercise).filter((s) =>
      RecordsEngine.isRecordSet(s, amongSets, exercise)
    );
    // Les finishers ne portent plus d'étoile (cf. `classifyFinisher`) : la piste existe encore
    // dans les données, mais elle ne doit plus récompenser une baisse de charge.
    const finisherCandidates: LoggedSet[] = [];
    if (candidates.length === 0 && finisherCandidates.length === 0) return new Set();

    const kept: LoggedSet[] = [...candidates];

    // La piste finisher reste séparée : un meilleur nombre de reps est gardé
    // par charge, sans jamais entrer dans les catégories poids/e1RM normales.
    kept.push(...finisherCandidates);

    return new Set(kept.map((s) => s.id));
  },
};

export const buildRecords = RecordsEngine.buildRecords;
export const classify = RecordsEngine.classify;
export const isRecordSet = RecordsEngine.isRecordSet;
export const displayedRecordSetIDs = RecordsEngine.displayedRecordSetIDs;
