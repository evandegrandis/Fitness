import { describe, expect, it } from "vitest";
import { statValueSize } from "@/components/ui/StatTile";

describe("tuile de statistique : le chiffre tient dans sa case", () => {
  it("rétrécit avec la longueur au lieu de déborder", () => {
    expect(statValueSize("67")).toBe("text-2xl");
    expect(statValueSize("2:34")).toBe("text-xl");
    expect(statValueSize("947,3")).toBe("text-lg");
  });
});
