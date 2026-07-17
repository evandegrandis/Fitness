"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, CloudOff, Loader2 } from "lucide-react";
import type { WorkoutSession } from "@/lib/models/types";
import { completedWorkSets } from "@/lib/models/types";

type SyncState = "idle" | "saving" | "saved" | "error";

function SyncBadge({ state }: { state: SyncState }) {
  if (state === "idle") return null;
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem] text-[--color-fg-faint]">
        <Loader2 size={12} className="animate-spin" /> enregistrement…
      </span>
    );
  if (state === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[0.7rem] text-[--color-danger]">
        <CloudOff size={12} /> non enregistré
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[0.7rem]" style={{ color: "#34d399" }}>
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
  syncState = "idle",
}: {
  session: WorkoutSession;
  onFinish: () => void;
  syncState?: SyncState;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSets = session.exercises.reduce((acc, e) => acc + completedWorkSets(e).length, 0);

  return (
    <div className="glass glass-strong glass-card flex items-center justify-between gap-3">
      <div>
        <p className="tnum font-display text-2xl font-bold text-[--color-fg]">{formatElapsed(session.startTime, nowMs)}</p>
        <div className="flex items-center gap-2 text-xs text-[--color-fg-muted]">
          <span>{totalSets} set{totalSets > 1 ? "s" : ""} loggué{totalSets > 1 ? "s" : ""}</span>
          <SyncBadge state={syncState} />
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
