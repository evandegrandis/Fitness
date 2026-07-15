"use client";

import { useWorkoutStore } from "@/lib/store/workout";
import { QuickStart } from "@/components/workout/QuickStart";
import { ActiveSession } from "@/components/workout/ActiveSession";

/**
 * Route "/" — bascule QuickStart ↔ Séance active selon l'état du store.
 *
 * `hasHydratedStorage` démarre à `false` côté serveur ET au premier rendu
 * client (persist middleware `skipHydration: true`, flip async via
 * `onRehydrateStorage`), donc ce flag suffit à éviter tout flash SSR/CSR sans
 * état "monté" séparé.
 */
export default function SeancePage() {
  const active = useWorkoutStore((s) => s.active);
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);

  if (!hasHydratedStorage) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <div className="flex flex-col gap-4">
          <div className="h-14 w-2/3 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
        </div>
      </main>
    );
  }

  return active ? <ActiveSession session={active} /> : <QuickStart />;
}
