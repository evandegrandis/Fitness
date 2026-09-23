/**
 * Trace GPS d'une course : distance, allure, arrêts.
 *
 * Le GPS d'un téléphone dérive en permanence, surtout à l'arrêt : sans filtrage, une pause à un
 * feu rouge « parcourt » quelques dizaines de mètres et gonfle la distance. Deux garde-fous :
 *
 *  - un point trop imprécis est ignoré (`MAX_ACCURACY_M`) ;
 *  - un déplacement sous le bruit de mesure ne compte pas comme distance (`MIN_STEP_M`), mais le
 *    temps continue de courir, donc l'allure moyenne reste juste.
 *
 * Moteur pur : aucune écriture, aucun état dérivé persisté (ALGO_SPEC_HARDENED §0.2).
 */

export interface TrackPoint {
  latitude: number;
  longitude: number;
  /** Précision horizontale annoncée par le navigateur, en mètres. */
  accuracyM: number;
  timestampMs: number;
}

export const GPS_TRACK = {
  /** Au-delà, la position est trop incertaine pour mesurer quoi que ce soit. */
  MAX_ACCURACY_M: 30,
  /** Sous ce déplacement entre deux points, on considère qu'on n'a pas bougé. */
  MIN_STEP_M: 4,
  /** Vitesse en dessous de laquelle on est considéré à l'arrêt (m/s ; ~2,2 km/h). */
  STOPPED_SPEED_MS: 0.6,
  /** Durée minimale pour qu'un ralentissement compte comme une vraie pause. */
  MIN_STOP_SECONDS: 20,
} as const;

export interface TrackStats {
  distanceKm: number;
  /** Temps total entre le premier et le dernier point retenu. */
  durationSeconds: number;
  /** Temps réellement en mouvement (total moins les pauses). */
  movingSeconds: number;
  /** Allure moyenne en mouvement, en secondes par kilomètre. `null` sans distance. */
  paceSecondsPerKm: number | null;
  stopCount: number;
  stoppedSeconds: number;
  /** Points retenus après filtrage, utilisables pour tracer le parcours. */
  points: TrackPoint[];
}

const EARTH_RADIUS_M = 6_371_000;

/** Distance orthodromique entre deux points, en mètres. */
export function haversineMeters(a: TrackPoint, b: TrackPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Écarte les points inutilisables avant tout calcul. */
export function usablePoints(points: TrackPoint[]): TrackPoint[] {
  return points
    .filter(
      (p) =>
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180 &&
        p.accuracyM <= GPS_TRACK.MAX_ACCURACY_M
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function trackStats(rawPoints: TrackPoint[]): TrackStats {
  const points = usablePoints(rawPoints);
  if (points.length < 2) {
    return {
      distanceKm: 0,
      durationSeconds: 0,
      movingSeconds: 0,
      paceSecondsPerKm: null,
      stopCount: 0,
      stoppedSeconds: 0,
      points,
    };
  }

  let meters = 0;
  let stoppedSeconds = 0;
  let stopCount = 0;
  let currentStopSeconds = 0;

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const seconds = (current.timestampMs - previous.timestampMs) / 1000;
    if (seconds <= 0) continue;

    const step = haversineMeters(previous, current);
    // Sous le bruit de mesure : le temps s'écoule, la distance non.
    const moved = step >= GPS_TRACK.MIN_STEP_M ? step : 0;
    meters += moved;

    if (moved / seconds < GPS_TRACK.STOPPED_SPEED_MS) {
      currentStopSeconds += seconds;
    } else if (currentStopSeconds > 0) {
      // Une pause n'est comptée qu'une fois close, et seulement si elle a duré.
      if (currentStopSeconds >= GPS_TRACK.MIN_STOP_SECONDS) {
        stopCount += 1;
        stoppedSeconds += currentStopSeconds;
      }
      currentStopSeconds = 0;
    }
  }
  if (currentStopSeconds >= GPS_TRACK.MIN_STOP_SECONDS) {
    stopCount += 1;
    stoppedSeconds += currentStopSeconds;
  }

  const durationSeconds = Math.round(
    (points[points.length - 1].timestampMs - points[0].timestampMs) / 1000
  );
  const movingSeconds = Math.max(0, Math.round(durationSeconds - stoppedSeconds));
  const distanceKm = Math.round((meters / 1000) * 100) / 100;

  return {
    distanceKm,
    durationSeconds,
    movingSeconds,
    // L'allure se lit sur le temps EN MOUVEMENT : inclure les feux rouges la rendrait
    // incomparable d'une sortie à l'autre.
    paceSecondsPerKm: distanceKm > 0 ? Math.round(movingSeconds / distanceKm) : null,
    stopCount,
    stoppedSeconds: Math.round(stoppedSeconds),
    points,
  };
}

/** « 5:30 /km ». */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm)) return "–";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

/**
 * Projette le parcours dans un carré de `size` unités, prêt pour un `<path>` SVG.
 * Pas de fond de carte : cela demanderait un service de tuiles externe, donc une dépendance
 * réseau et un partage de position à un tiers. La forme du parcours seule suffit à se repérer.
 */
export function trackPath(points: TrackPoint[], size = 100): string {
  if (points.length < 2) return "";
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // La longitude se resserre avec la latitude : sans ce facteur, un parcours nord-sud
  // apparaîtrait étiré. On conserve donc les proportions réelles.
  const latSpan = Math.max(1e-6, maxLat - minLat);
  const lonSpan = Math.max(1e-6, (maxLon - minLon) * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  const span = Math.max(latSpan, lonSpan);
  const padX = (span - lonSpan) / 2;
  const padY = (span - latSpan) / 2;

  return points
    .map((p, i) => {
      const x =
        ((p.longitude - minLon) * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) + padX) / span * size;
      // L'axe SVG descend, la latitude monte : on inverse.
      const y = size - ((p.latitude - minLat + padY) / span) * size;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
