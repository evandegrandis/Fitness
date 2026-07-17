"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";
import { updateSettings } from "@/lib/db/actions";
import type { UserSettings } from "@/lib/models/types";

const DEFAULT_WEIGHT = 75;

/**
 * Poids de corps (kg) — désormais persisté EN BASE via `settings.bodyWeightKg`
 * (plus de localStorage front-only). Utilisé par le moteur pour les exercices
 * au poids du corps / lestés.
 */
export function SettingsBodySection({ settings }: { settings: UserSettings }) {
  const [weight, setWeight] = useState<number>(settings.bodyWeightKg ?? DEFAULT_WEIGHT);
  const [saved, setSaved] = useState(false);

  async function update(next: number) {
    setWeight(next);
    setSaved(false);
    await updateSettings({ ...settings, bodyWeightKg: next });
    setSaved(true);
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Corps</p>
        {saved && <span className="text-[0.65rem] text-emerald-300">Enregistré</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-[--color-fg]">Poids de corps</span>
        <Stepper value={weight} onChange={update} step={0.5} min={30} max={250} suffix="kg" />
      </div>
    </GlassCard>
  );
}
