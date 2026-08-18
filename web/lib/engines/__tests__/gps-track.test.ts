import { describe, expect, it } from "vitest";
import { formatPace, GPS_TRACK, haversineMeters, trackPath, trackStats, usablePoints, type TrackPoint } from "@/lib/engines/gps-track";

const T0 = 1_760_000_000_000;

function point(secondsFromStart: number, latitude: number, longitude: number, accuracyM = 8): TrackPoint {
  return { latitude, longitude, accuracyM, timestampMs: T0 + secondsFromStart * 1000 };
}

/** ~111,3 m par 0,001° de latitude sous nos latitudes. */
const STEP_LAT = 0.001;

describe("distance", () => {
  it("mesure une distance connue à quelques mètres près", () => {
    const d = haversineMeters(point(0, 48.85, 2.35), point(1, 48.851, 2.35));
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("cumule un parcours en ligne droite", () => {
    const points = Array.from({ length: 6 }, (_, i) => point(i * 30, 48.85 + i * STEP_LAT, 2.35));
    expect(trackStats(points).distanceKm).toBeCloseTo(0.56, 1);
  });
});

describe("filtrage — le GPS dérive, surtout à l'arrêt", () => {
  it("écarte les points trop imprécis", () => {
    const points = [point(0, 48.85, 2.35), point(30, 48.9, 2.4, 200), point(60, 48.851, 2.35)];
    expect(usablePoints(points)).toHaveLength(2);
  });

  it("ne compte pas comme distance un déplacement sous le bruit de mesure", () => {
    // Dérive de ~1 m autour du même point pendant 5 minutes : distance réelle nulle.
    const points = Array.from({ length: 10 }, (_, i) =>
      point(i * 30, 48.85 + i * 0.00001, 2.35)
    );
    expect(trackStats(points).distanceKm).toBe(0);
  });

  it("remet les points en ordre chronologique", () => {
    const points = [point(60, 48.852, 2.35), point(0, 48.85, 2.35), point(30, 48.851, 2.35)];
    expect(usablePoints(points).map((p) => p.timestampMs)).toEqual([T0, T0 + 30_000, T0 + 60_000]);
  });

  it("ne casse pas sur une trace vide ou trop courte", () => {
    expect(trackStats([]).distanceKm).toBe(0);
    expect(trackStats([point(0, 48.85, 2.35)]).paceSecondsPerKm).toBeNull();
  });
});

describe("arrêts", () => {
  it("détecte une pause au feu rouge et l'exclut du temps en mouvement", () => {
    const running = Array.from({ length: 5 }, (_, i) => point(i * 30, 48.85 + i * STEP_LAT, 2.35));
    // 90 s immobile au même endroit.
    const stopped = [point(150, 48.854, 2.35), point(210, 48.854, 2.35), point(240, 48.854, 2.35)];
    const after = Array.from({ length: 3 }, (_, i) => point(270 + i * 30, 48.854 + (i + 1) * STEP_LAT, 2.35));

    const stats = trackStats([...running, ...stopped, ...after]);
    expect(stats.stopCount).toBe(1);
    expect(stats.stoppedSeconds).toBeGreaterThanOrEqual(90);
    expect(stats.movingSeconds).toBeLessThan(stats.durationSeconds);
  });

  it("ignore un ralentissement trop bref pour être une pause", () => {
    const points = [
      point(0, 48.85, 2.35),
      point(30, 48.851, 2.35),
      point(40, 48.851, 2.35),
      point(70, 48.852, 2.35),
    ];
    expect(trackStats(points).stopCount).toBe(0);
  });

  it("clôt une pause encore en cours à la fin de la trace", () => {
    const points = [
      point(0, 48.85, 2.35),
      point(30, 48.851, 2.35),
      point(90, 48.851, 2.35),
      point(150, 48.851, 2.35),
    ];
    expect(trackStats(points).stopCount).toBe(1);
  });
});

describe("allure", () => {
  it("se calcule sur le temps en mouvement, pas sur le temps total", () => {
    const running = Array.from({ length: 5 }, (_, i) => point(i * 30, 48.85 + i * STEP_LAT, 2.35));
    const stopped = [point(150, 48.854, 2.35), point(240, 48.854, 2.35)];
    const stats = trackStats([...running, ...stopped]);
    // Sinon les feux rouges rendraient deux sorties incomparables.
    expect(stats.paceSecondsPerKm).toBeLessThan(Math.round(stats.durationSeconds / stats.distanceKm));
  });

  it("s'affiche en minutes par kilomètre", () => {
    expect(formatPace(330)).toBe("5:30 /km");
    expect(formatPace(null)).toBe("—");
  });
});

describe("tracé du parcours", () => {
  it("produit un chemin SVG borné et conserve les proportions", () => {
    const points = [point(0, 48.85, 2.35), point(30, 48.851, 2.35), point(60, 48.851, 2.351)];
    const path = trackPath(points, 100);
    expect(path.startsWith("M")).toBe(true);
    const coords = [...path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(100);
  });

  it("ne trace rien sans au moins deux points", () => {
    expect(trackPath([point(0, 48.85, 2.35)])).toBe("");
  });
});

describe("constantes", () => {
  it("reste cohérent avec un usage en course à pied", () => {
    expect(GPS_TRACK.STOPPED_SPEED_MS).toBeLessThan(1);
    expect(GPS_TRACK.MIN_STOP_SECONDS).toBeGreaterThanOrEqual(10);
  });
});
