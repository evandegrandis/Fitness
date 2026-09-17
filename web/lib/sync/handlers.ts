import { syncOp, syncSession } from "@/lib/db/sync-actions";
import { exercisesReferencedBySession } from "@/lib/sync/session-dependencies";
import { useWorkoutStore } from "@/lib/store/workout";
import type { OutboxHandlers } from "@/lib/sync/outbox";

/**
 * OFFLINE_PWA_SPEC §4 (P4.4) — mappe chaque `OutboxOp.kind` vers la Server Action Neon
 * correspondante. Un seul endroit ; `lib/sync/outbox.ts` reste volontairement PUR (aucune
 * connaissance de la couche serveur) — ce fichier fait le pont.
 *
 * Depuis le 17/09/2026, les handlers passent par `sync-actions.ts` : le serveur renvoie un
 * résultat typé (transitoire vs permanent) au lieu d'une exception masquée, et une séance
 * emporte avec elle les fiches des exercices qu'elle référence, lues dans le catalogue local
 * au moment du rejeu (le dernier état connu). La file ne dépend donc plus de l'ordre
 * exercice → séance pour passer.
 */
export const defaultOutboxHandlers: OutboxHandlers = {
  session: (session) => syncSession({
    session,
    exercises: exercisesReferencedBySession(session, useWorkoutStore.getState().catalog),
  }),
  sessionDelete: (sessionId) => syncOp({ kind: "session_delete", sessionId }),
  settings: (settings) => syncOp({ kind: "settings", settings }),
  goals: (goals) => syncOp({ kind: "goals", goals }),
  recoveryCheckin: (checkin) => syncOp({ kind: "recovery_checkin", checkin }),
  exerciseUpsert: (exercise) => syncOp({ kind: "exercise_upsert", exercise }),
  exerciseDelete: (exerciseId) => syncOp({ kind: "exercise_delete", exerciseId }),
  templateUpsert: (template) => syncOp({ kind: "template_upsert", template }),
  templateDelete: (templateId) => syncOp({ kind: "template_delete", templateId }),
  bodyWeight: (entry) => syncOp({ kind: "body_weight", entry }),
};
