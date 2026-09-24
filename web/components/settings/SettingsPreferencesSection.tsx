"use client";

import { useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { updateSettings } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import { useWorkoutStore } from "@/lib/store/workout";
import { mergeSettingsPatch } from "@/lib/store/settings-write";
import type { UserSettings } from "@/lib/models/types";
import { CARDIO_GOAL } from "@/lib/engines/cardio";

function restoreDurablePreferenceFields(current: UserSettings, durable: UserSettings): UserSettings {
  return {
    ...current,
    usesKilograms: durable.usesKilograms,
    defaultSmallestIncrement: durable.defaultSmallestIncrement,
    defaultRestTimerSeconds: durable.defaultRestTimerSeconds,
    defaultRepTargetMin: durable.defaultRepTargetMin,
    defaultRepTargetMax: durable.defaultRepTargetMax,
    userName: durable.userName,
    supersetRestSeconds: durable.supersetRestSeconds,
    weeklyCardioMinutesGoal: durable.weeklyCardioMinutesGoal,
  };
}

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
  const [error, setError] = useState<string | null>(null);
  const mutationVersion = useRef(0);
  const lastDurable = useRef<UserSettings>(settings);

  async function persist(patch: Partial<UserSettings>) {
    const version = ++mutationVersion.current;
    const previous = useWorkoutStore.getState().settings;
    // Ne jamais réécrire l'objet `draft` complet : il peut précéder une
    // modification faite dans la carte Corps montée en parallèle.
    const next = mergeSettingsPatch(previous, patch);
    setDraft(next);
    // OFFLINE_PWA_SPEC §4 (P4.4) — reflète immédiatement dans le store, comme SettingsBodySection.
    useWorkoutStore.getState().setSettings(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Avant ce lot : `await updateSettings(next)` sans try/catch — hors-ligne, la promesse
      // rejetait sans jamais repasser `saving` à false (bouton bloqué sur "Enregistrement…" à
      // vie) ET l'action était perdue. `writeThrough` met en file au lieu de perdre l'action.
      await writeThrough({ kind: "settings", settings: next }, () => updateSettings(next));
      lastDurable.current = next;
      if (version === mutationVersion.current) setSaved(true);
    } catch (cause) {
      if (useWorkoutStore.getState().settings === next) {
        const current = useWorkoutStore.getState().settings;
        useWorkoutStore.getState().setSettings(
          restoreDurablePreferenceFields(current, lastDurable.current)
        );
      }
      if (version === mutationVersion.current) {
        setDraft((current) =>
          current === next ? restoreDurablePreferenceFields(current, lastDurable.current) : current
        );
        setError(cause instanceof Error ? cause.message : "Impossible de sécuriser les préférences.");
      }
    } finally {
      // Une réponse ancienne ne doit jamais annoncer « enregistré » ni
      // masquer le spinner de la mutation plus récente encore en attente.
      if (version === mutationVersion.current) setSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Préférences</p>
        {saving && <span className="text-[0.65rem] text-(--color-fg-faint)">Enregistrement…</span>}
        {!saving && saved && <span className="text-[0.65rem] text-emerald-300">Enregistré</span>}
      </div>

      <div className="mt-3 flex flex-col gap-4">
        <div>
          <label className="text-xs text-(--color-fg-muted)">Nom</label>
          <input
            value={draft.userName}
            onChange={(e) => setDraft({ ...draft, userName: e.target.value })}
            onBlur={() => persist({ userName: draft.userName })}
            placeholder="Ton prénom"
            className="glass mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-faint)"
          />
        </div>

        <div>
          <label className="text-xs text-(--color-fg-muted)">Unités</label>
          <div className="mt-1.5">
            <SegmentedControl
              layoutId="units-segmented"
              value={draft.usesKilograms ? "kg" : "lb"}
              onChange={(v) => persist({ usesKilograms: v === "kg" })}
              options={[
                { value: "kg", label: "Kilogrammes" },
                { value: "lb", label: "Livres" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-(--color-fg)">Incrément par défaut</span>
          <Stepper
            value={draft.defaultSmallestIncrement}
            onChange={(v) => persist({ defaultSmallestIncrement: v })}
            step={0.5}
            min={0.5}
            max={25}
            suffix="kg"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-(--color-fg)">Repos par défaut</span>
          <Stepper
            value={draft.defaultRestTimerSeconds}
            onChange={(v) => persist({ defaultRestTimerSeconds: v })}
            step={15}
            min={30}
            max={300}
            suffix="s"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-(--color-fg)">Objectif cardio / semaine</span>
          <Stepper
            value={draft.weeklyCardioMinutesGoal ?? CARDIO_GOAL.DEFAULT_WEEKLY_MINUTES}
            onChange={(v) => persist({ weeklyCardioMinutesGoal: v })}
            step={15}
            min={0}
            max={600}
            suffix="min"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-(--color-fg)">Repos superset</span>
          <Stepper
            value={draft.supersetRestSeconds}
            onChange={(v) => persist({ supersetRestSeconds: v })}
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
            onChange={(v) => persist({ defaultRepTargetMin: v })}
            min={1}
            max={draft.defaultRepTargetMax}
          />
          <Stepper
            label="Reps max défaut"
            value={draft.defaultRepTargetMax}
            onChange={(v) => persist({ defaultRepTargetMax: v })}
            min={draft.defaultRepTargetMin}
            max={50}
          />
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    </GlassCard>
  );
}
