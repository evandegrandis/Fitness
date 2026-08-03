"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, CloudOff, Loader2, WifiOff } from "lucide-react";
import type { WorkoutSession } from "@/lib/models/types";
import { completedWorkSets } from "@/lib/models/types";
import { effectiveSetUnits } from "@/lib/engines/set-structure";
import { useSyncStatus } from "@/lib/sync/status";

/** Badge de synchronisation HONNÊTE : reflète l'état réel, jamais un faux « enregistré ». */
function SyncBadge() {
  const status = useSyncStatus((s) => s.status);
  const pending = useSyncStatus((s) => s.pending);

  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem] text-[--color-fg-faint]">
        <Loader2 size={12} className="animate-spin" /> enregistrement…
      </span>
    );
  if (status === "offline")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem]" style={{ color: "var(--color-warning)" }}>
        <WifiOff size={12} /> en attente de réseau{pending > 1 ? ` (${pending})` : ""}
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem] text-[--color-danger]">
        <CloudOff size={12} /> non synchronisé{pending > 1 ? ` (${pending})` : ""}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[0.7rem]" style={{ color: "var(--color-success)" }}>
      <Cloud size={12} /> enregistré
    </span>
  );
}

function formatElapsed(startTime: Date, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - startTime.getTime()) / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) return `${mins}:${String(secs).padStart(2, "0")}`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** En-tête de séance active : durée live, total sets, bouton Terminer. */
export function SessionHeader({
  session,
  onFinish,
}: {
  session: WorkoutSession;
  onFinish: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSets = Math.round(
    session.exercises.reduce((acc, e) => acc + effectiveSetUnits(completedWorkSets(e)), 0) * 10
  ) / 10;

  return (
    <div className="glass glass-strong glass-card flex items-center justify-between gap-3">
      <div>
        <p className="tnum font-display text-2xl font-bold text-[--color-fg]">{formatElapsed(session.startTime, nowMs)}</p>
        <div className="flex items-center gap-2 text-xs text-[--color-fg-muted]">
          <span>{totalSets} set{totalSets > 1 ? "s" : ""} loggué{totalSets > 1 ? "s" : ""}</span>
          <SyncBadge />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (confirmFinish) {
            onFinish();
            setConfirmFinish(false);
          } else {
            setConfirmFinish(true);
            setTimeout(() => setConfirmFinish(false), 3000);
          }
        }}
        className="btn-accent flex items-center gap-1.5 px-4 py-2.5 text-sm active:scale-95 transition"
      >
        <Check size={16} />
        {confirmFinish ? "Confirmer ?" : "Terminer"}
      </button>
    </div>
  );
}
