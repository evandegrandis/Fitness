/**
 * Signal vers Barbis : un exercice créé en salle attend son profil musculaire.
 *
 * Evan crée ses machines en séance, sans réseau la plupart du temps. Dès qu'un exercice atteint
 * Neon (pendant la séance si le téléphone a du réseau, sinon au retour de la connexion, via la
 * file de synchronisation), Jeera prévient Barbis, qui cherche les muscles travaillés, leurs
 * coefficients et la machine équivalente de l'ancienne salle, puis écrit le résultat par
 * `POST /api/barbis/exercise-profile`. Un balayage périodique côté Barbis rattrape tout signal
 * perdu : ce signal accélère, il ne garantit pas seul le traitement.
 *
 * Jamais bloquant : sans configuration, ou si Barbis ne répond pas, la synchro continue.
 */

import { profileSourceRank, type Exercise, type ProfileSource, type WorkoutSession } from "@/lib/models/types";

/** Profils qu'une recherche Barbis peut améliorer : absents, copiés ou choisis d'un tap. */
export function needsBarbisProfile(source: ProfileSource | null | undefined): boolean {
  return source === null || source === undefined || source === "known_profile" || source === "donor";
}

/** Ce que le téléphone reprend du serveur quand Barbis a trouvé le profil. */
export type ServerProfile = Pick<
  Exercise,
  "id" | "muscleMappings" | "movementPattern" | "fatigueClass" | "category"
> & { profileSource: ProfileSource | null; equivalenceKey: string | null };

export const BARBIS_WATCH = {
  /** Un exercice créé en salle est guetté pendant deux jours : la séance, puis le retour du réseau. */
  WINDOW_MS: 48 * 3_600_000,
  INTERVAL_MS: 45_000,
} as const;

/**
 * Exercices créés par Evan, récemment pratiqués (séance en cours comprise), dont le profil peut
 * encore venir de Barbis. Hors de cette fenêtre, plus rien n'est guetté : le prochain chargement
 * complet de l'app suffit.
 */
export function exercisesAwaitingBarbis(
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[],
  active: WorkoutSession | null,
  now: Date
): string[] {
  const since = now.getTime() - BARBIS_WATCH.WINDOW_MS;
  const recent = new Set<string>();
  for (const session of active ? [active, ...history] : history) {
    if (session.date.getTime() < since) continue;
    for (const logged of session.exercises) recent.add(logged.exerciseId);
  }
  return catalog
    .filter((exercise) => exercise.createdByUser && needsBarbisProfile(exercise.profileSource) && recent.has(exercise.id))
    .map((exercise) => exercise.id);
}

/**
 * Le profil serveur remplace le profil local seulement s'il vient d'une source plus sûre : jamais
 * un réglage fait à la main sur le téléphone. Seuls les champs du profil sont repris, pas une
 * charge max ou un réglage saisis hors-ligne.
 */
export function adoptServerProfile(local: Exercise, remote: ServerProfile): Exercise | null {
  if (remote.muscleMappings.length === 0) return null;
  if (profileSourceRank(remote.profileSource) <= profileSourceRank(local.profileSource ?? null)) return null;
  return {
    ...local,
    muscleMappings: remote.muscleMappings,
    profileSource: remote.profileSource,
    movementPattern: remote.movementPattern,
    fatigueClass: remote.fatigueClass,
    category: ["", "autre"].includes(local.category.trim().toLowerCase()) ? remote.category : local.category,
    equivalenceKey: remote.equivalenceKey ?? local.equivalenceKey ?? null,
  };
}

const TIMEOUT_MS = 3000;

export async function notifyBarbisExercisesNeedProfile(exerciseIds: readonly string[]): Promise<void> {
  const url = process.env.BARBIS_JEERA_WEBHOOK_URL;
  const token = process.env.JEERA_BARBIS_TOKEN;
  if (!url || !token || exerciseIds.length === 0) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ exerciseIds, source: "jeera" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.log(JSON.stringify({ event: "barbis_exercise_signal", status: response.status, count: exerciseIds.length }));
  } catch (error) {
    console.log(JSON.stringify({
      event: "barbis_exercise_signal_failed",
      count: exerciseIds.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
