import { getInitialDataResult } from "@/lib/data";
import { requireAuthenticatedSession } from "@/lib/auth";

/**
 * Données de référence du téléphone (catalogue, historique, objectifs, réglages…), lues en arrière-
 * plan APRÈS l'affichage. Elles voyageaient auparavant dans le HTML de chaque page (983 Ko bruts,
 * 101 Ko compressés au 08/10/2026) : en 3G, l'app restait sur un écran noir tant que ce document
 * n'était pas arrivé. La page s'affiche désormais depuis le stockage local, puis ce snapshot
 * rafraîchit le cache (`components/providers/StoreHydrator.tsx`).
 *
 * Même exposition que les pages d'avant (qui contenaient ces données) ; même garde que le layout :
 * le proxy refuse sans cookie, et la session est revérifiée ici.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAuthenticatedSession();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await getInitialDataResult();
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
