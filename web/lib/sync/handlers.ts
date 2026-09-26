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
  session: (session, intentAt) => syncSession({
    session,
    exercises: exercisesReferencedBySession(session, useWorkoutStore.getState().catalog),
    intentAt,
  }),
  sessionDelete: (sessionId, intentAt) => syncOp({ kind: "session_delete", sessionId }, intentAt),
  settings: (settings, intentAt) => syncOp({ kind: "settings", settings }, intentAt),
  goals: (goals, intentAt) => syncOp({ kind: "goals", goals }, intentAt),
  recoveryCheckin: (checkin, intentAt) => syncOp({ kind: "recovery_checkin", checkin }, intentAt),
  exerciseUpsert: (exercise, intentAt) => syncOp({ kind: "exercise_upsert", exercise }, intentAt),
  exerciseDelete: (exerciseId, intentAt) => syncOp({ kind: "exercise_delete", exerciseId }, intentAt),
  templateUpsert: (template, intentAt) => syncOp({ kind: "template_upsert", template }, intentAt),
  templateDelete: (templateId, intentAt) => syncOp({ kind: "template_delete", templateId }, intentAt),
  bodyWeight: (entry, intentAt) => syncOp({ kind: "body_weight", entry }, intentAt),
};
