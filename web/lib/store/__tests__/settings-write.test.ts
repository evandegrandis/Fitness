import { describe, expect, it } from "vitest";

import type { UserSettings } from "@/lib/models/types";
import { mergeSettingsPatch } from "@/lib/store/settings-write";

const SETTINGS: UserSettings = {
  usesKilograms: true,
  defaultSmallestIncrement: 2.5,
  defaultRestTimerSeconds: 120,
  defaultRepTargetMin: 8,
  defaultRepTargetMax: 12,
  userName: "Evan",
  supersetRestSeconds: 180,
  bodyWeightKg: 80,
  gender: "male",
  ageYears: 26,
  trainingPhase: null,
  trainingPhaseStartedAt: null,
};

describe("mergeSettingsPatch", () => {
  it("préserve une modification Corps quand Préférences écrit juste après", () => {
    const afterBody = mergeSettingsPatch(SETTINGS, { bodyWeightKg: 81 });
    const afterPreferences = mergeSettingsPatch(afterBody, { defaultRestTimerSeconds: 135 });

    expect(afterPreferences.bodyWeightKg).toBe(81);
    expect(afterPreferences.defaultRestTimerSeconds).toBe(135);
  });

  it("ne propage pas les champs étrangers d'un ancien draft local", () => {
    const stalePreferencesDraft = { ...SETTINGS, defaultRestTimerSeconds: 150 };
    const current = { ...SETTINGS, bodyWeightKg: 82, ageYears: 27 };

    const result = mergeSettingsPatch(current, {
      defaultRestTimerSeconds: stalePreferencesDraft.defaultRestTimerSeconds,
    });

    expect(result).toMatchObject({ bodyWeightKg: 82, ageYears: 27, defaultRestTimerSeconds: 150 });
  });
});
