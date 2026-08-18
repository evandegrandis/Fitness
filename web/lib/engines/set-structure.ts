/**
 * Analyse pure de la structure intra-exercice : séries composites (drop-set /
 * rest-pause) et finishers détectables sans modifier le modèle persisté.
 *
 * Les anciens imports Jeera contiennent de nombreux timestamps identiques.
 * Un écart nul est donc volontairement traité comme "horloge inconnue" et ne
 * suffit jamais à fusionner deux séries. Pour les cas ambigus (deux séries
 * batch-loggées, finisher PDC sans position de l'exercice), il faudra à terme
 * persister un rôle/une technique explicite ; les helpers ci-dessous restent
 * conservateurs en attendant.
 */

import { SetType as ST } from "@/lib/models/enums";
import type { LoggedSet } from "@/lib/models/types";

export const SET_STRUCTURE = {
  /** Un enchaînement sans repos normal au-delà de 30 s n'est plus automatique. */
  COMPOSITE_MAX_GAP_SECONDS: 30,
  /**
   * Fenêtre d'une série COMPLÉMENTAIRE — plus large que celle d'un drop-set, qui suppose un
   * enchaînement immédiat. Compléter demande de constater qu'il manque des reps, de changer la
   * charge et de se replacer : le 65×2 d'Evan est arrivé 34 s après, et 30 s le refusaient de
   * justesse. Au-delà de 90 s, c'est un vrai repos, donc une nouvelle série.
   */
  COMPLEMENT_MAX_GAP_SECONDS: 90,
  /** Mini-bloc à charge identique : au plus 5 reps pour signaler un rest-pause. */
  REST_PAUSE_MAX_REPS: 5,
  /**
   * Reps cumulées minimales pour qu'un bloc compte. En deçà, le stimulus est trop court pour
   * valoir une série de travail, quelle que soit la proximité de l'échec.
   */
  MIN_REPS_PER_SET: 6,
  /**
   * Conservé : l'ancien seuil binaire (8) sert encore de repère de complétion — c'est à partir de
   * là qu'une série n'a plus besoin d'être complétée. La cible d'hypertrophie visée reste 10.
   */
  EFFECTIVE_REPS_PER_SET: 8,
  /** Au-delà, compléter n'apporte plus rien : le bloc se ferme. */
  TARGET_REPS_PER_SET: 10,
  /** Seuil absolu d'un burnout/finisher à hautes reps. */
  FINISHER_REP_FLOOR: 10,
  /** Un finisher tardif doit gagner au moins 3 reps après la baisse de charge. */
  FINISHER_REP_GAIN: 3,
  /** Baisse franche hors composite pour reconnaître un burnout final. */
  FINISHER_LOAD_DROP_RATIO: 0.2,
  /** Position relative à partir de laquelle l'exercice peut être un finisher dédié. */
  FINISHER_POSITION_RATIO: 0.6,
  /** Un finisher dédié historique est court. */
  FINISHER_MAX_SETS: 2,
} as const;

export interface ExercisePositionSignal {
  position: number;
  sessionExerciseCount: number;
}

export type CompositeSetKind = "standard" | "completion" | "drop_set" | "rest_pause";

export interface CompositeSetBlock {
  kind: CompositeSetKind;
  sets: LoggedSet[];
  /** Série qui porte la charge/reps normale pour les ancres de prédiction. */
  leadSet: LoggedSet;
  totalReps: number;
  /** Unité de couverture binaire : 1 à partir de 8 reps cumulées, sinon 0. */
  effectiveSetUnits: number;
}

export interface SetStructureOptions {
  increment?: number;
  position?: ExercisePositionSignal;
  /** Conserve les sets d'un exercice classé finisher pour sa prédiction dédiée. */
  preserveDedicatedFinisher?: boolean;
  /** Désactive uniquement le filtre finisher ; la fusion des composites reste active. */
  excludeFinishers?: boolean;
}

export type FinisherEvidence = "exercise_position" | "tail_burnout";

export interface FinisherSetMark {
  index: number;
  set: LoggedSet;
  evidence: FinisherEvidence[];
}

function isWorkSet(set: LoggedSet): boolean {
  return set.setType === ST.work || set.setType === ST.topSet || set.setType === ST.backoff;
}

/** Sets de travail complétés, ordre chronologique stable. */
export function chronologicalCompletedWorkSets(sets: LoggedSet[]): LoggedSet[] {
  return sets
    .filter((set) => set.completed && isWorkSet(set))
    .sort((a, b) => a.setSlotIndex - b.setSlotIndex || a.timestamp.getTime() - b.timestamp.getTime());
}

function elapsedSeconds(previous: LoggedSet, next: LoggedSet): number | null {
  const elapsed = (next.timestamp.getTime() - previous.timestamp.getTime()) / 1_000;
  // 0 est fréquent dans les imports historiques : ce n'est pas un signal temporel fiable.
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : null;
}

function sameSupersetRound(previous: LoggedSet, next: LoggedSet): boolean {
  return previous.supersetRoundIndex === next.supersetRoundIndex;
}

function consecutiveSlots(previous: LoggedSet, next: LoggedSet): boolean {
  return next.setSlotIndex - previous.setSlotIndex === 1;
}

function hasMeaningfulLoadDrop(previous: LoggedSet, next: LoggedSet, increment?: number): boolean {
  if (previous.weight <= 0 || next.weight >= previous.weight) return false;
  // Un seul cran matériel suffit : c'est précisément la baisse proposée par
  // l'UI après un mini-set raté. Le seuil de 20 % reste réservé aux finishers.
  const minDrop = Math.max(increment ?? 0, 0.5);
  return previous.weight - next.weight + 1e-9 >= minDrop;
}

/**
 * Détecte une continuation immédiate sans tenir compte du round de superset.
 * Le store l'utilise avant d'attribuer le round au nouveau set.
 */
export function immediateCompositeKind(
  previous: LoggedSet,
  next: LoggedSet,
  options: SetStructureOptions
): Exclude<CompositeSetKind, "standard"> | null {
  if (!isWorkSet(previous) || !isWorkSet(next) || !consecutiveSlots(previous, next)) return null;
  const gap = elapsedSeconds(previous, next);
  if (gap === null || gap > SET_STRUCTURE.COMPOSITE_MAX_GAP_SECONDS) return null;

  if (hasMeaningfulLoadDrop(previous, next, options.increment)) return "drop_set";
  if (Math.abs(previous.weight - next.weight) < 1e-9 && next.reps <= SET_STRUCTURE.REST_PAUSE_MAX_REPS) {
    return "rest_pause";
  }
  return null;
}

function compositeLinkKind(
  previous: LoggedSet,
  next: LoggedSet,
  options: SetStructureOptions
): Exclude<CompositeSetKind, "standard"> | null {
  if (!sameSupersetRound(previous, next)) return null;
  const previousLogicalSetId = previous.logicalSetId ?? null;
  const nextLogicalSetId = next.logicalSetId ?? null;
  if (
    nextLogicalSetId &&
    (previousLogicalSetId === nextLogicalSetId ||
      (previousLogicalSetId === null && previous.id === nextLogicalSetId))
  ) {
    if (next.setTechnique === "drop_set" || next.setTechnique === "rest_pause") {
      return next.setTechnique;
    }
    return "completion";
  }
  // Deux IDs logiques explicites différents expriment deux séries distinctes. L'heuristique
  // temporelle ne sert plus qu'aux anciens historiques qui ne stockaient pas cette intention.
  if (nextLogicalSetId !== null) return null;
  const immediate = immediateCompositeKind(previous, next, options);
  if (immediate) return immediate;

  // Série COMPLÉMENTAIRE : c'est la série AJOUTÉE qui doit être courte, pas la précédente qui
  // doit être incomplète. Deux reps ne sont pas une série de travail — c'est un appoint pour
  // finir la précédente ; sept reps en sont une, et ouvrent leur propre bloc même enchaînées.
  //
  // Le cas réel du 18/08 : 92,5×7, 85×7, 65×2, 72,5×7. L'ancienne règle fusionnait 92,5+85 (la
  // première étant « incomplète » à 7 reps) et laissait 65×2 orphelin à zéro. Ici, 85×7 et
  // 92,5×7 restent deux séries, 65×2 complète 85×7 (→ 9 reps), et 72,5×7 repart à neuf.
  //
  // Volontairement dans `compositeLinkKind` et non `immediateCompositeKind` : ce dernier décrit
  // une TECHNIQUE (drop-set/rest-pause) et numérote les rounds de superset, qui ne doivent rien
  // devoir à la complétion.
  if (!isWorkSet(previous) || !isWorkSet(next) || !consecutiveSlots(previous, next)) return null;
  if (next.reps >= SET_STRUCTURE.MIN_REPS_PER_SET) return null;
  const gap = elapsedSeconds(previous, next);
  if (gap === null || gap > SET_STRUCTURE.COMPLEMENT_MAX_GAP_SECONDS) return null;
  return "completion";
}

/**
 * Regroupe les mini-blocs consécutifs détectables. Une série standard garde
 * une unité au maximum. Un bloc n'est effectif qu'à partir de 8 reps
 * cumulées (ex. 4 reps => 0 ; 4+4 immédiats => 1 ; 16 reps => 1).
 */
/**
 * Valeur d'un bloc : 0 sous le minimum de reps, sinon 1 pondéré par la proximité de l'échec.
 *
 * Le RIR retenu est le PLUS BAS du bloc — c'est-à-dire la série qui s'est le plus approchée de
 * l'échec. Un rest-pause terminé à RIR 0 vaut un stimulus complet même si la série d'ouverture
 * était confortable ; c'est bien la fin du bloc qui porte l'effort.
 */
function blockUnits(totalReps: number, sets: LoggedSet[]): number {
  if (totalReps < SET_STRUCTURE.MIN_REPS_PER_SET) return 0;
  const reported = sets
    .map((set) => set.reportedRir)
    .filter((rir): rir is number => typeof rir === "number");
  if (reported.length === 0) return 1;
  return rirEffectiveness(Math.min(...reported));
}

export function compositeSetBlocks(sets: LoggedSet[], options: SetStructureOptions = {}): CompositeSetBlock[] {
  const ordered = chronologicalCompletedWorkSets(sets);
  const blocks: CompositeSetBlock[] = [];

  for (const set of ordered) {
    const previousBlock = blocks.at(-1);
    const previousSet = previousBlock?.sets.at(-1);
    const linkKind = previousSet ? compositeLinkKind(previousSet, set, options) : null;

    if (!previousBlock || !linkKind) {
      blocks.push({
        kind: "standard",
        sets: [set],
        leadSet: set,
        totalReps: set.reps,
        effectiveSetUnits: blockUnits(set.reps, [set]),
      });
      continue;
    }

    previousBlock.sets.push(set);
    previousBlock.kind =
      previousBlock.kind === "drop_set" || linkKind === "drop_set"
        ? "drop_set"
        : previousBlock.kind === "rest_pause" || linkKind === "rest_pause"
          ? "rest_pause"
          : "completion";
    previousBlock.totalReps += set.reps;
    previousBlock.effectiveSetUnits = blockUnits(previousBlock.totalReps, previousBlock.sets);
  }

  return blocks;
}

/**
 * Pondération d'une série par sa proximité de l'échec.
 *
 * C'est le RIR, pas le nombre de reps, qui détermine le stimulus hypertrophique : une série
 * arrêtée à 4 reps de l'échec ne vaut pas une série menée à l'échec, même à reps égales. Le
 * comptage binaire précédent ignorait complètement cette dimension.
 *
 * `null` (non rapporté) vaut 1 : tout l'historique antérieur au RIR — et toute série où Evan ne
 * renseigne rien — ne doit pas être dévalué rétroactivement sur une donnée absente.
 */
export function rirEffectiveness(rir: number | null | undefined): number {
  if (rir === null || rir === undefined) return 1;
  if (rir <= 2) return 1;
  if (rir === 3) return 0.75;
  return 0.5;
}

/** Nombre de séries effectives pour la couverture musculaire. */
export function effectiveSetUnits(sets: LoggedSet[], options: SetStructureOptions = {}): number {
  return compositeSetBlocks(sets, options).reduce((sum, block) => sum + block.effectiveSetUnits, 0);
}

/**
 * Volume physiologique : les finishers comptent dans la couverture, mais sont
 * gardés dans une piste séparée afin de ne jamais devenir des ancres de
 * prédiction normale. Deux mini-blocs de finisher peuvent encore former une
 * seule série effective selon les mêmes règles temporelles.
 */
export function physiologicalSetUnits(sets: LoggedSet[], options: SetStructureOptions = {}): number {
  const normalUnits = effectiveSetUnits(sets, options);
  const finisherAsWork = sets
    .filter((set) => set.completed && set.setType === ST.finisher)
    .map((set) => ({ ...set, setType: ST.work }));
  return normalUnits + effectiveSetUnits(finisherAsWork, options);
}

function exercisePositionIsFinisher(sets: LoggedSet[], position?: ExercisePositionSignal): boolean {
  if (!position || position.sessionExerciseCount <= 1 || sets.length === 0) return false;
  const ratio = position.position / (position.sessionExerciseCount - 1);
  return (
    ratio >= SET_STRUCTURE.FINISHER_POSITION_RATIO &&
    sets.length <= SET_STRUCTURE.FINISHER_MAX_SETS &&
    sets.some((set) => set.reps >= SET_STRUCTURE.FINISHER_REP_FLOOR)
  );
}

function isTailBurnout(previous: LoggedSet, tail: LoggedSet, increment?: number): boolean {
  if (tail.reps < SET_STRUCTURE.FINISHER_REP_FLOOR) return false;
  if (tail.reps - previous.reps < SET_STRUCTURE.FINISHER_REP_GAIN) return false;
  if (previous.weight <= 0) return false; // PDC -> PDC reste indétectable sans signal de position explicite.

  const requiredDrop = Math.max(
    increment ?? 0,
    previous.weight * SET_STRUCTURE.FINISHER_LOAD_DROP_RATIO
  );
  return previous.weight - tail.weight + 1e-9 >= requiredDrop;
}

/**
 * Détecte uniquement les finishers soutenus par les signaux disponibles :
 * exercice court placé tard, ou burnout final hautes reps après baisse franche.
 * Un finisher PDC->PDC sans position reste volontairement indétectable : il
 * nécessite un futur rôle/flag explicite dans le modèle ou dans SuggestParams.
 */
export function detectFinisherSets(sets: LoggedSet[], options: SetStructureOptions = {}): FinisherSetMark[] {
  const ordered = chronologicalCompletedWorkSets(sets);
  const evidence = new Map<number, Set<FinisherEvidence>>();
  const add = (index: number, item: FinisherEvidence) => {
    const current = evidence.get(index) ?? new Set<FinisherEvidence>();
    current.add(item);
    evidence.set(index, current);
  };

  if (exercisePositionIsFinisher(ordered, options.position)) {
    ordered.forEach((_, index) => add(index, "exercise_position"));
  }

  if (ordered.length >= 2) {
    const lastIndex = ordered.length - 1;
    if (isTailBurnout(ordered[lastIndex - 1], ordered[lastIndex], options.increment)) {
      add(lastIndex, "tail_burnout");
    }
  }

  return [...evidence.entries()].map(([index, marks]) => ({
    index,
    set: ordered[index],
    evidence: [...marks],
  }));
}

/**
 * Historique utilisable par les ancres : un seul lead par composite et aucun
 * finisher normal détecté. Les finishers dédiés peuvent être conservés pour
 * la branche ISOLATION_FINISHER, mais un burnout terminal reste exclu.
 */
export function setsForNormalPrediction(sets: LoggedSet[], options: SetStructureOptions = {}): LoggedSet[] {
  const leads = compositeSetBlocks(sets, options).map((block) => block.leadSet);
  if (options.excludeFinishers === false) return leads;

  const marks = detectFinisherSets(leads, options);
  const excludedIds = new Set(
    marks
      .filter((mark) => {
        if (mark.evidence.includes("tail_burnout")) return true;
        return !options.preserveDedicatedFinisher && mark.evidence.includes("exercise_position");
      })
      .map((mark) => mark.set.id)
  );
  return leads.filter((set) => !excludedIds.has(set.id));
}
