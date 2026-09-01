import { describe, expect, it } from "vitest";
import { CARDIO_GOAL, cardioNudge, cardioProgress } from "@/lib/engines/cardio";
import type { WorkoutSession } from "@/lib/models/types";

const NOW = new Date("2026-08-20T18:00:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
// NOW est un jeudi : la semaine civile démarre le lundi 17/08, donc J-4 et au-delà en sortent.
// Pour tester des trous longs À L'INTÉRIEUR de la semaine, il faut se placer en fin de semaine.
const SUNDAY = new Date("2026-08-23T18:00:00");
const sundayDaysAgo = (n: number) => new Date(SUNDAY.getTime() - n * 86_400_000);

function session(date: Date, minutes: number[], isActive = false): WorkoutSession {
  return {
    id: `s-${date.getTime()}`,
    date,
    startTime: date,
    endTime: isActive ? null : date,
    notes: "",
    isActive,
    templateName: null,
    exercises: [],
    supersetGroups: [],
    cardioEntries: minutes.map((m, i) => ({
      id: `c-${date.getTime()}-${i}`,
      activityType: "cycling" as const,
      activityName: "",
      machineName: null,
      machineModel: null,
      durationSeconds: m * 60,
      level: null,
      resistance: null,
      distanceKm: null,
      averageWatts: null,
      averageHeartRateBpm: null,
      inclinePercent: null,
      orderIndex: i,
    })),
  };
}

describe("volume cardio sur la semaine civile", () => {
  it("cumule les minutes de la fenêtre et calcule le reste à faire", () => {
    const p = cardioProgress([session(daysAgo(1), [50]), session(daysAgo(3), [45])], 150, NOW);
    expect(p.minutes).toBe(95);
    expect(p.sessionCount).toBe(2);
    expect(p.remainingMinutes).toBe(55);
    expect(p.ratio).toBeCloseTo(95 / 150, 2);
  });

  it("exclut ce qui sort de la fenêtre", () => {
    const p = cardioProgress([session(daysAgo(2), [40]), session(daysAgo(9), [60])], 150, NOW);
    expect(p.minutes).toBe(40);
  });

  it("ignore une séance active de l'historique mais compte la séance en cours", () => {
    const live = session(NOW, [30], true);
    const p = cardioProgress([session(daysAgo(10), [60], true)], 150, NOW, live);
    expect(p.minutes).toBe(30);
    expect(p.sessionCount).toBe(1);
  });

  it("borne le ratio à 1 sans borner les minutes réelles", () => {
    const p = cardioProgress([session(daysAgo(1), [200])], 150, NOW);
    expect(p.minutes).toBe(200);
    expect(p.ratio).toBe(1);
    expect(p.remainingMinutes).toBe(0);
  });

  it("retombe sur l'objectif par défaut si celui fourni est absurde", () => {
    expect(cardioProgress([], 0, NOW).goalMinutes).toBe(CARDIO_GOAL.DEFAULT_WEEKLY_MINUTES);
  });
});

describe("répartition — le volume ne dit pas tout", () => {
  it("mesure le plus long trou, en incluant celui qui court depuis la dernière séance", () => {
    // Trois séances groupées en début de semaine : volume atteint, mais 4 jours sans rien depuis.
    const p = cardioProgress(
      [session(sundayDaysAgo(4), [50]), session(sundayDaysAgo(5), [50]), session(sundayDaysAgo(6), [50])],
      150,
      SUNDAY
    );
    expect(p.minutes).toBe(150);
    expect(p.daysSinceLast).toBe(4);
    expect(p.longestGapDays).toBe(4);
  });

  it("mesure le trou depuis la dernière séance même si elle précède la semaine en cours", () => {
    // Le volume repart à zéro le lundi, pas la physiologie : le trou doit traverser la semaine.
    const p = cardioProgress([session(daysAgo(5), [50])], 150, NOW);
    expect(p.minutes).toBe(0);
    expect(p.daysSinceLast).toBe(5);
  });

  it("des séances étalées donnent un trou court", () => {
    const p = cardioProgress([session(daysAgo(1), [50]), session(daysAgo(3), [50]), session(daysAgo(5), [50])], 150, NOW);
    expect(p.longestGapDays).toBe(2);
  });

  it("n'invente pas de trou sans séance", () => {
    const p = cardioProgress([], 150, NOW);
    expect(p.daysSinceLast).toBeNull();
    expect(p.longestGapDays).toBeNull();
  });
});

describe("message de rappel — le pourquoi, pas seulement le combien", () => {
  it("interpelle quand la semaine est vide", () => {
    expect(cardioNudge(cardioProgress([], 150, NOW))).toContain("fréquence cardiaque au repos");
  });

  it("signale un trou qui dissipe le bénéfice, même objectif atteint", () => {
    const p = cardioProgress([session(sundayDaysAgo(5), [160])], 150, SUNDAY);
    expect(p.remainingMinutes).toBe(0);
    expect(cardioNudge(p)).toContain("dissipé");
  });

  it("ne repart pas de zéro dans le discours quand la semaine vient de basculer", () => {
    // Lundi matin : rien cette semaine, mais une sortie hier. Le compteur repart, pas le ton.
    const monday = new Date("2026-08-24T09:00:00");
    const p = cardioProgress([session(new Date("2026-08-23T10:00:00"), [60])], 150, monday);
    expect(p.minutes).toBe(0);
    const message = cardioNudge(p);
    expect(message).toContain("Nouvelle semaine");
    expect(message).not.toContain("Aucun cardio");
  });

  it("chiffre ce qu'il reste quand le rythme est bon", () => {
    expect(cardioNudge(cardioProgress([session(daysAgo(1), [100])], 150, NOW))).toContain("50 min");
  });

  it("confirme l'objectif atteint quand tout est à jour", () => {
    expect(cardioNudge(cardioProgress([session(daysAgo(1), [160])], 150, NOW))).toContain("atteint");
  });
});
