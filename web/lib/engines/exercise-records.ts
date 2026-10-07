/**
 * Fiche records d'un exercice (Progrès › Exercices) : charge la plus lourde, meilleure capacité,
 * reps à la charge actuelle et ses 5 meilleures séances. Mêmes règles que les étoiles de
 * l'Historique : séries de travail retenues par `normalRecordSets` (un complément de drop-set ou
 * une série arrêtée pour douleur ne compte pas), historique propre à la machine (une machine
 * équivalente garde ses records, sa conversion ne sert qu'aux suggestions), étoiles lues dans
 * `recordEvents` (donc jamais sur la séance d'étalonnage d'une nouvelle machine). Moteur pur.
 */

import { bestSetOfSession, mergeExerciseOccurrences } from "@/lib/engines/bilan";
import { estimated1RM } from "@/lib/engines/e1rm";
import { normalRecordSets } from "@/lib/engines/records";
import type { RecordEvent } from "@/lib/engines/progress-stats";
import { orderedSets, sessionsNewestFirst, type Exercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";

export const EXERCISE_RECORDS = {
  TOP_SESSIONS: 5,
} as const;

export interface RecordSetRef {
  weight: number;
  reps: number;
  date: Date;
  sessionId: string;
}

export interface ExerciseRecordSession extends RecordSetRef {
  /** 1RM estimé (Epley) pour une série chargée, reps sinon. */
  value: number;
  /** Étoiles de l'Historique sur cet exercice dans cette séance. */
  stars: number;
  /** Première séance sur la machine : elle pose la référence. */
  calibration: boolean;
}

export interface ExerciseRecordSheet {
  axis: "load" | "reps";
  /** Charge la plus lourde jamais faite (à égalité, le plus de reps). */
  heaviest: RecordSetRef | null;
  /** Meilleur 1RM estimé (Epley) sur une série dans la fourchette (reps ≥ minimum). */
  bestCapacity: (RecordSetRef & { e1rm: number }) | null;
  /** Charge de la meilleure série de la dernière séance, et le plus de reps jamais faites à cette charge. */
  currentLoad: { weight: number; bestReps: number; date: Date; sessionId: string } | null;
  /** Le plus de reps sur une série (exercices au poids du corps). */
  mostReps: RecordSetRef | null;
  topSessions: ExerciseRecordSession[];
  sessions: number;
  totalStars: number;
}

interface DatedSet {
  set: LoggedSet;
  session: WorkoutSession;
}

export function exerciseRecordSheet(
  exercise: Exercise,
  history: readonly WorkoutSession[],
  events: readonly RecordEvent[]
): ExerciseRecordSheet {
  const chronological = sessionsNewestFirst(history.filter((session) => !session.isActive)).reverse();
  const starsBySession = new Map<string, number>();
  for (const event of events) {
    if (event.exerciseId !== exercise.id) continue;
    starsBySession.set(event.sessionId, (starsBySession.get(event.sessionId) ?? 0) + 1);
  }

  const all: DatedSet[] = [];
  const perSession: ExerciseRecordSession[] = [];
  let firstSessionId: string | null = null;
  for (const session of chronological) {
    const occurrences = session.exercises.filter((logged) => logged.exerciseId === exercise.id);
    if (occurrences.length === 0) continue;
    const sets = normalRecordSets(occurrences.flatMap((logged) => orderedSets(logged)), exercise);
    if (sets.length === 0) continue;
    firstSessionId ??= session.id;
    sets.forEach((set) => all.push({ set, session }));
    const merged = mergeExerciseOccurrences(session).find((logged) => logged.exerciseId === exercise.id)!;
    const best = bestSetOfSession(merged, exercise);
    if (!best) continue;
    perSession.push({
      weight: best.weight,
      reps: best.reps,
      date: session.date,
      sessionId: session.id,
      value: valueOf(best, exercise),
      stars: starsBySession.get(session.id) ?? 0,
      calibration: session.id === firstSessionId,
    });
  }

  const loaded = exercise.setPatternMode !== "assisted_bodyweight" && all.some((entry) => entry.set.weight > 0);
  const ref = (entry: DatedSet): RecordSetRef => ({
    weight: entry.set.weight,
    reps: entry.set.reps,
    date: entry.session.date,
    sessionId: entry.session.id,
  });

  let heaviest: DatedSet | null = null;
  let bestCapacity: DatedSet | null = null;
  let mostReps: DatedSet | null = null;
  for (const entry of all) {
    const { set } = entry;
    if (loaded && set.weight > 0) {
      if (!heaviest || set.weight > heaviest.set.weight || (set.weight === heaviest.set.weight && set.reps > heaviest.set.reps)) heaviest = entry;
      if (set.reps >= exercise.repTargetMin && (!bestCapacity || estimated1RM(set.weight, set.reps) > estimated1RM(bestCapacity.set.weight, bestCapacity.set.reps) + 1e-9)) {
        bestCapacity = entry;
      }
    }
    if (!mostReps || set.reps > mostReps.set.reps) mostReps = entry;
  }

  const last = perSession.at(-1) ?? null;
  const atLoad = last
    ? all
        .filter((entry) => Math.abs(entry.set.weight - last.weight) < 0.01)
        .reduce<DatedSet | null>((best, entry) => (!best || entry.set.reps > best.set.reps ? entry : best), null)
    : null;

  return {
    axis: loaded ? "load" : "reps",
    heaviest: heaviest ? ref(heaviest) : null,
    bestCapacity: bestCapacity ? { ...ref(bestCapacity), e1rm: estimated1RM(bestCapacity.set.weight, bestCapacity.set.reps) } : null,
    currentLoad: atLoad && last ? { weight: last.weight, bestReps: atLoad.set.reps, date: atLoad.session.date, sessionId: atLoad.session.id } : null,
    mostReps: loaded ? null : mostReps ? ref(mostReps) : null,
    topSessions: [...perSession]
      .sort((a, b) => b.value - a.value || b.date.getTime() - a.date.getTime())
      .slice(0, EXERCISE_RECORDS.TOP_SESSIONS),
    sessions: perSession.length,
    totalStars: [...starsBySession.values()].reduce((sum, count) => sum + count, 0),
  };
}

function valueOf(set: Pick<LoggedSet, "weight" | "reps">, exercise: Exercise): number {
  if (exercise.setPatternMode === "assisted_bodyweight") return -set.weight * 100 + set.reps;
  return set.weight > 0 ? estimated1RM(set.weight, set.reps) : set.reps;
}
