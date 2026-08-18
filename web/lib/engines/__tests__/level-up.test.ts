import { describe, expect, it } from "vitest";
import { detectLevelUp, LEVEL_STYLE } from "@/lib/engines/level-up";
import { STRENGTH_LEVEL_KEYS } from "@/lib/engines/benchmark";
import type { Exercise, LoggedSet, UserSettings } from "@/lib/models/types";

/** Profil exact de la table de repères : toute autre valeur masque le barème. */
const PROFILE: Pick<UserSettings, "bodyWeightKg" | "gender" | "ageYears"> = {
  bodyWeightKg: 80,
  gender: "male",
  ageYears: 30,
};

/** « Pec deck » a un barème relevé : load [42, 63, 89, 119, 152]. */
const PEC_DECK: Exercise = {
  id: "ex-pec", name: "Pec deck", category: "Push", setPatternMode: "straight",
  repTargetMin: 6, repTargetMax: 10, smallestIncrement: 5, isFavorite: false,
  createdByUser: false, sortOrder: 0, suggestedRestSeconds: 90, machineSetting: "",
  setupNotes: "", benchmarkLow: null, benchmarkHigh: null, fatigueClass: "light",
  progressionPolicy: null, voluntaryRepCap: 0, muscleMappings: [], lastUsed: null,
  movementPattern: null, resistanceProfile: null, strengthStandardKey: "Pec deck",
  benchmarkUnit: "load",
};

const NO_STANDARD: Exercise = { ...PEC_DECK, id: "ex-none", name: "Machine maison", strengthStandardKey: null };

function set(weight: number, reps: number, id = `s-${weight}-${reps}`): LoggedSet {
  return {
    id, weight, reps, setType: "work", timestamp: new Date("2026-08-18T18:00:00"),
    setSlotIndex: 0, completed: true, supersetRoundIndex: null,
  };
}

describe("détection du passage de palier", () => {
  it("signale le franchissement et nomme le palier atteint", () => {
    // 60x8 reste sous le seuil intermédiaire ; 100x8 le dépasse largement.
    const levelUp = detectLevelUp(PEC_DECK, [set(60, 8)], set(100, 8, "nouveau"), PROFILE);
    expect(levelUp).not.toBeNull();
    expect(levelUp!.setId).toBe("nouveau");
    expect(levelUp!.exerciseName).toBe("Pec deck");
    expect(STRENGTH_LEVEL_KEYS).toContain(levelUp!.to);
    expect(levelUp!.rank).toBeGreaterThan(0);
  });

  it("ne signale rien quand le palier ne bouge pas", () => {
    expect(detectLevelUp(PEC_DECK, [set(100, 8)], set(102.5, 8, "n"), PROFILE)).toBeNull();
  });

  it("ne signale rien quand la série est moins bonne que l'historique", () => {
    expect(detectLevelUp(PEC_DECK, [set(120, 10)], set(50, 5, "n"), PROFILE)).toBeNull();
  });

  it("reste muet sans barème pour cet exercice", () => {
    expect(detectLevelUp(NO_STANDARD, [set(40, 8)], set(200, 10, "n"), PROFILE)).toBeNull();
  });

  it("reste muet si le profil ne correspond pas à la table de repères", () => {
    const autrePoids = { ...PROFILE, bodyWeightKg: 95 };
    expect(detectLevelUp(PEC_DECK, [set(50, 8)], set(140, 10, "n"), autrePoids)).toBeNull();
  });

  it("annonce un premier palier même sans historique", () => {
    const levelUp = detectLevelUp(PEC_DECK, [], set(100, 8, "premier"), PROFILE);
    expect(levelUp).not.toBeNull();
    expect(levelUp!.from).toBe("below_beginner");
  });
});

describe("intensité de la célébration", () => {
  it("monte avec le palier atteint", () => {
    const ordered = STRENGTH_LEVEL_KEYS.map((key) => LEVEL_STYLE[key].particles);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
    }
  });

  it("couvre les cinq paliers", () => {
    for (const key of STRENGTH_LEVEL_KEYS) {
      expect(LEVEL_STYLE[key].label).toBeTruthy();
      expect(LEVEL_STYLE[key].color).toMatch(/^#/);
    }
  });
});
