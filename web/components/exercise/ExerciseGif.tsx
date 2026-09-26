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
 * de séance (pour ne pas alourdir le geste de log). `immediate` : la démo a déjà été demandée
 * (bouton « Démo » du menu d'exercice), elle se charge sans second tap.
 *
 * Les animations sont distribuées en 180×180 seulement (conditions de Gym visual, qui en détient
 * les droits, avec crédit obligatoire) : affichées à 1,5× au plus pour rester nettes, jamais
 * agrandies par un autre moyen.
 */
export function ExerciseGif({ exerciseName, immediate = false }: { exerciseName: string; immediate?: boolean }) {
  const url = exerciseGifUrl(exerciseName);
  const [shown, setShown] = useState(immediate);
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
        className="glass flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-(--color-fg-muted) active:scale-[0.98] transition"
      >
        <Film size={15} />
        Voir la démonstration
      </button>
    );
  }

  return (
    <div className="glass mx-auto w-full max-w-[270px] overflow-hidden rounded-xl">
      <div className="relative grid aspect-square w-full place-items-center bg-black/20">
        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center text-(--color-fg-faint)">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {state === "error" ? (
          <p className="px-6 text-center text-xs text-(--color-fg-faint)">
            Démo indisponible pour l&apos;instant (pas de réseau ?). Réessaie une fois connecté.
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Démonstration : ${exerciseName}`}
            // PAS de loading="lazy" : l'image naît à l'intérieur d'une feuille modale qui entre en
            // translation, donc hors viewport au montage. Le navigateur différait le chargement
            // et ne le déclenchait jamais — le GIF restait invisible. Le report est de toute façon
            // déjà assuré par le clic sur « Voir la démonstration ».
            onLoad={() => setState("ok")}
            onError={() => setState("error")}
            className="h-full w-full object-contain"
            style={{ opacity: state === "ok" ? 1 : 0, transition: "opacity 0.2s" }}
          />
        )}
      </div>
      <p className="px-3 py-1.5 text-[0.65rem] text-(--color-fg-faint)">
        Démo générique · © Gym visual, gymvisual.com
      </p>
    </div>
  );
}
