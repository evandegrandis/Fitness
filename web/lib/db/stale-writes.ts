import { sql, type SQL } from "drizzle-orm";

import { db } from "./client";
import type { OutboxOp } from "@/lib/sync/outbox";
import { STALE_WRITE_CODE, type SyncFailure } from "@/lib/sync/outcome";

/**
 * Garde-fou de synchro : une écriture rejouée par l'outbox ne peut pas écraser une version plus
 * récente du serveur (DATA_SAFETY.md).
 *
 * Chaque écriture de la file porte l'heure où elle a été décidée sur l'appareil (`intentAt`).
 * Si la ligne visée a changé sur le serveur APRÈS cette heure (au-delà d'une tolérance pour
 * l'écart d'horloge du téléphone), elle est refusée : lettre morte visible, code `stale_write`,
 * que seul Evan peut rejouer. Une ligne supprimée après coup compte comme un changement (pierre
 * tombale dans `row_history`) : pas de résurrection.
 *
 * Incident du 26/09/2026 : un Safari resté sur son stockage du 16/09 a rejoué d'un coup des
 * écritures décidées en août. Les 39 premières étaient identiques au serveur ; les suivantes
 * auraient remis les objectifs, le poids et une fourchette de reps d'août.
 *
 * `updated_at` est tenu par la base (trigger `jeera_touch_updated_at`, migration 0016) : aucun
 * écrivain ne peut l'oublier.
 */
export const STALE_TOLERANCE_MS = 10 * 60_000;

/** Une écriture sans heure de décision vient d'une version de l'app antérieure au garde-fou. */
export function isStaleWrite(serverChangedAt: number | null, intentAt: number | undefined): boolean {
  if (serverChangedAt === null) return false;
  const decidedAt = typeof intentAt === "number" && Number.isFinite(intentAt) ? intentAt : 0;
  return serverChangedAt > decidedAt + STALE_TOLERANCE_MS;
}

function formatParis(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function staleWriteMessage(serverChangedAt: number, intentAt: number | undefined): string {
  const decided = typeof intentAt === "number" && Number.isFinite(intentAt) && intentAt > 0
    ? `décidée le ${formatParis(intentAt)}`
    : "venue d'une ancienne version de l'app";
  return `Le serveur a une version plus récente (modifiée le ${formatParis(serverChangedAt)}) que cette écriture ${decided} : mise de côté pour ne rien écraser.`;
}

const epochMs = (expression: SQL) => sql`(extract(epoch from ${expression}) * 1000)::float8`;

/** Heure de la dernière modification de la ligne, ou de sa suppression si `withTombstone`. */
function changedAtQuery(table: string, key: string, id: string, withTombstone: boolean): SQL {
  const row = sql`(SELECT updated_at FROM ${sql.identifier(table)} WHERE ${sql.identifier(key)} = ${id})`;
  if (!withTombstone) return epochMs(row);
  const tombstone = sql`(SELECT max(changed_at) FROM row_history WHERE table_name = ${table} AND row_key = ${id} AND op = 'DELETE')`;
  return epochMs(sql`greatest(${row}, ${tombstone})`);
}

function serverChangedAtQuery(op: OutboxOp): SQL {
  switch (op.kind) {
    case "session":
      return changedAtQuery("workout_sessions", "id", op.session.id, true);
    // Une suppression ne se heurte qu'à une modification plus récente ; déjà supprimée, elle ne fait rien.
    case "session_delete":
      return changedAtQuery("workout_sessions", "id", op.sessionId, false);
    case "exercise_upsert":
      return changedAtQuery("exercises", "id", op.exercise.id, true);
    case "exercise_delete":
      return changedAtQuery("exercises", "id", op.exerciseId, false);
    case "template_upsert":
      return changedAtQuery("workout_templates", "id", op.template.id, true);
    case "template_delete":
      return changedAtQuery("workout_templates", "id", op.templateId, false);
    case "settings":
      return epochMs(sql`(SELECT updated_at FROM user_settings WHERE id = 'singleton')`);
    case "goals":
      // La liste est remplacée d'un bloc : sa version est le plus récent de ses changements.
      return epochMs(sql`greatest((SELECT max(updated_at) FROM muscle_goals), (SELECT max(changed_at) FROM row_history WHERE table_name = 'muscle_goals'))`);
    case "recovery_checkin":
      return epochMs(sql`(SELECT updated_at FROM recovery_checkins WHERE date = ${op.checkin.date.toISOString()}::timestamptz)`);
    case "body_weight": {
      // Même normalisation que `saveBodyWeight` : une pesée par jour civil.
      const measured = op.entry.measuredOn;
      const day = new Date(Date.UTC(measured.getFullYear(), measured.getMonth(), measured.getDate()));
      return epochMs(sql`(SELECT updated_at FROM body_weights WHERE measured_on = ${day.toISOString()}::timestamptz)`);
    }
  }
}

/** Refus `stale_write` si le serveur a changé la cible après la décision, sinon null. */
export async function staleWriteFailure(op: OutboxOp, intentAt: number | undefined): Promise<SyncFailure | null> {
  const result = await db.execute<{ at: number | string | null }>(sql`SELECT ${serverChangedAtQuery(op)} AS at`);
  const raw = result.rows[0]?.at;
  const serverChangedAt = raw === null || raw === undefined ? null : Number(raw);
  if (serverChangedAt === null || !Number.isFinite(serverChangedAt) || !isStaleWrite(serverChangedAt, intentAt)) return null;
  return { ok: false, kind: "permanent", code: STALE_WRITE_CODE, message: staleWriteMessage(serverChangedAt, intentAt) };
}
