import { getInitialDataResult } from "@/lib/data";
import { requireAuthenticatedSession } from "@/lib/auth";
import { StoreHydrator } from "@/components/providers/StoreHydrator";
import { ModeProvider } from "@/components/providers/ModeProvider";
import { SyncProvider } from "@/components/providers/SyncProvider";
import { BarbisProfileWatcher } from "@/components/providers/BarbisProfileWatcher";
import { SyncAlertBanner } from "@/components/sync/SyncAlertBanner";
import { TabBar } from "@/components/ui/TabBar";

// Les séances changent hors du cycle de build (autosave, imports, backfills) :
// toujours hydrater depuis Neon au chargement, jamais depuis un HTML figé.
export const dynamic = "force-dynamic";

/**
 * Shell applicatif : lit les données initiales côté serveur, hydrate le store
 * client, applique le thème de mode, et pose la barre d'onglets.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proxy ne constitue qu'un garde optimiste. La session est revérifiée au plus près de la
  // lecture sensible afin qu'une mauvaise configuration ou un contournement de route ne puisse
  // jamais exposer le dataset complet.
  await requireAuthenticatedSession();
  const initial = await getInitialDataResult();

  return (
    <ModeProvider>
      <StoreHydrator data={initial.data} source={initial.source} fetchedAt={initial.fetchedAt} />
      <SyncProvider>
        <BarbisProfileWatcher />
        <div className="flex-1 flex flex-col min-h-full">
          {/* padding-bottom = hauteur de la TabBar sticky, pour que le contenu ne passe jamais dessous */}
          <SyncAlertBanner />
          <div className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</div>
          <TabBar />
        </div>
      </SyncProvider>
    </ModeProvider>
  );
}
