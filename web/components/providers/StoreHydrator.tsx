"use client";

import { useEffect, useRef } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import type { AllData } from "@/lib/db/queries";
import type { InitialDataSource } from "@/lib/data";
import { shouldApplyServerSnapshot } from "@/lib/data/snapshot-freshness";
import { pendingCount } from "@/lib/sync/outbox";
import { sessionsNewestFirst } from "@/lib/models/types";

/**
 * Hydrate le store client : réhydrate d'abord le cache offline depuis
 * localStorage (persist skipHydration, P4.1), PUIS injecte les données de
 * référence lues côté serveur — DANS CET ORDRE, attendu explicitement
 * (OFFLINE_PWA_SPEC §3, P4.2). Le snapshot serveur ne remplace ensuite le cache
 * que s'il est strictement plus récent que le watermark local et qu'aucune
 * écriture n'attend dans l'outbox. Cela couvre notamment un vieux HTML/RSC
 * ressorti du service worker alors que `navigator.onLine` vaut encore `true`.
 * Si `data` est vide/absent
 * (Neon injoignable hors-ligne, `getInitialData` § P4.2), on n'appelle PAS
 * `hydrate()` du tout : le cache réhydraté par `persist.rehydrate()` reste
 * la seule source pour cette session (jamais écrasé par un résultat indisponible, C2).
 */
export function StoreHydrator({
  data,
  source,
  fetchedAt,
}: {
  data: AllData;
  source: InitialDataSource;
  fetchedAt: string;
}) {
  // Conserver la Promise (et pas seulement un booléen) évite une course en React Strict Mode :
  // le second passage de l'effet doit attendre la réhydratation lancée par le premier avant
  // d'envisager d'appliquer le snapshot SSR.
  const rehydration = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!rehydration.current) {
        rehydration.current = Promise.resolve(useWorkoutStore.persist.rehydrate());
      }
      await rehydration.current;
      if (cancelled) return;
      // `navigator.onLine` n'est qu'un indice. Le watermark bloque aussi le cas plus trompeur où il
      // vaut `true` alors que le SW vient de servir un vieux HTML/RSC. Une outbox illisible est
      // traitée comme non vide : mieux vaut garder le cache que risquer d'écraser une intention.
      if (navigator.onLine === false) return;
      let hasPendingOutbox = true;
      try {
        hasPendingOutbox = pendingCount() > 0;
      } catch {
        hasPendingOutbox = true;
      }
      const before = useWorkoutStore.getState();
      if (!shouldApplyServerSnapshot({
        source,
        fetchedAt,
        lastAppliedAt: before.lastServerSnapshotAt,
        hasPendingOutbox,
      })) return;

      before.hydrate({
        catalog: data.exercises,
        history: sessionsNewestFirst(data.sessions),
        goals: data.goals,
        settings: data.settings,
        templates: data.templates,
        recoveryCheckins: data.recoveryCheckins,
        bodyWeights: data.bodyWeights,
      });
      // La copie locale de la séance active contient potentiellement des taps plus récents que
      // l'autosave Neon. Elle gagne toujours ; Neon ne sert qu'à restaurer un navigateur vierge.
      const active = useWorkoutStore.getState().active ?? data.activeSession;
      useWorkoutStore.setState({ active, lastServerSnapshotAt: fetchedAt });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [data, source, fetchedAt]);

  return null;
}
