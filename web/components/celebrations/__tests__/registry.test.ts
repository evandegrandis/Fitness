import { describe, expect, it } from "vitest";

import { SECRET_SCENES } from "@/components/celebrations/scenes/secrets";
import { isStreakMilestone, nextStreakMilestone, streakScene, streakSceneDef } from "@/components/celebrations/scenes/streak/pick";
import { STREAK_SCENES } from "@/components/celebrations/scenes/streak";
import { frenchNumber } from "@/components/celebrations/scenes/streak/caption";
import { SECRETS } from "@/lib/engines/career-secrets";

describe("registre des célébrations", () => {
  it("chaque secret a sa propre mise en scène, et aucune scène n'est orpheline", () => {
    expect(Object.keys(SECRET_SCENES).sort()).toEqual(SECRETS.map((secret) => secret.id).sort());
    expect(new Set(Object.values(SECRET_SCENES).map((scene) => scene.Component)).size).toBe(SECRETS.length);
  });

  it("série de S : une scène propre à chaque compte de 1 à 50, le maillon et la légende au-delà", () => {
    expect(streakScene(0)).toBeNull();
    expect(streakSceneDef(1.5)).toBeNull();
    const designed = new Set<unknown>();
    for (let count = 1; count <= 50; count += 1) {
      expect(STREAK_SCENES[count], `scène ${count}`).toBeDefined();
      expect(streakSceneDef(count)).toBe(STREAK_SCENES[count]);
      designed.add(STREAK_SCENES[count].load);
    }
    expect(designed.size).toBe(50);
    for (const count of [51, 54, 56, 101]) expect(streakSceneDef(count)).toBe(STREAK_SCENES[0]);
    for (const count of [55, 60, 100]) expect(streakSceneDef(count)).toBe(STREAK_SCENES[-1]);
    expect(streakScene(12)?.Component).toBe(streakScene(12)?.Component);
    expect([1, 31, 50, 51, 55].map(isStreakMilestone)).toEqual([true, true, true, false, true]);
    expect([0, 1, 49, 50, 54, 55].map(nextStreakMilestone)).toEqual([1, 2, 50, 55, 55, 60]);
  });

  it("les nombres en toutes lettres", () => {
    expect([1, 16, 17, 21, 22, 30, 41, 50].map(frenchNumber)).toEqual(["un", "seize", "dix-sept", "vingt et un", "vingt-deux", "trente", "quarante et un", "cinquante"]);
  });
});
