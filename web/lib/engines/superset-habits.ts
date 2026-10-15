import type { WorkoutSession } from "@/lib/models/types";

/**
 * Supersets qu'Evan forme d'habitude, lus dans son historique (16/10/2026).
 *
 * Evan, séance du 15/10 : « les supersets ne se faisaient pas automatiquement, j'ai dû cliquer et
 * dire que c'était un superset à chaque fois ». Seule « Séance du jour » liait des paires, et
 * seulement quand les deux exercices étaient dans son plan : depuis que le plan suit le besoin du
 * jour (11/10), Lateral raises n'y figurait plus, donc Wide Chest Press + Lateral raises (liés les
 * 06, 13 et 15/10) ne se liaient jamais. Rien ne liait un exercice ajouté en cours de séance, et la
 * détection après coup demande une alternance stricte à moins de 4 min, que ses séries lourdes
 * dépassent (258 s le 15/10).
 *
 * Une paire est habituelle quand il l'a LIÉE lui-même (groupe enregistré, pas une simple
 * alternance) dans au moins deux séances des 28 derniers jours, et que la dernière fois qu'il a fait
 * les deux exercices dans la même séance, il les a liés. Rien ne se lie sans cette preuve ; une
 * paire qu'il cesse de lier cesse de se lier toute seule dès la séance suivante.
 */
export const SUPERSET_HABIT = {
  /** Fenêtre de l'historique lu (même horizon que « Séance du jour »). */
  MAX_AGE_DAYS: 28,
  /** Séances où il a lié la paire lui-même. */
  MIN_LINKED_SESSIONS: 2,
} as const;

const DAY_MS = 86_400_000;

export interface HabitualSupersetPair {
  /** Ids catalogue, dans l'ordre de la dernière séance où la paire était liée. */
  exerciseIds: [string, string];
  /** Séances de la fenêtre où il a lié la paire. */
  linkedSessions: number;
  lastLinkedAt: Date;
}

/** Clé d'une paire, indépendante de l'ordre. */
export function supersetPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function practicedExerciseIds(session: WorkoutSession): Set<string> {
  return new Set(session.exercises.filter((logged) => logged.sets.some((set) => set.completed)).map((logged) => logged.exerciseId));
}

/** Paires liées dans une séance : groupes de deux exercices pratiqués, ids catalogue dans l'ordre du groupe. */
function linkedPairs(session: WorkoutSession): [string, string][] {
  const byId = new Map(session.exercises.map((logged) => [logged.id, logged]));
  const pairs: [string, string][] = [];
  for (const group of session.supersetGroups ?? []) {
    const members = group.memberOrder
      .map((id) => byId.get(id))
      .filter((logged) => logged !== undefined && logged.sets.some((set) => set.completed))
      .map((logged) => logged!.exerciseId);
    const distinct = [...new Set(members)];
    if (distinct.length === 2) pairs.push([distinct[0], distinct[1]]);
  }
  return pairs;
}

/**
 * Les paires habituelles à `now`, de la plus prouvée à la moins prouvée (puis la plus récente).
 * Un exercice peut figurer dans plusieurs paires : c'est l'application qui départage, dans cet ordre.
 */
export function habitualSupersetPairs(history: readonly WorkoutSession[], now: Date): HabitualSupersetPair[] {
  const sessions = history
    .filter((session) => !session.isActive && session.date.getTime() <= now.getTime())
    .filter((session) => now.getTime() - session.date.getTime() <= SUPERSET_HABIT.MAX_AGE_DAYS * DAY_MS)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const found = new Map<string, HabitualSupersetPair>();
  for (const session of sessions) {
    for (const [a, b] of linkedPairs(session)) {
      const key = supersetPairKey(a, b);
      const known = found.get(key);
      if (known) known.linkedSessions += 1;
      else found.set(key, { exerciseIds: [a, b], linkedSessions: 1, lastLinkedAt: session.date });
    }
  }

  const pairs: HabitualSupersetPair[] = [];
  for (const [key, pair] of found) {
    if (pair.linkedSessions < SUPERSET_HABIT.MIN_LINKED_SESSIONS) continue;
    // La dernière séance où il a fait les deux : il doit les y avoir liés.
    const [a, b] = pair.exerciseIds;
    const lastTogether = sessions.find((session) => {
      const practiced = practicedExerciseIds(session);
      return practiced.has(a) && practiced.has(b);
    });
    if (!lastTogether || !linkedPairs(lastTogether).some(([x, y]) => supersetPairKey(x, y) === key)) continue;
    pairs.push(pair);
  }
  return pairs.sort(
    (x, y) => y.linkedSessions - x.linkedSessions || y.lastLinkedAt.getTime() - x.lastLinkedAt.getTime()
  );
}
