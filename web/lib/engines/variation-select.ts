/**
 * Sélection de variation d'exercice — VARIATION_CYCLING_SPEC.md §6.
 *
 * Moteur PUR : aucune donnée n'est persistée, tout est recalculé depuis le
 * catalogue + l'historique fournis par l'appelant.
 *   - `weakPointFit` (P2.1) : actif dès que `Exercise.resistanceProfile` est
 *     tagué côté candidat ET qu'un `weakPoint` mesuré est fourni par l'appelant
 *     (capture 1-tap persistée sur `LoggedExercise.plateauWeakPoint`, cf.
 *     `mostRecentPlateauWeakPoint` ci-dessous). Neutre (0.5) sinon (§9).
 *   - `lifecycleQuality` (P2.2) : déléguée à `lib/engines/lifecycle.ts::buildRoster`
 *     — classement dérivé à la volée sur le roster [current + candidats valides],
 *     normalisé RELATIVEMENT au meilleur cycle passé observé DANS ce roster (data-
 *     driven, §7), et non plus une constante arbitraire (`/120`, Phase 1/P1.5).
 *   - « run courant » (exclusion §6/§9) = uniquement `current.id` : pas de
 *     bookkeeping de rotation cross-exercice pour `isPlateau`/`progressionState`
 *     (ça, c'est `deriveStateV2`/`progression.ts`, simplification tracée en P1.2,
 *     PAS branchée sur `lifecycle.ts` en P2.2 — cf. doc de tête de `lifecycle.ts`).
 */

import { MUSCLE_PARENTS, type MuscleParent } from "@/lib/models/muscles";
import { aggregateCoefficient, type Exercise, type MuscleGoal, type WorkoutSession } from "@/lib/models/types";
import { movementPatternDisplayName, plateauWeakPointDisplayName } from "@/lib/models/enums";
import type { PlateauWeakPoint } from "@/lib/models/enums";
import { collectExerciseHistory } from "@/lib/engines/patterns";
import { rollingPriorities } from "@/lib/engines/effective-sets";
import { bestE1RM } from "@/lib/engines/e1rm";
import { buildRoster, type LifeCycle, workingSetsOf } from "@/lib/engines/lifecycle";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/**
 * VARIATION_CYCLING_SPEC §5.3 — point faible mesuré (1 tap, `plateau_weak_point`),
 * persisté sur `LoggedExercise.plateauWeakPoint` (`lib/models/enums.ts::PlateauWeakPoint`).
 * Alias local conservé pour compat des appelants existants (P1.5) — structurellement
 * identique au type canonique.
 */
export type WeakPoint = PlateauWeakPoint;

export interface VariationSuggestion {
  exerciseId: string;
  score: number;
  explanationFR: string;
}

// ---------------------------------------------------------------------------
// Constantes locales (heuristiques Phase 1, documentées, scope = ce module)
// ---------------------------------------------------------------------------

/** Poids du score pondéré §6. */
const WEIGHTS = {
  muscleOverlap: 0.35,
  weakPointFit: 0.2,
  lifecycleQuality: 0.2,
  novelty: 0.15,
  goalFit: 0.1,
} as const;

/** §6 — pénalité si fatigueClass(candidat) > fatigueClass(current). */
const FATIGUE_PENALTY = 0.15;
const FATIGUE_RANK: Record<Exercise["fatigueClass"], number> = { light: 0, medium: 1, heavy: 2 };

/**
 * §2/§9 — seuil de recouvrement musculaire (cosinus) utilisé UNIQUEMENT en
 * fallback quand `movementPattern` est `null` des deux côtés.
 */
const MUSCLE_OVERLAP_FALLBACK_THRESHOLD = 0.5;

/** §6/§9 — `weakPointFit` neutre si `weakPoint` non renseigné ou candidat non tagué. */
const NEUTRAL_WEAK_POINT_FIT = 0.5;

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Vecteur des coefficients agrégés par `MuscleParent`, dans un ordre stable. */
function muscleVector(exercise: Exercise): number[] {
  return MUSCLE_PARENTS.map((parent) => aggregateCoefficient(exercise, parent));
}

/** Cosinus entre deux vecteurs musculaires ; 0 si l'un des deux est nul (évite NaN). */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function muscleOverlap(a: Exercise, b: Exercise): number {
  return clamp01(cosineSimilarity(muscleVector(a), muscleVector(b)));
}

/** Proxy équipement/registre : dissimilarité de nom (Jaccard sur les mots), §6 "novelty". */
function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0)
  );
}

function nameDissimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection += 1;
  const union = ta.size + tb.size - intersection;
  if (union === 0) return 0;
  const jaccard = intersection / union;
  return clamp01(1 - jaccard);
}

/**
 * §6 "novelty" (0.15) — Phase 1 : `resistanceProfile` absent (P2.1), donc
 * composée uniquement de la différence de catégorie et de la dissimilarité de
 * nom (proxy équipement), à parts égales.
 */
function novelty(current: Exercise, candidate: Exercise): number {
  const categoryDiffers = current.category !== candidate.category ? 1 : 0;
  const dissimilarity = nameDissimilarity(current.name, candidate.name);
  return clamp01(0.5 * categoryDiffers + 0.5 * dissimilarity);
}

/**
 * §6 "goalFit" (0.10) — recouvrement du candidat avec les muscles les plus en
 * retard (`rollingPriorities`), normalisé par le retard le plus important de
 * la fenêtre.
 */
function goalFit(candidate: Exercise, priorities: [MuscleParent, number][]): number {
  const maxRemaining = priorities[0]?.[1] ?? 0;
  if (maxRemaining <= 0) return 0;
  let sum = 0;
  for (const [parent, remaining] of priorities) {
    sum += aggregateCoefficient(candidate, parent) * (remaining / maxRemaining);
  }
  return clamp01(sum);
}

/**
 * Meilleur e1RM JAMAIS observé pour ce candidat sur toute la fenêtre `history` fournie (pas
 * segmenté par run, à la différence de `lib/engines/lifecycle.ts` — concept distinct : "quelle est
 * la charge la plus lourde déjà atteinte", utilisé UNIQUEMENT pour le tie-break "variante la plus
 * faible" ci-dessous, §6). `null` si le candidat n'a jamais été fait. Réutilise `workingSetsOf`
 * (spec §1 : sets de travail `{work, top_set}` complétés uniquement) exporté par `lifecycle.ts`.
 */
function bestHistoricalE1rm(candidateId: string, history: WorkoutSession[]): number | null {
  const { sets } = collectExerciseHistory(history, candidateId);
  if (sets.length === 0) return null;
  const workingSets = sets.flatMap(workingSetsOf);
  if (workingSets.length === 0) return null;
  return bestE1RM(workingSets).e1rm;
}

/**
 * §6 "weakPointFit" (0.20, P2.1) — 1 si le `resistanceProfile` du candidat correspond
 * au point faible mesuré de l'utilisateur (la variante concentre la difficulté là où
 * l'utilisateur cale, méthode "cibler le point faible", `DZfAcXkJdxz`), 0 s'il diverge,
 * 0.5 (neutre) si l'un des deux est inconnu (`weakPoint` non renseigné OU candidat non
 * tagué, §9 — dégradation gracieuse, jamais de crash).
 */
function weakPointFit(candidate: Exercise, weakPoint: WeakPoint | null | undefined): number {
  if (!weakPoint || candidate.resistanceProfile === null) return NEUTRAL_WEAK_POINT_FIT;
  return candidate.resistanceProfile === weakPoint ? 1 : 0;
}

/**
 * Dérive (à la volée, jamais persisté) le point faible mesuré le plus RÉCEMMENT capturé
 * pour cet exercice à travers l'historique multi-exercices (§5.3/§8) : scanne les
 * `LoggedExercise` de `exerciseId` dans `sessionHistory` (convention "plus récent en
 * premier", comme `state.history`/`collectExerciseHistory`) et renvoie le premier
 * `plateauWeakPoint` non-null rencontré. `null` si jamais capturé — `weakPointFit` reste
 * alors neutre (§9). Exporté pour `progression.ts::suggest()` (site `selectAlternative`
 * qui ne reçoit pas de `LoggedExercise` unique, à la différence de `bilan.ts` qui lit
 * directement `logged.plateauWeakPoint` de l'occurrence en cours de revue).
 */
export function mostRecentPlateauWeakPoint(exerciseId: string, sessionHistory: WorkoutSession[]): WeakPoint | null {
  for (const session of sessionHistory) {
    for (const logged of session.exercises) {
      if (logged.exerciseId === exerciseId && logged.plateauWeakPoint !== null) {
        return logged.plateauWeakPoint;
      }
    }
  }
  return null;
}

function fatiguePenalty(current: Exercise, candidate: Exercise): number {
  return FATIGUE_RANK[candidate.fatigueClass] > FATIGUE_RANK[current.fatigueClass] ? FATIGUE_PENALTY : 0;
}

function passesHardFilter(current: Exercise, candidate: Exercise): boolean {
  if (candidate.id === current.id) return false;
  if (current.movementPattern !== null && candidate.movementPattern !== null) {
    return current.movementPattern === candidate.movementPattern;
  }
  if (current.movementPattern === null && candidate.movementPattern === null) {
    return muscleOverlap(current, candidate) >= MUSCLE_OVERLAP_FALLBACK_THRESHOLD;
  }
  // Un seul des deux est tagué : le filtre dur `movementPattern === movementPattern`
  // échoue strictement (dégradation gracieuse §9 : moins de candidats, jamais de crash).
  return false;
}

function buildExplanation(
  current: Exercise,
  candidate: Exercise,
  usedFallback: boolean,
  bestCycle: LifeCycle | null,
  weakPoint: WeakPoint | null | undefined
): string {
  const carryOverClause = usedFallback
    ? "recouvrement musculaire proche"
    : `même ${(movementPatternDisplayName[current.movementPattern!] ?? current.movementPattern!).toLowerCase()}`;
  // §6 — n'annonce "cible ton point faible" que si le `resistanceProfile` du candidat
  // CHOISI correspond réellement (weakPointFit=1) ; sinon le clause serait mensongère
  // (le candidat gagnant a pu l'être pour d'autres raisons, weakPointFit neutre/0).
  const weakPointClause =
    weakPoint && candidate.resistanceProfile === weakPoint
      ? ` ; cible ton point faible « ${plateauWeakPointDisplayName[weakPoint].toLowerCase()} »`
      : "";
  // §6/§7 (P2.2) — "cycle précédent" cite le MEILLEUR cycle passé (`bestPastCycle` via le roster),
  // pas forcément le run courant (qui peut être en plein plateau) : cf. exemple spec §6 "cycle
  // précédent 8 sem./+15 kg".
  const lifecycleClause =
    bestCycle !== null && bestCycle.weeks > 0
      ? ` ; cycle précédent ${Math.round(bestCycle.weeks)} sem./+${Math.round(Math.max(0, bestCycle.e1rmGain))} kg`
      : "";
  return `${candidate.name} (${carryOverClause} → force reportée${weakPointClause}${lifecycleClause})`;
}

// ---------------------------------------------------------------------------
// selectAlternative
// ---------------------------------------------------------------------------

/**
 * VARIATION_CYCLING_SPEC §6 — sélectionne la meilleure variante de rotation
 * pour `current`, ou `null` si aucun candidat valide (catalogue restreint,
 * isolation/core sans pair — §9, jamais de crash).
 *
 * `now` : horloge injectable (défaut `new Date()`), utilisée uniquement pour
 * `rollingPriorities` (fenêtre roulante 7 jours de `goalFit`) — ajout Phase 1
 * au-delà de la signature littérale du spec, pour garder ce moteur pur/déterministe
 * en test (comme `suggest({ now })` ailleurs dans `progression.ts`).
 */
export function selectAlternative(
  current: Exercise,
  catalog: Exercise[],
  history: WorkoutSession[],
  goals: MuscleGoal[],
  weakPoint?: WeakPoint | null,
  now: Date = new Date()
): VariationSuggestion | null {
  const passing = catalog.filter((candidate) => passesHardFilter(current, candidate));
  if (passing.length === 0) return null;

  const priorities = rollingPriorities(history, catalog, goals, now);

  // VARIATION_CYCLING_SPEC §7 (P2.2) — le roster émerge ICI, sur cet appel précis : l'exercice
  // courant + tous les candidats qui passent le filtre dur (même movementPattern, cf. §7 "cible
  // méthode : roster de ~12-18 variantes"). `lifecycleQuality` de chaque candidat est normalisée
  // RELATIVEMENT à ce roster (pas une constante arbitraire) — data-driven par construction.
  const roster = buildRoster([current.id, ...passing.map((c) => c.id)], history);
  const rosterByExerciseId = new Map(roster.map((entry) => [entry.exerciseId, entry]));

  let best: {
    candidate: Exercise;
    score: number;
    usedFallback: boolean;
    bestCycle: LifeCycle | null;
    bestE1rm: number | null;
  } | null = null;

  for (const candidate of passing) {
    const usedFallback = current.movementPattern === null && candidate.movementPattern === null;
    const overlap = muscleOverlap(current, candidate);
    const rosterEntry = rosterByExerciseId.get(candidate.id);
    const lifecycleQuality = rosterEntry?.lifecycleQuality ?? 0.5; // "0.5 si jamais fait" (§6)
    const bestCycle = rosterEntry?.bestCycle ?? null;

    const score =
      WEIGHTS.muscleOverlap * overlap +
      WEIGHTS.weakPointFit * weakPointFit(candidate, weakPoint) +
      WEIGHTS.lifecycleQuality * lifecycleQuality +
      WEIGHTS.novelty * novelty(current, candidate) +
      WEIGHTS.goalFit * goalFit(candidate, priorities) -
      fatiguePenalty(current, candidate);

    if (best === null) {
      best = { candidate, score, usedFallback, bestCycle, bestE1rm: bestHistoricalE1rm(candidate.id, history) };
      continue;
    }

    if (score > best.score + 1e-9) {
      best = { candidate, score, usedFallback, bestCycle, bestE1rm: bestHistoricalE1rm(candidate.id, history) };
      continue;
    }

    if (score > best.score - 1e-9) {
      // §6 — égalité de score totale (que `weakPointFit`/`lifecycleQuality` y aient contribué à
      // égalité ou non) : préférer le candidat dont l'e1RM historique de l'utilisateur est le plus
      // bas ("variante la plus faible"). Un candidat jamais fait (pas de mesure) ne peut pas
      // revendiquer être "plus bas" qu'un candidat mesuré : il perd le départage face à toute
      // mesure réelle.
      const candidateE1rm = bestHistoricalE1rm(candidate.id, history);
      const bestE1rmValue = best.bestE1rm ?? Number.POSITIVE_INFINITY;
      const candidateE1rmValue = candidateE1rm ?? Number.POSITIVE_INFINITY;
      if (candidateE1rmValue < bestE1rmValue - 1e-9) {
        best = { candidate, score, usedFallback, bestCycle, bestE1rm: candidateE1rm };
      }
    }
  }

  if (best === null) return null;

  return {
    exerciseId: best.candidate.id,
    score: best.score,
    explanationFR: buildExplanation(current, best.candidate, best.usedFallback, best.bestCycle, weakPoint),
  };
}
