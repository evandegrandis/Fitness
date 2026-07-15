"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { updateSettings } from "@/lib/db/actions";
import type { UserSettings } from "@/lib/models/types";

/**
 * Préférences éditables : userName, incrément par défaut, repos par défaut,
 * repos superset, unités. État local initialisé une fois depuis `settings`
 * (formulaire "non contrôlé côté serveur" classique : la source de vérité
 * redevient le store seulement après un rechargement complet de page/route).
 */
export function SettingsPreferencesSection({ settings }: { settings: UserSettings }) {
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function persist(next: UserSettings) {
    setDraft(next);
    setSaving(true);
    setSaved(false);
    await updateSettings(next);
    setSaving(false);
    setSaved(true);
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Préférences</p>
        {saving && <span className="text-[0.65rem] text-[--color-fg-faint]">Enregistrement…</span>}
        {!saving && saved && <span className="text-[0.65rem] text-emerald-300">Enregistré</span>}
      </div>

      <div className="mt-3 flex flex-col gap-4">
        <div>
          <label className="text-xs text-[--color-fg-muted]">Nom</label>
          <input
            value={draft.userName}
            onChange={(e) => setDraft({ ...draft, userName: e.target.value })}
            onBlur={() => persist(draft)}
            placeholder="Ton prénom"
            className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
          />
        </div>

        <div>
          <label className="text-xs text-[--color-fg-muted]">Unités</label>
          <div className="mt-1.5">
            <SegmentedControl
              layoutId="units-segmented"
              value={draft.usesKilograms ? "kg" : "lb"}
              onChange={(v) => persist({ ...draft, usesKilograms: v === "kg" })}
              options={[
                { value: "kg", label: "Kilogrammes" },
                { value: "lb", label: "Livres" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-[--color-fg]">Incrément par défaut</span>
          <Stepper
            value={draft.defaultSmallestIncrement}
            onChange={(v) => persist({ ...draft, defaultSmallestIncrement: v })}
            step={0.5}
            min={0.5}
            max={25}
            suffix="kg"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-[--color-fg]">Repos par défaut</span>
          <Stepper
            value={draft.defaultRestTimerSeconds}
            onChange={(v) => persist({ ...draft, defaultRestTimerSeconds: v })}
            step={15}
            min={30}
            max={300}
            suffix="s"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-[--color-fg]">Repos superset</span>
          <Stepper
            value={draft.supersetRestSeconds}
            onChange={(v) => persist({ ...draft, supersetRestSeconds: v })}
            step={15}
            min={30}
            max={300}
            suffix="s"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stepper
            label="Reps min défaut"
            value={draft.defaultRepTargetMin}
            onChange={(v) => persist({ ...draft, defaultRepTargetMin: v })}
            min={1}
            max={draft.defaultRepTargetMax}
          />
          <Stepper
            label="Reps max défaut"
            value={draft.defaultRepTargetMax}
            onChange={(v) => persist({ ...draft, defaultRepTargetMax: v })}
            min={draft.defaultRepTargetMin}
            max={50}
          />
        </div>
      </div>
    </GlassCard>
  );
}
