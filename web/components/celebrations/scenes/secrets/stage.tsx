"use client";

import type { ReactNode } from "react";
import { Backdrop, Caption, CornerFrame, SceneLayout } from "../../kit";

/**
 * Cadre commun des secrets : voile teinté, équerres de coin (la signature « secret »), légende
 * « Secret découvert ». La scène elle-même (emblème, couleur, chorégraphie) est propre à chaque
 * secret, dans son fichier.
 */
export function SecretStage({
  tint,
  accent,
  title,
  description,
  children,
  captionDelay = 1.2,
  veil = 0.9,
}: {
  tint: string;
  accent: string;
  title: string;
  description: string;
  children: ReactNode;
  captionDelay?: number;
  veil?: number;
}) {
  return (
    <>
      <Backdrop tint={tint} veil={veil} />
      <SceneLayout caption={<Caption kicker="Secret découvert" title={title} sub={description} accent={accent} delay={captionDelay} />}>
        <CornerFrame color={accent} size={300} />
        {children}
      </SceneLayout>
    </>
  );
}

export interface SecretProps {
  title: string;
  description: string;
}

/** Étoile à cinq branches centrée sur (0, 0). */
export function starPath(outer: number, inner = outer * 0.45): string {
  return (
    Array.from({ length: 10 }, (_, index) => {
      const radius = index % 2 ? inner : outer;
      const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;
      return `${index ? "L" : "M"}${(Math.cos(angle) * radius).toFixed(1)} ${(Math.sin(angle) * radius).toFixed(1)}`;
    }).join(" ") + "Z"
  );
}
