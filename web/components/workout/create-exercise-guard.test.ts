import { describe, expect, it } from "vitest";
import { canOfferCreate, CREATE_SETTLE_MS, createTapDecision } from "./create-exercise-guard";

describe("création d'exercice depuis la recherche", () => {
  it("un tap pendant la frappe ne crée rien : il arme la carte (cas « Trac » du 01/10)", () => {
    const now = 10_000;
    expect(createTapDecision({ query: "Trac", lastKeyAt: now - 200, armed: false, now })).toBe("arm");
  });

  it("le tap suivant sur la carte armée crée l'exercice", () => {
    const now = 10_000;
    expect(createTapDecision({ query: "Traction largeur épaule", lastKeyAt: now - 100, armed: true, now })).toBe("create");
  });

  it("un nom tapé puis relu se crée d'un seul tap", () => {
    const now = 10_000;
    expect(createTapDecision({ query: "Traction largeur épaule", lastKeyAt: now - CREATE_SETTLE_MS, armed: false, now })).toBe("create");
  });

  it("deux lettres ne proposent rien, un nom déjà au catalogue non plus", () => {
    expect(canOfferCreate("Tr", [])).toBe(false);
    expect(canOfferCreate("  traction pronation large ", ["Traction pronation large"])).toBe(false);
    expect(canOfferCreate("Traction largeur épaule", ["Traction pronation large"])).toBe(true);
    expect(createTapDecision({ query: "Tr", lastKeyAt: null, armed: true, now: 0 })).toBe("ignore");
  });
});
