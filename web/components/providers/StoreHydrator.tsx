"use client";

import { useEffect } from "react";
import { useWorkoutStore } from "@/lib/store/workout";
import type { InitialDataResult } from "@/lib/data";
import { fetchServerSnapshot } from "@/lib/data/server-snapshot";
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

/** Au plus un rafraîchissement par minute quand l'app revient au premier plan. */
const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 60_000;

/** Après une synchro réussie (`SyncProvider`) : relire Neon en arrière-plan. */
export const REFRESH_DATA_EVENT = "jeera:refresh-data";

/**
 * Hydrate le store client SANS attendre le réseau : réhydrate d'abord le cache offline depuis
 * localStorage (persist skipHydration, P4.1) et l'écran s'affiche aussitôt ; PUIS lit le snapshot
 * Neon en arrière-plan (`GET /api/data`, `lib/data/server-snapshot.ts`) et l'applique selon les
 * mêmes garde-fous qu'avant (OFFLINE_PWA_SPEC §3). Jusqu'au 08/10/2026, ce snapshot voyageait dans
 * le HTML de chaque page (983 Ko) : en 3G, rien ne s'affichait avant qu'il soit arrivé.
 *
 * Le snapshot ne remplace le cache que s'il est strictement plus récent que le watermark local et
 * qu'aucune écriture n'attend dans l'outbox. Indisponible (hors-ligne, délai dépassé, Neon KO) : on
 * n'appelle PAS `hydrate()`, le cache réhydraté reste la seule source (jamais écrasé par un
 * résultat indisponible, C2). Relu au retour du réseau, au retour au premier plan (au plus une fois
 * par minute) et après chaque synchro réussie.
 */
export function StoreHydrator() {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastAttemptAt = 0;

    async function apply(snapshot: InitialDataResult) {
      const { data, source, fetchedAt } = snapshot;
      // Avant toute comparaison avec Neon, fige une copie brute de localStorage. Si même cette
      // copie de sécurité échoue (quota/mode privé), on garde intégralement le store en mémoire et
      // on refuse l'hydratation : aucune séance locale ne peut être sacrifiée.
      if (!preserveEmergencyLocalBackup()) return;
      // Une outbox illisible est traitée comme non vide : mieux vaut garder le cache que risquer
      // d'écraser une intention.
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

    async function refresh() {
      if (inFlight || navigator.onLine === false) return;
      inFlight = true;
      lastAttemptAt = Date.now();
      try {
        const snapshot = await fetchServerSnapshot();
        if (snapshot && !cancelled) await apply(snapshot);
      } finally {
        inFlight = false;
      }
    }

    async function start() {
      await Promise.resolve(useWorkoutStore.persist.rehydrate());
      if (cancelled) return;
      const state = useWorkoutStore.getState();
      // Navigateur vierge (aucun cache) : rien de vrai à montrer avant Neon, le squelette reste
      // jusqu'à la première réponse (ou son échec), au lieu d'une app vide qui aurait l'air remise
      // à zéro.
      const emptyCache = state.lastServerSnapshotAt === null && state.catalog.length === 0 && state.history.length === 0;
      if (emptyCache) state.setHasHydratedStorage(false);
      try {
        await refresh();
      } finally {
        if (emptyCache && !cancelled) useWorkoutStore.getState().setHasHydratedStorage(true);
      }
    }

    const onOnline = () => void refresh();
    const onRefreshRequested = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAttemptAt > FOREGROUND_REFRESH_MIN_INTERVAL_MS) {
        void refresh();
      }
    };
    void start();
    window.addEventListener("online", onOnline);
    window.addEventListener(REFRESH_DATA_EVENT, onRefreshRequested);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener(REFRESH_DATA_EVENT, onRefreshRequested);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
