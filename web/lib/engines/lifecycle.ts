/**
 * Life cycles & roster — VARIATION_CYCLING_SPEC.md §7.
 *
 * Moteur PUR : rien n'est persisté ici. Le suivi de cycle de vie (durée + force gagnée) est
 * ENTIÈREMENT dérivé de l'historique à la volée, à chaque appel (invariant de pureté HARDENED §0.2)
 * — jamais de champ `lifeCycle`/`roster` stocké sur `Exercise`/`WorkoutSession`.
 *
 * - `computeLifeCycle(exerciseId, history, now?)` → le run COURANT (bloc continu le plus récent de
 *   séances contenant cet exercice, séparé du reste par un gap > `ALGO_V2.LIFECYCLE_RUN_GAP_DAYS`) :
 *   `{ startDate, weeks, e1rmGain, ended }`. Dates via `LoggedSet.timestamp`, force via `bestE1RM`
 *   (spec §1 : uniquement les sets de travail `{work, top_set}` complétés — `workingSetsOf`).
 * - `allLifeCycles(exerciseId, history)` → TOUS les runs passés (§7 "des runs passés", pluriel),
 *   du plus récent au plus ancien, même segmentation par gap.
 * - `bestPastCycle(exerciseId, history)` → parmi `allLifeCycles`, celui qui maximise
 *   `weeks × max(0, e1rmGain)` ("le cycle le plus fort", cité dans l'explication FR §6 — pas
 *   forcément le run courant, qui peut être en plein plateau). `null` si jamais fait.
 * - `buildRoster(exerciseIds, history, now?)` → §7 "classement dérivé à la volée" : pour chaque id,
 *   `bestPastCycle` + une `lifecycleQuality` NORMALISÉE dans [0,1] relativement au MEILLEUR cycle
 *   observé dans CE roster (pas une constante arbitraire) — data-driven, cf. décision #4 du spec.
 *   `null` (pas 0) si l'exercice n'a jamais été fait -> l'appelant applique le "0.5 si jamais fait"
 *   (§6) lui-même, cette distinction lui appartient (`variation-select.ts`).
 *
 * Le même seuil de continuité est appliqué dans `progression.ts` aux signaux de plateau et de
 * vélocité : une reprise après un ancien cycle ne réactive donc pas immédiatement une alerte.
 */

import { collectExerciseHistory } from "@/lib/engines/patterns";
import { bestE1RM } from "@/lib/engines/e1rm";
import { SetType } from "@/lib/models/enums";
import type { LoggedSet, WorkoutSession } from "@/lib/models/types";
import { ALGO_V2 } from "@/lib/engines/constants";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface LifeCycle {
  /** Date de la première ancre qualifiante de ce run. */
  startDate: Date;
  /** Date de la dernière ancre qualifiante de ce run. */
  endDate: Date;
  /** Durée du run, en semaines (>= 0 ; 0 si une seule séance qualifiante). */
  weeks: number;
  /** Gain d'e1RM (kg) entre la première et la dernière ancre du run. Peut être négatif (régression) — pas clampé ici, c'est un fait brut. */
  e1rmGain: number;
  /**
   * true si ce run est terminé : plus de `LIFECYCLE_RUN_GAP_DAYS` jours écoulés depuis `endDate`
   * (référence `now`). Purement local à CET exercice (pas de notion de "remplacé par quelle
   * variante" — ça nécessiterait le catalogue, hors de cette signature, cf. doc de tête).
   */
  ended: boolean;
}

export interface RosterEntry {
  exerciseId: string;
  /** Meilleur cycle passé (courant inclus) ; `null` si l'exercice n'a jamais été fait. */
  bestCycle: LifeCycle | null;
  /**
   * §7 — `lifecycleQuality` normalisée dans [0,1] RELATIVEMENT au meilleur cycle observé dans CE
   * roster (data-driven, pas de constante arbitraire). `null` si jamais fait — l'appelant décide de
   * la valeur neutre à substituer (§6 : "0.5 si jamais fait", propre à `selectAlternative`, pas à
   * ce module qui reste agnostique de la sémantique de scoring).
   */
  lifecycleQuality: number | null;
}

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

/**
 * §1 — P_séance réutilise `bestE1RM` UNIQUEMENT sur les sets de travail `{work, top_set}`
 * complétés (warmups/finisher/incomplets exclus). Exporté : réutilisé par `variation-select.ts`
 * (qui l'importait auparavant en copie locale — P2.2 déduplique vers cette source unique).
 */
export function workingSetsOf(sets: LoggedSet[]): LoggedSet[] {
  return sets.filter((s) => s.completed && (s.setType === SetType.work || s.setType === SetType.topSet));
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function earliestTimestamp(sets: LoggedSet[]): Date {
  return sets.reduce((min, s) => (s.timestamp < min ? s.timestamp : min), sets[0].timestamp);
}

function latestTimestamp(sets: LoggedSet[]): Date {
  return sets.reduce((max, s) => (s.timestamp > max ? s.timestamp : max), sets[0].timestamp);
}

function cycleFromBlock(block: LoggedSet[][]): LifeCycle {
  // `block` : séances qualifiantes (déjà filtrées `workingSetsOf`, non vides), plus récent -> plus
  // ancien (convention `collectExerciseHistory`/`history`).
  const mostRecent = block[0];
  const oldest = block[block.length - 1];
  const startDate = earliestTimestamp(oldest);
  const endDate = latestTimestamp(mostRecent);
  const weeks = Math.max(0, daysBetween(endDate, startDate) / 7);
  const e1rmGain = bestE1RM(mostRecent).e1rm - bestE1RM(oldest).e1rm;
  return { startDate, endDate, weeks, e1rmGain, ended: false }; // `ended` résolu par l'appelant (a besoin de `now`).
}

/**
 * Segmente les séances qualifiantes (plus récent -> plus ancien) en runs contigus : deux séances
 * consécutives appartiennent au même run si l'écart est <= `LIFECYCLE_RUN_GAP_DAYS`. Renvoie les
 * runs du plus récent au plus ancien.
 */
function segmentIntoRuns(sessionsWithWork: LoggedSet[][]): LoggedSet[][][] {
  if (sessionsWithWork.length === 0) return [];
  const runs: LoggedSet[][][] = [];
  let currentRun: LoggedSet[][] = [sessionsWithWork[0]];

  for (let i = 1; i < sessionsWithWork.length; i++) {
    const boundaryOfRun = earliestTimestamp(currentRun[currentRun.length - 1]);
    const candidateMostRecent = latestTimestamp(sessionsWithWork[i]);
    if (daysBetween(boundaryOfRun, candidateMostRecent) > ALGO_V2.LIFECYCLE_RUN_GAP_DAYS) {
      runs.push(currentRun);
      currentRun = [sessionsWithWork[i]];
    } else {
      currentRun.push(sessionsWithWork[i]);
    }
  }
  runs.push(currentRun);
  return runs;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * VARIATION_CYCLING_SPEC §7 — run COURANT (le plus récent) de `exerciseId` dans `history`.
 * `null`-safe : si l'exercice n'a jamais de set de travail qualifiant, renvoie un cycle "vide"
 * (`weeks:0, e1rmGain:0, ended:true`) plutôt que `null` — cf. signature du spec, littéralement un
 * objet, jamais `null`. Les appelants qui doivent distinguer "jamais fait" utilisent `bestPastCycle`
 * (qui renvoie `null` explicitement) ou `allLifeCycles(...).length === 0`.
 */
export function computeLifeCycle(exerciseId: string, history: WorkoutSession[], now: Date = new Date()): LifeCycle {
  const runs = allLifeCycles(exerciseId, history);
  if (runs.length === 0) {
    return { startDate: now, endDate: now, weeks: 0, e1rmGain: 0, ended: true };
  }
  const current = runs[0];
  return { ...current, ended: daysBetween(now, current.endDate) > ALGO_V2.LIFECYCLE_RUN_GAP_DAYS };
}

/** §7 "des runs passés" (pluriel) — TOUS les runs de `exerciseId`, du plus récent au plus ancien. */
export function allLifeCycles(exerciseId: string, history: WorkoutSession[]): LifeCycle[] {
  const { sets } = collectExerciseHistory(history, exerciseId);
  const sessionsWithWork = sets.map(workingSetsOf).filter((s) => s.length > 0);
  return segmentIntoRuns(sessionsWithWork).map(cycleFromBlock);
}

/**
 * §7/§6 — le run passé (courant inclus) qui maximise `weeks × max(0, e1rmGain)` : "le cycle le
 * plus fort" cité dans l'explication FR (§6, exemple "cycle précédent 8 sem./+15 kg"). Une
 * régression (e1rmGain < 0) ne peut jamais gagner face à un run à progrès nul (0 est le plancher de
 * la comparaison, mais le champ `e1rmGain` renvoyé reste le vrai gain signé de ce run, pas clampé).
 * `null` si l'exercice n'a jamais été fait (aucun run).
 */
export function bestPastCycle(exerciseId: string, history: WorkoutSession[]): LifeCycle | null {
  const runs = allLifeCycles(exerciseId, history);
  if (runs.length === 0) return null;
  return runs.reduce((best, run) =>
    run.weeks * Math.max(0, run.e1rmGain) > best.weeks * Math.max(0, best.e1rmGain) ? run : best
  );
}

/**
 * VARIATION_CYCLING_SPEC §7 — "classement dérivé à la volée" : `lifecycleQuality` normalisée dans
 * [0,1] relativement au MEILLEUR cycle observé dans CE roster précis (pas une constante arbitraire
 * comme l'ancien `/120` de la Phase 1 — cf. note P1.5/P2.2 dans VARIATION_CYCLING_IMPL.md). Le
 * roster émerge de l'appelant (typiquement : l'exercice courant + tous les candidats valides du
 * même `movementPattern`, cible méthode ~12-18 variantes, §7) ; ce module reste agnostique du
 * catalogue/pattern, il ne fait que noter chaque id fourni.
 */
export function buildRoster(exerciseIds: string[], history: WorkoutSession[]): RosterEntry[] {
  const bestCycles = exerciseIds.map((id) => ({ exerciseId: id, bestCycle: bestPastCycle(id, history) }));
  const maxRawQuality = bestCycles.reduce((max, entry) => {
    if (!entry.bestCycle) return max;
    const raw = entry.bestCycle.weeks * Math.max(0, entry.bestCycle.e1rmGain);
    return Math.max(max, raw);
  }, 0);

  return bestCycles.map(({ exerciseId, bestCycle }) => {
    if (!bestCycle) return { exerciseId, bestCycle: null, lifecycleQuality: null };
    if (maxRawQuality <= 0) return { exerciseId, bestCycle, lifecycleQuality: 0 };
    const raw = bestCycle.weeks * Math.max(0, bestCycle.e1rmGain);
    return { exerciseId, bestCycle, lifecycleQuality: Math.min(1, Math.max(0, raw / maxRawQuality)) };
  });
}
