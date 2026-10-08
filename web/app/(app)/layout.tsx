import { StoreHydrator } from "@/components/providers/StoreHydrator";
import { ModeProvider } from "@/components/providers/ModeProvider";
import { SyncProvider } from "@/components/providers/SyncProvider";
import { BarbisProfileWatcher } from "@/components/providers/BarbisProfileWatcher";
import { SyncAlertBanner } from "@/components/sync/SyncAlertBanner";
import { TabBar } from "@/components/ui/TabBar";
import { CelebrationHost } from "@/components/celebrations/CelebrationHost";

/**
 * Shell applicatif STATIQUE (08/10/2026) : aucune donnée dedans. Il s'affiche depuis le cache du
 * service worker sans attendre le réseau, l'écran se remplit depuis le stockage local, puis
 * `StoreHydrator` lit Neon en arrière-plan (`GET /api/data`, qui revérifie la session : la lecture
 * sensible a quitté ce fichier). Les onglets, statiques eux aussi, sont préchargés par les liens de
 * la barre et changent sans aller-retour serveur.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModeProvider>
      <StoreHydrator />
      <SyncProvider>
        <BarbisProfileWatcher />
        <div className="flex-1 flex flex-col min-h-full">
          {/* padding-bottom = hauteur de la TabBar sticky, pour que le contenu ne passe jamais dessous */}
          <SyncAlertBanner />
          <div className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</div>
          <TabBar />
          <CelebrationHost />
        </div>
      </SyncProvider>
    </ModeProvider>
  );
}
