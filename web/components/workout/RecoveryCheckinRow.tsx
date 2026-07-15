"use client";

import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RecoveryDraft {
  tookCreatine: boolean;
  proteinTargetMet: boolean;
  sleepHours: number;
}

function sleepTone(hours: number): { label: string; color: string } {
  if (hours >= 7) return { label: "haut", color: "#34d399" };
  if (hours >= 5.5) return { label: "ok", color: "#fbbf24" };
  return { label: "bas", color: "#fb7185" };
}

/** Ligne de recovery checkin (J-1 ou J-2) : toggles Créatine/Protéine + slider sommeil. */
export function RecoveryCheckinRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RecoveryDraft;
  onChange: (next: RecoveryDraft) => void;
}) {
  const tone = sleepTone(value.sleepHours);

  return (
    <div className="glass glass-card flex flex-col gap-3">
      <p className="text-sm font-semibold text-[--color-fg]">{label}</p>

      <div className="flex gap-2">
        <ToggleChip
          label="Créatine"
          active={value.tookCreatine}
          onClick={() => onChange({ ...value, tookCreatine: !value.tookCreatine })}
        />
        <ToggleChip
          label="Protéine"
          active={value.proteinTargetMet}
          onClick={() => onChange({ ...value, proteinTargetMet: !value.proteinTargetMet })}
        />
      </div>

      <div className="flex items-center gap-3">
        <Moon size={16} className="shrink-0" style={{ color: tone.color }} />
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={value.sleepHours}
          onChange={(e) => onChange({ ...value, sleepHours: Number(e.target.value) })}
          className="h-1.5 flex-1 appearance-none rounded-full bg-white/10 accent-[color:var(--accent)]"
        />
        <span className="tnum shrink-0 text-sm font-semibold" style={{ color: tone.color }}>
          {value.sleepHours}h · {tone.label}
        </span>
      </div>
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition",
        active ? "border-transparent text-[#06070d]" : "border-white/10 text-[--color-fg-muted]"
      )}
      style={active ? { background: "linear-gradient(120deg, var(--accent), var(--accent-2))" } : undefined}
    >
      {label}
    </button>
  );
}
