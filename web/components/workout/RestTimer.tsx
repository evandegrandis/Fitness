"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, SkipForward } from "lucide-react";
import { restRemainingSeconds, useWorkoutStore } from "@/lib/store/workout";
import { scheduleRestNotification } from "@/lib/push/client";

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Minuteur de repos flottant — anneau de progression + compte à rebours. */
export function RestTimer() {
  const rest = useWorkoutStore((s) => s.rest);
  const skipRest = useWorkoutStore((s) => s.skipRest);
  const addRestSeconds = useWorkoutStore((s) => s.addRestSeconds);
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

    // Deux chemins complémentaires, aucun ne suffit seul :
    //  - le push serveur est le SEUL à fonctionner écran éteint (iOS gèle le JS de la page) ;
    //  - le timer local couvre l'app restée au premier plan, et le cas où le push est refusé.
    // `showNotification` via le service worker, jamais `new Notification()` : ce constructeur
    // n'existe pas sur iOS, l'ancienne notification ne s'y déclenchait donc jamais.
    const scheduled = scheduleRestNotification(remaining);
    const id = setTimeout(() => {
      void (async () => {
        if (typeof window === "undefined" || !("Notification" in window)) return;
        if (Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        // Même tag que le push : si les deux arrivent, la seconde remplace la première.
        await registration.showNotification("Repos terminé", {
          body: "C'est reparti !",
          tag: "jeera-rest",
          icon: "/icon",
        });
      })();
    }, remaining * 1000);

    return () => {
      clearTimeout(id);
      // Repos passé ou séance terminée : libère la fonction serveur en attente.
      scheduled?.abort();
    };
  }, [rest]);

  return (
    <AnimatePresence>
      {rest && (
        <RestTimerCard
          key={rest.exerciseId + rest.startedAtMs}
          rest={rest}
          onSkip={skipRest}
          onAdd={() => addRestSeconds(30)}
        />
      )}
    </AnimatePresence>
  );
}

function RestTimerCard({
  rest,
  onSkip,
  onAdd,
}: {
  rest: { exerciseId: string; startedAtMs: number; targetSeconds: number };
  onSkip: () => void;
  onAdd: () => void;
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
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.5, bottom: 0.1 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -50) onSkip(); // flick vers le haut = passer
      }}
      className="surface-solid fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[calc(100%-2.5rem)] max-w-md touch-none items-center gap-3 rounded-2xl px-4 py-3"
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
        <p className="text-xs text-[--color-fg-muted]">Repos · glisser ↑ pour passer</p>
      </div>
      {!done && (
        <button
          type="button"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onAdd}
          className="pill shrink-0 active:scale-90"
          aria-label="Ajouter 30 secondes"
        >
          <Plus size={12} />30 s
        </button>
      )}
      <button
        type="button"
        onPointerDownCapture={(e) => e.stopPropagation()}
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
