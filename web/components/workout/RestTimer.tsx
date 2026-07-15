"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SkipForward } from "lucide-react";
import { restRemainingSeconds, useWorkoutStore } from "@/lib/store/workout";

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Minuteur de repos flottant — anneau de progression + compte à rebours. */
export function RestTimer() {
  const rest = useWorkoutStore((s) => s.rest);
  const skipRest = useWorkoutStore((s) => s.skipRest);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [rest]);

  useEffect(() => {
    if (!rest) return;
    const remaining = restRemainingSeconds({ rest });
    if (remaining <= 0) return;
    const id = setTimeout(() => {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification("Repos terminé", { body: "C'est reparti !" });
      }
    }, remaining * 1000);
    return () => clearTimeout(id);
  }, [rest]);

  return (
    <AnimatePresence>
      {rest && <RestTimerCard key={rest.exerciseId + rest.startedAtMs} rest={rest} onSkip={skipRest} />}
    </AnimatePresence>
  );
}

function RestTimerCard({
  rest,
  onSkip,
}: {
  rest: { exerciseId: string; startedAtMs: number; targetSeconds: number };
  onSkip: () => void;
}) {
  const remaining = restRemainingSeconds({ rest });
  const done = remaining <= 0;
  const progress = Math.max(0, Math.min(1, remaining / rest.targetSeconds));
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className="glass glass-strong fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[calc(100%-2.5rem)] max-w-md items-center gap-3 rounded-2xl px-4 py-3"
    >
      <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0 -rotate-90">
        <circle cx="26" cy="26" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={RADIUS}
          fill="none"
          stroke={done ? "#34d399" : "var(--accent)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="tnum text-lg font-bold text-[--color-fg]">
          {done ? "C'est parti !" : `${mins}:${String(secs).padStart(2, "0")}`}
        </p>
        <p className="text-xs text-[--color-fg-muted]">Repos</p>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className={done ? "btn-accent flex items-center gap-1.5 px-3.5 py-2 text-sm active:scale-95 transition" : "glass grid h-9 w-9 place-items-center rounded-full active:scale-90 transition"}
        style={done ? { background: "linear-gradient(120deg, #34d399, #2dd4bf)" } : undefined}
        aria-label="Passer le repos"
      >
        {done ? "GO" : <SkipForward size={16} />}
      </button>
    </motion.div>
  );
}
