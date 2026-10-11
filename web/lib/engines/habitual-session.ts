/**
 * « Séance du jour » : la séance proposée au démarrage, construite sur ce qu'Evan fait vraiment
 * en ce moment plutôt que sur un modèle figé (07/10/2026). Son seul modèle, « Full Body », date de
 * son ancienne salle (26 séances jusqu'au 21/09) ; depuis Fitness Park il s'entraîne sans modèle,
 * et l'accueil lui proposait encore ce Full Body.
 *
 * 11/10/2026, Evan : « quand j'ai cliqué sur la séance du jour recommandée, elle n'était pas
 * cohérente avec ce qu'il fallait que je fasse ». Ce jour-là (dernière séance de sa semaine, tout le
 * reste était pour aujourd'hui : pecs 6,3, abdos 6,3, triceps 5,1, dorsaux 3,6, deltoïdes 3,2 et
 * 3,1, biceps 3,1), l'ancienne version remplissait d'abord ses exercices habituels avec leurs
 * séries habituelles : biceps 6,2 séries pour 3,1 à faire, abdos 4,1 pour 6,3. Suivie à la lettre,
 * elle donnait ~25 séries comptées quand l'or en demandait 27.
 *
 * Construction :
 *   1. le besoin du jour par muscle = ce qui reste de l'objectif / séances qui restent d'habitude
 *      (`weekSessionPlan`, la même part que « Quoi faire maintenant ») ; jambes exclues si Evan les a
 *      mises de côté cette semaine ;
 *   2. choix glouton parmi les exercices de ses 6 dernières séances : chaque exercice reçoit les
 *      séries que demande le muscle qu'il comble le mieux (2 à 4), et n'entre que s'il apporte au
 *      moins une série comptée. L'habitude départage (à besoin comparable, l'exercice familier passe
 *      devant), elle ne fait plus entrer un exercice pour un muscle déjà servi ;
 *   3. volume au plus 1,25 fois sa séance habituelle (en séries) : de quoi viser un palier sans
 *      séance démesurée. Si les besoins du jour sont couverts avant son volume habituel, son socle
 *      (exercices de la moitié de ses séances) complète, avec ses séries habituelles ;
 *   4. dans l'ordre où il les fait d'habitude ; les paires qu'il enchaîne en superset dans au moins
 *      deux séances récentes restent liées ;
 *   5. le palier de semaine atteint si la séance est faite (`projected`), dit sur la carte.
 * Moteur pur : il propose, il n'écrit rien et ne touche pas aux suggestions de charge.
 */

import { weeklyProgress } from "@/lib/engines/effective-sets";
import { SESSION_FOCUS, weekSessionPlan } from "@/lib/engines/session-focus";
import { supersetBlocks } from "@/lib/engines/session-insights";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { WEEK_TIERS, weekTier, type WeekTier } from "@/lib/engines/progress-stats";
import { isLowerBodyParent, LOWER_BODY_PARENTS, parentShortName, type MuscleParent } from "@/lib/models/muscles";
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
   * Poids de l'habitude, en séries comptées : un exercice fait à chaque séance gagne 2 séries
   * d'avance sur un exercice jamais fait. À besoin comparable, le familier passe devant ; un
   * exercice qui comble 2 séries de plus passe devant le familier.
   */
  HABIT_WEIGHT: 2,
  /** Séries proposées par exercice. */
  MIN_TARGET_SETS: 2,
  MAX_TARGET_SETS: 4,
  /** Un exercice n'entre pour le besoin du jour que s'il apporte au moins une série comptée. */
  MIN_USEFUL_SETS: 1,
  /** Volume au plus, en multiple de sa séance habituelle (séries). */
  VOLUME_STRETCH: 1.25,
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
  /** Palier de la semaine avant la séance et si la séance est faite telle quelle. */
  projected: { scoreBefore: number; scoreAfter: number; tierBefore: WeekTier | null; tierAfter: WeekTier | null };
}

export interface HabitualSessionOptions {
  /** Jambes mises de côté cette semaine (« Quoi faire maintenant ») : rien n'est prévu pour elles. */
  lowerBodyOff?: boolean;
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
function practicedOrder(session: WorkoutSession, byId: ReadonlyMap<string, Exercise>): { exercise: Exercise; sets: number; units: number }[] {
  const firstAt = new Map<string, number>();
  const sets = new Map<string, number>();
  const units = new Map<string, number>();
  for (const logged of session.exercises) {
    const exercise = byId.get(logged.exerciseId);
    if (!exercise) continue;
    const done = logged.sets.filter((set) => set.completed && set.reps > 0);
    const loggedUnits = physiologicalSetUnits(done, { increment: exercise.smallestIncrement });
    if (loggedUnits <= 0) continue;
    const first = Math.min(...done.map((set) => set.timestamp.getTime()));
    firstAt.set(exercise.id, Math.min(firstAt.get(exercise.id) ?? Infinity, first));
    sets.set(exercise.id, (sets.get(exercise.id) ?? 0) + done.length);
    units.set(exercise.id, (units.get(exercise.id) ?? 0) + loggedUnits);
  }
  return [...firstAt.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => ({ exercise: byId.get(id)!, sets: sets.get(id)!, units: units.get(id)! }));
}

export function habitualSessionPlan(
  history: readonly WorkoutSession[],
  catalog: readonly Exercise[],
  goals: readonly MuscleGoal[],
  now: Date,
  options: HabitualSessionOptions = {}
): HabitualSessionPlan | null {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const recent = sessionsNewestFirst(history.filter((session) => !session.isActive && session.date.getTime() <= now.getTime()))
    .filter((session) => now.getTime() - session.date.getTime() <= HABITUAL_SESSION.MAX_AGE_DAYS * DAY_MS)
    .filter((session) => practicedOrder(session, byId).length > 0)
    .slice(0, HABITUAL_SESSION.RECENT_SESSIONS);
  if (recent.length < HABITUAL_SESSION.MIN_SESSIONS) return null;

  const usage = new Map<string, Usage>();
  const sizes: number[] = [];
  const volumes: number[] = [];
  for (const session of recent) {
    const order = practicedOrder(session, byId);
    sizes.push(order.length);
    volumes.push(order.reduce((sum, entry) => sum + entry.units, 0));
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
  const usualVolume = Math.round(median(volumes));
  const budget = Math.max(usualVolume, Math.round(usualVolume * HABITUAL_SESSION.VOLUME_STRETCH));
  const habitualSetsOf = (entry: Usage) =>
    Math.min(HABITUAL_SESSION.MAX_TARGET_SETS, Math.max(HABITUAL_SESSION.MIN_TARGET_SETS, Math.round(median(entry.sets))));

  // 1. Besoin du jour : ce qui reste de chaque objectif, divisé par les séances qui restent.
  const plan = weekSessionPlan([...history], now);
  const progress = weeklyProgress([...history], [...catalog], [...goals], now).filter((row) => row.goalSets > 0);
  const deficits = progress
    .filter((row) => row.remaining >= SESSION_FOCUS.MIN_REMAINING)
    .filter((row) => !(options.lowerBodyOff && isLowerBodyParent(row.parent)))
    .sort((a, b) => b.remaining - a.remaining)
    .map((row) => ({ parent: row.parent, share: row.remaining / plan.sessionsLeftIncludingToday }));
  const gaps = new Map(deficits.map(({ parent, share }) => [parent, share]));

  // Habitude d'un exercice : présence dans les séances récentes, les plus récentes pesant plus
  // (6 pour la dernière, 1 pour la plus ancienne), pour qu'un changement de salle se lise vite.
  const totalWeight = recent.reduce((sum, _session, index) => sum + (recent.length - index), 0);
  const habitOf = new Map<string, number>();
  recent.forEach((session, index) => {
    for (const { exercise } of practicedOrder(session, byId)) {
      habitOf.set(exercise.id, (habitOf.get(exercise.id) ?? 0) + (recent.length - index) / totalWeight);
    }
  });

  /** Ce que `sets` séries de l'exercice comblent des besoins restants (séries comptées). */
  const usefulSets = (exercise: Exercise, sets: number) => {
    let useful = 0;
    for (const [parent, gap] of gaps) {
      const coefficient = aggregateCoefficient(exercise, parent);
      if (coefficient < SESSION_FOCUS.MIN_SUGGESTION_COEFFICIENT || gap <= 0) continue;
      useful += Math.min(gap, coefficient * sets);
    }
    return useful;
  };

  const chosen: { entry: Usage; sets: number; reason: HabitualExercise["reason"]; forParent: MuscleParent | null }[] = [];
  const minSessions = Math.ceil(recent.length * HABITUAL_SESSION.CORE_SHARE);
  let total = 0;
  const take = (entry: Usage, sets: number, forParent: MuscleParent | null) => {
    for (const [parent, gap] of gaps) gaps.set(parent, gap - aggregateCoefficient(entry.exercise, parent) * sets);
    const habit = entry.sessions >= minSessions;
    chosen.push({ entry, sets, reason: habit ? "habit" : "deficit", forParent: habit ? null : forParent });
    total += sets;
  };

  // 2-3. Glouton sur le besoin : l'exercice qui comble le plus, habitude en départage.
  while (chosen.length < targetSize && budget - total >= HABITUAL_SESSION.MIN_TARGET_SETS) {
    let best: { entry: Usage; sets: number; score: number; parent: MuscleParent } | null = null;
    for (const entry of usage.values()) {
      if (chosen.some((picked) => picked.entry.exercise.id === entry.exercise.id)) continue;
      // Le muscle qu'il comble le mieux fixe ses séries : de quoi fermer ce besoin, 2 à 4.
      let main: { parent: MuscleParent; gap: number; coefficient: number; fill: number } | null = null;
      for (const [parent, gap] of gaps) {
        const coefficient = aggregateCoefficient(entry.exercise, parent);
        if (coefficient < SESSION_FOCUS.MIN_SUGGESTION_COEFFICIENT || gap <= 0) continue;
        const fill = Math.min(gap, coefficient * HABITUAL_SESSION.MAX_TARGET_SETS);
        if (!main || fill > main.fill) main = { parent, gap, coefficient, fill };
      }
      if (!main) continue;
      const sets = Math.min(
        budget - total,
        Math.min(HABITUAL_SESSION.MAX_TARGET_SETS, Math.max(HABITUAL_SESSION.MIN_TARGET_SETS, Math.round(main.gap / main.coefficient)))
      );
      const useful = usefulSets(entry.exercise, sets);
      if (useful < HABITUAL_SESSION.MIN_USEFUL_SETS) continue;
      const score = useful + HABITUAL_SESSION.HABIT_WEIGHT * (habitOf.get(entry.exercise.id) ?? 0);
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && entry.lastSeen > best.entry.lastSeen)) {
        best = { entry, sets, score, parent: main.parent };
      }
    }
    if (!best) break;
    take(best.entry, best.sets, best.parent);
  }

  // Besoins couverts avant son volume habituel : son socle complète, séries habituelles.
  const trainsLegs = (exercise: Exercise) =>
    LOWER_BODY_PARENTS.some((parent) => aggregateCoefficient(exercise, parent) >= SESSION_FOCUS.MIN_SUGGESTION_COEFFICIENT);
  const core = [...usage.values()]
    .filter((entry) => entry.sessions >= minSessions && !chosen.some((picked) => picked.entry.exercise.id === entry.exercise.id))
    .filter((entry) => !(options.lowerBodyOff && trainsLegs(entry.exercise)))
    .sort((a, b) => (habitOf.get(b.exercise.id) ?? 0) - (habitOf.get(a.exercise.id) ?? 0));
  for (const entry of core) {
    if (chosen.length >= targetSize || usualVolume - total < HABITUAL_SESSION.MIN_TARGET_SETS) break;
    take(entry, Math.min(habitualSetsOf(entry), usualVolume - total), null);
  }
  if (chosen.length === 0) return null;

  // 4. Ordre habituel (position relative médiane dans ses séances).
  chosen.sort((a, b) => median(a.entry.positions) - median(b.entry.positions));

  // Supersets récurrents : la paire reste liée et collée.
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

  const exercises: HabitualExercise[] = chosen.map(({ entry, sets, reason, forParent }) => ({
    exerciseId: entry.exercise.id,
    exerciseName: entry.exercise.name,
    targetSets: sets,
    seenIn: entry.sessions,
    reason,
    forParent,
  }));
  const coveredDeficits = deficits.filter(({ parent }) =>
    chosen.some(({ entry }) => aggregateCoefficient(entry.exercise, parent) >= SESSION_FOCUS.MIN_SUGGESTION_COEFFICIENT)
  );

  // 5. Palier de la semaine si la séance est faite telle quelle (chaque muscle plafonné).
  const goalTotal = progress.reduce((sum, row) => sum + row.goalSets, 0);
  const planned = (parent: MuscleParent) =>
    chosen.reduce((sum, { entry, sets }) => sum + aggregateCoefficient(entry.exercise, parent) * sets, 0);
  const scoreBefore = goalTotal > 0 ? progress.reduce((sum, row) => sum + Math.min(row.effectiveSets, row.goalSets), 0) / goalTotal : 0;
  const scoreAfter =
    goalTotal > 0 ? progress.reduce((sum, row) => sum + Math.min(row.effectiveSets + planned(row.parent), row.goalSets), 0) / goalTotal : 0;

  return {
    exercises,
    supersetPairs,
    basedOnSessions: recent.length,
    since: recent.at(-1)!.date,
    deficits: coveredDeficits,
    expectedSets: exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0),
    projected: { scoreBefore, scoreAfter, tierBefore: weekTier(scoreBefore), tierAfter: weekTier(scoreAfter) },
  };
}

/** Ligne d'explication de la carte d'accueil : d'où vient la séance, en chiffres. */
export function habitualSessionSummary(plan: HabitualSessionPlan): string {
  const base = `Tes ${plan.basedOnSessions} dernières séances · ${plan.exercises.length} exercices · ~${plan.expectedSets} séries`;
  const { tierBefore, tierAfter } = plan.projected;
  const rank = (tier: WeekTier | null) => (tier ? WEEK_TIERS.findIndex((entry) => entry.tier === tier) : -1);
  if (tierAfter && rank(tierAfter) > rank(tierBefore)) {
    const label = WEEK_TIERS.find((entry) => entry.tier === tierAfter)!.label.toLowerCase();
    return `${base} · de quoi passer la semaine en ${label}`;
  }
  const added = plan.exercises.filter((exercise) => exercise.reason === "deficit" && exercise.forParent);
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
