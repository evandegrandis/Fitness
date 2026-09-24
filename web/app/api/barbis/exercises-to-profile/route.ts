import { getExercises, getSessions } from "@/lib/db/queries";
import { rejectUnlessBearer } from "@/lib/api/bearer";
import { equivalenceKey } from "@/lib/engines/equivalence";
import { needsBarbisProfile } from "@/lib/integrations/barbis";
import { EXERCISE_CATEGORIES } from "@/lib/integrations/barbis-profile-input";
import { FATIGUE_CLASSES, MOVEMENT_PATTERNS } from "@/lib/models/enums";
import { LEAF_TO_PARENT, MUSCLE_LEAVES, leafDisplayName, parentDisplayName } from "@/lib/models/muscles";
import { orderedSets, sessionsNewestFirst } from "@/lib/models/types";

/**
 * Pour Barbis : les exercices créés en salle qui attendent leur profil musculaire, avec de quoi
 * les cartographier en bonne intelligence : leurs séries récentes, les machines existantes qui
 * pourraient être leur équivalent (d'une autre salle), la taxonomie exacte des muscles et la
 * convention des coefficients telle que le catalogue l'applique déjà.
 *
 * Jeton `JEERA_BARBIS_TOKEN` (l'app est publique).
 */

const CANDIDATE_WINDOW_DAYS = 365;

export async function GET(request: Request): Promise<Response> {
  const rejected = rejectUnlessBearer(request, "JEERA_BARBIS_TOKEN");
  if (rejected) return rejected;

  const [catalog, history] = await Promise.all([getExercises(), getSessions()]);
  const pending = catalog.filter((exercise) => exercise.createdByUser && needsBarbisProfile(exercise.profileSource));
  const pendingIds = new Set(pending.map((exercise) => exercise.id));

  const recentSets = new Map<string, string[]>();
  for (const session of sessionsNewestFirst(history)) {
    for (const logged of session.exercises) {
      if (!pendingIds.has(logged.exerciseId)) continue;
      const done = orderedSets(logged)
        .filter((set) => set.completed)
        .map((set) => `${set.weight > 0 ? `${set.weight}kg` : "PDC"}x${set.reps}${set.reportedRir != null ? `@RIR${set.reportedRir}` : ""}`);
      const list = recentSets.get(logged.exerciseId) ?? [];
      if (list.length < 3 && done.length > 0) {
        list.push(`${session.date.toISOString().slice(0, 10)}: ${done.join(", ")}`);
        recentSets.set(logged.exerciseId, list);
      }
    }
  }

  const since = Date.now() - CANDIDATE_WINDOW_DAYS * 86_400_000;
  const candidates = catalog
    .filter((exercise) => !pendingIds.has(exercise.id) && exercise.muscleMappings.length > 0)
    .filter((exercise) => (exercise.lastUsed?.getTime() ?? 0) >= since)
    .sort((a, b) => (b.lastUsed?.getTime() ?? 0) - (a.lastUsed?.getTime() ?? 0))
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      family: equivalenceKey(exercise),
      movementPattern: exercise.movementPattern,
      lastUsed: exercise.lastUsed?.toISOString().slice(0, 10) ?? null,
      muscleMappings: exercise.muscleMappings,
    }));

  return Response.json({
    exercises: pending.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
      setPatternMode: exercise.setPatternMode,
      machineSetting: exercise.machineSetting,
      setupNotes: exercise.setupNotes,
      profileSource: exercise.profileSource ?? null,
      movementPattern: exercise.movementPattern,
      fatigueClass: exercise.fatigueClass,
      muscleMappings: exercise.muscleMappings,
      recentSessions: recentSets.get(exercise.id) ?? [],
    })),
    equivalentCandidates: candidates,
    taxonomy: {
      muscles: MUSCLE_LEAVES.map((leaf) => ({
        key: leaf,
        name: leafDisplayName[leaf],
        group: parentDisplayName[LEAF_TO_PARENT[leaf]],
      })),
      movementPatterns: MOVEMENT_PATTERNS,
      fatigueClasses: FATIGUE_CLASSES,
      categories: EXERCISE_CATEGORIES,
    },
    conventions: [
      "Coefficient par muscle fin (clé de la taxonomie) : 1 = moteur principal, 0,5 à 0,7 = synergiste important, 0,3 = secondaire, 0,1 = stabilisateur. Au moins un muscle à 1.",
      "Un faisceau non sollicité ne figure pas. Rester cohérent avec les profils des machines existantes (equivalentCandidates).",
      "equivalentToExerciseId : la machine existante qui fait LE MÊME mouvement (même trajectoire, même muscle cible), typiquement celle de l'ancienne salle ; null s'il n'y en a pas. Les charges ne se comparent pas : l'app mesure elle-même le facteur de conversion.",
      "fatigueClass : heavy pour un polyarticulaire lourd (presse, squat, développé chargé), medium pour un polyarticulaire guidé ou un tirage, light pour l'isolation.",
    ],
  });
}
