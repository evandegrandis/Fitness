import { describe, expect, it } from "vitest";

import { SetType } from "@/lib/models/enums";
import type { LoggedExercise, LoggedSet, SupersetGroup, WorkoutSession } from "@/lib/models/types";
import {
  autoDetectSupersetIfNeeded,
  cloneSupersetTopology,
  completedSupersetRounds,
  detachFromSupersetGroup,
  handleSupersetLink,
  isLastInSuperset,
  isSupersetRoundComplete,
  moveExercise,
  nextSupersetExerciseId,
  nextSupersetRoundIndex,
  recomputeSupersetRoundIndices,
  wouldCompleteSupersetPattern,
} from "@/lib/store/superset";

function loggedSet(
  id: string,
  timestampMs: number,
  slot: number,
  options: Partial<Pick<LoggedSet, "weight" | "reps" | "setType" | "supersetRoundIndex">> = {}
): LoggedSet {
  return {
    id,
    weight: options.weight ?? 50,
    reps: options.reps ?? 8,
    setType: options.setType ?? SetType.work,
    timestamp: new Date(timestampMs),
    setSlotIndex: slot,
    completed: true,
    supersetRoundIndex: options.supersetRoundIndex ?? null,
  };
}

function loggedExercise(
  id: string,
  orderIndex: number,
  sets: LoggedSet[] = [],
  supersetGroupId: string | null = null
): LoggedExercise {
  return {
    id,
    orderIndex,
    notes: "",
    exerciseId: `catalog-${id}`,
    exerciseName: id,
    sets,
    supersetGroupId,
    plateauWeakPoint: null,
  };
}

function workoutSession(
  exercises: LoggedExercise[],
  supersetGroups: SupersetGroup[] = []
): WorkoutSession {
  return {
    id: "session",
    date: new Date(0),
    startTime: new Date(0),
    endTime: null,
    notes: "",
    isActive: true,
    templateName: null,
    exercises,
    supersetGroups,
    cardioEntries: [],
  };
}

function appendWorkSet(
  session: WorkoutSession,
  exerciseId: string,
  sequenceIndex: number
): { session: WorkoutSession; setId: string } {
  const setId = `set-${sequenceIndex}`;
  return {
    setId,
    session: {
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [
                ...exercise.sets,
                loggedSet(setId, (sequenceIndex + 1) * 1_000, exercise.sets.length),
              ],
            }
          : exercise
      ),
    },
  };
}

function autoDetectedSession(size: 2 | 3 | 4, visitCount = size * 2): WorkoutSession {
  const memberIds = ["A", "B", "C", "D"].slice(0, size);
  const interleaved = memberIds.flatMap((id, index) =>
    index === 0 ? [loggedExercise(id, index)] : [loggedExercise(`solo-${index}`, index * 2 - 1), loggedExercise(id, index * 2)]
  );
  let session = workoutSession(interleaved);
  let groupCounter = 0;

  for (let index = 0; index < visitCount; index += 1) {
    const memberId = memberIds[index % size];
    session = appendWorkSet(session, memberId, index).session;
    session = autoDetectSupersetIfNeeded(session, memberId, () => `group-${++groupCounter}`);
  }
  return session;
}

describe("superset 2–4 membres", () => {
  it.each([2, 3, 4] as const)(
    "détecte %i membres, stabilise leur ordre et rend le bloc contigu",
    (size) => {
      const expected = ["A", "B", "C", "D"].slice(0, size);
      const session = autoDetectedSession(size);

      expect(session.supersetGroups).toHaveLength(1);
      expect(session.supersetGroups[0].memberOrder).toEqual(expected);
      const orderedIds = [...session.exercises]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((exercise) => exercise.id);
      const anchor = orderedIds.indexOf("A");
      expect(orderedIds.slice(anchor, anchor + size)).toEqual(expected);
      for (const memberId of expected) {
        const member = session.exercises.find((exercise) => exercise.id === memberId)!;
        expect(member.sets.map((set) => set.supersetRoundIndex)).toEqual([1, 2]);
      }
      expect(completedSupersetRounds(session, session.supersetGroups[0].id)).toBe(2);
    }
  );

  it.each([2, 3, 4] as const)(
    "ne fait jamais tourner l'ordre de %i membres après douze visites",
    (size) => {
      const expected = ["A", "B", "C", "D"].slice(0, size);
      const session = autoDetectedSession(size, 29);
      const group = session.supersetGroups[0];

      expect(group.memberOrder).toEqual(expected);
      for (const memberId of expected) {
        const member = session.exercises.find((exercise) => exercise.id === memberId)!;
        expect(isLastInSuperset(session, member)).toBe(memberId === expected.at(-1));
      }
    }
  );

  it("permet de construire manuellement un groupe de quatre membres, sans cinquième", () => {
    let session = workoutSession([
      loggedExercise("A", 0),
      loggedExercise("solo", 1),
      loggedExercise("B", 2),
      loggedExercise("C", 3),
      loggedExercise("D", 4),
      loggedExercise("E", 5),
    ]);
    let armed: string | null = null;
    let result = handleSupersetLink(session, "A", armed, () => "group");
    session = result.session;
    armed = result.armed;
    result = handleSupersetLink(session, "B", armed, () => "group");
    session = result.session;

    for (const joining of ["C", "D"]) {
      result = handleSupersetLink(session, joining, null, () => "unused");
      result = handleSupersetLink(result.session, "A", result.armed, () => "unused");
      session = result.session;
    }

    expect(session.supersetGroups[0].memberOrder).toEqual(["A", "B", "C", "D"]);
    expect([...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex).map((e) => e.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "solo",
      "E",
    ]);

    const armFifth = handleSupersetLink(session, "E", null, () => "unused");
    const rejectFifth = handleSupersetLink(armFifth.session, "A", armFifth.armed, () => "unused");
    expect(rejectFifth.session).toBe(session);
    expect(rejectFifth.armed).toBe("E");
  });

  it.each([2, 3, 4] as const)(
    "reconnaît le set candidat qui complète le deuxième cycle à %i membres avant auto-finisher",
    (size) => {
      const memberIds = ["A", "B", "C", "D"].slice(0, size);
      let session = workoutSession(memberIds.map((id, index) => loggedExercise(id, index)));
      for (let index = 0; index < size * 2 - 1; index += 1) {
        session = appendWorkSet(session, memberIds[index % size], index).session;
      }
      const lastMember = memberIds.at(-1)!;
      const lastExercise = session.exercises.find((exercise) => exercise.id === lastMember)!;

      expect(
        wouldCompleteSupersetPattern(session, lastMember, {
          weight: 0,
          reps: 16,
          setType: SetType.work,
          timestamp: new Date(size * 2 * 1_000),
          setSlotIndex: lastExercise.sets.length,
        })
      ).toBe(true);
    }
  );

  it("protège chaque préfixe du second cycle ABCD contre l'auto-finisher", () => {
    const memberIds = ["A", "B", "C", "D"];
    let session = workoutSession(memberIds.map((id, index) => loggedExercise(id, index)));
    for (let index = 0; index < memberIds.length; index += 1) {
      session = appendWorkSet(session, memberIds[index], index).session;
    }

    for (let prefix = 0; prefix < memberIds.length; prefix += 1) {
      const memberId = memberIds[prefix];
      const member = session.exercises.find((exercise) => exercise.id === memberId)!;
      expect(
        wouldCompleteSupersetPattern(session, memberId, {
          weight: 0,
          reps: 16,
          setType: SetType.work,
          timestamp: new Date((memberIds.length + prefix + 1) * 1_000),
          setSlotIndex: member.sets.length,
        })
      ).toBe(true);
      session = appendWorkSet(session, memberId, memberIds.length + prefix).session;
    }
  });
});

describe("rounds globaux et composites", () => {
  it("compte un drop-set comme une visite et laisse warmups/finishers hors rounds", () => {
    const group: SupersetGroup = { id: "group", orderIndex: 0, memberOrder: ["A", "B"] };
    const session = workoutSession(
      [
        loggedExercise(
          "A",
          0,
          [
            loggedSet("warmup", 500, 0, { setType: SetType.warmup, supersetRoundIndex: 9 }),
            loggedSet("a-1", 1_000, 1, { weight: 100, reps: 4, supersetRoundIndex: 9 }),
            loggedSet("a-drop", 10_000, 2, {
              weight: 97.5,
              reps: 6,
              setType: SetType.backoff,
              supersetRoundIndex: 9,
            }),
            loggedSet("finisher", 15_000, 3, { setType: SetType.finisher, supersetRoundIndex: 9 }),
            loggedSet("a-2", 40_000, 4, { supersetRoundIndex: 9 }),
          ],
          "group"
        ),
        loggedExercise("B", 1, [loggedSet("b-1", 20_000, 0), loggedSet("b-2", 50_000, 1)], "group"),
      ],
      [group]
    );

    const repaired = recomputeSupersetRoundIndices(session, "group");
    const a = repaired.exercises[0];
    const b = repaired.exercises[1];
    expect(a.sets.map((set) => set.supersetRoundIndex)).toEqual([null, 1, 1, null, 2]);
    expect(b.sets.map((set) => set.supersetRoundIndex)).toEqual([1, 2]);
    expect(completedSupersetRounds(repaired, "group")).toBe(2);
    expect(nextSupersetRoundIndex(repaired, "A")).toBe(3);
  });

  it.each([
    { label: "drop-set", continuationWeight: 97.5, continuationReps: 6, continuationType: SetType.backoff },
    { label: "rest-pause", continuationWeight: 100, continuationReps: 3, continuationType: SetType.work },
  ])("auto-détecte les $label pour deux, trois et quatre membres", (technique) => {
    for (const memberIds of [["A", "B"], ["A", "B", "C"], ["A", "B", "C", "D"]]) {
      const exercises = memberIds.map((id, index) => loggedExercise(id, index));
      let session = workoutSession(exercises);
      let timestamp = 1_000;
      let serial = 0;

      for (let round = 0; round < 2; round += 1) {
        for (const memberId of memberIds) {
          const member = session.exercises.find((exercise) => exercise.id === memberId)!;
          const baseSlot = member.sets.length;
          const first = loggedSet(`${memberId}-${round}-lead`, timestamp, baseSlot, {
            weight: 100,
            reps: 4,
          });
          const continuation = loggedSet(`${memberId}-${round}-drop`, timestamp + 5_000, baseSlot + 1, {
            weight: technique.continuationWeight,
            reps: technique.continuationReps,
            setType: technique.continuationType,
          });
          timestamp += 10_000;
          session = {
            ...session,
            exercises: session.exercises.map((exercise) =>
              exercise.id === memberId ? { ...exercise, sets: [...exercise.sets, first, continuation] } : exercise
            ),
          };
          session = autoDetectSupersetIfNeeded(session, memberId, () => `group-${++serial}`);
        }
      }

      expect(session.supersetGroups[0].memberOrder).toEqual(memberIds);
      for (const memberId of memberIds) {
        const member = session.exercises.find((exercise) => exercise.id === memberId)!;
        expect(member.sets.map((set) => set.supersetRoundIndex)).toEqual([1, 1, 2, 2]);
      }
    }
  });

  it("n'achève un round que lorsque tous ses membres ont participé, même hors ordre", () => {
    const group: SupersetGroup = { id: "group", orderIndex: 0, memberOrder: ["A", "B", "C"] };
    let session = workoutSession(
      [loggedExercise("A", 0, [], "group"), loggedExercise("B", 1, [], "group"), loggedExercise("C", 2, [], "group")],
      [group]
    );

    let appended = appendWorkSet(session, "A", 0);
    session = recomputeSupersetRoundIndices(appended.session, "group");
    expect(isSupersetRoundComplete(session, "A", appended.setId)).toBe(false);
    expect(nextSupersetExerciseId(session, "A")).toBe("B");

    appended = appendWorkSet(session, "C", 1);
    session = recomputeSupersetRoundIndices(appended.session, "group");
    expect(isSupersetRoundComplete(session, "C", appended.setId)).toBe(false);
    expect(nextSupersetExerciseId(session, "C")).toBe("B");

    appended = appendWorkSet(session, "B", 2);
    session = recomputeSupersetRoundIndices(appended.session, "group");
    expect(isSupersetRoundComplete(session, "B", appended.setId)).toBe(true);
    expect(completedSupersetRounds(session, "group")).toBe(1);
    expect(nextSupersetExerciseId(session, "B")).toBe("A");
  });
});

describe("détachement et invariants", () => {
  it("nettoie les rounds du membre détaché et recalcule ceux du groupe restant", () => {
    const group: SupersetGroup = { id: "group", orderIndex: 0, memberOrder: ["A", "B", "C"] };
    const sets = (id: string) => [
      loggedSet(`${id}-1`, 1_000, 0, { supersetRoundIndex: 1 }),
      loggedSet(`${id}-2`, 2_000, 1, { supersetRoundIndex: 2 }),
    ];
    const session = workoutSession(
      [loggedExercise("A", 0, sets("A"), "group"), loggedExercise("B", 1, sets("B"), "group"), loggedExercise("C", 2, sets("C"), "group")],
      [group]
    );

    const detached = detachFromSupersetGroup(session, "B");
    expect(detached.supersetGroups[0].memberOrder).toEqual(["A", "C"]);
    expect(detached.exercises.find((exercise) => exercise.id === "B")?.supersetGroupId).toBeNull();
    expect(detached.exercises.find((exercise) => exercise.id === "B")?.sets.map((set) => set.supersetRoundIndex)).toEqual([
      null,
      null,
    ]);
    expect(detached.exercises.find((exercise) => exercise.id === "A")?.sets.map((set) => set.supersetRoundIndex)).toEqual([
      1,
      2,
    ]);
  });

  it("dissout une paire et retire tous les badges de round", () => {
    const group: SupersetGroup = { id: "group", orderIndex: 0, memberOrder: ["A", "B"] };
    const session = workoutSession(
      [
        loggedExercise("A", 0, [loggedSet("a", 1_000, 0, { supersetRoundIndex: 1 })], "group"),
        loggedExercise("B", 1, [loggedSet("b", 2_000, 0, { supersetRoundIndex: 1 })], "group"),
      ],
      [group]
    );

    const detached = detachFromSupersetGroup(session, "A");
    expect(detached.supersetGroups).toEqual([]);
    expect(detached.exercises.map((exercise) => exercise.supersetGroupId)).toEqual([null, null]);
    expect(detached.exercises.flatMap((exercise) => exercise.sets).map((set) => set.supersetRoundIndex)).toEqual([
      null,
      null,
    ]);
  });

  it("déplace bien le membre choisi après la remise en contiguïté du groupe restant", () => {
    const group: SupersetGroup = { id: "group", orderIndex: 0, memberOrder: ["A", "B", "C"] };
    const session = workoutSession(
      [
        loggedExercise("A", 0, [], "group"),
        loggedExercise("B", 1, [], "group"),
        loggedExercise("C", 2, [], "group"),
        loggedExercise("X", 3),
      ],
      [group]
    );

    const moved = moveExercise(session, 1, 3);

    expect([...moved.exercises].sort((a, b) => a.orderIndex - b.orderIndex).map((exercise) => exercise.id)).toEqual([
      "A",
      "C",
      "X",
      "B",
    ]);
    expect(moved.supersetGroups[0].memberOrder).toEqual(["A", "C"]);
    expect(moved.exercises.find((exercise) => exercise.id === "B")?.supersetGroupId).toBeNull();
  });

  it("recopie la topologie 2–4 avec de nouveaux IDs pour « Reprendre »", () => {
    const source = workoutSession(
      [
        loggedExercise("old-A", 0),
        loggedExercise("old-B", 1),
        loggedExercise("old-C", 2),
        loggedExercise("old-D", 3),
      ].map((exercise, index) => ({ ...exercise, exerciseId: `catalog-${index}` })),
      [{ id: "old-group", orderIndex: 0, memberOrder: ["old-A", "old-B", "old-C", "old-D"] }]
    );
    const target = workoutSession(
      [
        loggedExercise("new-A", 0),
        loggedExercise("new-B", 1),
        loggedExercise("new-C", 2),
        loggedExercise("new-D", 3),
      ].map((exercise, index) => ({ ...exercise, exerciseId: `catalog-${index}` }))
    );

    const cloned = cloneSupersetTopology(source, target, () => "new-group");
    expect(cloned.supersetGroups).toEqual([
      { id: "new-group", orderIndex: 0, memberOrder: ["new-A", "new-B", "new-C", "new-D"] },
    ]);
    expect(cloned.exercises.map((exercise) => exercise.supersetGroupId)).toEqual([
      "new-group",
      "new-group",
      "new-group",
      "new-group",
    ]);
  });
});
