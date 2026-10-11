import { describe, expect, it } from "vitest";

// Même stub que workout.test.ts : le store persiste via `localStorage`, absent sous Vitest (node).
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

globalThis.localStorage = new MemoryStorage();

const { useWorkoutStore } = await import("@/lib/store/workout");
const { weekKey } = await import("@/lib/engines/week-status");

describe("« Pas de jambes cette semaine »", () => {
  it("est retenu pour la semaine civile, persisté localement, et tombe le lundi suivant", () => {
    const sunday = new Date(2026, 9, 11, 16, 13);
    useWorkoutStore.getState().setLowerBodyOff(true, sunday);
    const stored = useWorkoutStore.getState().lowerBodyOffWeek;
    expect(stored).toBe("2026-10-05");
    expect(stored).toBe(weekKey(new Date(2026, 9, 6, 9, 0)));
    expect(stored).not.toBe(weekKey(new Date(2026, 9, 12, 7, 0)));
    expect(JSON.parse(localStorage.getItem("jeera-workout-store")!).state.lowerBodyOffWeek).toBe("2026-10-05");

    useWorkoutStore.getState().setLowerBodyOff(false, sunday);
    expect(useWorkoutStore.getState().lowerBodyOffWeek).toBeNull();
  });

  it("ne touche ni aux objectifs ni aux réglages", () => {
    const goals = [{ parent: "quads" as const, weeklyGoalSets: 9 }];
    useWorkoutStore.setState({ goals });
    useWorkoutStore.getState().setLowerBodyOff(true, new Date(2026, 9, 11));
    expect(useWorkoutStore.getState().goals).toEqual(goals);
  });
});
