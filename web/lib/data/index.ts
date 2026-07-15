import { getAllData, type AllData } from "@/lib/db/queries";
import { loadFullDatasetFromDisk } from "@/lib/data/build-dataset";

/**
 * Données initiales pour hydrater l'app.
 * - Si une base est configurée (DATABASE_URL) → lecture DB.
 * - Sinon (dev / avant provisioning Neon) → fallback local depuis les JSON
 *   (33 séances complètes), pour que l'app soit utilisable sans DB.
 */
export async function getInitialData(): Promise<AllData> {
  if (process.env.DATABASE_URL) {
    return getAllData();
  }
  try {
    return await loadFullDatasetFromDisk();
  } catch {
    return getAllData(); // renvoie des valeurs vides
  }
}
