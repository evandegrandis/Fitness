/**
 * « Séance du jour » : la séance proposée au démarrage, construite sur ce qu'Evan fait vraiment
 * en ce moment plutôt que sur un modèle figé (07/10/2026). Son seul modèle, « Full Body », date de
 * son ancienne salle (26 séances jusqu'au 21/09) ; depuis Fitness Park il s'entraîne sans modèle,
 * et l'accueil lui proposait encore ce Full Body.
 *
 * Construction, sur les mécanismes existants :
 *   1. le socle = les exercices présents dans au moins la moitié de ses dernières séances ;
 *   2. complété, jusqu'à son nombre habituel d'exercices, par les exercices de son répertoire
 *      récent (21 jours, comme « Quoi faire maintenant ») qui comblent le mieux la part du jour des
 *      déficits de la semaine (`weeklyPriorities` / `weekSessionPlan`) ;
 *   3. dans l'ordre où il les fait d'habitude, séries habituelles par exercice ;
 *   4. les paires qu'il enchaîne en superset dans au moins deux séances récentes restent liées.
 * Moteur pur : il propose, il n'écrit rien et ne touche pas aux suggestions de charge.
 */

import { weeklyPriorities } from "@/lib/engines/effective-sets";
import { SESSION_FOCUS, weekSessionPlan } from "@/lib/engines/session-focus";
import { supersetBlocks } from "@/lib/engines/session-insights";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { parentShortName, type MuscleParent } from "@/lib/models/muscles";
import {
  aggregateCoefficient,
  primaryParent,
  sessionsNewestFirst,
  type Exercise,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";

export const HABITUAL_SESSION = {
  /** Séances récentes lues pour l'habitude (≈ une semaine et demie à 4 séances par semaine). */
  RECENT_SESSIONS: 6,
  /** En deçà, pas d'habitude lisible : l'accueil garde ses propositions d'avant. */
  MIN_SESSIONS: 3,
  /** Au-delà, la séance est trop ancienne pour dire ce qu'il fait en ce moment. */
  MAX_AGE_DAYS: 28,
  /** Part des séances récentes où un exercice doit figurer pour faire partie du socle. */
  CORE_SHARE: 0.5,
  /** Séances où une paire doit avoir été enchaînée pour rester liée. */
  SUPERSET_MIN_SESSIONS: 2,
  /**
   * Poids d'un muscle en retard face à l'habitude (en « séances de présence ») : un exercice fait
   * 2 fois sur 6 qui comble un retard passe devant un exercice fait 3 fois sur 6 pour un muscle
   * déjà couvert, jamais devant le socle fait 5 ou 6 fois sur 6.
   */
  DEFICIT_WEIGHT: 1.5,
  /** Séries proposées par exercice, au plus (sa médiane, une montée en charge comptée à part). */
  MAX_TARGET_SETS: 4,
} as const;

const DAY_MS = 86_400_000;

export interface HabitualExercise {
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  /** Séances récentes où il figure. */
  seenIn: number;
  /** Socle (habitude) ou ajouté pour un muscle en retard cette semaine. */
  reason: "habit" | "deficit";
  /** Muscle en retard qu'il vient combler (ajout seulement). */
  forParent: MuscleParent | null;
}

export interface HabitualSessionPlan {
  exercises: HabitualExercise[];
  /** Paires à lier en superset (ids d'exercice), dans l'ordre de la séance. */
  supersetPairs: [string, string][];
  /** Séances lues et date de la plus ancienne. */
  basedOnSessions: number;
  since: Date;
  /** Muscles en retard visés aujourd'hui, avec la part du jour (séries). */
  deficits: { parent: MuscleParent; share: number }[];
  expectedSets: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface Usage {
  exercise: Exercise;
  sessions: number;
  sets: number[];
  positions: number[];
  lastSeen: number;
}

/** Ordre réel d'une séance : exercices rangés par l'heure de leur première série de travail. */
function practicedOrder(session: WorkoutSession, byId: ReadonlyMap<string, Exercise>): { exercise: Exercise; sets: number }[] {
  const firstAt = new Map<string, number>();
  const sets = new Map<string, number>();
  for (const logged of session.exercises) {
    const exercise = byId.get(logged.exerciseId);
    if (!exercise) continue;
    const done = logged.sets.filter((set) => set.completed && set.reps > 0);
    const units = physiologicalSetUnits(done, { increment: exercise.smallestIncrement });
    if (units <= 0) continue;
    const first = Math.min(...done.map((set) => set.timestamp.getTime()));
    firstAt.set(exercise.id, Math.min(firstAt.get(exercise.id) ?? Infinity, first));
    sets.set(exercise.id, (sets.get(exercise.id) ?? 0) + done.length);
  }
  return [...firstAt.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => ({ exercise: byId.get(id)!, sets: sets.get(id)! }));
}

export function habitualSessionPlan(
  history: readonly WorkoutSession[],
  catalog: readonly Exercise[],
  goals: readonly MuscleGoal[],
  now: Date
): HabitualSessionPlan | null {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const recent = sessionsNewestFirst(history.filter((session) => !session.isActive && session.date.getTime() <= now.getTime()))
    .filter((session) => now.getTime() - session.date.getTime() <= HABITUAL_SESSION.MAX_AGE_DAYS * DAY_MS)
    .filter((session) => practicedOrder(session, byId).length > 0)
    .slice(0, HABITUAL_SESSION.RECENT_SESSIONS);
  if (recent.length < HABITUAL_SESSION.MIN_SESSIONS) return null;

  const usage = new Map<string, Usage>();
  const sizes: number[] = [];
  for (const session of recent) {
    const order = practicedOrder(session, byId);
    sizes.push(order.length);
    order.forEach(({ exercise, sets }, index) => {
      const entry = usage.get(exercise.id) ?? { exercise, sessions: 0, sets: [], positions: [], lastSeen: 0 };
      entry.sessions += 1;
      entry.sets.push(sets);
      entry.positions.push(order.length > 1 ? index / (order.length - 1) : 0);
      entry.lastSeen = Math.max(entry.lastSeen, session.date.getTime());
      usage.set(exercise.id, entry);
    });
  }
  const targetSize = Math.round(median(sizes));
  const targetSetsOf = (entry: Usage) =>
    Math.min(HABITUAL_SESSION.MAX_TARGET_SETS, Math.max(2, Math.round(median(entry.sets))));

  // Déficits de la semaine, part du jour : ce qui reste divisé par les séances qui restent.
  const plan = weekSessionPlan([...history], now);
  const deficits = weeklyPriorities([...history], [...catalog], [...goals], now).map(([parent, remaining]) => ({
    parent,
    share: remaining / plan.sessionsLeftIncludingToday,
  }));

  // Habitude d'un exercice : présence dans les séances récentes, les plus récentes pesant plus
  // (6 pour la dernière, 1 pour la plus ancienne), pour qu'un changement de salle se lise vite.
  const totalWeight = recent.reduce((sum, _session, index) => sum + (recent.length - index), 0);
  const habitOf = new Map<string, number>();
  recent.forEach((session, index) => {
    for (const { exercise } of practicedOrder(session, byId)) {
      habitOf.set(exercise.id, (habitOf.get(exercise.id) ?? 0) + (recent.length - index) / totalWeight);
    }
  });

  // Choix glouton parmi ce qu'il a fait récemment : habitude + part des séries qui irait à un
  // muscle encore en retard aujourd'hui (une fois un muscle couvert par les exercices déjà
  // retenus, il ne pèse plus). Le socle (habitude forte) passe donc en premier, et un muscle en
  // retard que le socle ne couvre pas fait entrer l'exercice qui le travaille d'habitude.
  const gaps = new Map(deficits.map(({ parent, share }) => [parent, share]));
  const chosen: { entry: Usage; reason: HabitualExercise["reason"]; forParent: MuscleParent | null }[] = [];
  const minSessions = Math.ceil(recent.length * HABITUAL_SESSION.CORE_SHARE);
  while (chosen.length < targetSize) {
    let best: { entry: Usage; score: number; parent: MuscleParent | null; need: number } | null = null;
    for (const entry of usage.values()) {
      if (chosen.some((picked) => picked.entry.exercise.id === entry.exercise.id)) continue;
      const sets = targetSetsOf(entry);
      let need = 0;
      let mainParent: MuscleParent | null = null;
      let mainNeed = 0;
      for (const [parent, gap] of gaps) {
        const coefficient = aggregateCoefficient(entry.exercise, parent);
        if (coefficient < SESSION_FOCUS.MIN_SUGGESTION_COEFFICIENT || gap <= 0) continue;
        const filled = Math.min(gap, coefficient * sets);
        need += filled;
        if (filled > mainNeed) {
          mainNeed = filled;
          mainParent = parent;
        }
      }
      const score = (habitOf.get(entry.exercise.id) ?? 0) * recent.length + HABITUAL_SESSION.DEFICIT_WEIGHT * (need / sets);
      if (!best || score > best.score) best = { entry, score, parent: mainParent, need };
    }
    if (!best) break;
    for (const [parent, gap] of gaps) {
      gaps.set(parent, gap - aggregateCoefficient(best.entry.exercise, parent) * targetSetsOf(best.entry));
    }
    const habit = best.entry.sessions >= minSessions;
    chosen.push({ entry: best.entry, reason: habit ? "habit" : "deficit", forParent: habit ? null : best.parent });
  }

  // 3. Ordre habituel (position relative médiane dans ses séances).
  chosen.sort((a, b) => median(a.entry.positions) - median(b.entry.positions));

  // 4. Supersets récurrents : la paire reste liée et collée.
  const pairCounts = new Map<string, number>();
  for (const session of recent) {
    for (const block of supersetBlocks(session)) {
      if (block.exerciseIds.length !== 2) continue;
      const key = [...block.exerciseIds].sort().join("|");
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }
  const chosenIds = chosen.map((picked) => picked.entry.exercise.id);
  const supersetPairs: [string, string][] = [];
  const paired = new Set<string>();
  for (const [key, count] of [...pairCounts.entries()].sort((a, b) => b[1] - a[1])) {
    if (count < HABITUAL_SESSION.SUPERSET_MIN_SESSIONS) continue;
    const [a, b] = key.split("|");
    if (!chosenIds.includes(a) || !chosenIds.includes(b) || paired.has(a) || paired.has(b)) continue;
    const [first, second] = chosenIds.indexOf(a) < chosenIds.indexOf(b) ? [a, b] : [b, a];
    supersetPairs.push([first, second]);
    paired.add(a);
    paired.add(b);
    // Le second rejoint le premier.
    const secondIndex = chosen.findIndex((picked) => picked.entry.exercise.id === second);
    const [moved] = chosen.splice(secondIndex, 1);
    chosen.splice(chosen.findIndex((picked) => picked.entry.exercise.id === first) + 1, 0, moved);
  }

  const exercises: HabitualExercise[] = chosen.map(({ entry, reason, forParent }) => ({
    exerciseId: entry.exercise.id,
    exerciseName: entry.exercise.name,
    targetSets: targetSetsOf(entry),
    seenIn: entry.sessions,
    reason,
    forParent,
  }));
  const coveredDeficits = deficits.filter(({ parent }) =>
    chosen.some(({ entry }) => aggregateCoefficient(entry.exercise, parent) >= SESSION_FOCUS.MIN_SUGGESTION_COEFFICIENT)
  );
  return {
    exercises,
    supersetPairs,
    basedOnSessions: recent.length,
    since: recent.at(-1)!.date,
    deficits: coveredDeficits,
    expectedSets: exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0),
  };
}

/** Ligne d'explication de la carte d'accueil : d'où vient la séance, en chiffres. */
export function habitualSessionSummary(plan: HabitualSessionPlan): string {
  const added = plan.exercises.filter((exercise) => exercise.reason === "deficit" && exercise.forParent);
  const base = `Tes ${plan.basedOnSessions} dernières séances · ${plan.exercises.length} exercices · ~${plan.expectedSets} séries`;
  if (added.length === 0) return base;
  const parents = [...new Set(added.map((exercise) => exercise.forParent!))];
  return `${base} · + ${parents.map((parent) => parentShortName[parent]).join(", ")} en retard`;
}

/** Muscle principal de chaque exercice, pour l'aperçu de la carte. */
export function habitualSessionParents(plan: HabitualSessionPlan, catalog: readonly Exercise[]): MuscleParent[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const parents: MuscleParent[] = [];
  for (const entry of plan.exercises) {
    const exercise = byId.get(entry.exerciseId);
    const parent = exercise ? primaryParent(exercise) : null;
    if (parent && !parents.includes(parent)) parents.push(parent);
  }
  return parents;
}
