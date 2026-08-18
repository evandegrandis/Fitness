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

  it("compte une série isolée à partir de 6 reps (seuil de stimulus, pas de complétion)", () => {
    expect(effectiveSetUnits([set(0, 0, 100, 4)], { increment: 2.5 })).toBe(0);
    expect(effectiveSetUnits([set(0, 0, 100, 5)], { increment: 2.5 })).toBe(0);
    expect(effectiveSetUnits([set(0, 0, 100, 6)], { increment: 2.5 })).toBe(1);
    expect(effectiveSetUnits([set(0, 0, 100, 8)], { increment: 2.5 })).toBe(1);
    expect(effectiveSetUnits([set(0, 0, 100, 16)], { increment: 2.5 })).toBe(1);
  });

  it("un composite atteint une série dès 6 reps cumulées, plafonnée à une unité", () => {
    const exact = [set(0, 0, 100, 4), set(1, 12, 75, 4)];
    expect(effectiveSetUnits(exact, { increment: 2.5 })).toBe(1);

    const juste = [set(0, 0, 100, 4), set(1, 12, 75, 2)];
    expect(effectiveSetUnits(juste, { increment: 2.5 })).toBe(1);

    const tropCourt = [set(0, 0, 100, 3), set(1, 12, 75, 2)];
    expect(effectiveSetUnits(tropCourt, { increment: 2.5 })).toBe(0);
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

  it("regroupe une série logique explicitement complétée même si la saisie est espacée", () => {
    const sets = [
      set(0, 0, 80, 9, { logicalSetId: "pec-1" }),
      set(1, 192, 85, 5, { logicalSetId: "pec-2" }),
      set(2, 425, 75, 5, { logicalSetId: "pec-2", setTechnique: "completion" }),
    ];
    const blocks = compositeSetBlocks(sets, { increment: 5 });

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ kind: "completion", totalReps: 10, effectiveSetUnits: 1 });
    expect(effectiveSetUnits(sets, { increment: 5 })).toBe(2);
  });

  it("ne fusionne jamais deux groupes logiques explicites distincts", () => {
    const sets = [
      set(0, 0, 100, 4, { logicalSetId: "group-a" }),
      set(1, 120, 75, 4, { logicalSetId: "group-a", setTechnique: "completion" }),
      set(2, 240, 100, 4, { logicalSetId: "group-b" }),
      set(3, 360, 75, 4, { logicalSetId: "group-b", setTechnique: "completion" }),
    ];
    expect(compositeSetBlocks(sets, { increment: 2.5 })).toHaveLength(2);
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(2);
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

describe("pondération par le RIR — c'est la proximité de l'échec qui fait le stimulus", () => {
  it("compte une série pleine jusqu'à RIR 2, puis la dévalue", () => {
    const withRir = (rir: number) => [{ ...set(0, 0, 100, 8), reportedRir: rir }];
    expect(effectiveSetUnits(withRir(0), { increment: 2.5 })).toBe(1);
    expect(effectiveSetUnits(withRir(2), { increment: 2.5 })).toBe(1);
    expect(effectiveSetUnits(withRir(3), { increment: 2.5 })).toBe(0.75);
    expect(effectiveSetUnits(withRir(4), { increment: 2.5 })).toBe(0.5);
  });

  it("ne dévalue jamais une série sans RIR — l'historique antérieur ne doit pas s'effondrer", () => {
    expect(effectiveSetUnits([set(0, 0, 100, 8)], { increment: 2.5 })).toBe(1);
  });

  it("retient le RIR le plus bas d'un bloc : c'est la fin qui porte l'effort", () => {
    // Ouverture confortable (RIR 3) terminée à l'échec (RIR 0) : stimulus complet.
    const sets = [
      { ...set(0, 0, 100, 5), reportedRir: 3 },
      { ...set(1, 12, 80, 3), reportedRir: 0 },
    ];
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(1);
  });

  it("un travail trop court reste à zéro, même mené à l'échec", () => {
    expect(effectiveSetUnits([{ ...set(0, 0, 100, 4), reportedRir: 0 }], { increment: 2.5 })).toBe(0);
  });
});

describe("séries complémentaires — le cas réel du 18/08", () => {
  it("rattache une complémentaire même quand la charge REMONTE", () => {
    // 65×2 puis 72,5×7 : 9 reps réelles. L'ancienne règle exigeait une charge descendante et
    // laissait ces deux séries à 0 série effective chacune.
    const sets = [set(0, 0, 65, 2), set(1, 15, 72.5, 7)];
    const blocks = compositeSetBlocks(sets, { increment: 2.5 });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].totalReps).toBe(9);
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(1);
  });

  it("accepte plusieurs complémentaires d'affilée", () => {
    const sets = [set(0, 0, 60, 2), set(1, 12, 50, 2), set(2, 24, 40, 2)];
    expect(compositeSetBlocks(sets, { increment: 2.5 })).toHaveLength(1);
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(1);
  });

  it("ne fusionne PAS deux vraies séries : au-delà de 30 s, nouveau bloc", () => {
    const sets = [set(0, 0, 60, 4), set(1, 90, 60, 4)];
    expect(compositeSetBlocks(sets, { increment: 2.5 })).toHaveLength(2);
  });

  it("ne fusionne PAS une série déjà complète, même enchaînée vite", () => {
    // 8 reps n'ont rien à compléter : la suivante ouvre son propre bloc.
    const sets = [set(0, 0, 60, 8), set(1, 15, 60, 8)];
    const blocks = compositeSetBlocks(sets, { increment: 2.5 });
    expect(blocks).toHaveLength(2);
    expect(effectiveSetUnits(sets, { increment: 2.5 })).toBe(2);
  });
});
