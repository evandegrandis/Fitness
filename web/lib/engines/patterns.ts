/**
 * Pré-traitement de l'historique + détection de pattern + clusters de charge —
 * voir `web/ALGO_SPEC_HARDENED.md` §1, §2, §3.
 *
 * Ce module est PUR : aucune donnée n'est persistée, tout est recalculé à
 * chaque appel depuis `recentHistory` (fenêtre `HISTORY_WINDOW`, plus récent
 * en premier).
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import { setsForNormalPrediction } from "@/lib/engines/set-structure";
import { SetPatternMode as SPM, SetType as ST } from "@/lib/models/enums";
import { sessionsNewestFirst, type Exercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Rôles de sets (§0) — dérivés, jamais persistés.
// ---------------------------------------------------------------------------

export type SetRole = "amorce" | "top" | "backoff" | "straight" | "bw" | "finisher";

export interface HistoryPosition {
  position: number;
  sessionExerciseCount: number;
}

export interface PreprocessHistoryOptions {
  /** Position alignée sur `history`, utilisée pour isoler les finishers dédiés. */
  positions?: HistoryPosition[];
  /** La branche ISOLATION_FINISHER garde ses sets dédiés comme profil spécifique. */
  preserveDedicatedFinishers?: boolean;
}

export interface CollectedExerciseHistory {
  /** Une entrée par vraie séance, doublons intra-séance déjà concaténés. */
  sets: LoggedSet[][];
  /** Position de la première occurrence de l'exercice dans chaque séance. */
  positions: HistoryPosition[];
}

/**
 * P2/P5 côté intégration : extrait l'historique brut directement depuis les
 * séances, sans jeter les warmups, et fusionne les occurrences répétées d'un
 * exercice dans une même séance. Le store et le bilan doivent utiliser ce
 * helper avant `suggest()` ; une matrice `LoggedSet[][]` déjà amputée ne peut
 * pas être réparée a posteriori par le moteur.
 */
export function collectExerciseHistory(
  history: WorkoutSession[],
  exerciseId: string,
  maxSessions = Number.POSITIVE_INFINITY
): CollectedExerciseHistory {
  const sets: LoggedSet[][] = [];
  const positions: HistoryPosition[] = [];

  for (const session of sessionsNewestFirst(history)) {
    const performed = [...session.exercises]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((logged) => logged.sets.some((set) => set.completed));
    const matches = performed.filter((logged) => logged.exerciseId === exerciseId);
    if (matches.length === 0) continue;

    const merged = matches
      .flatMap((logged) =>
        logged.sets.map((set) => ({ set, orderIndex: logged.orderIndex }))
      )
      .sort(
        (a, b) =>
          a.set.timestamp.getTime() - b.set.timestamp.getTime() ||
          a.orderIndex - b.orderIndex ||
          a.set.setSlotIndex - b.set.setSlotIndex
      )
      // Les slots repartent souvent à zéro sur la seconde occurrence. On les
      // renumérote uniquement dans cette vue dérivée pour conserver la vraie
      // chronologie dans les helpers qui trient d'abord par setSlotIndex.
      .map(({ set }, setSlotIndex) => ({ ...set, setSlotIndex }));

    if (!merged.some((set) => set.completed)) continue;
    sets.push(merged);
    positions.push({
      position: performed.findIndex((logged) => logged.exerciseId === exerciseId),
      sessionExerciseCount: performed.length,
    });
    if (sets.length >= maxSessions) break;
  }

  return { sets, positions };
}

// ---------------------------------------------------------------------------
// P1-P5 — pré-traitement d'une séance
// ---------------------------------------------------------------------------

export interface ProcessedSession {
  /** Sets de travail post P1/P2/P5 (warmups reclassés inclus, doublons fusionnés). */
  workSets: LoggedSet[];
  /** Rôle historique (P3) attribué à chaque set de `workSets` (même index). */
  roles: SetRole[];
  amorce: LoggedSet | null;
  top: LoggedSet | null;
  backoffs: LoggedSet[];
}

/** roundToIncrement — même définition que `deload.ts` (arrondi half-away-from-zero, jamais < 0). */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return Math.max(0, value);
  const ratio = value / increment;
  const rounded = ratio >= 0 ? Math.floor(ratio + 0.5) : Math.ceil(ratio - 0.5);
  return Math.max(0, rounded * increment);
}

/** median — moyenne des deux valeurs centrales si pair, aucun arrondi intermédiaire. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

/**
 * P2 — reclassification des warmups mal taggés : un set `warmup` devient un
 * set de travail pour la dérivation si sa charge >= 90% de l'amorce
 * provisoire (médiane des sets-au-max-de-reps des 5 séances précédentes,
 * SANS reclassification) ET ses reps >= repTargetMin.
 */
function provisionalAmorceLoad(priorSessions: LoggedSet[][]): number | null {
  const loads: number[] = [];
  for (const session of priorSessions.slice(0, 5)) {
    const completed = session
      .filter((s) => s.completed && s.setType !== ST.warmup && s.setType !== ST.finisher)
      .sort((a, b) => a.setSlotIndex - b.setSlotIndex || a.timestamp.getTime() - b.timestamp.getTime())
      .slice(0, 3);
    if (completed.length === 0) continue;
    const maxReps = Math.max(...completed.map((s) => s.reps));
    const first = completed.find((s) => s.reps === maxReps);
    if (first) loads.push(first.weight);
  }
  return loads.length > 0 ? median(loads) : null;
}

/**
 * P1+P2+P5 : filtre la complétion, reclasse les warmups éligibles, fusionne
 * les doublons intra-séance chronologiquement. `priorSessions` = séances plus
 * anciennes (pour la médiane provisoire P2), plus récentes en premier.
 */
function preprocessSession(
  rawSession: LoggedSet[],
  exercise: Exercise,
  priorSessions: LoggedSet[][],
  preserveExplicitFinishers: boolean
): LoggedSet[] {
  const completed = rawSession.filter((s) => s.completed);
  const provisional = provisionalAmorceLoad(priorSessions);

  return completed.filter((s) => {
    if (s.setType === ST.finisher) return preserveExplicitFinishers;
    if (s.setType !== ST.warmup) return true;
    if (provisional === null) return false;
    return s.weight >= 0.9 * provisional && s.reps >= exercise.repTargetMin;
  });
}

/**
 * P3 complet avec incrément connu (nécessaire pour le seuil top = amorce + 1 incrément).
 * Trie chronologiquement par `setSlotIndex`, fusionne les doublons (P5) : si un exercice
 * apparaît deux fois, on concatène par ordre chronologique et seuls les 3 premiers sets
 * alimentent les rôles (le reste compte pour volume/records, pas pour la structure).
 */
export function classifySessionRoles(workSets: LoggedSet[], increment: number): ProcessedSession {
  const chrono = [...workSets].sort((a, b) => a.setSlotIndex - b.setSlotIndex);
  if (chrono.length === 0) return { workSets: [], roles: [], amorce: null, top: null, backoffs: [] };

  // P5 : le rappel tardif reste disponible dans les données brutes pour le
  // volume et les records, mais ne doit jamais devenir un échantillon set 1/2/3.
  const structural = chrono.slice(0, 3);
  const maxReps = Math.max(...structural.map((s) => s.reps));
  const amorce = structural.find((s) => s.reps === maxReps) ?? structural[0];

  const topCandidates = structural.filter(
    (s) => s !== amorce && s.weight >= amorce.weight + increment - 1e-9 && s.reps >= 3
  );
  const top = topCandidates.length > 0 ? topCandidates.reduce((best, cur) => (cur.weight > best.weight ? cur : best)) : null;
  const topIndex = top ? structural.indexOf(top) : -1;
  const backoffs = top
    ? structural.filter((s, index) => index > topIndex && s !== amorce)
    : [];

  const roles: SetRole[] = structural.map((s, index) => {
    if (s === amorce) return "amorce";
    if (top && s === top) return "top";
    if (top && index > topIndex) return "backoff";
    return "straight";
  });

  return { workSets: structural, roles, amorce, top, backoffs };
}

/**
 * Pipeline complet P1-P5 pour une fenêtre de séances (plus récent en premier).
 * `exercise` et `increment` pilotent P2 (reclassification warmup) et le seuil top (P3).
 */
export function preprocessHistory(
  history: LoggedSet[][],
  exercise: Exercise,
  increment: number,
  options: PreprocessHistoryOptions = {}
): ProcessedSession[] {
  const result: ProcessedSession[] = [];
  for (let i = 0; i < history.length; i++) {
    const priorSessions = history.slice(i + 1); // plus anciennes que la séance i
    const eligibleSets =
      exercise.setPatternMode === SPM.weightedBodyweight && !options.preserveDedicatedFinishers
        ? history[i].filter(
            (s) => s.completed && s.setType !== ST.warmup && s.setType !== ST.finisher
          ) // §P3 : les sets weight===0 sont des sets bw
        : preprocessSession(history[i], exercise, priorSessions, options.preserveDedicatedFinishers === true);

    // P2 est une reclassification dérivée : le tag persisté reste warmup, mais l'analyse de
    // structure doit le voir comme un work set. Aucun objet source n'est muté.
    const structurallyWorkSets = eligibleSets.map((set) =>
      set.setType === ST.warmup || set.setType === ST.finisher
        ? { ...set, setType: ST.work }
        : set
    );
    const workSets = setsForNormalPrediction(structurallyWorkSets, {
      increment,
      preserveDedicatedFinisher: options.preserveDedicatedFinishers,
    });
    result.push(classifySessionRoles(workSets, increment));
  }
  return result;
}

// ---------------------------------------------------------------------------
// §2 — Détection du pattern
// ---------------------------------------------------------------------------

export type DetectedPattern =
  | "ASSISTED_BW"
  | "WEIGHTED_BW_VARIABLE"
  | "BW_REP"
  | "TOP_SET_BACKOFF"
  | "ISOLATION_FINISHER"
  | "STRAIGHT";

function patternFromFixedMode(exercise: Exercise): DetectedPattern {
  switch (exercise.setPatternMode) {
    case SPM.straight:
      return "STRAIGHT";
    case SPM.topSetBackoff:
      return "TOP_SET_BACKOFF";
    case SPM.bodyweight:
      return "BW_REP";
    case SPM.weightedBodyweight:
      return "WEIGHTED_BW_VARIABLE";
    case SPM.ramping:
      return "STRAIGHT"; // ramping reste disponible via setPatternMode, jamais détecté (§2, étape 2)
    case SPM.assistedBodyweight:
      return "ASSISTED_BW";
    default:
      return "STRAIGHT";
  }
}

/**
 * `detectPattern` — pur, exporté pour tests. Ordre d'évaluation strict :
 * la première condition vraie gagne (§2).
 */
export function detectPattern(exercise: Exercise, rawHistory: LoggedSet[][], positions?: HistoryPosition[]): DetectedPattern {
  // Kept in the public signature for callers that already collect positional metadata. Position
  // is deliberately no longer evidence of a finisher; only persisted `setType=finisher` is.
  void positions;
  // 1. Verrou assisted_bodyweight : jamais overridé.
  if (exercise.setPatternMode === SPM.assistedBodyweight) return "ASSISTED_BW";

  const completedSessions = rawHistory
    .map((sets) => sets.filter((set) => set.completed && set.setType !== ST.warmup))
    .filter((sets) => sets.length > 0);
  const explicitlyDedicatedFinisher =
    completedSessions.length > 0 &&
    completedSessions.every((sets) => sets.every((set) => set.setType === ST.finisher));
  if (explicitlyDedicatedFinisher) return "ISOLATION_FINISHER";

  // Les continuations de drop-set/rest-pause ne doivent ni gonfler le nombre de sets, ni faire
  // basculer artificiellement BW/TOP_SET_BACKOFF. La position tardive ne suffit jamais à créer un
  // profil finisher : seul le type `finisher` explicitement persisté ci-dessus fait autorité.
  const sessions = rawHistory
    .map((sets) => ({
      sets: setsForNormalPrediction(sets.filter((set) => set.setType !== ST.finisher), {
        increment: exercise.smallestIncrement,
      }).slice(0, 3),
    }))
    .filter((entry) => entry.sets.length > 0);
  const S = sessions.length;

  // 2. Historique insuffisant : suit le setPatternMode figé.
  if (S < ALGO_V2.MIN_SESSIONS_FOR_PATTERN) return patternFromFixedMode(exercise);

  // 3. WEIGHTED_BW_VARIABLE : >= WBW_MIXED_SESSIONS séances avec un set BW ET un set lesté.
  const mixedSessions = sessions.filter((session) => {
    const completed = session.sets;
    const hasBW = completed.some((s) => s.weight === 0);
    const hasWeighted = completed.some((s) => s.weight > 0);
    return hasBW && hasWeighted;
  }).length;
  if (mixedSessions >= ALGO_V2.WBW_MIXED_SESSIONS) return "WEIGHTED_BW_VARIABLE";

  // 4. BW_REP : part des sets à weight === 0 >= BW_SET_SHARE.
  const allSets = sessions.flatMap((session) => session.sets);
  if (allSets.length > 0) {
    const bwShare = allSets.filter((s) => s.weight === 0).length / allSets.length;
    if (bwShare >= ALGO_V2.BW_SET_SHARE) return "BW_REP";
  }

  // 5. TOP_SET_BACKOFF : parmi les séances à >= 2 sets de travail, part des séances où le set le
  // plus lourd n'est PAS le premier chronologique ET dépasse le premier d'au moins 1 incrément.
  const multiSetSessions = sessions
    .map((session) => session.sets)
    .filter((s) => s.length >= 2);
  if (multiSetSessions.length > 0) {
    const topSetLaterCount = multiSetSessions.filter((s) => {
      const first = s[0];
      const heaviest = s.reduce((best, cur) => (cur.weight > best.weight ? cur : best));
      return heaviest !== first && heaviest.weight >= first.weight + exercise.smallestIncrement - 1e-9;
    }).length;
    if (topSetLaterCount / multiSetSessions.length >= ALGO_V2.TOPSET_SHARE) return "TOP_SET_BACKOFF";
  }

  // 6. STRAIGHT : défaut.
  return "STRAIGHT";
}

// ---------------------------------------------------------------------------
// §3 — Clusters de charge (machines à marques multiples)
// ---------------------------------------------------------------------------

export interface LoadCluster {
  loads: number[];
  sessionIndices: number[]; // indices dans `processed` (0 = plus récent)
}

/**
 * Clustering agglomératif single-linkage trivial sur les charges d'amorce.
 * Deux charges a<=b sont dans le même cluster si b - a <= max(CLUSTER_TOL_INCR * increment,
 * CLUSTER_TOL_PCT * b). `entries` = (loads, sessionIndex) par séance, un seul point par
 * séance (l'ancre v2 = amorce pour TOP_SET_BACKOFF, set le plus lourd non-échec sinon).
 */
export function clusterLoads(entries: { load: number; sessionIndex: number }[], increment: number): LoadCluster[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a.load - b.load);
  const clusters: LoadCluster[] = [];
  let current: LoadCluster = { loads: [sorted[0].load], sessionIndices: [sorted[0].sessionIndex] };

  for (let i = 1; i < sorted.length; i++) {
    const prevLoad = sorted[i - 1].load;
    const curLoad = sorted[i].load;
    const tolerance = Math.max(ALGO_V2.CLUSTER_TOL_INCR * increment, ALGO_V2.CLUSTER_TOL_PCT * curLoad);
    if (curLoad - prevLoad <= tolerance) {
      current.loads.push(curLoad);
      current.sessionIndices.push(sorted[i].sessionIndex);
    } else {
      clusters.push(current);
      current = { loads: [curLoad], sessionIndices: [sorted[i].sessionIndex] };
    }
  }
  clusters.push(current);
  return clusters;
}

/**
 * Cluster actif = celui contenant la séance la plus récente (index le plus bas = plus récent
 * dans notre convention `history[0]` = dernière séance). Renvoie null si aucun cluster.
 */
export function activeCluster(clusters: LoadCluster[]): LoadCluster | null {
  if (clusters.length === 0) return null;
  return clusters.reduce((best, cur) => {
    const bestMinIdx = Math.min(...best.sessionIndices);
    const curMinIdx = Math.min(...cur.sessionIndices);
    return curMinIdx < bestMinIdx ? cur : best;
  });
}

/** Trouve le cluster contenant une charge donnée (re-ancrage §3.4), null si aucun. */
export function clusterContaining(clusters: LoadCluster[], load: number, increment: number): LoadCluster | null {
  for (const cluster of clusters) {
    const min = Math.min(...cluster.loads);
    const max = Math.max(...cluster.loads);
    const tolerance = Math.max(ALGO_V2.CLUSTER_TOL_INCR * increment, ALGO_V2.CLUSTER_TOL_PCT * max);
    if (load >= min - tolerance && load <= max + tolerance) return cluster;
  }
  return null;
}
