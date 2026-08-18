"use client";

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stepper } from "@/components/ui/Stepper";
import { saveBodyWeight } from "@/lib/db/actions";
import { writeThrough } from "@/lib/sync/write-through";
import { useWorkoutStore } from "@/lib/store/workout";
import { buildWeightTrend, latestBodyWeight, WEIGHT_TREND } from "@/lib/engines/body-weight";

/**
 * Saisie d'une pesée + lecture de la tendance.
 *
 * Le chiffre mis en avant est la MOYENNE 7 JOURS, jamais la pesée du jour : une variation
 * quotidienne de ±1,5 kg dépasse largement la perte hebdomadaire visée, donc afficher le brut
 * comme résultat revient à afficher du bruit.
 */
export function SettingsWeightSection() {
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const settings = useWorkoutStore((s) => s.settings);
  const setBodyWeightEntry = useWorkoutStore((s) => s.setBodyWeightEntry);

  const lastKnown = latestBodyWeight(bodyWeights) ?? settings.bodyWeightKg ?? 77;
  const [draft, setDraft] = useState(lastKnown);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trend = useMemo(
    () => buildWeightTrend(bodyWeights, settings.trainingPhaseStartedAt),
    [bodyWeights, settings.trainingPhaseStartedAt]
  );

  async function persist() {
    setSaving(true);
    setError(null);
    const entry = { id: crypto.randomUUID(), measuredOn: new Date(), weightKg: draft };
    setBodyWeightEntry(entry);
    try {
      await writeThrough({ kind: "body_weight", entry }, () => saveBodyWeight(entry));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Pesée gardée en local, synchro au retour du réseau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">Poids</p>
        {saving && <span className="text-[0.65rem] text-[--color-fg-faint]">Enregistrement…</span>}
        {!saving && saved && <span className="text-[0.65rem] text-emerald-300">Enregistré</span>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-[--color-fg]">Pesée du jour</span>
        <Stepper label="" value={draft} onChange={setDraft} step={0.1} min={30} max={300} suffix="kg" />
      </div>

      <button
        type="button"
        onClick={persist}
        disabled={saving}
        className="btn-accent mt-3 flex w-full items-center justify-center py-3 text-sm active:scale-[0.98] transition disabled:opacity-50"
      >
        Enregistrer la pesée
      </button>

      {trend.currentKg !== null && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[--color-fg-muted]">Tendance 7 jours</span>
            <span className="tnum text-lg font-bold text-[--color-fg]">{trend.currentKg.toFixed(1)} kg</span>
          </div>
          {trend.deltaKg !== null && trend.deltaPct !== null && Math.abs(trend.deltaKg) >= 0.05 && (
            <p className="mt-1 text-xs text-[--color-fg-muted]">
              {trend.deltaKg > 0 ? "+" : "−"}
              {Math.abs(trend.deltaKg).toFixed(1)} kg ({Math.abs(trend.deltaPct).toFixed(1)} %) depuis le départ
            </p>
          )}
          {trend.weeklyPct !== null && (
            <p className="mt-1 text-xs" style={{ color: rateColor(trend.verdict) }}>
              {rateLabel(trend.verdict, trend.weeklyPct)}
            </p>
          )}
          {trend.weeklyPct === null && (
            <p className="mt-1 text-xs text-[--color-fg-faint]">
              Encore trop peu de recul pour estimer une vitesse ({WEIGHT_TREND.MIN_DAYS_FOR_RATE} jours minimum).
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-amber-200/80">{error}</p>}
      {bodyWeights.length === 0 && (
        <p className="mt-3 text-xs text-[--color-fg-faint]">
          Aucune pesée enregistrée. La première sert de point de départ.
        </p>
      )}
    </GlassCard>
  );
}

function rateColor(verdict: ReturnType<typeof buildWeightTrend>["verdict"]): string {
  if (verdict === "on_track") return "rgb(110, 231, 183)";
  if (verdict === "too_fast") return "#fb7185";
  return "var(--color-fg-muted)";
}

function rateLabel(verdict: ReturnType<typeof buildWeightTrend>["verdict"], weeklyPct: number): string {
  const pace = `${weeklyPct > 0 ? "+" : "−"}${Math.abs(weeklyPct).toFixed(2)} %/semaine`;
  switch (verdict) {
    case "on_track":
      return `${pace} · dans la zone visée`;
    case "too_fast":
      // Au-delà de 0,7 %/sem, la perte se paie en masse maigre (Garthe et al.).
      return `${pace} · trop rapide, tu risques d'y laisser du muscle`;
    case "too_slow":
      return `${pace} · trop lent pour se distinguer du bruit`;
    case "gaining":
      return `${pace} · tu prends du poids`;
    default:
      return pace;
  }
}
