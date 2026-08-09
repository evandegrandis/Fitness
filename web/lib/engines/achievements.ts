/**
 * Records récents pour l'écran d'accueil, miroir exact de
 * `Jeera/Engines/AchievementsEngine.swift`.
 *
 * Une "achievement" est un set qui bat un record précédent — soit le poids
 * validé le plus lourd jamais atteint, soit le plus de reps à un poids
 * donné. On parcourt les N dernières séances terminées et on flague les sets
 * qui étaient des records au moment où ils ont été loggés.
 */

import {
  buildFinisherRecords,
  classifyFinisher,
  normalRecordSets,
  RecordsEngine,
  type RecordKind,
} from "@/lib/engines/records";
import { SetType } from "@/lib/models/enums";
import {
  orderedSets,
  sessionsNewestFirst,
  type Exercise,
  type LoggedSet,
  type WorkoutSession,
} from "@/lib/models/types";

/** Miroir de `Achievement` (Swift). */
export interface Achievement {
  id: string;
  exerciseName: string;
  date: Date;
  kind: RecordKind;
  weight: number;
  reps: number;
}

function rank(kind: RecordKind): number {
  switch (kind) {
    case "heaviestWeight":
      return 4;
    case "estimated1RM":
      return 3;
    case "repsAtWeight":
      return 2;
    case "bodyweightReps":
      return 2;
    case "finisherReps":
      return 1;
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

let achievementIdCounter = 0;
function nextAchievementId(): string {
  achievementIdCounter += 1;
  return `achievement-${achievementIdCounter}`;
}

/**
 * Extrait les records récents des `maxSessions` dernières séances terminées.
 * Chaque set est testé contre TOUT l'historique antérieur pour voir s'il
 * était un record au moment où il a été loggé.
 *
 * L'ordre d'entrée est tolérant aux imports/restaurations : il est normalisé
 * ici avant d'appliquer la fenêtre des séances récentes.
 */
export function recentAchievements(sessions: WorkoutSession[], exercises: Exercise[], maxSessions = 10): Achievement[] {
  const newestFirst = sessionsNewestFirst(sessions);
  const recent = newestFirst.slice(0, maxSessions);
  const recentIds = new Set(recent.map((s) => s.id));
  // Liste chronologique de toutes les séances pour l'historique par exercice.
  const allChronological = newestFirst.reverse();

  const results: Achievement[] = [];

  for (const exercise of exercises) {
    // Rassemble tous les sets historiques de cet exercice, en ordre chronologique.
    let cumulativeSets: LoggedSet[] = [];
    let cumulativeFinishers: LoggedSet[] = [];

    for (const session of allChronological) {
      const logged = session.exercises.filter((le) => le.exerciseId === exercise.id);
      const newSets = logged.flatMap((le) => normalRecordSets(orderedSets(le), exercise));
      const newFinishers = logged.flatMap((le) =>
        orderedSets(le).filter((set) => set.completed && set.setType === SetType.finisher)
      );
      if (newSets.length === 0 && newFinishers.length === 0) continue;

      // Construit les records AVANT les sets de cette séance.
      const priorRecords = RecordsEngine.buildRecords(exercise, cumulativeSets);
      const priorFinisherRecords = buildFinisherRecords(cumulativeFinishers);

      // Vérifie chaque nouveau set contre les records antérieurs.
      for (const set of newSets) {
        const kind = RecordsEngine.classify(set, exercise, priorRecords);
        if (kind && recentIds.has(session.id)) {
          results.push({
            id: nextAchievementId(),
            exerciseName: exercise.name,
            date: session.date,
            kind,
            weight: set.weight,
            reps: set.reps,
          });
        }
      }

      for (const set of newFinishers) {
        const kind = classifyFinisher(set, priorFinisherRecords);
        if (kind && recentIds.has(session.id)) {
          results.push({
            id: nextAchievementId(),
            exerciseName: exercise.name,
            date: session.date,
            kind,
            weight: set.weight,
            reps: set.reps,
          });
        }
      }

      cumulativeSets = cumulativeSets.concat(newSets);
      cumulativeFinishers = cumulativeFinishers.concat(newFinishers);
    }
  }

  const deduped = new Map<string, Achievement>();

  for (const achievement of results) {
    const key = `${achievement.exerciseName}::${startOfDay(achievement.date).getTime()}`;
    const existing = deduped.get(key);

    if (existing) {
      const newRank = rank(achievement.kind);
      const oldRank = rank(existing.kind);

      if (
        newRank > oldRank ||
        (newRank === oldRank && achievement.reps > existing.reps) ||
        (newRank === oldRank && achievement.reps === existing.reps && achievement.weight > existing.weight)
      ) {
        deduped.set(key, achievement);
      }
    } else {
      deduped.set(key, achievement);
    }
  }

  // Tri plus récent d'abord, puis record le plus fort d'abord.
  return [...deduped.values()].sort((a, b) => {
    if (a.date.getTime() !== b.date.getTime()) return b.date.getTime() - a.date.getTime();
    return rank(b.kind) - rank(a.kind);
  });
}
