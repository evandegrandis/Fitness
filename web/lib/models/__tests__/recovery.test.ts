import { describe, expect, it } from "vitest";

import { hasAnyRecoveryValue, shouldPersistRecoveryValues } from "@/lib/models/recovery";

const EMPTY = {
  tookCreatine: null,
  proteinTargetMet: null,
  sleepHours: null,
  hadAlcohol: null,
} as const;

describe("recovery tri-state persistence", () => {
  it("ignore un nouveau draft vide mais persiste un ancien draft vidé pour le supprimer", () => {
    expect(shouldPersistRecoveryValues(null, EMPTY)).toBe(false);
    expect(shouldPersistRecoveryValues("existing", EMPTY)).toBe(true);
  });

  it("distingue une réponse Non de la valeur inconnue", () => {
    expect(hasAnyRecoveryValue(EMPTY)).toBe(false);
    expect(hasAnyRecoveryValue({ ...EMPTY, hadAlcohol: false })).toBe(true);
    expect(hasAnyRecoveryValue({ ...EMPTY, tookCreatine: false })).toBe(true);
  });
});
