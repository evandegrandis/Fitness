import type { ComponentType } from "react";

/** Mises en scène de la série de S, remplies au lot J1. */
export const STREAK_SCENES: Record<number, { Component: ComponentType<{ count: number }>; duration: number }> = {};
