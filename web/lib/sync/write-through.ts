import {
  acknowledgeDirectSuccess,
  enqueue,
  pendingCount,
  type OutboxOp,
} from "@/lib/sync/outbox";
import { useSyncStatus } from "@/lib/sync/status";

/**
 * OFFLINE_PWA_SPEC §4 (P4.4) — écritures aujourd'hui directes (`updateSettings`,
 * `upsertExercise`, `deleteExercise`) : avant ce lot, un appel direct hors-ligne rejetait sans
 * aucun filet (l'action était PERDUE — le composant n'avait ni mis à jour le store ni retenté).
 *
 * `writeThrough` tente l'écriture Neon directe quand un réseau est probable ; hors-ligne ou en cas
 * d'échec, met l'opération en file (`lib/sync/outbox.ts`, même mécanisme que les séances) pour rejeu
 * automatique au retour réseau (`SyncProvider`). Ne lève QUE si la mise en file locale elle-même a
 * échoué (`OutboxPersistenceError` — localStorage indisponible/plein) : c'est la SEULE situation où
 * l'appelant doit afficher une vraie erreur, puisque c'est la seule où l'action est réellement en
 * risque de perte.
 *
 * L'appelant reste responsable de refléter le changement dans le store client (optimiste, pour que
 * le reste de l'app — ex. `suggestion()` lisant `settings.bodyWeightKg` — voie la valeur à jour
 * immédiatement, y compris hors-ligne) : `writeThrough` ne fait QUE la resync serveur, pas l'état
 * local (séparation des responsabilités, comme le store `hydrate()` vs les server actions).
 */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Erreur métier déterministe : retenter plus tard ne changera rien (par exemple supprimer un
 * exercice encore référencé par l'historique). Elle ne doit surtout pas entrer dans l'outbox :
 * comme la file est causale/FIFO, une telle opération impossible bloquerait définitivement toutes
 * les écritures placées derrière elle.
 */
export class PermanentMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentMutationError";
  }
}

/**
 * Au-delà, l'écriture directe passe dans la file au lieu de faire attendre l'écran (réglages
 * rapides d'un exercice en séance, charge max) : en 3G muette, l'appel ne revenait jamais et le
 * bouton restait sur « Enregistrement… » (08/10/2026). L'appel parti continue ; les Server Actions
 * d'une page passent une par une dans la file du routeur Next, donc le rejeu de la file arrive
 * toujours APRÈS lui et ne peut pas être écrasé par sa réponse tardive.
 */
export const DIRECT_WRITE_BUDGET_MS = 5_000;

async function directWithinBudget(direct: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Réseau trop lent : écriture mise en file.")), DIRECT_WRITE_BUDGET_MS);
  });
  try {
    await Promise.race([direct(), budget]);
  } finally {
    clearTimeout(timer);
  }
}

async function performWriteThrough(op: OutboxOp, direct: () => Promise<void>): Promise<void> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // Une file non vide matérialise un ordre causal. Ne jamais faire passer la nouvelle écriture
  // directement devant une opération plus ancienne qui attend encore sa confirmation.
  const alreadyQueued = pendingCount() > 0;
  if (!offline && !alreadyQueued) {
    try {
      await directWithinBudget(direct);
      // L'écriture serveur est déjà confirmée. L'acquittement local est un nettoyage défensif
      // (multi-onglet/race) et ne doit jamais transformer ce succès en faux échec si localStorage
      // devient indisponible entre-temps.
      try {
        acknowledgeDirectSuccess(op);
      } catch {
        // Un prochain flush idempotent reste sûr ; le serveur a déjà reçu la valeur courante.
      }
      return;
    } catch (error) {
      if (error instanceof PermanentMutationError) throw error;
      // Réseau probable mais l'appel a échoué quand même (latence, Neon KO…) — tombe dans la file.
    }
  }
  enqueue(op); // peut lever OutboxPersistenceError — remonte intentionnellement à l'appelant.
  useSyncStatus.getState().setPending(pendingCount());
}

/** Sérialise aussi les écritures directes : deux taps rapides ne doivent jamais arriver en DB à
 * l'envers (ancien réglage qui termine après le nouveau et l'écrase). */
export function writeThrough(op: OutboxOp, direct: () => Promise<void>): Promise<void> {
  const task = writeChain.catch(() => undefined).then(() => performWriteThrough(op, direct));
  writeChain = task;
  return task;
}

/**
 * Écriture faite EN SÉANCE (autosave, exercice créé en salle) : jamais d'attente réseau. La copie
 * locale (store + outbox) est la garantie ; le rejeu part aussitôt en arrière-plan
 * (`SyncProvider`, événement `jeera:sync-needed`) avec son délai borné. Avant le 08/10/2026, ces
 * écritures attendaient une Server Action : en 3G, « Création… » tournait sans fin pendant que la
 * file d'actions du routeur Next restait bloquée derrière la précédente. Lève seulement si la file
 * locale elle-même n'a pas pu être écrite (`OutboxPersistenceError`).
 */
export function queueWrite(op: OutboxOp): void {
  enqueue(op);
  useSyncStatus.getState().setPending(pendingCount());
  if (typeof window !== "undefined") window.dispatchEvent(new Event("jeera:sync-needed"));
}
