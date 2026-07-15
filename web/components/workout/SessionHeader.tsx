"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { WorkoutSession } from "@/lib/models/types";
import { completedWorkSets } from "@/lib/models/types";

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

  const totalSets = session.exercises.reduce((acc, e) => acc + completedWorkSets(e).length, 0);

  return (
    <div className="glass glass-strong glass-card flex items-center justify-between gap-3">
      <div>
        <p className="tnum font-display text-2xl font-bold text-[--color-fg]">{formatElapsed(session.startTime, nowMs)}</p>
        <p className="text-xs text-[--color-fg-muted]">{totalSets} set{totalSets > 1 ? "s" : ""} loggué{totalSets > 1 ? "s" : ""}</p>
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
