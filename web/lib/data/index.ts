import { emptyAllData, getAllData, type AllData } from "@/lib/db/queries";
import { loadFullDatasetFromDisk } from "@/lib/data/build-dataset";

export type InitialDataSource = "database" | "disk" | "unavailable";

export interface InitialDataResult {
  data: AllData;
  source: InitialDataSource;
  /** Watermark du rendu serveur, conservé dans le HTML/RSC et comparé au cache client. */
  fetchedAt: string;
}

function result(data: AllData, source: InitialDataSource): InitialDataResult {
  return { data, source, fetchedAt: new Date().toISOString() };
}

/**
 * Données initiales pour hydrater l'app.
 * - Si une base est configurée (DATABASE_URL) → lecture DB.
 * - Sinon, en développement uniquement → fallback local depuis les JSON
 *   (33 séances complètes), pour que l'app soit utilisable sans DB.
 *
 * OFFLINE_PWA_SPEC §3 (P4.2) — cette fonction est appelée depuis un Server Component
 * `force-dynamic` (`app/(app)/layout.tsx`) : si Neon est injoignable (offline réel, outage,
 * latence), elle NE DOIT JAMAIS lever — sinon toute la page (y compris le shell + le JS client qui
 * lirait le cache localStorage, P4.1) plante au lieu de charger en mode dégradé. `getAllData()`
 * peut lever (le `Promise.all` interne rejette dès qu'une requête échoue) : on l'attrape et
 * on renvoie `emptyAllData()` avec la source explicite `unavailable`, à charge pour
 * `StoreHydrator` de préserver le cache déjà réhydraté. Une base réellement vide reste ainsi
 * distinguable d'une panne réseau.
 */
export async function getInitialDataResult(): Promise<InitialDataResult> {
  if (process.env.DATABASE_URL) {
    try {
      return result(await getAllData(), "database");
    } catch {
      return result(emptyAllData(), "unavailable");
    }
  }
  // Le dataset JSON embarque un historique utilisateur réel. Il est utile pour le développement
  // local, mais une prod mal configurée doit échouer fermée plutôt que de le servir par accident.
  if (process.env.NODE_ENV === "production") {
    return result(emptyAllData(), "unavailable");
  }
  try {
    return result(await loadFullDatasetFromDisk(), "disk");
  } catch {
    return result(emptyAllData(), "unavailable");
  }
}

/** Compatibilité pour les consommateurs qui ne font qu'une lecture ponctuelle. */
export async function getInitialData(): Promise<AllData> {
  return (await getInitialDataResult()).data;
}
