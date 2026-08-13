import { describe, expect, it } from "vitest";
import { SetType } from "@/lib/models/enums";
import { setRowBadgeLabel } from "./SetRow";

describe("setRowBadgeLabel", () => {
  it("uses explicit labels only for warmups and finishers", () => {
    expect(setRowBadgeLabel(SetType.warmup, 1)).toBe("Échauff.");
    expect(setRowBadgeLabel(SetType.finisher, 1)).toBe("Finisher");
  });

  it("never exposes planned top-set and backoff roles", () => {
    expect(setRowBadgeLabel(SetType.topSet, 2)).toBe("2");
    expect(setRowBadgeLabel(SetType.backoff, 3)).toBe("3");
    expect(setRowBadgeLabel(SetType.work)).toBe("•");
  });
});
