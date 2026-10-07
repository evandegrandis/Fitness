"use client";

import { useEffect, useMemo, useState } from "react";
import { BilanHero } from "@/components/workout/bilan/BilanHero";
import { BilanInsights } from "@/components/workout/bilan/BilanInsights";
import { useCareer } from "@/lib/hooks/use-career";
import { useWorkoutStore } from "@/lib/store/workout";
import type { WorkoutSession } from "@/lib/models/types";

/**
 * Le bilan d'une séance passée, tel qu'il était le soir même : recalculé sur les seules séances
 * d'avant (`debriefSession`), sans aucune séance postérieure. Une séance d'avant le 15/08/2026
 * (pas de suggestion enregistrée) montre ce qui existe, sans section vide.
 */
export function SessionBilan({ session }: { session: WorkoutSession }) {
  const sessionDebrief = useWorkoutStore((s) => s.sessionDebrief);
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  // Le parcours (rang) relit tout l'historique : lancé après le premier rendu de la page.
  const [careerReady, setCareerReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCareerReady(true), 120);
    return () => clearTimeout(id);
  }, []);
  const debrief = useMemo(() => {
    void history;
    void catalog;
    void goals;
    return sessionDebrief(session);
  }, [session, sessionDebrief, history, catalog, goals]);

  return (
    <div className="flex flex-col gap-3">
      {careerReady ? <SessionRank review={debrief.review} sessionId={session.id} /> : <div aria-hidden className="h-[108px]" />}
      <BilanInsights insights={debrief.insights} exercises={debrief.review.exercises} />
    </div>
  );
}

function SessionRank({ review, sessionId }: { review: Parameters<typeof BilanHero>[0]["review"]; sessionId: string }) {
  const careerSession = useCareer().bySession.get(sessionId);
  return <BilanHero review={review} rank={careerSession?.rank ?? null} unlocks={careerSession?.unlocks ?? []} />;
}
