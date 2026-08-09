import { describe, expect, it } from "vitest";
import { SessionFatigueContext } from "@/lib/engines/session-fatigue";
import { MuscleParent } from "@/lib/models/muscles";

describe("SessionFatigueContext", () => {
  it("empty context n'est jamais significatif", () => {
    const ctx = SessionFatigueContext.empty;
    expect(ctx.totalSystemicCost).toBe(0);
    expect(ctx.isSignificant(MuscleParent.pectoraux)).toBe(false);
    expect(ctx.fatigueNote(MuscleParent.pectoraux)).toBeNull();
  });

  it("totalSystemicCost pondère par baseRepDrop selon fatigueClass", () => {
    const ctx = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 3, fatigueClass: "heavy" }, // 3*2.0=6
      { primaryParent: MuscleParent.dosHaut, workSetsCompleted: 2, fatigueClass: "medium" }, // 2*1.5=3
    ]);
    expect(ctx.totalSystemicCost).toBe(9);
  });

  it("fatigue systémique confirmée dès que la pénalité d'excès atteint 2", () => {
    // 6 sets heavy = 12.0 -> floor(12/6) = pénalité 2
    const ctxAtBoundary = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 6, fatigueClass: "heavy" },
    ]);
    expect(ctxAtBoundary.totalSystemicCost).toBe(12);
    expect(ctxAtBoundary.isSignificant(MuscleParent.quads)).toBe(true);

    // 7 sets heavy = 14.0 -> significatif
    const ctxOver = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 7, fatigueClass: "heavy" },
    ]);
    expect(ctxOver.totalSystemicCost).toBe(14);
    expect(ctxOver.isSignificant(MuscleParent.quads)).toBe(true);
    expect(ctxOver.fatigueNote(MuscleParent.quads)).toBe("Fatigue systémique de séance détectée");
  });

  it("ne surdétecte pas une fatigue systémique à mi-palier", () => {
    const ctx = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 4.5, fatigueClass: "heavy" },
    ]); // coût 9 : un seul palier complet de 6, pas deux
    expect(ctx.fatiguePenalty(MuscleParent.quads)).toBe(1);
    expect(ctx.fatigueNote(MuscleParent.quads)).toBeNull();
  });

  it("n'annonce jamais comme fatigue un contexte entièrement absorbé par la baseline", () => {
    const ctx = new SessionFatigueContext(
      [{ primaryParent: MuscleParent.pectoraux, workSetsCompleted: 7, fatigueClass: "heavy" }],
      { baselineSystemicCost: 14, baselineSameParentSets: 7 }
    );
    expect(ctx.fatiguePenalty(MuscleParent.pectoraux)).toBe(0);
    expect(ctx.isSignificant(MuscleParent.pectoraux)).toBe(false);
    expect(ctx.fatigueNote(MuscleParent.pectoraux)).toBeNull();
  });

  it("fatigue locale déclenchée à >= 3 sets sur le même parent, même si systémique faible", () => {
    const ctx = new SessionFatigueContext([
      { primaryParent: MuscleParent.biceps, workSetsCompleted: 3, fatigueClass: "light" }, // cost=3, pas systémique
    ]);
    expect(ctx.totalSystemicCost).toBe(3);
    expect(ctx.sameParentSets(MuscleParent.biceps)).toBe(3);
    expect(ctx.isSignificant(MuscleParent.biceps)).toBe(true);
    expect(ctx.fatigueNote(MuscleParent.biceps)).toBe("Fatigue locale Biceps détectée");
    // Sur un autre parent, pas de fatigue locale et pas de fatigue systémique
    expect(ctx.isSignificant(MuscleParent.quads)).toBe(false);
    expect(ctx.fatigueNote(MuscleParent.quads)).toBeNull();
  });

  it("2 sets sur le même parent ne suffisent pas (seuil = 3)", () => {
    const ctx = new SessionFatigueContext([
      { primaryParent: MuscleParent.triceps, workSetsCompleted: 2, fatigueClass: "medium" },
    ]);
    expect(ctx.isSignificant(MuscleParent.triceps)).toBe(false);
  });

  it("sameParentSets agrège plusieurs priorLoads du même parent", () => {
    const ctx = new SessionFatigueContext([
      { primaryParent: MuscleParent.grandDorsal, workSetsCompleted: 2, fatigueClass: "medium" },
      { primaryParent: MuscleParent.grandDorsal, workSetsCompleted: 1, fatigueClass: "light" },
      { primaryParent: MuscleParent.abs, workSetsCompleted: 5, fatigueClass: "light" },
    ]);
    expect(ctx.sameParentSets(MuscleParent.grandDorsal)).toBe(3);
    expect(ctx.isSignificant(MuscleParent.grandDorsal)).toBe(true);
  });

  it("isSignificant/fatigueNote avec parent null retombe sur le seul critère systémique", () => {
    const ctxLow = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 3, fatigueClass: "heavy" },
    ]);
    expect(ctxLow.isSignificant(null)).toBe(false);

    const ctxHigh = new SessionFatigueContext([
      { primaryParent: MuscleParent.pectoraux, workSetsCompleted: 7, fatigueClass: "heavy" },
    ]);
    expect(ctxHigh.isSignificant(null)).toBe(true);
    expect(ctxHigh.fatigueNote(null)).toBe("Fatigue systémique de séance détectée");
  });
});
