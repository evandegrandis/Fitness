import type { InitialDataSource } from "@/lib/data";

export interface SnapshotFreshnessInput {
  source: InitialDataSource;
  fetchedAt: string;
  lastAppliedAt: string | null;
  hasPendingOutbox: boolean;
}

/**
 * Décide si les données SSR peuvent remplacer le cache offline.
 *
 * Le timestamp voyage dans le HTML/RSC : si le service worker ressort un ancien document tout en
 * laissant `navigator.onLine === true`, son watermark reste ancien et ne peut donc pas écraser une
 * copie locale plus récente. Une outbox non vide gagne toujours, car elle contient par définition
 * une intention locale qui n'existe pas encore dans le snapshot serveur.
 */
export function shouldApplyServerSnapshot(input: SnapshotFreshnessInput): boolean {
  if (input.source === "unavailable" || input.hasPendingOutbox) return false;
  const fetchedAtMs = Date.parse(input.fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) return false;
  if (input.lastAppliedAt === null) return true;
  const lastAppliedAtMs = Date.parse(input.lastAppliedAt);
  if (!Number.isFinite(lastAppliedAtMs)) return true;
  return fetchedAtMs > lastAppliedAtMs;
}
