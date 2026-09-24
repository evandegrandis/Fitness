"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Trophy } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { machinesForMaxTracking, type MachineMaxStatus } from "@/lib/engines/machine-max";
import { cleanWeight } from "@/lib/format";
import { useWorkoutStore } from "@/lib/store/workout";
import { saveExercise } from "@/lib/sync/save-exercise";

/**
 * Charges max des machines, à saisir HORS séance, d'un coup pour toute la salle, sans ouvrir chaque
 * exercice. C'est aussi le tableau de l'objectif « maxer chaque machine » : combien sont maxées.
 */
export function SettingsMachinesSection() {
  const catalog = useWorkoutStore((s) => s.catalog);
  const history = useWorkoutStore((s) => s.history);
  const [open, setOpen] = useState(false);
  const machines = useMemo(() => machinesForMaxTracking(catalog, history, new Date()), [catalog, history]);
  const known = machines.filter((machine) => machine.maxLoad !== null);
  const maxed = known.filter((machine) => machine.maxed).length;

  return (
    <>
      <GlassCard>
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Trophy size={16} style={{ color: "#fbbf24" }} />
            <div className="text-left">
              <p className="text-sm font-semibold text-(--color-fg)">Machines maxées</p>
              <p className="text-xs text-(--color-fg-muted)">
                {known.length > 0
                  ? `${maxed} sur ${known.length} · ${machines.length - known.length} sans charge max`
                  : `${machines.length} machines récentes, charge max à renseigner`}
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-(--color-fg-faint)" />
        </button>
      </GlassCard>

      <Sheet open={open} onClose={() => setOpen(false)} full>
        <h2 className="font-display text-lg font-bold text-(--color-fg)">Charges max des machines</h2>
        <p className="mt-1 text-xs text-(--color-fg-muted)">
          Le bout de pile de chaque machine. Au-delà, l&apos;app ne propose rien de plus lourd et fait progresser par les reps.
        </p>
        <div className="mt-4 flex flex-col">
          {machines.map((machine, index) => (
            <MachineRow key={machine.exercise.id} status={machine} isLast={index === machines.length - 1} />
          ))}
        </div>
      </Sheet>
    </>
  );
}

function parseLoad(raw: string): number | null | "invalid" {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : "invalid";
}

function MachineRow({ status, isLast }: { status: MachineMaxStatus; isLast: boolean }) {
  const [draft, setDraft] = useState(status.maxLoad !== null ? cleanWeight(status.maxLoad) : "");
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    const parsed = parseLoad(draft);
    if (parsed === "invalid") {
      setError("Charge invalide");
      return;
    }
    setError(null);
    if (parsed === status.maxLoad) return;
    try {
      await saveExercise({ ...status.exercise, maxLoad: parsed });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    }
  };

  return (
    <div className={`py-3 ${isLast ? "" : "border-b border-white/[0.06]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-(--color-fg)">{status.exercise.name}</p>
          <p className="tnum text-[0.7rem] text-(--color-fg-faint)">
            {status.maxed ? (
              <span style={{ color: "#fbbf24" }}>Maxée</span>
            ) : status.progress !== null ? (
              `${cleanWeight(status.bestLoad)} / ${cleanWeight(status.maxLoad!)} kg · ${Math.round(status.progress * 100)} %`
            ) : (
              `meilleure charge ${cleanWeight(status.bestLoad)} kg`
            )}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1 text-xs text-(--color-fg-muted)">
          max
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            inputMode="decimal"
            placeholder="–"
            aria-label={`Charge max de ${status.exercise.name}`}
            className="glass tnum w-16 rounded-lg px-2 py-1.5 text-right text-sm text-(--color-fg) outline-none"
          />
          kg
        </label>
      </div>
      {status.progress !== null && !status.maxed && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full" style={{ width: `${Math.round(status.progress * 100)}%`, background: "var(--accent)" }} />
        </div>
      )}
      {error && <p className="mt-1 text-[0.7rem] text-(--color-danger)">{error}</p>}
    </div>
  );
}
