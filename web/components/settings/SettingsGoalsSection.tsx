"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";
import { setGoals } from "@/lib/db/actions";
import { MUSCLE_PARENTS, parentDisplayName, type MuscleParent } from "@/lib/models/muscles";
import type { MuscleGoal } from "@/lib/models/types";

function toMap(list: MuscleGoal[]): Record<MuscleParent, number> {
  const map = {} as Record<MuscleParent, number>;
  for (const p of MUSCLE_PARENTS) map[p] = 0;
  for (const g of list) map[g.parent] = g.weeklyGoalSets;
  return map;
}

/**
 * Objectifs hebdomadaires (sets) — un Stepper par MuscleParent, sauvegarde via
 * setGoals. Pas d'état local mirroré : les valeurs viennent directement de
 * `goals` (source de vérité = store, mis à jour de façon optimiste par
 * `hydrate` après revalidation serveur). Un override optimiste local absorbe
 * le round-trip réseau entre le clic et la ré-hydratation.
 */
export function SettingsGoalsSection({ goals }: { goals: MuscleGoal[] }) {
  const [pending, setPending] = useState<Record<MuscleParent, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const values = pending ?? toMap(goals);

  async function update(parent: MuscleParent, value: number) {
    const next = { ...values, [parent]: value };
    setPending(next);
    setSaving(true);
    setSaved(false);
    const goalList: MuscleGoal[] = MUSCLE_PARENTS.map((p) => ({ parent: p, weeklyGoalSets: next[p] }));
    await setGoals(goalList);
    setSaving(false);
    setSaved(true);
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Objectifs hebdo (sets)</p>
        {saving && <span className="text-[0.65rem] text-[--color-fg-faint]">Enregistrement…</span>}
        {!saving && saved && <span className="text-[0.65rem] text-emerald-300">Enregistré</span>}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {MUSCLE_PARENTS.map((parent) => (
          <div key={parent} className="flex items-center justify-between gap-2">
            <span className="text-sm text-[--color-fg]">{parentDisplayName[parent]}</span>
            <Stepper value={values[parent]} onChange={(v) => update(parent, v)} min={0} max={40} className="scale-90" />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
