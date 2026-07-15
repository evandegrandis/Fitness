"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";

const STORAGE_KEY = "user_body_weight_kg";
const DEFAULT_WEIGHT = 75;

function readStoredWeight(): number {
  if (typeof window === "undefined") return DEFAULT_WEIGHT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_WEIGHT;
  const parsed = Number(raw);
  return !Number.isNaN(parsed) && parsed > 0 ? parsed : DEFAULT_WEIGHT;
}

/**
 * Poids de corps (kg). `UserSettings` n'a pas de champ dédié côté modèle
 * partagé (mirror strict du backup iOS) — stocké dans `localStorage`, comme
 * spécifié, sous la même clé que côté app iOS. Lu de façon paresseuse dans
 * l'initialiseur de state (le composant n'est monté qu'après hydratation du
 * store parent, donc pas de risque de mismatch SSR ici).
 */
export function SettingsBodySection() {
  const [weight, setWeight] = useState<number>(readStoredWeight);

  function update(next: number) {
    setWeight(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <GlassCard>
      <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Corps</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-[--color-fg]">Poids de corps</span>
        <Stepper value={weight} onChange={update} step={0.5} min={30} max={250} suffix="kg" />
      </div>
    </GlassCard>
  );
}
