import { getBodyWeights, getExercises, getSessions, getSettings } from "@/lib/db/queries";
import { rejectUnlessBearer } from "@/lib/api/bearer";
import { sessionCalories } from "@/lib/engines/calories";
import { sessionsNewestFirst } from "@/lib/models/types";

/**
 * Pour Barbis : dépense estimée de chaque séance terminée (méthode : `CALORIES.md`), recalculée à
 * la lecture avec le même moteur que l'app. Lecture seule, jeton `JEERA_BARBIS_TOKEN`.
 *
 * `?days=N` (défaut 30, max 3650) limite aux séances des N derniers jours.
 * Pour un bilan énergétique, additionner `activeKcal` (au-dessus du repos) à la dépense de base,
 * jamais `kcal` qui compte aussi le métabolisme de repos pendant la séance.
 */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 3650;

export async function GET(request: Request): Promise<Response> {
  const rejected = rejectUnlessBearer(request, "JEERA_BARBIS_TOKEN");
  if (rejected) return rejected;

  const requested = Number(new URL(request.url).searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_DAYS) : DEFAULT_DAYS;
  const since = Date.now() - days * 86_400_000;

  const [catalog, history, bodyWeights, settings] = await Promise.all([
    getExercises(),
    getSessions(),
    getBodyWeights(),
    getSettings(),
  ]);

  const sessions = sessionsNewestFirst(history)
    .filter((session) => session.date.getTime() >= since)
    .map((session) => {
      const estimate = sessionCalories(session, catalog, bodyWeights, settings.bodyWeightKg);
      return {
        sessionId: session.id,
        date: session.date.toISOString().slice(0, 10),
        startTime: session.startTime.toISOString(),
        endTime: session.endTime?.toISOString() ?? null,
        ...estimate,
      };
    });

  return Response.json({
    days,
    unit: "kcal",
    method: "Hybride MET de fond + coût par série (masse musculaire, charge, RIR) + récupération ; voir web/CALORIES.md",
    sessions,
  });
}
