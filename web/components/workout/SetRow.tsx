"use client";

import { Star } from "lucide-react";
import { reportedRirLabel, SetType, stopReasonDisplayName } from "@/lib/models/enums";
import type { LoggedSet } from "@/lib/models/types";
import type { RecordKind } from "@/lib/engines/records";
import { cn } from "@/lib/utils";
import { cleanWeight } from "@/lib/format";

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
  const hasRir = typeof set.reportedRir === "number";
  // Douleur/matériel = série non représentative (exclue des baselines) → ton d'alerte discret.
  const excludingStop = set.stopReason === "pain" || set.stopReason === "equipment";
  const rirAria = hasRir ? `, RIR ${reportedRirLabel(set.reportedRir as number)}` : "";
  const stopAria = set.stopReason ? `, arrêt ${stopReasonDisplayName[set.stopReason]}` : "";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Modifier ${roleLabel}, ${loadLabel}, ${set.reps} répétition${set.reps > 1 ? "s" : ""}${rirAria}${stopAria}${isRecord ? ", record" : ""}`}
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
        {set.weight > 0 ? `${cleanWeight(set.weight)}kg` : "PDC"} × {set.reps}
      </span>
      {hasRir && (
        <span className="tnum shrink-0 rounded-md bg-white/[0.06] px-1.5 text-[0.65rem] font-semibold text-[--color-fg-muted]">
          RIR {reportedRirLabel(set.reportedRir as number)}
        </span>
      )}
      {set.stopReason && set.stopReason !== "muscular" && (
        <span
          className="shrink-0 rounded-md px-1.5 text-[0.65rem] font-semibold"
          style={
            excludingStop
              ? { color: "#fb7185", background: "rgba(251,113,133,0.14)" }
              : { color: "var(--color-fg-muted)", background: "rgba(255,255,255,0.06)" }
          }
        >
          {stopReasonDisplayName[set.stopReason]}
        </span>
      )}
      {isRecord && <Star aria-hidden="true" size={13} className="ml-auto shrink-0 text-amber-300" fill="currentColor" />}
    </button>
  );
}
