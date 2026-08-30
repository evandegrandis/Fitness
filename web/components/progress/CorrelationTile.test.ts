import { describe, expect, it } from "vitest";

import { correlationReadout } from "./CorrelationTile";

describe("correlationReadout", () => {
  it("n'interprète jamais 12 séances comme un effet, même avec un coefficient non nul", () => {
    expect(correlationReadout(0.25, 12)).toEqual({
      title: "Pas assez de recul",
      detail: "12 séances utilisables · résultat encore trop instable",
      reliable: false,
    });
  });

  it("présente un coefficient faible sur un échantillon suffisant comme une absence de tendance claire", () => {
    expect(correlationReadout(-0.15, 30).title).toBe("Aucune tendance claire");
  });
});
