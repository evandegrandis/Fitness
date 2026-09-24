import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { exercises, muscleMappings } from "@/lib/db/schema";
import { rejectUnlessBearer } from "@/lib/api/bearer";
import { nameEquivalenceKey } from "@/lib/engines/equivalence";
import { parseBarbisProfile, type BarbisProfileInput } from "@/lib/integrations/barbis-profile-input";

/**
 * Barbis écrit le profil musculaire qu'il a trouvé pour un exercice créé en salle. Jeera valide
 * tout (muscles de la taxonomie, coefficients, au moins un moteur principal) et n'écrase jamais un
 * profil réglé à la main (`profile_source = user`). L'équivalent désigné rattache la nouvelle
 * machine à la famille de l'ancienne : suggestions, courbe et machine par défaut suivent.
 *
 * Jeton `JEERA_BARBIS_TOKEN` (l'app est publique).
 */

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUnlessBearer(request, "JEERA_BARBIS_TOKEN");
  if (rejected) return rejected;

  let body: BarbisProfileInput;
  try {
    body = parseBarbisProfile(await request.json());
  } catch (error) {
    return Response.json({ error: "invalid_body", detail: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  const [current] = await db
    .select({ id: exercises.id, name: exercises.name, category: exercises.category, profileSource: exercises.profileSource })
    .from(exercises)
    .where(eq(exercises.id, body.exerciseId));
  if (!current) return Response.json({ error: "not_found" }, { status: 404 });
  if (current.profileSource === "user") {
    return Response.json({ applied: false, reason: "profil réglé à la main, conservé" }, { status: 409 });
  }

  let equivalenceKey: string | null | undefined;
  if (body.equivalentToExerciseId) {
    if (body.equivalentToExerciseId === body.exerciseId) {
      return Response.json({ error: "equivalent_to_self" }, { status: 400 });
    }
    const [target] = await db
      .select({ name: exercises.name, equivalenceKey: exercises.equivalenceKey })
      .from(exercises)
      .where(eq(exercises.id, body.equivalentToExerciseId));
    if (!target) return Response.json({ error: "equivalent_not_found" }, { status: 404 });
    // La nouvelle machine rejoint la famille de l'ancienne ; si celle-ci n'avait qu'une famille
    // déduite de son nom, cette famille devient explicite des deux côtés.
    equivalenceKey = target.equivalenceKey ?? nameEquivalenceKey(target.name);
    if (!target.equivalenceKey) {
      await db.update(exercises).set({ equivalenceKey }).where(eq(exercises.id, body.equivalentToExerciseId));
    }
  }

  // L'éditeur enregistre « Autre » quand rien n'est choisi : c'est une catégorie vide.
  const categoryIsBlank = ["", "autre"].includes(current.category.trim().toLowerCase());
  await db.batch([
    db
      .update(exercises)
      .set({
        profileSource: "barbis",
        movementPattern: body.movementPattern,
        ...(body.fatigueClass ? { fatigueClass: body.fatigueClass } : {}),
        ...(categoryIsBlank && body.category ? { category: body.category } : {}),
        ...(equivalenceKey !== undefined ? { equivalenceKey } : {}),
      })
      .where(eq(exercises.id, body.exerciseId)),
    db.delete(muscleMappings).where(eq(muscleMappings.exerciseId, body.exerciseId)),
    db.insert(muscleMappings).values(
      body.muscleMappings.map((mapping) => ({
        id: crypto.randomUUID(),
        exerciseId: body.exerciseId,
        muscleGroup: mapping.muscleGroup,
        coefficient: mapping.coefficient,
      }))
    ),
  ]);

  console.log(JSON.stringify({
    event: "barbis_exercise_profile_applied",
    exercise: current.name,
    muscles: body.muscleMappings.length,
    equivalent: body.equivalentToExerciseId ?? null,
  }));
  revalidatePath("/", "layout");
  return Response.json({ applied: true, exercise: current.name, equivalenceKey: equivalenceKey ?? null });
}
