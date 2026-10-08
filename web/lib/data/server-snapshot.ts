import type { InitialDataResult } from "@/lib/data";
import { reviveServerSnapshotDates } from "@/lib/store/workout";

/**
 * Lecture en arrière-plan du snapshot Neon (`GET /api/data`). Jamais bloquante pour l'affichage :
 * l'app s'est déjà rendue depuis le stockage local. Un réseau absent, lent au-delà du délai ou une
 * réponse illisible donnent `null` : le cache local reste la seule source jusqu'au prochain essai.
 */

/** En 3G faible, ~70 Ko compressés passent en 2 à 10 s ; au-delà, le réseau est inutilisable. */
export const SNAPSHOT_TIMEOUT_MS = 30_000;

export async function fetchServerSnapshot(timeoutMs: number = SNAPSHOT_TIMEOUT_MS): Promise<InitialDataResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/data", { cache: "no-store", signal: controller.signal });
    // Session expirée (app non publique) : la coquille vient du cache du service worker, qui ne
    // voit pas le cookie ; c'est ici que l'app apprend qu'il faut se reconnecter.
    if (response.status === 401) {
      window.location.assign(`/login?from=${encodeURIComponent(window.location.pathname)}`);
      return null;
    }
    if (!response.ok) return null;
    const body = (await response.json()) as InitialDataResult;
    if (!body || typeof body.fetchedAt !== "string" || !body.data) return null;
    return { ...body, data: reviveServerSnapshotDates(body.data) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
