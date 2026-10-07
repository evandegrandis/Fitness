import { buildTrainingState } from "@/lib/barbis/training-state";
import { rejectUnlessBearer } from "@/lib/api/bearer";
import { getBodyWeights, getExercises, getGoals, getRecoveryCheckins, getSessions, getSettings } from "@/lib/db/queries";

/**
 * Pour Barbis : l'état d'entraînement calculé par les moteurs de Jeera (semaine, records,
 * tendances, séances avec leur bilan résumé et la table des corrélations). Lecture seule, jeton
 * `JEERA_BARBIS_TOKEN`. Barbis ne recalcule rien de tout cela : une seule vérité, celle de l'app.
 *
 * `?days=N` (défaut 120, max 3650) limite les séances, records et exercices servis ; les calculs
 * lisent toujours l'historique entier (une étoile, une tendance dépendent de tout le passé).
 */

const DEFAULT_DAYS = 120;
const MAX_DAYS = 3650;

export async function GET(request: Request): Promise<Response> {
  const rejected = rejectUnlessBearer(request, "JEERA_BARBIS_TOKEN");
  if (rejected) return rejected;

  const requested = Number(new URL(request.url).searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_DAYS) : DEFAULT_DAYS;

  const [catalog, sessions, goals, settings, checkins, bodyWeights] = await Promise.all([
    getExercises(),
    getSessions(),
    getGoals(),
    getSettings(),
    getRecoveryCheckins(),
    getBodyWeights(),
  ]);

  return Response.json(buildTrainingState({ sessions, catalog, goals, settings, checkins, bodyWeights, now: new Date(), days }));
}
