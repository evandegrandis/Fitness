import { describe, expect, it } from "vitest";
import { formatSleepHours } from "./RecoveryCheckinRow";

describe("formatSleepHours", () => {
  it("keeps whole and half hours in a compact one-line format", () => {
    expect(formatSleepHours(8)).toBe("8h");
    expect(formatSleepHours(8.5)).toBe("8h30");
  });
});
