"use client";

import { useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";
import { updateSettings } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import { useWorkoutStore } from "@/lib/store/workout";
import { mergeSettingsPatch } from "@/lib/store/settings-write";
import type { UserSettings } from "@/lib/models/types";

const DEFAULT_WEIGHT = 75;

function restoreDurableBodyFields(current: UserSettings, durable: UserSettings): UserSettings {
  return {
    ...current,
    bodyWeightKg: durable.bodyWeightKg,
    gender: durable.gender,
    ageYears: durable.ageYears,
  };
}

/**
 * Poids de corps (kg) — désormais persisté EN BASE via `settings.bodyWeightKg`
 * (plus de localStorage front-only). Utilisé par le moteur pour les exercices
 * au poids du corps / lestés.
 */
export function SettingsBodySection({ settings }: { settings: UserSettings }) {
  const [profile, setProfile] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationVersion = useRef(0);
  const lastDurable = useRef<UserSettings>(settings);

  async function update(patch: Partial<Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears">>) {
    const version = ++mutationVersion.current;
    const previous = useWorkoutStore.getState().settings;
    // Toujours fusionner sur le singleton global FRAIS : la carte Préférences
    // peut avoir écrit entre deux rendus de ce draft local.
    const next = mergeSettingsPatch(previous, patch);
    setProfile(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    // OFFLINE_PWA_SPEC §4 (P4.4) — reflète TOUJOURS dans le store (suggestion() lit
    // `state.settings.bodyWeightKg`) avant même de savoir si Neon est joignable : une correction
    // offline (ex. le poids de corps à la salle sans réseau) doit s'appliquer immédiatement pour
    // le reste de la séance en cours, pas seulement après un retour réseau.
    useWorkoutStore.getState().setSettings(next);
    try {
      // Hors-ligne ou échec réseau -> mis en file (`lib/sync/outbox.ts`), rejoué par `SyncProvider`
      // au retour réseau. Ne lève que si même la mise en file locale a échoué.
      await writeThrough({ kind: "settings", settings: next }, () => updateSettings(next));
      lastDurable.current = next;
      if (version === mutationVersion.current) setSaved(true);
    } catch (cause) {
      // Le changement n'existe ni sur le serveur ni dans l'outbox. Annule
      // seulement si aucune mutation plus récente n'a remplacé cet objet.
      if (useWorkoutStore.getState().settings === next) {
        const current = useWorkoutStore.getState().settings;
        useWorkoutStore.getState().setSettings(restoreDurableBodyFields(current, lastDurable.current));
      }
      if (version === mutationVersion.current) {
        setProfile((current) => {
          if (current !== next) return current;
          return restoreDurableBodyFields(current, lastDurable.current);
        });
        setError(
          cause instanceof Error
            ? cause.message
            : "Impossible d'enregistrer le profil (ni en ligne, ni en file locale)."
        );
      }
    } finally {
      if (version === mutationVersion.current) setSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Corps</p>
        {saving && <span className="text-[0.65rem] text-[--color-fg-faint]">Enregistrement…</span>}
        {!saving && saved && <span className="text-[0.65rem] text-emerald-300">Enregistré</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-[--color-fg]">Poids de corps</span>
        <Stepper
          value={profile.bodyWeightKg ?? DEFAULT_WEIGHT}
          onChange={(bodyWeightKg) => void update({ bodyWeightKg })}
          step={0.5}
          min={30}
          max={250}
          suffix="kg"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-[--color-fg-muted]">
          Sexe du profil benchmark
          <select
            value={profile.gender ?? ""}
            onChange={(event) => {
              const gender = event.target.value === "male" || event.target.value === "female" ? event.target.value : null;
              void update({ gender });
            }}
            className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#11131a] px-3 text-sm text-[--color-fg]"
          >
            <option value="">Non renseigné</option>
            <option value="male">Homme</option>
            <option value="female">Femme</option>
          </select>
        </label>
        <label className="text-xs text-[--color-fg-muted]">
          Âge
          <input
            type="number"
            min={10}
            max={120}
            value={profile.ageYears ?? ""}
            onChange={(event) => {
              const parsed = event.target.value === "" ? null : Number(event.target.value);
              setProfile((current) => ({ ...current, ageYears: parsed }));
            }}
            onBlur={() => {
              const ageYears = profile.ageYears;
              if (
                ageYears === null ||
                (Number.isFinite(ageYears) && Number.isInteger(ageYears) && ageYears >= 10 && ageYears <= 120)
              ) {
                void update({ ageYears });
              } else {
                // `min`/`max` HTML n'empêchent pas la saisie manuelle d'une
                // valeur invalide. Ne pas la laisser contaminer la prochaine
                // écriture complète du singleton.
                setProfile((current) => ({
                  ...current,
                  ageYears: useWorkoutStore.getState().settings.ageYears,
                }));
                setError("L'âge doit être un entier entre 10 et 120 ans.");
              }
            }}
            className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-[--color-fg]"
          />
        </label>
      </div>
      <p className="mt-2 text-[0.68rem] text-[--color-fg-faint]">
        Ces champs contextualisent les repères de force; ils ne créent aucun benchmark pour une modalité inconnue.
      </p>
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    </GlassCard>
  );
}
