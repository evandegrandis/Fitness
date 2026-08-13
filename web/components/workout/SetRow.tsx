"use client";

import { Star } from "lucide-react";
import { SetType } from "@/lib/models/enums";
import type { LoggedSet } from "@/lib/models/types";
import type { RecordKind } from "@/lib/engines/records";
import { cn } from "@/lib/utils";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

export function setRowBadgeLabel(setType: SetType, seriesNumber?: number): string {
  if (setType === SetType.warmup) return "Échauff.";
  if (setType === SetType.finisher) return "Finisher";
  return Number.isInteger(seriesNumber) && (seriesNumber ?? 0) > 0 ? String(seriesNumber) : "•";
}

/** Ligne compacte pour un set déjà loggué — tap pour éditer/supprimer. */
export function SetRow({
  set,
  isRecord,
  seriesNumber,
  onTap,
}: {
  set: LoggedSet;
  isRecord: RecordKind | undefined;
  seriesNumber?: number;
  onTap: () => void;
}) {
  const isWarmup = set.setType === SetType.warmup;
  const isFinisher = set.setType === SetType.finisher;
  const label = setRowBadgeLabel(set.setType, seriesNumber);
  const loadLabel = set.weight > 0 ? `${cleanWeight(set.weight)} kilogrammes` : "poids du corps";
  const roleLabel = isWarmup ? "échauffement" : isFinisher ? "finisher" : `série ${seriesNumber ?? "non numérotée"}`;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Modifier ${roleLabel}, ${loadLabel}, ${set.reps} répétition${set.reps > 1 ? "s" : ""}${isRecord ? ", record" : ""}`}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-white/[0.035] px-3 py-2 text-left active:scale-[0.98] transition"
    >
      <span
        className={cn(
          "grid h-5 shrink-0 place-items-center rounded-md text-[0.65rem] font-bold",
          isWarmup
            ? "min-w-5 bg-amber-400/15 px-1.5 text-amber-300"
            : isFinisher
              ? "min-w-5 bg-rose-400/15 px-1.5 text-rose-300"
              : "w-5 bg-white/8 text-[--color-fg-muted]"
        )}
      >
        {label}
      </span>
      <span className="tnum text-sm text-[--color-fg]">
        {set.weight > 0 ? `${cleanWeight(set.weight)}kg` : "BW"} × {set.reps}
      </span>
      {isRecord && <Star aria-hidden="true" size={13} className="shrink-0 text-amber-300" fill="currentColor" />}
    </button>
  );
}
