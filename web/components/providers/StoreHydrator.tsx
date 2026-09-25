"use client";

import { useEffect, useRef } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import type { AllData } from "@/lib/db/queries";
import type { InitialDataSource } from "@/lib/data";
import { shouldApplyServerSnapshot } from "@/lib/data/snapshot-freshness";
import { enqueue, pendingCount } from "@/lib/sync/outbox";
import {
  localExercisesRequiredBySessions,
  localSessionsMissingFromServer,
  mergeServerHistoryWithoutDroppingLocal,
} from "@/lib/sync/local-session-recovery";
import { sessionsNewestFirst } from "@/lib/models/types";

const EMERGENCY_BACKUP_KEY = "jeera-workout-store-emergency-backup-2026-08-30";
const WORKOUT_STORE_KEY = "jeera-workout-store";
const SYNC_NEEDED_EVENT = "jeera:sync-needed";

/** Copie immuable du store avant la première réconciliation de ce correctif. */
function preserveEmergencyLocalBackup(): boolean {
  try {
    const current = window.localStorage.getItem(WORKOUT_STORE_KEY);
    if (current && window.localStorage.getItem(EMERGENCY_BACKUP_KEY) === null) {
      window.localStorage.setItem(EMERGENCY_BACKUP_KEY, current);
      if (window.localStorage.getItem(EMERGENCY_BACKUP_KEY) !== current) return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
      // Avant toute comparaison avec Neon, fige une copie brute de localStorage. Si même cette
      // copie de sécurité échoue (quota/mode privé), on garde intégralement le store en mémoire et
      // on refuse l'hydratation : aucune séance locale ne peut être sacrifiée.
      if (!preserveEmergencyLocalBackup()) return;
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

      // Incident août 2026 : des séances finalisées existaient bien dans `history` sur le
      // téléphone, mais leur opération d'outbox n'existait plus. Le snapshot Neon (plus pauvre)
      // remplaçait alors le tableau local. On reconstruit ici une outbox ADDITIVE avant toute
      // hydratation. Les exercices créés hors-ligne passent d'abord pour respecter les FK.
      if (source === "database" && !hasPendingOutbox) {
        const missingSessions = localSessionsMissingFromServer(before.history, data.sessions);
        if (missingSessions.length > 0) {
          const missingExercises = localExercisesRequiredBySessions(
            missingSessions,
            before.catalog,
            data.exercises
          );
          try {
            for (const exercise of missingExercises) enqueue({ kind: "exercise_upsert", exercise });
            // L'heure de la séance, pas celle de la récupération : une séance supprimée depuis
            // sur le serveur ne revient pas (garde-fou de `sync-actions.ts`).
            for (const session of missingSessions) {
              enqueue({ kind: "session", session }, { intentAt: (session.endTime ?? session.date).getTime() });
            }
          } catch {
            // L'outbox n'a pas pu garantir la persistance : conserver le cache tel quel est la
            // seule réponse sûre. Aucun snapshot serveur ne sera appliqué dans ce passage.
            return;
          }
          // Le provider de sync peut avoir exécuté son effet juste avant celui-ci. L'événement
          // explicite évite d'attendre son polling de 30 s, avec le polling comme filet final.
          window.setTimeout(() => window.dispatchEvent(new Event(SYNC_NEEDED_EVENT)), 0);
          return;
        }
      }
      if (!shouldApplyServerSnapshot({
        source,
        fetchedAt,
        lastAppliedAt: before.lastServerSnapshotAt,
        hasPendingOutbox,
      })) return;

      before.hydrate({
        catalog: data.exercises,
        // Défense en profondeur : même si une séance locale apparaît entre la comparaison et
        // l'hydratation (autre onglet/race), un snapshot serveur ne peut plus la faire disparaître.
        history: sessionsNewestFirst(
          mergeServerHistoryWithoutDroppingLocal(data.sessions, before.history)
        ),
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
