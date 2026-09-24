/**
 * Équivalences entre machines : le même mouvement sur deux marques différentes.
 *
 * Evan nomme ses machines d'après leur marque parce que les charges affichées ne se comparent
 * pas : 72,5 kg sur une Chest Press LifeFitness ne valent pas 72,5 kg sur l'ancienne Chest Press.
 * Chaque machine reste donc un exercice distinct, avec ses propres records. Mais le mouvement,
 * lui, est le même, et la progression doit rester continue quand on change de salle :
 *
 *   - un FACTEUR DE CONVERSION entre deux machines d'une même famille, mesuré sur la capacité
 *     RÉCENTE de part et d'autre d'un changement de machine (jamais sur le premier record de
 *     l'ancienne : la progression est continue) et CORRIGÉ DE LA FATIGUE (une série faite en fin
 *     de séance, sur un muscle déjà entamé, sous-estime la vraie capacité) ;
 *   - la DERNIÈRE machine utilisée d'une famille devient la machine par défaut ;
 *   - l'historique des autres machines, converti, prolonge celui de la machine par défaut pour
 *     les suggestions et la courbe de progression.
 *
 * Moteur pur : rien n'est persisté, tout se recalcule depuis l'historique (ALGO_SPEC_HARDENED §0).
 */

import { estimated1RM } from "@/lib/engines/e1rm";
import { normalRecordSets } from "@/lib/engines/records";
import { weightedMean } from "@/lib/engines/references";
import { SessionFatigueContext, type PriorLoad } from "@/lib/engines/session-fatigue";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { normalizeCatalogExerciseName, stripMachineBrand } from "@/lib/data/catalog-muscle-profiles";
import {
  orderedSets,
  primaryParent,
  sessionsNewestFirst,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type WorkoutSession,
} from "@/lib/models/types";

export const EQUIVALENCE = {
  /** Au-delà de cet écart, deux séances sont trop éloignées pour mesurer un facteur. */
  MAX_BRIDGE_GAP_DAYS: 56,
  /** Séances retenues de chaque côté d'un changement de machine. */
  SESSIONS_PER_SIDE: 3,
  /** Demi-vie (jours) du poids d'un changement de machine : un écart court est plus fiable. */
  BRIDGE_GAP_HALF_LIFE_DAYS: 14,
} as const;

/**
 * Familles dont les noms diffèrent au-delà de la marque (français/anglais, gammes). Le cas le
 * plus courant, « X » contre « X Technogym », n'a pas besoin d'y figurer : le retrait de la
 * marque suffit. Chaque groupe réunit des machines qui se sont REMPLACÉES dans le temps (changement
 * de salle, septembre 2026), jamais deux choix utilisés en parallèle : Lateral raises aux
 * haltères, Pec deck bras tendus ou Upper back restent donc à part.
 */
const EQUIVALENT_GROUPS: readonly (readonly string[])[] = [
  ["Pec deck", "Pectoral fly", "Pec fly", "Pec fly machine"],
  ["Crunch machine", "Abdominal", "Abdominal machine", "Ab crunch machine"],
  ["Pulley serré", "Tirage horizontal poulie basse", "Seated cable row"],
  ["Plate loaded lateral raises", "Delts machine", "Lateral raise machine"],
  ["Pulldown", "Lat pulldown", "Vertical traction", "Tirage vertical prise large"],
  ["Chest press incliné", "Isolateral incline press", "Développé incliné machine", "Incline chest press"],
  ["Presse à cuisses", "Leg press"],
];

const GROUP_KEY_BY_ALIAS = new Map<string, string>(
  EQUIVALENT_GROUPS.flatMap((group) => {
    const key = `groupe:${normalizeCatalogExerciseName(group[0])}`;
    return group.map((alias) => [stripMachineBrand(normalizeCatalogExerciseName(alias)), key] as const);
  })
);

/**
 * Clé de famille : deux exercices sont équivalents si et seulement si leurs clés sont égales. Un
 * lien explicite (posé par Barbis ou à la main) prime sur la famille déduite du nom : une machine
 * « Pectoraux convergents » de Fitness Park peut ainsi rejoindre la Chest Press de l'ancienne salle.
 */
export function equivalenceKey(exercise: Pick<Exercise, "name"> & { equivalenceKey?: string | null }): string {
  if (exercise.equivalenceKey && exercise.equivalenceKey.trim().length > 0) return exercise.equivalenceKey.trim();
  return nameEquivalenceKey(exercise.name);
}

/** Famille déduite du seul nom (marque retirée, groupes connus). */
export function nameEquivalenceKey(name: string): string {
  const normalized = normalizeCatalogExerciseName(name);
  const withoutBrand = stripMachineBrand(normalized) || normalized;
  return GROUP_KEY_BY_ALIAS.get(withoutBrand) ?? withoutBrand;
}

/** Les autres exercices du catalogue équivalents à `exercise` (lui exclu). */
export function equivalentExercises(exercise: Exercise, catalog: readonly Exercise[]): Exercise[] {
  const key = equivalenceKey(exercise);
  return catalog.filter((candidate) => candidate.id !== exercise.id && equivalenceKey(candidate) === key);
}

export function areEquivalent(
  a: Pick<Exercise, "name"> & { equivalenceKey?: string | null },
  b: Pick<Exercise, "name"> & { equivalenceKey?: string | null }
): boolean {
  return equivalenceKey(a) === equivalenceKey(b);
}

function isCompletedWork(set: LoggedSet): boolean {
  return set.completed && set.reps > 0;
}

function lastCompletedAt(session: WorkoutSession, exerciseId: string): number | null {
  let latest: number | null = null;
  for (const logged of session.exercises) {
    if (logged.exerciseId !== exerciseId) continue;
    for (const set of logged.sets) {
      if (!isCompletedWork(set)) continue;
      const at = set.timestamp.getTime();
      if (latest === null || at > latest) latest = at;
    }
  }
  return latest;
}

/**
 * Machine par défaut d'une famille : celle qui a servi en dernier. Sans historique dans la
 * famille, l'exercice demandé reste lui-même.
 */
export function defaultEquivalent(
  exercise: Exercise,
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[]
): Exercise {
  const members = [exercise, ...equivalentExercises(exercise, catalog)];
  if (members.length === 1) return exercise;
  let best: { exercise: Exercise; at: number } | null = null;
  for (const session of history) {
    if (session.isActive) continue;
    for (const member of members) {
      const at = lastCompletedAt(session, member.id);
      if (at !== null && (best === null || at > best.at)) best = { exercise: member, at };
    }
  }
  return best?.exercise ?? exercise;
}

// ---------------------------------------------------------------------------
// Capacité « à frais » d'une séance
// ---------------------------------------------------------------------------

/**
 * Travail déjà fait AVANT `before` sur les autres exercices de la séance, au sens du modèle de
 * fatigue de l'app. Mesuré en absolu : ici on veut la fatigue réelle au moment de la série, pas
 * l'écart à l'habitude de cet exercice (celui-là neutraliserait justement la différence entre
 * une machine faite en premier et une autre faite en fin de séance).
 */
function priorLoadsBefore(
  session: WorkoutSession,
  targetIds: ReadonlySet<string>,
  before: number,
  catalogById: ReadonlyMap<string, Exercise>
): PriorLoad[] {
  const loads: PriorLoad[] = [];
  for (const logged of session.exercises) {
    if (targetIds.has(logged.id)) continue;
    const exercise = catalogById.get(logged.exerciseId);
    if (!exercise) continue;
    const parent = primaryParent(exercise);
    if (!parent) continue;
    const earlier = logged.sets.filter((set) => set.timestamp.getTime() < before);
    const units = physiologicalSetUnits(earlier, { increment: exercise.smallestIncrement });
    if (units <= 0) continue;
    loads.push({ primaryParent: parent, workSetsCompleted: units, fatigueClass: exercise.fatigueClass });
  }
  return loads;
}

/**
 * Meilleure capacité estimée de l'exercice sur la séance, ramenée à frais : e1RM (Epley) de
 * chaque série, sur les reps jusqu'à l'échec (reps + RIR rapporté) augmentées de la pénalité de
 * fatigue que l'app aurait appliquée à ce moment-là. `null` si aucune série chargée exploitable.
 */
export function freshCapacity(
  session: WorkoutSession,
  exercise: Exercise,
  catalogById: ReadonlyMap<string, Exercise>
): number | null {
  const occurrences = session.exercises.filter((logged) => logged.exerciseId === exercise.id);
  if (occurrences.length === 0) return null;
  const targetIds = new Set(occurrences.map((logged) => logged.id));
  const parent = primaryParent(exercise);
  const sets = normalRecordSets(
    occurrences.flatMap((logged) => orderedSets(logged)),
    exercise
  ).filter((set) => set.weight > 0);

  let best: number | null = null;
  for (const set of sets) {
    const context = new SessionFatigueContext(
      priorLoadsBefore(session, targetIds, set.timestamp.getTime(), catalogById),
      { baselineSystemicCost: 0, baselineSameParentSets: 0 }
    );
    const repsToFailure = set.reps + Math.max(0, set.reportedRir ?? 0);
    const capacity = estimated1RM(set.weight, repsToFailure + context.fatiguePenalty(parent));
    if (best === null || capacity > best) best = capacity;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Facteur de conversion
// ---------------------------------------------------------------------------

interface CapacityPoint {
  exerciseId: string;
  at: number;
  capacity: number;
}

export interface EquivalenceConversion {
  fromId: string;
  toId: string;
  /** Charge sur `to` ≈ charge sur `from` × ratio. */
  ratio: number;
  /** Nombre de changements de machine ayant servi à la mesure. */
  bridges: number;
}

const DAY_MS = 86_400_000;

function capacityTimeline(
  members: readonly Exercise[],
  history: readonly WorkoutSession[],
  catalogById: ReadonlyMap<string, Exercise>
): CapacityPoint[] {
  const points: CapacityPoint[] = [];
  for (const session of history) {
    if (session.isActive) continue;
    for (const member of members) {
      const capacity = freshCapacity(session, member, catalogById);
      const at = lastCompletedAt(session, member.id);
      if (capacity !== null && capacity > 0 && at !== null) {
        points.push({ exerciseId: member.id, at, capacity });
      }
    }
  }
  return points.sort((a, b) => a.at - b.at);
}

interface Bridge {
  from: string;
  to: string;
  ratio: number;
  weight: number;
}

/**
 * Chaque passage d'une machine à l'autre donne une mesure : capacité récente sur l'ancienne
 * (les dernières séances AVANT le changement, la plus proche pesant le plus) contre capacité sur
 * la nouvelle (les premières séances APRÈS). Plus l'écart entre les deux est court, plus la
 * mesure pèse : la progression continue entre-temps brouille la comparaison.
 */
function bridgesOf(timeline: readonly CapacityPoint[]): Bridge[] {
  const bridges: Bridge[] = [];
  const maxGap = EQUIVALENCE.MAX_BRIDGE_GAP_DAYS * DAY_MS;
  for (let i = 0; i + 1 < timeline.length; i += 1) {
    const last = timeline[i];
    const next = timeline[i + 1];
    if (last.exerciseId === next.exerciseId) continue;
    const gap = next.at - last.at;
    if (gap > maxGap) continue;

    const before: number[] = [];
    for (let j = i; j >= 0 && before.length < EQUIVALENCE.SESSIONS_PER_SIDE; j -= 1) {
      const point = timeline[j];
      if (next.at - point.at > maxGap) break;
      if (point.exerciseId === last.exerciseId) before.push(point.capacity);
    }
    const after: number[] = [];
    for (let j = i + 1; j < timeline.length && after.length < EQUIVALENCE.SESSIONS_PER_SIDE; j += 1) {
      const point = timeline[j];
      if (point.at - last.at > maxGap) break;
      if (point.exerciseId === next.exerciseId) after.push(point.capacity);
      else if (point.exerciseId === last.exerciseId) break;
    }
    const fromCapacity = weightedMean(before);
    const toCapacity = weightedMean(after);
    if (fromCapacity <= 0 || toCapacity <= 0) continue;
    bridges.push({
      from: last.exerciseId,
      to: next.exerciseId,
      ratio: toCapacity / fromCapacity,
      weight: Math.pow(0.5, gap / DAY_MS / EQUIVALENCE.BRIDGE_GAP_HALF_LIFE_DAYS) * Math.min(before.length, after.length),
    });
  }
  return bridges;
}

/** Moyenne géométrique pondérée des mesures directes entre deux machines. */
function directRatio(bridges: readonly Bridge[], fromId: string, toId: string): { ratio: number; count: number } | null {
  let logSum = 0;
  let weightSum = 0;
  let count = 0;
  for (const bridge of bridges) {
    let ratio: number | null = null;
    if (bridge.from === fromId && bridge.to === toId) ratio = bridge.ratio;
    else if (bridge.from === toId && bridge.to === fromId) ratio = 1 / bridge.ratio;
    if (ratio === null) continue;
    logSum += Math.log(ratio) * bridge.weight;
    weightSum += bridge.weight;
    count += 1;
  }
  return weightSum > 0 ? { ratio: Math.exp(logSum / weightSum), count } : null;
}

/**
 * Facteur de conversion de `from` vers `to`, mesuré directement ou, à défaut, par une chaîne de
 * machines de la même famille (A → B → C). `null` tant qu'aucun passage de l'une à l'autre n'a
 * été observé : la première séance sur une machine sert justement à la mesurer.
 */
export function conversionBetween(
  from: Exercise,
  to: Exercise,
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[]
): EquivalenceConversion | null {
  if (from.id === to.id) return { fromId: from.id, toId: to.id, ratio: 1, bridges: 0 };
  if (!areEquivalent(from, to)) return null;
  const members = [to, ...equivalentExercises(to, catalog)];
  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const bridges = bridgesOf(capacityTimeline(members, history, catalogById));

  // Parcours en largeur : le chemin le plus court en nombre de machines est le moins bruité.
  const visited = new Map<string, { ratio: number; bridges: number }>([[from.id, { ratio: 1, bridges: 0 }]]);
  const queue = [from.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const reached = visited.get(current)!;
    for (const member of members) {
      if (visited.has(member.id)) continue;
      const edge = directRatio(bridges, current, member.id);
      if (!edge) continue;
      visited.set(member.id, { ratio: reached.ratio * edge.ratio, bridges: reached.bridges + edge.count });
      queue.push(member.id);
    }
  }
  const result = visited.get(to.id);
  return result ? { fromId: from.id, toId: to.id, ratio: result.ratio, bridges: result.bridges } : null;
}

function roundToIncrement(weight: number, increment: number): number {
  if (!(increment > 0)) return Math.round(weight * 10) / 10;
  return Math.max(increment, Math.round(weight / increment) * increment);
}

function convertLogged(logged: LoggedExercise, target: Exercise, ratio: number): LoggedExercise {
  return {
    ...logged,
    id: `${logged.id}~${target.id}`,
    exerciseId: target.id,
    sets: logged.sets.map((set) => ({
      ...set,
      id: `${set.id}~${target.id}`,
      weight: set.weight > 0 ? roundToIncrement(set.weight * ratio, target.smallestIncrement) : set.weight,
    })),
  };
}

export interface FamilyHistory {
  /** Historique où les séances des machines équivalentes sont réécrites dans les unités de la cible. */
  history: WorkoutSession[];
  /** Machines dont l'historique a été converti, avec leur facteur. */
  conversions: { exercise: Exercise; ratio: number }[];
  /** Machine de la séance la plus récente de la famille, si ce n'est pas la cible. */
  latestFrom: { exercise: Exercise; ratio: number } | null;
}

/**
 * Historique continu du mouvement vu depuis `target`. Les séances faites sur une machine
 * équivalente dont le facteur est connu y apparaissent converties (charges arrondies à
 * l'incrément de la cible). Les records, eux, ne lisent JAMAIS cet historique : ils restent
 * propres à chaque machine.
 */
export function familyHistory(
  target: Exercise,
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[]
): FamilyHistory {
  const others = equivalentExercises(target, catalog);
  if (others.length === 0) return { history: [...history], conversions: [], latestFrom: null };

  const conversions: { exercise: Exercise; ratio: number }[] = [];
  for (const other of others) {
    const conversion = conversionBetween(other, target, catalog, history);
    if (conversion) conversions.push({ exercise: other, ratio: conversion.ratio });
  }
  if (conversions.length === 0) return { history: [...history], conversions: [], latestFrom: null };

  const ratioById = new Map(conversions.map((item) => [item.exercise.id, item.ratio]));
  const rewritten = history.map((session) => {
    const hasTarget = session.exercises.some((logged) => logged.exerciseId === target.id);
    if (!session.exercises.some((logged) => ratioById.has(logged.exerciseId))) return session;
    return {
      ...session,
      exercises: session.exercises.flatMap((logged) => {
        const ratio = ratioById.get(logged.exerciseId);
        if (ratio === undefined) return [logged];
        // Séance où la cible a aussi été faite : sa propre mesure prime, pas de doublon converti.
        if (hasTarget) return [];
        return [convertLogged(logged, target, ratio)];
      }),
    };
  });

  let latestFrom: FamilyHistory["latestFrom"] = null;
  let latestAt = -Infinity;
  for (const session of sessionsNewestFirst(history)) {
    if (session.isActive) continue;
    const targetAt = lastCompletedAt(session, target.id);
    if (targetAt !== null && targetAt > latestAt) {
      latestAt = targetAt;
      latestFrom = null;
    }
    for (const item of conversions) {
      const at = lastCompletedAt(session, item.exercise.id);
      if (at !== null && at > latestAt) {
        latestAt = at;
        latestFrom = item;
      }
    }
  }
  return { history: rewritten, conversions, latestFrom };
}

/**
 * Point de départ d'une PREMIÈRE séance sur une machine, tiré de la machine équivalente utilisée
 * le plus récemment (8 semaines au plus) : la série de tête de sa dernière séance. Faute de
 * facteur mesuré, c'est un ordre de grandeur à recaler dès la première série, pas une conversion :
 * il vaut mieux partir de 60 kg vus 5 jours plus tôt sur l'autre machine que de 20 kg par défaut.
 */
export function startingPointFromEquivalent(
  target: Exercise,
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[],
  now: Date
): { exercise: Exercise; set: LoggedSet } | null {
  const others = equivalentExercises(target, catalog);
  if (others.length === 0) return null;
  const maxAge = EQUIVALENCE.MAX_BRIDGE_GAP_DAYS * DAY_MS;
  for (const session of sessionsNewestFirst(history)) {
    if (session.isActive) continue;
    if (now.getTime() - session.date.getTime() > maxAge) break;
    for (const other of others) {
      const leadSets = normalRecordSets(
        session.exercises.filter((logged) => logged.exerciseId === other.id).flatMap((logged) => orderedSets(logged)),
        other
      ).filter((set) => set.weight > 0);
      if (leadSets.length > 0) return { exercise: other, set: leadSets[0] };
    }
  }
  return null;
}
