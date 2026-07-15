import { getInitialData } from "@/lib/data";
import { StoreHydrator } from "@/components/providers/StoreHydrator";
import { ModeProvider } from "@/components/providers/ModeProvider";
import { TabBar } from "@/components/ui/TabBar";

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
      <div className="flex-1 flex flex-col min-h-full">
        <div className="flex-1">{children}</div>
        <TabBar />
      </div>
    </ModeProvider>
  );
}
