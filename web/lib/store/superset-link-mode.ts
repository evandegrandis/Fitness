import { create } from "zustand";
import type { WorkoutSession } from "@/lib/models/types";
import { useWorkoutStore } from "@/lib/store/workout";

/**
 * Mode « lier en superset » : armer un exercice (bouton lien d'une carte) attend un second tap sur un
 * autre exercice. 15/10/2026, Evan en séance : « ce truc est resté super longtemps ». Le mode n'avait
 * aucune fin : il survivait à une série validée, à un changement d'onglet et même à un rechargement.
 *
 * Il s'arrête maintenant dès qu'Evan fait autre chose, et le bandeau dit pourquoi en une ligne, au
 * même endroit, le temps de la lire :
 * - une série validée (sur l'exercice armé ou un exercice qu'on ne peut pas lier : sur une carte
 *   qu'on peut lier, tout tap lie, comme avant) : il est passé à autre chose ;
 * - un tap hors des exercices qu'on peut lier et hors du bandeau (`isSupersetLinkTap`) ;
 * - 15 s sans choix (`SUPERSET_LINK_TIMEOUT_MS`).
 * Sans message : « Annuler », un superset créé, l'écran de séance quitté (changement d'onglet, fin
 * de séance), l'exercice armé retiré.
 */

/**
 * 15 s. Lier, c'est deux taps et au plus un défilement de quelques cartes (une séance tient en
 * 6 à 10 cartes repliées) : quelques secondes suffisent, 15 s en laissent deux à trois fois plus,
 * sans presser. Au-delà, le bandeau redevient « le truc qui reste ». Une fin trop tôt ne coûte
 * qu'un tap pour réarmer. Pour comparer : le toast « Annuler » d'une suppression reste 6 s.
 */
export const SUPERSET_LINK_TIMEOUT_MS = 15_000;

/** Durée d'affichage de la raison de fin : une ligne courte se lit en moins de 2 s. */
export const SUPERSET_LINK_NOTICE_MS = 2_600;

/** Attribut posé sur ce qui fait partie du geste de liaison : un tap dessus ne l'annule pas. */
export const SUPERSET_LINK_ZONE_ATTR = "data-superset-link";

export type SupersetLinkEndReason = "set_logged" | "tap_elsewhere" | "timeout";

/** La raison, en mots d'Evan, affichée sous « Superset annulé ». */
export const SUPERSET_LINK_END_REASONS: Record<SupersetLinkEndReason, string> = {
  set_logged: "Tu as validé une série",
  tap_elsewhere: "Tu as touché ailleurs",
  timeout: "Aucun exercice choisi en 15 s",
};

export type SupersetLinkNotice = { id: number; reason: SupersetLinkEndReason };

/** Raison de la dernière fin automatique, lue par le bandeau. Jamais persistée. */
export const useSupersetLinkNotice = create<{ notice: SupersetLinkNotice | null }>(() => ({ notice: null }));

let noticeSeq = 0;

/**
 * Arrête le mode s'il est armé. `"silent"` : fin voulue ou évidente (Annuler, écran quitté), rien à
 * expliquer. Renvoie `true` si le mode était armé.
 */
export function endSupersetLinkMode(reason: SupersetLinkEndReason | "silent"): boolean {
  if (useWorkoutStore.getState().armedSupersetExerciseId === null) return false;
  useWorkoutStore.setState({ armedSupersetExerciseId: null });
  useSupersetLinkNotice.setState({ notice: reason === "silent" ? null : { id: ++noticeSeq, reason } });
  return true;
}

/** Retire la raison affichée, si c'est toujours celle-là. */
export function clearSupersetLinkNotice(id: number): void {
  if (useSupersetLinkNotice.getState().notice?.id === id) useSupersetLinkNotice.setState({ notice: null });
}

/**
 * Un tap fait-il partie du geste de liaison ? Oui sur le bandeau, sur une carte qu'on peut lier et
 * sur les boutons lien (leur propre clic gère le mode). Tout le reste l'annule. Un défilement ne
 * produit pas de clic : chercher la carte à lier en faisant défiler n'annule rien.
 */
export function isSupersetLinkTap(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  if (!element || typeof element.closest !== "function") return false;
  return element.closest(`[${SUPERSET_LINK_ZONE_ATTR}]`) != null;
}

function completedSetCount(session: WorkoutSession | null): number {
  if (!session) return 0;
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
}

/**
 * Surveille le mode tant que l'écran de séance est monté : délai, série validée, exercice armé
 * disparu. Renvoie le nettoyage, qui arrête aussi le mode (écran quitté = changement d'onglet ou
 * fin de séance). Les taps hors zone sont écoutés par le bandeau (`isSupersetLinkTap`).
 */
export function watchSupersetLinkMode(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  // Un mode trouvé armé à l'ouverture de l'écran n'a pas été armé ici : il tombe sans bruit.
  endSupersetLinkMode("silent");

  let armed = useWorkoutStore.getState().armedSupersetExerciseId;
  let sets = completedSetCount(useWorkoutStore.getState().active);

  const unsubscribe = useWorkoutStore.subscribe((state) => {
    const nextSets = completedSetCount(state.active);
    const setLogged = nextSets > sets;
    sets = nextSets;

    if (state.armedSupersetExerciseId !== null) {
      if (setLogged) {
        endSupersetLinkMode("set_logged");
        return;
      }
      if (!state.active?.exercises.some((exercise) => exercise.id === state.armedSupersetExerciseId)) {
        endSupersetLinkMode("silent");
        return;
      }
    }

    if (state.armedSupersetExerciseId === armed) return;
    armed = state.armedSupersetExerciseId;
    stopTimer();
    if (armed === null) return;
    // Nouvel armement : l'ancienne raison n'a plus lieu d'être, le délai repart.
    useSupersetLinkNotice.setState({ notice: null });
    timer = setTimeout(() => {
      timer = null;
      endSupersetLinkMode("timeout");
    }, SUPERSET_LINK_TIMEOUT_MS);
  });

  return () => {
    unsubscribe();
    stopTimer();
    endSupersetLinkMode("silent");
    useSupersetLinkNotice.setState({ notice: null });
  };
}
