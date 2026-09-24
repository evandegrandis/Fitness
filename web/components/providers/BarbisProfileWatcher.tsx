"use client";

import { useEffect } from "react";
import { fetchExerciseProfiles } from "@/lib/db/profile-actions";
import { adoptServerProfile, BARBIS_WATCH, exercisesAwaitingBarbis } from "@/lib/integrations/barbis";
import { useWorkoutStore } from "@/lib/store/workout";
import { pendingCount } from "@/lib/sync/outbox";

/**
 * Fait arriver sur le téléphone, pendant la séance, le profil musculaire que Barbis a trouvé pour
 * une machine créée en salle. Rien ne s'affiche et rien ne s'interrompt : l'exercice se met à
 * compter pour ses muscles, et le cache local le garde hors-ligne.
 *
 * Ne tourne que si un exercice récent attend son profil, avec du réseau et une file vide : une
 * écriture locale en attente passe toujours avant (le serveur garde de toute façon le profil
 * le plus sûr).
 */
export function BarbisProfileWatcher() {
  useEffect(() => {
    let running = false;

    async function check() {
      if (running || navigator.onLine === false) return;
      let pending = 1;
      try {
        pending = pendingCount();
      } catch {
        return;
      }
      if (pending > 0) return;
      const state = useWorkoutStore.getState();
      const ids = exercisesAwaitingBarbis(state.catalog, state.history, state.active, new Date());
      if (ids.length === 0) return;
      running = true;
      try {
        const profiles = await fetchExerciseProfiles(ids);
        for (const remote of profiles) {
          const local = useWorkoutStore.getState().catalog.find((exercise) => exercise.id === remote.id);
          const adopted = local ? adoptServerProfile(local, remote) : null;
          if (adopted) useWorkoutStore.getState().upsertExerciseInCatalog(adopted);
        }
      } catch {
        // Réseau coupé en plein appel : le prochain passage réessaie.
      } finally {
        running = false;
      }
    }

    void check();
    const interval = setInterval(() => void check(), BARBIS_WATCH.INTERVAL_MS);
    const onOnline = () => void check();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
