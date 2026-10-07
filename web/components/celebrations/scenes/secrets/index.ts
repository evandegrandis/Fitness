import type { ComponentType } from "react";

/** Une mise en scène par secret (identifiant de `career-secrets.ts`), remplies au lot J2. */
export const SECRET_SCENES: Record<string, { Component: ComponentType<{ title: string; description: string }>; duration: number }> = {};
