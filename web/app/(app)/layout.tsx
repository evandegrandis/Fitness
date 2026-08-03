import { getInitialData } from "@/lib/data";
import { StoreHydrator } from "@/components/providers/StoreHydrator";
import { ModeProvider } from "@/components/providers/ModeProvider";
import { SyncProvider } from "@/components/providers/SyncProvider";
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
  const data = await getInitialData();

  return (
    <ModeProvider>
      <StoreHydrator data={data} />
      <SyncProvider>
        <div className="flex-1 flex flex-col min-h-full">
          {/* padding-bottom = hauteur de la TabBar sticky, pour que le contenu ne passe jamais dessous */}
          <div className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</div>
          <TabBar />
        </div>
      </SyncProvider>
    </ModeProvider>
  );
}
