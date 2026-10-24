/**
 * Les étoiles d'une séance : LA définition d'un record dans l'app (24/10/2026).
 *
 * Avant, deux définitions coexistaient. L'en-tête de séance comptait des marques posées au moment de valider
 * (`classify` : un seul record par type et par exercice), qu'une correction de série effaçait sans jamais les
 * recalculer ; l'Historique, le bilan, le rang du parcours, Progrès et Barbis comptaient les étoiles
 * (`displayedRecordSetIDs`). Le 22/10, la même séance valait « Rang B, 1 record » en direct et « Rang S,
 * 5 records » au bilan. Désormais tout le monde lit cette fonction, séance en cours comprise : le direct dit
 * ce que dira le bilan.
 *
 * Règle (celle de l'Historique) : pas d'étoile au tout premier passage d'un exercice ; sinon
 * `displayedRecordSetIDs` sur toutes les séries de l'exercice jusqu'à la séance comprise (étalonnage, compléments,
 * séries arrêtées pour douleur et finishers exclus). Une étoile peut disparaître plus tard dans la séance si une
 * meilleure série la domine : le bilan ne la compterait pas non plus.
 */
import { buildRecords, classify, displayedRecordSetIDs, recordCalibration, type RecordKind } from "@/lib/engines/records";
import { orderedSets, sessionsNewestFirst, type Exercise, type LoggedSet, type WorkoutSession } from "@/lib/models/types";

/** Séries de chaque exercice dans les séances d'avant (clé présente = exercice déjà pratiqué, même sans série). */
export type SetsBefore = ReadonlyMap<string, readonly LoggedSet[]>;

export function setsBeforeSession(previous: readonly WorkoutSession[]): Map<string, LoggedSet[]> {
  const byExercise = new Map<string, LoggedSet[]>();
  for (const session of sessionsNewestFirst(previous.filter((candidate) => !candidate.isActive)).reverse()) {
    for (const logged of session.exercises) {
      byExercise.set(logged.exerciseId, [...(byExercise.get(logged.exerciseId) ?? []), ...orderedSets(logged)]);
    }
  }
  return byExercise;
}

/** Identifiants des séries étoilées de la séance, dans l'ordre des exercices. */
export function sessionStarIds(session: WorkoutSession, before: SetsBefore, catalogById: ReadonlyMap<string, Exercise>): string[] {
  const today = new Map<string, LoggedSet[]>();
  for (const logged of session.exercises) {
    today.set(logged.exerciseId, [...(today.get(logged.exerciseId) ?? []), ...orderedSets(logged)]);
  }
  const ids: string[] = [];
  for (const logged of session.exercises) {
    const exercise = catalogById.get(logged.exerciseId);
    if (!exercise || !before.has(logged.exerciseId)) continue;
    const among = [...(before.get(logged.exerciseId) ?? []), ...(today.get(logged.exerciseId) ?? [])];
    for (const setId of displayedRecordSetIDs(logged, among, exercise)) ids.push(setId);
  }
  return ids;
}

/**
 * Le type d'une étoile, pour son libellé : ce que `classify` dit de la série face à tout ce qui la précède
 * (séances d'avant et séries plus tôt dans la séance). Une étoile que `classify` ne nomme pas (charge jamais
 * faite, que rien ne domine, sans 2 % de 1RM en plus) est un record de reps à cette charge.
 */
export function starKind(set: LoggedSet, exercise: Exercise, earlier: readonly LoggedSet[]): RecordKind {
  const prior = [...earlier];
  return classify(set, exercise, buildRecords(exercise, prior), recordCalibration(prior, exercise)) ?? (set.weight === 0 ? "bodyweightReps" : "repsAtWeight");
}

/** Les étoiles de la séance avec leur type. `previous` : les séances terminées d'avant (la séance exclue). */
export function sessionStars(
  session: WorkoutSession,
  previous: readonly WorkoutSession[],
  catalog: readonly Exercise[]
): Map<string, RecordKind> {
  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const before = setsBeforeSession(previous.filter((candidate) => candidate.id !== session.id));
  const stars = new Map<string, RecordKind>();
  const ids = new Set(sessionStarIds(session, before, catalogById));
  if (ids.size === 0) return stars;
  for (const logged of session.exercises) {
    const exercise = catalogById.get(logged.exerciseId);
    if (!exercise) continue;
    const todaySets = session.exercises.filter((candidate) => candidate.exerciseId === logged.exerciseId).flatMap((candidate) => orderedSets(candidate));
    for (const set of orderedSets(logged)) {
      if (!ids.has(set.id)) continue;
      const earlier = [...(before.get(logged.exerciseId) ?? []), ...todaySets.filter((candidate) => candidate.timestamp < set.timestamp)];
      stars.set(set.id, starKind(set, exercise, earlier));
    }
  }
  return stars;
}
