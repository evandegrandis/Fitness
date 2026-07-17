"use client";

import { useState } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import { QuickStart } from "@/components/workout/QuickStart";
import { ActiveSession } from "@/components/workout/ActiveSession";
import { PostWorkoutSheet } from "@/components/workout/PostWorkoutSheet";
import type { WorkoutSession } from "@/lib/models/types";
import type { FinishedWorkoutSnapshot } from "@/lib/store/snapshot";

/**
 * Route "/" — bascule QuickStart ↔ Séance active. Le bilan post-séance vit ICI
 * (niveau page, toujours monté) et NON dans ActiveSession : sinon il se
 * démonterait à `finish()` (quand active repasse à null) et ne s'afficherait
 * jamais.
 */
export default function SeancePage() {
  const active = useWorkoutStore((s) => s.active);
  const hasHydratedStorage = useWorkoutStore((s) => s.hasHydratedStorage);
  const [finished, setFinished] = useState<{
    session: WorkoutSession;
    snapshot: FinishedWorkoutSnapshot;
  } | null>(null);

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

  return (
    <>
      {active ? <ActiveSession session={active} onFinished={setFinished} /> : <QuickStart />}
      <PostWorkoutSheet
        open={finished !== null}
        snapshot={finished?.snapshot ?? null}
        session={finished?.session ?? null}
        onClose={() => setFinished(null)}
      />
    </>
  );
}
