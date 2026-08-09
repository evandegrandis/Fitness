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

function formatSleepHours(hours: number): string {
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
  const tone = value.sleepHours === null ? null : sleepTone(value.sleepHours);

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

      <div className="flex items-center gap-3">
        <Moon size={16} className="shrink-0" style={{ color: tone?.color ?? "var(--color-fg-faint)" }} />
        {value.sleepHours === null ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, sleepHours: 7 })}
            className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-[--color-fg-muted]"
          >
            Renseigner le sommeil
          </button>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={value.sleepHours}
              onChange={(event) => onChange({ ...value, sleepHours: Number(event.target.value) })}
              className="h-1.5 min-w-0 flex-1 appearance-none rounded-full bg-white/10 accent-[color:var(--accent)]"
            />
            <span className="tnum w-20 text-right text-sm font-semibold" style={{ color: tone?.color }}>
              {formatSleepHours(value.sleepHours)} · {tone?.label}
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...value, sleepHours: null })}
              className="text-xs text-[--color-fg-faint]"
              aria-label="Remettre le sommeil à inconnu"
            >
              ×
            </button>
          </>
        )}
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
