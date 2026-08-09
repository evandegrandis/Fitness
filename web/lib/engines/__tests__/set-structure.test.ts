import { describe, expect, it } from "vitest";
import {
  compositeSetBlocks,
  detectFinisherSets,
  effectiveSetUnits,
  physiologicalSetUnits,
  setsForNormalPrediction,
} from "@/lib/engines/set-structure";
import { SetType } from "@/lib/models/enums";
import type { LoggedSet } from "@/lib/models/types";

let nextId = 0;
const BASE = new Date("2026-08-03T10:00:00.000Z");

function set(slot: number, seconds: number, weight: number, reps: number, overrides: Partial<LoggedSet> = {}): LoggedSet {
  nextId += 1;
  return {
    id: `structure-${nextId}`,
    weight,
    reps,
    setType: SetType.work,
    timestamp: new Date(BASE.getTime() + seconds * 1_000),
    setSlotIndex: slot,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

describe("séries composites — drop-set / rest-pause", () => {
  it("fusionne 4 reps lourdes + 6 reps après baisse immédiate en une seule série effective", () => {
    const sets = [set(0, 0, 100, 4), set(1, 15, 75, 6, { setType: SetType.backoff })];
    const blocks = compositeSetBlocks(sets, { increment: 2.5 });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("drop_set");
    expect(blocks[0].totalReps).toBe(10);
    expect(blocks[0].effectiveSetUnits).toBe(1);
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(1);
  });

  it("fusionne aussi une baisse immédiate d'un seul cran à charge élevée", () => {
    const sets = [set(0, 0, 100, 4), set(1, 15, 97.5, 6, { setType: SetType.backoff })];
    const blocks = compositeSetBlocks(sets, { increment: 2.5 });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("drop_set");
    expect(blocks[0].effectiveSetUnits).toBe(1);
  });

  it("compte une série isolée seulement à partir de 8 reps", () => {
    expect(effectiveSetUnits([set(0, 0, 100, 4)], { increment: 2.5 })).toBe(0);
    expect(effectiveSetUnits([set(0, 0, 100, 6)], { increment: 2.5 })).toBe(0);
    expect(effectiveSetUnits([set(0, 0, 100, 8)], { increment: 2.5 })).toBe(1);
    expect(effectiveSetUnits([set(0, 0, 100, 16)], { increment: 2.5 })).toBe(1);
  });

  it("un composite 4+4 atteint une série, plafonnée à une unité", () => {
    const exact = [set(0, 0, 100, 4), set(1, 12, 75, 4)];
    expect(effectiveSetUnits(exact, { increment: 2.5 })).toBe(1);

    const sets = [set(0, 0, 100, 4), set(1, 12, 75, 3)];
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(0);
  });

  it("détecte aussi un mini-bloc rest-pause à charge identique", () => {
    const sets = [set(0, 0, 80, 6), set(1, 18, 80, 4)];
    expect(compositeSetBlocks(sets, { increment: 2.5 })[0].kind).toBe("rest_pause");
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(1);
  });

  it("ne fusionne pas deux séries séparées par un repos normal", () => {
    const sets = [set(0, 0, 100, 4), set(1, 120, 75, 8)];
    expect(compositeSetBlocks(sets, { increment: 2.5 })).toHaveLength(2);
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(1);
  });

  it("ne considère jamais les timestamps identiques d'un import legacy comme une preuve", () => {
    const timestamp = new Date("2026-04-10T18:00:00.000Z");
    const sets = [
      set(0, 0, 100, 4, { timestamp }),
      set(1, 0, 75, 8, { timestamp }),
    ];
    expect(compositeSetBlocks(sets, { increment: 2.5 })).toHaveLength(2);
  });

  it("ne traverse pas deux rounds de superset", () => {
    const sets = [
      set(0, 0, 100, 4, { supersetRoundIndex: 1 }),
      set(1, 15, 75, 6, { supersetRoundIndex: 2 }),
    ];
    expect(compositeSetBlocks(sets, { increment: 2.5 })).toHaveLength(2);
  });
});

describe("finishers — exclusion des ancres normales", () => {
  it("exclut toujours un finisher explicitement persisté", () => {
    const normal = set(0, 0, 0, 10);
    const finisher = set(1, 300, 0, 20, { setType: SetType.finisher });

    expect(effectiveSetUnits([normal, finisher])).toBe(1);
    expect(setsForNormalPrediction([normal, finisher])).toEqual([normal]);
  });

  it("compte un finisher dans le volume physiologique sans le remettre dans la prédiction", () => {
    const normal = set(0, 0, 80, 8);
    const finisher = set(1, 180, 0, 4, { setType: SetType.finisher });

    expect(setsForNormalPrediction([normal, finisher])).toEqual([normal]);
    expect(physiologicalSetUnits([normal, finisher])).toBe(1);
  });

  it("isole un burnout final hautes reps après une baisse franche (tractions lestées -> PDC)", () => {
    const weighted = set(0, 0, 20, 6, { setType: SetType.topSet });
    const burnout = set(1, 300, 0, 15, { setType: SetType.backoff });
    const marks = detectFinisherSets([weighted, burnout], { increment: 1.25 });

    expect(marks).toHaveLength(1);
    expect(marks[0].set.id).toBe(burnout.id);
    expect(marks[0].evidence).toContain("tail_burnout");
    expect(setsForNormalPrediction([weighted, burnout], { increment: 1.25 })).toEqual([weighted]);
  });

  it("conserve un backoff PDC normal qui n'est pas à hautes reps", () => {
    const weighted = set(0, 0, 20, 6, { setType: SetType.topSet });
    const backoff = set(1, 300, 0, 8, { setType: SetType.backoff });
    expect(detectFinisherSets([weighted, backoff], { increment: 1.25 })).toHaveLength(0);
    expect(setsForNormalPrediction([weighted, backoff], { increment: 1.25 })).toHaveLength(2);
  });

  it("reconnaît un exercice court placé en fin de séance (ex. lateral raises)", () => {
    const sets = [set(0, 0, 12, 10), set(1, 180, 12, 7)];
    const options = { position: { position: 8, sessionExerciseCount: 10 } };
    const marks = detectFinisherSets(sets, options);

    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => mark.evidence.includes("exercise_position"))).toBe(true);
    expect(setsForNormalPrediction(sets, options)).toHaveLength(0);
    expect(setsForNormalPrediction(sets, { ...options, preserveDedicatedFinisher: true })).toHaveLength(2);
  });

  it("documente la limite : un finisher PDC->PDC sans position explicite reste indétectable", () => {
    const sets = [set(0, 0, 0, 10), set(1, 180, 0, 15)];
    expect(detectFinisherSets(sets)).toHaveLength(0);
  });
});
