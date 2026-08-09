import {
  deleteExercise,
  deleteSession,
  deleteTemplate,
  saveRecoveryCheckin,
  saveSession,
  saveTemplate,
  setGoals,
  updateSettings,
  upsertExercise,
} from "@/lib/db/actions";
import type { OutboxHandlers } from "@/lib/sync/outbox";

/**
 * OFFLINE_PWA_SPEC §4 (P4.4) — mappe chaque `OutboxOp.kind` vers la Server Action Neon
 * correspondante. Un seul endroit (au lieu de dupliquer cet objet dans `SyncProvider.tsx` ET
 * `ActiveSession.tsx`) ; `lib/sync/outbox.ts` reste volontairement PUR (aucune connaissance de la
 * couche serveur, cf. sa doc de tête) — ce fichier fait le pont.
 */
export const defaultOutboxHandlers: OutboxHandlers = {
  session: saveSession,
  sessionDelete: deleteSession,
  settings: updateSettings,
  goals: setGoals,
  recoveryCheckin: saveRecoveryCheckin,
  exerciseUpsert: upsertExercise,
  // Un exercice encore utilisé dans l'historique est conservé en base. Pour
  // une ancienne opération offline, ce résultat résolu est terminal (la
  // remettre en file bloquerait indéfiniment les mutations suivantes).
  exerciseDelete: async (exerciseId) => {
    await deleteExercise(exerciseId);
  },
  templateUpsert: saveTemplate,
  templateDelete: deleteTemplate,
};
