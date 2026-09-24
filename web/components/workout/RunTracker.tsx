"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Pause, Play, Square } from "lucide-react";
import { formatPace, trackPath, trackStats, type TrackPoint } from "@/lib/engines/gps-track";

/**
 * Suivi GPS d'une course, en direct.
 *
 * Le tracé est dessiné en SVG à partir des seules coordonnées, sans fond de carte : afficher des
 * tuiles supposerait un service externe, donc une dépendance réseau en pleine sortie et un
 * partage de position à un tiers. La forme du parcours suffit à se relire.
 *
 * Les positions restent en mémoire pendant la course ; seul le résumé (distance, durée) est
 * enregistré à l'arrêt, via `onFinish`.
 */
export function RunTracker({
  onFinish,
}: {
  onFinish: (result: { distanceKm: number; durationSeconds: number }) => void;
}) {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "paused">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const watchId = useRef<number | null>(null);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  // Le composant peut être démonté en pleine course (navigation, fin de séance) : sans ça, le
  // watcher continuerait de tourner et de consommer la batterie en arrière-plan.
  useEffect(() => stopWatching, [stopWatching]);

  // Rafraîchit la durée affichée même quand aucune position n'arrive.
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  function start() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Ce navigateur ne donne pas accès à la position.");
      return;
    }
    setError(null);
    setStatus("running");
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setPoints((current) => [
          ...current,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            timestampMs: position.timestamp,
          },
        ]);
      },
      (positionError) => {
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Position refusée. À réautoriser dans les réglages du navigateur."
            : "Position indisponible pour l'instant."
        );
        setStatus("paused");
        stopWatching();
      },
      // `enableHighAccuracy` est indispensable en course : sans lui, iOS renvoie une position
      // réseau à plusieurs centaines de mètres, inutilisable pour une distance.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
  }

  function pause() {
    stopWatching();
    setStatus("paused");
  }

  function finish() {
    stopWatching();
    const stats = trackStats(points);
    setStatus("idle");
    onFinish({ distanceKm: stats.distanceKm, durationSeconds: stats.durationSeconds });
    setPoints([]);
  }

  const stats = trackStats(points);
  const path = trackPath(stats.points, 100);
  const elapsed = stats.durationSeconds;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--color-fg)">
          <MapPin size={13} style={{ color: "rgb(110,231,183)" }} />
          Course suivie au GPS
        </span>
        {status === "running" && (
          <span className="text-[0.65rem] text-(--color-fg-faint)">
            {stats.points.length} point{stats.points.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="Distance" value={`${stats.distanceKm.toFixed(2)} km`} />
        <Metric label="Durée" value={formatDuration(elapsed)} />
        <Metric label="Allure" value={formatPace(stats.paceSecondsPerKm)} />
      </div>

      {stats.stopCount > 0 && (
        <p className="mt-2 text-[0.68rem] text-(--color-fg-muted)">
          {stats.stopCount} arrêt{stats.stopCount > 1 ? "s" : ""} ({formatDuration(stats.stoppedSeconds)}),
          exclus de l&apos;allure.
        </p>
      )}

      {path && (
        <svg viewBox="0 0 100 100" className="mt-3 h-32 w-full" aria-label="Tracé du parcours">
          <path d={path} fill="none" stroke="rgb(110,231,183)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      <div className="mt-3 flex gap-2">
        {status !== "running" ? (
          <button type="button" onClick={start} className="pill min-h-11 flex-1 justify-center gap-1.5">
            <Play size={14} />
            {status === "paused" ? "Reprendre" : "Démarrer"}
          </button>
        ) : (
          <button type="button" onClick={pause} className="pill min-h-11 flex-1 justify-center gap-1.5">
            <Pause size={14} />
            Pause
          </button>
        )}
        {points.length > 0 && (
          <button
            type="button"
            onClick={finish}
            className="pill min-h-11 flex-1 justify-center gap-1.5"
            style={{ color: "rgb(110,231,183)", background: "rgba(110,231,183,0.14)" }}
          >
            <Square size={13} />
            Terminer
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-amber-200/80">{error}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tnum text-sm font-bold text-(--color-fg)">{value}</p>
      <p className="text-[0.6rem] uppercase tracking-wide text-(--color-fg-faint)">{label}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
