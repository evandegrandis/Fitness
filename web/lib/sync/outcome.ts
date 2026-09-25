/**
 * Résultat typé d'une écriture de synchronisation.
 *
 * Pourquoi un résultat et pas une exception : en production, Next.js masque le
 * message d'une erreur levée par une Server Action (le client ne reçoit qu'un
 * digest). Le client ne pouvait donc pas distinguer « pas de réseau » (on
 * réessaie plus tard, dans l'ordre) de « le serveur refusera toujours cette
 * écriture » (violation de contrainte, donnée invalide). Du 20/08 au 17/09/2026,
 * une seule opération permanente en tête de file a ainsi bloqué toutes les
 * écritures suivantes, en silence, toutes les 30 secondes.
 *
 * Le serveur renvoie désormais un `SyncOutcome` : le client isole ce qui est
 * permanent (dead letter visible) et ne retient l'ordre causal que pour le
 * transitoire.
 */

export type SyncFailureKind = "transient" | "permanent";

export interface SyncFailure {
  ok: false;
  kind: SyncFailureKind;
  /** Code SQLSTATE Postgres (23503, 23514…) ou code applicatif ; null si inconnu. */
  code: string | null;
  message: string;
}

export type SyncOutcome = { ok: true } | SyncFailure;

/**
 * Refus du garde-fou de synchro (`lib/db/stale-writes.ts`) : le serveur avait une version plus
 * récente que l'écriture rejouée. Rien n'a été écrasé ; ce n'est pas une panne.
 */
export const STALE_WRITE_CODE = "stale_write";

/** Codes SQLSTATE dont un rejeu identique ne changera jamais l'issue. */
const PERMANENT_SQLSTATE_CLASSES = new Set(["22", "23", "42"]);

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  cause?: unknown;
}

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : {};
}

/**
 * Classe une erreur survenue côté serveur. Une violation d'intégrité (FK,
 * CHECK, unicité), une donnée mal typée ou une requête invalide sont
 * permanentes. Tout le reste (réseau, Neon indisponible, timeout, inconnu)
 * est transitoire : on préfère réessayer un vrai incident réseau que
 * d'abandonner une écriture par excès de prudence.
 */
export function classifySyncError(error: unknown): SyncFailure {
  const like = asErrorLike(error);
  const nested = asErrorLike(like.cause);
  const code = typeof like.code === "string" ? like.code : typeof nested.code === "string" ? nested.code : null;
  const detail = typeof like.detail === "string" ? like.detail : typeof nested.detail === "string" ? nested.detail : null;
  const baseMessage = typeof like.message === "string" && like.message ? like.message : String(error);
  const message = detail ? `${baseMessage} (${detail})` : baseMessage;
  if (like.name === "PermanentMutationError" || nested.name === "PermanentMutationError") {
    return { ok: false, kind: "permanent", code: code ?? "permanent_mutation", message };
  }
  if (code && code.length === 5 && PERMANENT_SQLSTATE_CLASSES.has(code.slice(0, 2))) {
    return { ok: false, kind: "permanent", code, message };
  }
  return { ok: false, kind: "transient", code, message };
}

export function isSyncFailure(value: unknown): value is SyncFailure {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}
