"use server";

/**
 * Server Actions de SYNCHRONISATION (rejeu de l'outbox du téléphone).
 *
 * Différence avec `actions.ts` : ici rien ne lève. Chaque appel renvoie un
 * `SyncOutcome` typé, parce qu'en production le client ne peut pas lire le
 * message d'une exception de Server Action (masquée par Next.js). Sans ce
 * contrat, une écriture refusée pour toujours (clé étrangère, contrainte) est
 * indiscernable d'une coupure réseau, et la file causale du client s'arrête
 * dessus indéfiniment. C'est exactement ce qui a gelé la synchro du 20/08 au
 * 17/09/2026.
 *
 * Chaque rejet est journalisé côté serveur avec sa nature : les logs Vercel
 * deviennent lisibles (« permanent 23503 séance x → exercice y absent »)
 * au lieu d'une stack trace anonyme toutes les 30 secondes.
 */

import type { BatchItem } from "drizzle-orm/batch";

import { db } from "./client";
import {
  deleteExercise,
  deleteSession,
  deleteTemplate,
  saveBodyWeight,
  saveRecoveryCheckin,
  saveTemplate,
  setGoals,
  updateSettings,
  upsertExercise,
} from "./actions";
import { missingExerciseOperations, sessionWriteOperations } from "./session-writes";
import { requireAuthenticatedSession } from "@/lib/auth";
import { after } from "next/server";
import { notifyBarbisExercisesNeedProfile, notifyBarbisSessionFinished, sessionJustFinished } from "@/lib/integrations/barbis";
import { sessionCalories } from "@/lib/engines/calories";
import { getBodyWeights, getExercises, getSettings } from "./queries";
import type { Exercise, WorkoutSession } from "@/lib/models/types";
import { classifySyncError, type SyncOutcome } from "@/lib/sync/outcome";
import type { OutboxOp } from "@/lib/sync/outbox";
import { revalidatePath } from "next/cache";

function logOutcome(kind: string, target: string, outcome: SyncOutcome): void {
  if (outcome.ok) return;
  console.error(JSON.stringify({
    event: "sync_op_rejected",
    op: kind,
    target,
    failure: outcome.kind,
    code: outcome.code,
    message: outcome.message.slice(0, 500),
  }));
}

/**
 * Écrit une séance ET les exercices qu'elle référence dans un seul lot
 * atomique. `exercises` contient les fiches du catalogue local pour les
 * exercices de la séance ; seuls ceux que le serveur ignore sont créés.
 */
export async function syncSession(payload: { session: WorkoutSession; exercises: Exercise[] }): Promise<SyncOutcome> {
  const target = payload.session.id;
  try {
    await requireAuthenticatedSession();
    const referenced = new Set(payload.session.exercises.map((logged) => logged.exerciseId));
    const carried = payload.exercises.filter((exercise) => referenced.has(exercise.id));
    const missing = await missingExerciseOperations(carried);
    const operations: BatchItem<"pg">[] = [...missing.operations, ...sessionWriteOperations(payload.session)];
    await db.batch(operations as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    if (missing.inserted.length > 0) {
      console.log(JSON.stringify({ event: "sync_session_created_exercises", session: target, exercises: missing.inserted }));
    }
    // Machines créées en salle et arrivées avec la séance : Barbis les cartographie, après la réponse.
    if (missing.needsProfile.length > 0) {
      const ids = missing.needsProfile;
      after(() => notifyBarbisExercisesNeedProfile(ids));
    }
    // Séance tout juste validée : Barbis fait le bilan du jour et dit quoi manger ensuite.
    if (sessionJustFinished(payload.session)) {
      const session = payload.session;
      after(async () => {
        const estimate = await Promise.all([getExercises(), getBodyWeights(), getSettings()])
          .then(([catalog, bodyWeights, settings]) => sessionCalories(session, catalog, bodyWeights, settings.bodyWeightKg))
          .then((calories) => ({ activeKcal: calories.activeKcal, low: calories.low, high: calories.high }))
          .catch(() => null);
        await notifyBarbisSessionFinished(session, estimate);
      });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    const outcome = classifySyncError(error);
    logOutcome("session", target, outcome);
    return outcome;
  }
}

/** Toutes les autres opérations de l'outbox, avec le même contrat de résultat. */
export async function syncOp(op: Exclude<OutboxOp, { kind: "session" }>): Promise<SyncOutcome> {
  const target = "sessionId" in op ? op.sessionId
    : "exerciseId" in op ? op.exerciseId
    : "templateId" in op ? op.templateId
    : "exercise" in op ? op.exercise.id
    : "template" in op ? op.template.id
    : "checkin" in op ? op.checkin.date.toISOString()
    : "entry" in op ? op.entry.id
    : op.kind;
  try {
    switch (op.kind) {
      case "session_delete":
        await deleteSession(op.sessionId);
        break;
      case "settings":
        await updateSettings(op.settings);
        break;
      case "goals":
        await setGoals(op.goals);
        break;
      case "recovery_checkin":
        await saveRecoveryCheckin(op.checkin);
        break;
      case "exercise_upsert":
        await upsertExercise(op.exercise);
        break;
      case "exercise_delete":
        // Un exercice encore référencé est conservé : pour un rejeu, c'est un
        // résultat terminal (le remettre en file bloquerait la suite).
        await deleteExercise(op.exerciseId);
        break;
      case "template_upsert":
        await saveTemplate(op.template);
        break;
      case "template_delete":
        await deleteTemplate(op.templateId);
        break;
      case "body_weight":
        await saveBodyWeight(op.entry);
        break;
    }
    return { ok: true };
  } catch (error) {
    const outcome = classifySyncError(error);
    logOutcome(op.kind, target, outcome);
    return outcome;
  }
}
