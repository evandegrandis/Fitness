import { notFound } from "next/navigation";
import { CelebrationsPreview } from "@/components/celebrations/preview/CelebrationsPreview";

/**
 * Aperçu des célébrations, en développement seulement (introuvable en production, lié nulle part).
 * `?play=rank-S` joue une scène au chargement (captures) ; `?secrets=1` montre la section des
 * secrets, cachée par défaut : Evan les découvre en jouant.
 */
export default async function CelebrationsPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return <CelebrationsPreview play={params.play ?? null} showSecrets={params.secrets === "1"} />;
}
