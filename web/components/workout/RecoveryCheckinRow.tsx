"use client";

import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasAnyRecoveryValue } from "@/lib/models/recovery";

export interface RecoveryDraft {
  tookCreatine: boolean | null;
  proteinTargetMet: boolean | null;
  sleepHours: number | null;
  hadAlcohol: boolean | null;
}

export function isRecoveryDraftConfirmed(value: RecoveryDraft): boolean {
  return hasAnyRecoveryValue(value);
}

function sleepTone(hours: number): { label: string; color: string } {
  if (hours >= 7) return { label: "haut", color: "#34d399" };
  if (hours >= 5.5) return { label: "ok", color: "#fbbf24" };
  return { label: "bas", color: "#fb7185" };
}

export function formatSleepHours(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h${minutes}`;
}

/** Ligne J-1/J-2 : aucune valeur n'est supposée tant que l'utilisateur ne la confirme pas. */
export function RecoveryCheckinRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RecoveryDraft;
  onChange: (next: RecoveryDraft) => void;
}) {
  const displayedSleepHours = value.sleepHours ?? 7;
  const tone = sleepTone(displayedSleepHours);
  const hasConfirmedSleep = value.sleepHours !== null;

  return (
    <div className="glass glass-card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[--color-fg]">{label}</p>
        <span className="text-[0.65rem] text-[--color-fg-faint]">
          {isRecoveryDraftConfirmed(value) ? "Partiellement confirmé" : "Non renseigné"}
        </span>
      </div>

      <TriStateField
        label="Créatine"
        value={value.tookCreatine}
        onChange={(next) => onChange({ ...value, tookCreatine: next })}
      />
      <TriStateField
        label="Objectif protéines"
        value={value.proteinTargetMet}
        onChange={(next) => onChange({ ...value, proteinTargetMet: next })}
      />
      <TriStateField
        label="Alcool"
        value={value.hadAlcohol}
        warning
        onChange={(next) => onChange({ ...value, hadAlcohol: next })}
      />

      <div className="flex flex-col gap-1">
        <div className="flex min-h-11 items-center gap-2">
          <Moon
            size={16}
            className="shrink-0"
            style={{ color: hasConfirmedSleep ? tone.color : "var(--color-fg-faint)" }}
          />
          <span className="text-xs text-[--color-fg-muted]">Sommeil</span>
          <span
            className="tnum ml-auto whitespace-nowrap text-right text-sm font-semibold leading-none"
            style={{ color: hasConfirmedSleep ? tone.color : "var(--color-fg-muted)" }}
          >
            {formatSleepHours(displayedSleepHours)} · {tone.label}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, sleepHours: null })}
            disabled={!hasConfirmedSleep}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center text-base text-[--color-fg-faint] disabled:opacity-30"
            aria-label="Remettre le sommeil à inconnu"
          >
            ×
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={displayedSleepHours}
          onPointerDown={() => {
            // Afficher 7 h comme point de départ ne doit pas l'enregistrer. Un contact
            // volontaire avec le slider le confirme toutefois, même sans déplacement.
            if (!hasConfirmedSleep) onChange({ ...value, sleepHours: displayedSleepHours });
          }}
          onChange={(event) => onChange({ ...value, sleepHours: Number(event.target.value) })}
          aria-label={`${label} : durée de sommeil`}
          aria-valuetext={`${formatSleepHours(displayedSleepHours)}${hasConfirmedSleep ? "" : ", valeur proposée non confirmée"}`}
          className="h-11 w-full accent-[color:var(--accent)]"
        />
      </div>
    </div>
  );
}

function TriStateField({
  label,
  value,
  onChange,
  warning = false,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[--color-fg-muted]">{label}</span>
      <div className="grid grid-cols-3 rounded-xl border border-white/10 p-0.5">
        {([
          [null, "?"],
          [false, "Non"],
          [true, "Oui"],
        ] as const).map(([next, text]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(next)}
            aria-pressed={value === next}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[0.68rem] font-semibold transition",
              value === next
                ? warning && next === true
                  ? "bg-amber-300/15 text-amber-200"
                  : "bg-white/12 text-[--color-fg]"
                : "text-[--color-fg-faint]"
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
