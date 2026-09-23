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

function set(
  weight: number,
  reps: number,
  id = `s-${weight}-${reps}`,
  timestamp = new Date("2026-08-18T18:00:00")
): LoggedSet {
  return {
    id, weight, reps, setType: "work", timestamp,
    setSlotIndex: 0, completed: true, supersetRoundIndex: null,
  };
}

/** Première séance, une semaine avant : 3 séries qui posent la référence (étalonnage, records.ts). */
function firstSession(weight: number, reps: number): LoggedSet[] {
  return [0, 1, 2].map((i) =>
    set(weight, reps, `ref-${weight}-${i}`, new Date(Date.UTC(2026, 7, 11, 16, i * 3)))
  );
}

describe("détection du passage de palier", () => {
  it("signale le franchissement et nomme le palier atteint", () => {
    // 60x8 reste sous le seuil intermédiaire ; 100x8 le dépasse largement.
    const levelUp = detectLevelUp(PEC_DECK, firstSession(60, 8), set(100, 8, "nouveau"), PROFILE);
    expect(levelUp).not.toBeNull();
    expect(levelUp!.setId).toBe("nouveau");
    expect(levelUp!.exerciseName).toBe("Pec deck");
    expect(STRENGTH_LEVEL_KEYS).toContain(levelUp!.to);
    expect(levelUp!.rank).toBeGreaterThan(0);
  });

  it("ne signale rien quand le palier ne bouge pas", () => {
    expect(detectLevelUp(PEC_DECK, firstSession(100, 8), set(102.5, 8, "n"), PROFILE)).toBeNull();
  });

  it("ne signale rien quand la série est moins bonne que l'historique", () => {
    expect(detectLevelUp(PEC_DECK, firstSession(120, 10), set(50, 5, "n"), PROFILE)).toBeNull();
  });

  it("reste muet sans barème pour cet exercice", () => {
    expect(detectLevelUp(NO_STANDARD, firstSession(40, 8), set(200, 10, "n"), PROFILE)).toBeNull();
  });

  it("reste muet si le profil ne correspond pas à la table de repères", () => {
    const autrePoids = { ...PROFILE, bodyWeightKg: 95 };
    expect(detectLevelUp(PEC_DECK, firstSession(50, 8), set(140, 10, "n"), autrePoids)).toBeNull();
  });

  it("n'annonce aucun palier pendant la première séance : le niveau se découvre, il ne se franchit pas", () => {
    expect(detectLevelUp(PEC_DECK, [], set(100, 8, "premier"), PROFILE)).toBeNull();
    const sameSession = [set(60, 8, "a", new Date("2026-08-18T17:50:00"))];
    expect(detectLevelUp(PEC_DECK, sameSession, set(100, 8, "b"), PROFILE)).toBeNull();
  });

  it("après une première séance de 2 séries, aucune annonce avant la 5e série", () => {
    const short = [0, 1].map((i) => set(60, 8, `short-${i}`, new Date(Date.UTC(2026, 7, 11, 16, i * 3))));
    const third = set(60, 8, "third", new Date("2026-08-18T18:00:00"));
    const fourth = set(100, 8, "fourth", new Date("2026-08-18T18:03:00"));
    expect(detectLevelUp(PEC_DECK, [...short, third], fourth, PROFILE)).toBeNull();
    const fifth = set(100, 8, "fifth", new Date("2026-08-18T18:06:00"));
    expect(detectLevelUp(PEC_DECK, [...short, third, set(60, 8, "fourth-bis", new Date("2026-08-18T18:03:00"))], fifth, PROFILE)).not.toBeNull();
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
