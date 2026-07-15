"use client";

import { Star } from "lucide-react";
import { SetType, setTypeShortLabel } from "@/lib/models/enums";
import type { LoggedSet } from "@/lib/models/types";
import type { RecordKind } from "@/lib/engines/records";
import { cn } from "@/lib/utils";

function cleanWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

const BADGE_STYLE: Record<string, string> = {
  [SetType.warmup]: "bg-amber-400/15 text-amber-300",
  [SetType.topSet]: "bg-violet-400/15 text-violet-300",
  [SetType.backoff]: "bg-sky-400/15 text-sky-300",
  [SetType.work]: "bg-white/8 text-[--color-fg-muted]",
};

/** Ligne compacte pour un set déjà loggué — tap pour éditer/supprimer. */
export function SetRow({
  set,
  isRecord,
  onTap,
}: {
  set: LoggedSet;
  isRecord: RecordKind | undefined;
  onTap: () => void;
}) {
  const label = setTypeShortLabel[set.setType];
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.035] px-3 py-2 text-left active:scale-[0.98] transition"
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md text-[0.65rem] font-bold",
          BADGE_STYLE[set.setType]
        )}
      >
        {label || "•"}
      </span>
      <span className="tnum text-sm text-[--color-fg]">
        {set.weight > 0 ? `${cleanWeight(set.weight)}kg` : "BW"} × {set.reps}
      </span>
      {isRecord && <Star size={13} className="shrink-0 text-amber-300" fill="currentColor" />}
    </button>
  );
}
