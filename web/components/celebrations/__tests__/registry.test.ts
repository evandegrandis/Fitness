import { describe, expect, it } from "vitest";

import { SECRET_SCENES } from "@/components/celebrations/scenes/secrets";
import { isStreakMilestone, nextStreakMilestone, streakScene } from "@/components/celebrations/scenes/streak/pick";
import { STREAK_SCENES } from "@/components/celebrations/scenes/streak";
import { SECRETS } from "@/lib/engines/career-secrets";

describe("registre des célébrations", () => {
  it("chaque secret a sa propre mise en scène, et aucune scène n'est orpheline", () => {
    expect(Object.keys(SECRET_SCENES).sort()).toEqual(SECRETS.map((secret) => secret.id).sort());
    expect(new Set(Object.values(SECRET_SCENES).map((scene) => scene.Component)).size).toBe(SECRETS.length);
  });

  it("série de S : une scène par palier (2, 3, 4, 5, 7, 10, 15, 20, 25), le maillon entre deux, la légende au-delà", () => {
    expect(streakScene(1)).toBeNull();
    for (const count of [2, 3, 4, 5, 7, 10, 15, 20, 25]) expect(streakScene(count)).toBe(STREAK_SCENES[count]);
    for (const count of [6, 8, 9, 11, 14, 26]) expect(streakScene(count)).toBe(STREAK_SCENES[0]);
    for (const count of [30, 35, 100]) expect(streakScene(count)).toBe(STREAK_SCENES[-1]);
    expect([5, 6, 7, 30, 31].map(isStreakMilestone)).toEqual([true, false, true, true, false]);
    expect([1, 5, 7, 25, 31].map(nextStreakMilestone)).toEqual([2, 7, 10, 30, 35]);
  });
});
