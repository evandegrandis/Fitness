"use client";

import { useState } from "react";
import { Film, Loader2 } from "lucide-react";
import { exerciseGifUrl } from "@/lib/data/exercise-gifs";

/**
 * Démonstration animée (GIF) d'un exercice, chargée À LA DEMANDE.
 *
 * Contraintes respectées :
 * - AUCUN chargement tant que l'utilisateur ne tape pas "Voir la démo"
 *   (le GIF n'entre jamais dans le poids initial de la page).
 * - Hors-ligne (salle sans réseau) : le GIF ne se charge pas → on affiche
 *   un message discret au lieu d'une image cassée. Ne bloque jamais l'UI.
 * - Rendu uniquement si une correspondance sûre existe (sinon `null`).
 *
 * Placement : détail/éditeur d'exercice uniquement — jamais dans la liste
 * de séance (pour ne pas alourdir le geste de log).
 */
export function ExerciseGif({ exerciseName }: { exerciseName: string }) {
  const url = exerciseGifUrl(exerciseName);
  const [shown, setShown] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  if (!url) return null;

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => {
          setState("loading");
          setShown(true);
        }}
        className="glass flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[--color-fg-muted] active:scale-[0.98] transition"
      >
        <Film size={15} />
        Voir la démonstration
      </button>
    );
  }

  return (
    <div className="glass overflow-hidden rounded-xl">
      <div className="relative grid aspect-square w-full place-items-center bg-black/20">
        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center text-[--color-fg-faint]">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {state === "error" ? (
          <p className="px-6 text-center text-xs text-[--color-fg-faint]">
            Démo indisponible pour l&apos;instant (pas de réseau ?). Réessaie une fois connecté.
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Démonstration : ${exerciseName}`}
            loading="lazy"
            onLoad={() => setState("ok")}
            onError={() => setState("error")}
            className="h-full w-full object-contain"
            style={{ opacity: state === "ok" ? 1 : 0, transition: "opacity 0.2s" }}
          />
        )}
      </div>
      <p className="px-3 py-1.5 text-[0.65rem] text-[--color-fg-faint]">
        Démo générique · dataset communautaire (usage personnel)
      </p>
    </div>
  );
}
