"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { updateSettings } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import { useWorkoutStore } from "@/lib/store/workout";
import { mergeSettingsPatch } from "@/lib/store/settings-write";
import { TRAINING_PHASES, trainingPhaseDisplayName, type TrainingPhase } from "@/lib/models/enums";

/**
 * Phase d'entraînement déclarée.
 *
 * Elle ne touche AUCUNE suggestion de charge — le moteur reste dérivé de l'historique. Elle change
 * la lecture du résultat : en déficit, les charges stagnent ou reculent, et sans ce contexte le
 * détecteur de plateau lit une stagnation à corriger là où maintenir sa charge est justement le
 * résultat visé. L'app dirait « tu stagnes » pendant toute une sèche réussie.
 */
export function SettingsPhaseSection() {
  const settings = useWorkoutStore((s) => s.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(phase: TrainingPhase | null) {
    setSaving(true);
    setError(null);
    const previous = useWorkoutStore.getState().settings;
    // Changer de phase redémarre le compteur : la variation de poids se lit depuis ce jour-là.
    const startedAt =
      phase === null ? null : phase === previous.trainingPhase ? previous.trainingPhaseStartedAt : new Date();
    const next = mergeSettingsPatch(previous, { trainingPhase: phase, trainingPhaseStartedAt: startedAt });
    useWorkoutStore.getState().setSettings(next);
    try {
      await writeThrough({ kind: "settings", settings: next }, () => updateSettings(next));
    } catch {
      setError("Changement gardé en local, synchro au retour du réseau.");
    } finally {
      setSaving(false);
    }
  }

  const current = settings.trainingPhase;

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">Phase</p>
        {saving && <span className="text-[0.65rem] text-(--color-fg-faint)">Enregistrement…</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {TRAINING_PHASES.map((phase) => {
          const selected = current === phase;
          return (
            <button
              key={phase}
              type="button"
              onClick={() => choose(selected ? null : phase)}
              aria-pressed={selected}
              className="pill min-h-11 flex-1 justify-center"
              style={selected ? { color: "var(--accent)", background: "rgba(255,138,61,0.14)" } : undefined}
            >
              {trainingPhaseDisplayName[phase]}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-(--color-fg-muted)">
        {current === "cut"
          ? "Tenir ta charge compte comme une réussite : le suivi ne signalera plus de plateau."
          : current === "bulk"
            ? "Les charges sont attendues en hausse ; le suivi de plateau reste actif."
            : current === "maintain"
              ? "Maintien : progression lente attendue, plateau signalé normalement."
              : "Aucune phase déclarée : le suivi se comporte comme aujourd'hui."}
      </p>

      {error && <p className="mt-2 text-xs text-amber-200/80">{error}</p>}
    </GlassCard>
  );
}
