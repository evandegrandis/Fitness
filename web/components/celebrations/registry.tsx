"use client";

import { Suspense, type ComponentType } from "react";
import { RANK_COLORS } from "@/lib/theme/tiers";
import { CREAM, GOLD } from "./kit";
import type { CelebrationEvent } from "./store";
import RankUpA from "./scenes/rank/RankUpA";
import RankUpB from "./scenes/rank/RankUpB";
import RankUpS from "./scenes/rank/RankUpS";
import { SECRET_SCENES } from "./scenes/secrets";
import { streakScene } from "./scenes/streak/pick";
import BeatenToast from "./toasts/BeatenToast";
import NearRankToast from "./toasts/NearRankToast";

/**
 * Registre : chaque événement trouve ici sa mise en scène, sa durée et s'il se ferme d'un tap.
 * En séance (passage de rang, bandeaux), rien ne capte le toucher : la saisie continue dessous.
 */
export interface SceneEntry {
  render: () => React.ReactNode;
  /** Durée avant fermeture automatique, en ms. */
  duration: number;
  /** Un tap ferme la scène (bilan, Progrès). En séance : jamais, elle laisse passer les touchers. */
  tap: boolean;
  label: string;
}

const RANK_SCENES: Record<"B" | "A" | "S", { Component: ComponentType; duration: number }> = {
  B: { Component: RankUpB, duration: 2100 },
  A: { Component: RankUpA, duration: 2450 },
  S: { Component: RankUpS, duration: 3000 },
};

export function sceneEntry(event: CelebrationEvent): SceneEntry | null {
  switch (event.kind) {
    case "rank-up": {
      const { Component, duration } = RANK_SCENES[event.letter];
      return { render: () => <Component />, duration, tap: false, label: `Rang ${event.letter} atteint` };
    }
    case "streak": {
      const scene = streakScene(event.count);
      if (!scene) return null;
      const { Component, duration } = scene;
      return {
        render: () => (
          <Suspense fallback={null}>
            <Component count={event.count} />
          </Suspense>
        ),
        duration,
        tap: true,
        label: event.count === 1 ? "Premier rang S" : `${event.count} rangs S d'affilée`,
      };
    }
    case "secret": {
      const scene = SECRET_SCENES[event.id];
      if (!scene) return null;
      const { Component, duration } = scene;
      return { render: () => <Component title={event.title} description={event.description} />, duration, tap: true, label: `Secret découvert : ${event.title}` };
    }
    default:
      return null;
  }
}

export interface ToastEntry {
  render: () => React.ReactNode;
  duration: number;
  label: string;
  /** Lueur du haut de l'écran derrière le bandeau : l'œil la capte même s'il regarde ailleurs. */
  tint: string;
}

export function toastEntry(event: CelebrationEvent): ToastEntry | null {
  switch (event.kind) {
    case "near-rank":
      return { render: () => <NearRankToast event={event} />, duration: 2900, label: `Rang ${event.letter} en vue`, tint: RANK_COLORS[event.letter] };
    case "beaten":
      return {
        render: () => <BeatenToast event={event} />,
        duration: event.combo >= 5 ? 2400 : 2000,
        label: event.combo >= 2 ? `Combo ${event.combo}` : "Suggestion battue",
        tint: event.combo >= 2 ? GOLD : CREAM,
      };
    default:
      return null;
  }
}
