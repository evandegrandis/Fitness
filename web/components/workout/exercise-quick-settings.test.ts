import { describe, expect, it } from "vitest";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise } from "@/lib/models/types";
import { applyQuickSettings, formatRest, quickSettingsChanged, quickSettingsOf } from "./exercise-quick-settings";

const LOW_ROW: Exercise = {
  id: "ex-low-row",
  name: "Low Row Technogym",
  category: "pull",
  setPatternMode: "straight",
  repTargetMin: 8,
  repTargetMax: 12,
  smallestIncrement: 2.5,
  isFavorite: false,
  createdByUser: true,
  sortOrder: 0,
  suggestedRestSeconds: 120,
  machineSetting: "",
  setupNotes: "",
  benchmarkLow: null,
  benchmarkHigh: null,
  fatigueClass: "medium",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

describe("réglages rapides de l'exercice en séance", () => {
  it("n'écrase pas un profil musculaire arrivé pendant que la feuille était ouverte", () => {
    const draft = { ...quickSettingsOf(LOW_ROW), repTargetMax: 15 };
    // Barbis a posé les muscles entre l'ouverture de la feuille et l'enregistrement.
    const latest: Exercise = {
      ...LOW_ROW,
      muscleMappings: [{ muscleGroup: MuscleGroup.trapMid, coefficient: 1 }],
      profileSource: "barbis",
    };

    const saved = applyQuickSettings(latest, draft);

    expect(saved.repTargetMax).toBe(15);
    expect(saved.muscleMappings).toEqual(latest.muscleMappings);
    expect(saved.profileSource).toBe("barbis");
  });

  it("garde une fourchette cohérente, une charge max vide comme vide et « pas de max » (0) comme réponse", () => {
    const saved = applyQuickSettings(LOW_ROW, {
      ...quickSettingsOf(LOW_ROW),
      repTargetMin: 14,
      repTargetMax: 10,
      maxLoad: null,
      machineSetting: "  siège 4  ",
    });

    expect(saved.repTargetMin).toBe(14);
    expect(saved.repTargetMax).toBe(14);
    expect(saved.maxLoad).toBeNull();
    expect(saved.machineSetting).toBe("siège 4");
    expect(applyQuickSettings(LOW_ROW, { ...quickSettingsOf(LOW_ROW), maxLoad: 0 }).maxLoad).toBe(0);
    expect(applyQuickSettings(LOW_ROW, { ...quickSettingsOf(LOW_ROW), maxLoad: -3 }).maxLoad).toBeNull();
  });

  it("ne propose d'enregistrer que si un réglage a vraiment changé", () => {
    const initial = quickSettingsOf(LOW_ROW);
    expect(quickSettingsChanged(initial, { ...initial })).toBe(false);
    expect(quickSettingsChanged(initial, { ...initial, machineSetting: "   " })).toBe(false);
    expect(quickSettingsChanged(initial, { ...initial, maxLoad: 100 })).toBe(true);
    expect(quickSettingsChanged(initial, { ...initial, suggestedRestSeconds: 135 })).toBe(true);
  });

  it("affiche le repos comme le minuteur", () => {
    expect(formatRest(90)).toBe("1:30");
    expect(formatRest(120)).toBe("2:00");
    expect(formatRest(45)).toBe("0:45");
  });
});
