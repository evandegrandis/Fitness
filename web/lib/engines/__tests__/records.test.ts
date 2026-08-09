import { describe, expect, it } from "vitest";
import {
  buildFinisherRecords,
  classifyFinisher,
  EMPTY_RECORDS,
  isFinisherRepRecord,
  RecordsEngine,
} from "@/lib/engines/records";
import { SetType } from "@/lib/models/enums";
import type { Exercise, LoggedSet } from "@/lib/models/types";

const BENCH: Exercise = {
  id: "ex-bench",
  name: "Développé couché",
  category: "push",
  setPatternMode: "straight",
  repTargetMin: 6,
  repTargetMax: 10,
  smallestIncrement: 2.5,
  isFavorite: false,
  createdByUser: false,
  sortOrder: 0,
  suggestedRestSeconds: 120,
  machineSetting: "",
  setupNotes: "",
  benchmarkLow: null,
  benchmarkHigh: null,
  fatigueClass: "heavy",
  progressionPolicy: null,
  voluntaryRepCap: 0,
  muscleMappings: [],
  lastUsed: null,
  movementPattern: null,
  resistanceProfile: null,
  strengthStandardKey: null,
  benchmarkUnit: null,
};

const PULLUPS: Exercise = { ...BENCH, id: "ex-pullups", name: "Tractions", repTargetMin: 8, repTargetMax: 15 };

function set(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-10T10:00:00"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

describe("buildRecords", () => {
  it("retourne EMPTY_RECORDS sans historique", () => {
    expect(RecordsEngine.buildRecords(BENCH, [])).toEqual(EMPTY_RECORDS);
  });

  it("ignore les sets non complétés et les warmups", () => {
    const sets = [set({ weight: 100, reps: 8, completed: false }), set({ weight: 90, reps: 8, setType: SetType.warmup })];
    expect(RecordsEngine.buildRecords(BENCH, sets)).toEqual(EMPTY_RECORDS);
  });

  it("calcule heaviestValidated, bestRepsByWeight, heaviestEver, bestE1RM", () => {
    const sets = [
      set({ weight: 80, reps: 10 }),
      set({ weight: 80, reps: 8 }),
      set({ weight: 85, reps: 3 }), // sous repTargetMin (6) -> compte pour heaviestEver seulement
    ];
    const records = RecordsEngine.buildRecords(BENCH, sets);
    expect(records.heaviestValidated).toBe(80);
    expect(records.repsAtHeaviestValidated).toBe(10);
    expect(records.heaviestEver).toBe(85);
    expect(records.bestRepsByWeight[80]).toBe(10);
    expect(records.isEmpty).toBe(false);
  });

  it("piste bodyweight ne nécessite pas repTargetMin", () => {
    const sets = [set({ weight: 0, reps: 4 }), set({ weight: 0, reps: 12 })];
    const records = RecordsEngine.buildRecords(PULLUPS, sets);
    expect(records.bestBodyweightReps).toBe(12);
  });

  it("une continuation composite ne modifie jamais les records normaux", () => {
    const started = new Date("2026-07-10T10:00:00");
    const lead = set({ weight: 100, reps: 4, setSlotIndex: 0, timestamp: started });
    const continuation = set({
      weight: 75,
      reps: 12,
      setType: SetType.backoff,
      setSlotIndex: 1,
      timestamp: new Date(started.getTime() + 10_000),
    });

    const records = RecordsEngine.buildRecords(BENCH, [lead, continuation]);
    expect(records.heaviestEver).toBe(100);
    expect(records.heaviestValidated).toBe(0);
    expect(records.bestRepsByWeight[75]).toBeUndefined();

    const logged = {
      id: "le-composite",
      orderIndex: 0,
      notes: "",
      exerciseId: BENCH.id,
      exerciseName: BENCH.name,
      supersetGroupId: null,
      plateauWeakPoint: null,
      sets: [lead, continuation],
    };
    const displayed = RecordsEngine.displayedRecordSetIDs(logged, [lead, continuation], BENCH);
    expect(displayed.has(lead.id)).toBe(true);
    expect(displayed.has(continuation.id)).toBe(false);
  });
});

describe("classify — ordre de priorité exact des 4 types de records", () => {
  it("1. bodyweight: reps > bestBodyweightReps quand weight == 0", () => {
    const prior = RecordsEngine.buildRecords(PULLUPS, [set({ weight: 0, reps: 8 })]);
    const kind = RecordsEngine.classify(set({ weight: 0, reps: 10 }), PULLUPS, prior);
    expect(kind).toBe("bodyweightReps");
  });

  it("2. heaviestWeight bat tout le reste, même sans reps validées", () => {
    const prior = RecordsEngine.buildRecords(BENCH, [set({ weight: 80, reps: 10 })]);
    // 90kg pour seulement 1 rep (< repTargetMin 6) — record de poids quand même
    const kind = RecordsEngine.classify(set({ weight: 90, reps: 1 }), BENCH, prior);
    expect(kind).toBe("heaviestWeight");
  });

  it("guard: reps < repTargetMin et poids pas nouveau -> null (pas de record e1RM/reps)", () => {
    const prior = RecordsEngine.buildRecords(BENCH, [set({ weight: 80, reps: 10 })]);
    const kind = RecordsEngine.classify(set({ weight: 70, reps: 3 }), BENCH, prior);
    expect(kind).toBeNull();
  });

  it("3. estimated1RM avec marge x1.02 — 80x10 puis 80x9 NE déclenche PAS", () => {
    // e1RM(80,10) = 80 * (1 + 10/30) = 106.667
    const prior = RecordsEngine.buildRecords(BENCH, [set({ weight: 80, reps: 10 })]);
    // e1RM(80,9) = 80 * (1 + 9/30) = 104 < 106.667 * 1.02 = 108.8
    const kind = RecordsEngine.classify(set({ weight: 80, reps: 9 }), BENCH, prior);
    expect(kind).toBeNull();
  });

  it("3bis. estimated1RM déclenche quand la marge de 2% est dépassée (même poids, plus de reps)", () => {
    // Poids déjà atteint (donc pas de branche heaviestWeight) mais e1RM nettement meilleur.
    const prior = RecordsEngine.buildRecords(BENCH, [set({ weight: 80, reps: 10 }), set({ weight: 85, reps: 1 })]); // heaviestEver=85, e1RM=106.667
    // e1RM(80,12) = 80 * 1.4 = 112 > 106.667 * 1.02 = 108.8, poids 80 <= heaviestEver 85
    const kind = RecordsEngine.classify(set({ weight: 80, reps: 12 }), BENCH, prior);
    expect(kind).toBe("estimated1RM");
  });

  it("4. repsAtWeight: plus de reps au même poids déjà atteint, sans battre e1RM", () => {
    // Historique large pour que bestE1RM soit déjà élevé et ne soit pas battu.
    const prior = RecordsEngine.buildRecords(BENCH, [set({ weight: 100, reps: 10 }), set({ weight: 80, reps: 8 })]);
    const kind = RecordsEngine.classify(set({ weight: 80, reps: 9 }), BENCH, prior);
    expect(kind).toBe("repsAtWeight");
  });

  it("retourne null si le set n'est pas complété", () => {
    const prior = RecordsEngine.buildRecords(BENCH, []);
    expect(RecordsEngine.classify(set({ completed: false, weight: 200, reps: 10 }), BENCH, prior)).toBeNull();
  });

  it("retourne null quand rien n'est battu", () => {
    const prior = RecordsEngine.buildRecords(BENCH, [set({ weight: 80, reps: 10 })]);
    const kind = RecordsEngine.classify(set({ weight: 80, reps: 10 }), BENCH, prior);
    expect(kind).toBeNull();
  });
});

describe("isRecordSet / displayedRecordSetIDs", () => {
  it("étoile le set le plus lourd et le meilleur set de reps à poids donné", () => {
    const s1 = set({ weight: 80, reps: 10 });
    const s2 = set({ weight: 85, reps: 6 });
    const s3 = set({ weight: 80, reps: 6 }); // pas record (moins que s1 au même poids)
    const all = [s1, s2, s3];

    expect(RecordsEngine.isRecordSet(s1, all, BENCH)).toBe(true);
    expect(RecordsEngine.isRecordSet(s2, all, BENCH)).toBe(true);
    expect(RecordsEngine.isRecordSet(s3, all, BENCH)).toBe(false);
  });

  it("displayedRecordSetIDs garde au plus les catégories distinctes (validé + BW + absolu)", () => {
    const le = {
      id: "le-1",
      orderIndex: 0,
      notes: "",
      exerciseId: BENCH.id,
      exerciseName: BENCH.name,
      supersetGroupId: null,
      plateauWeakPoint: null,
      sets: [set({ weight: 80, reps: 10 }), set({ weight: 85, reps: 3 })],
    };
    const ids = RecordsEngine.displayedRecordSetIDs(le, le.sets, BENCH);
    // 80x10 = meilleur set validé ; 85x3 = meilleur poids absolu (distinct, sous validation)
    expect(ids.size).toBe(2);
    expect(ids.has(le.sets[0].id)).toBe(true);
    expect(ids.has(le.sets[1].id)).toBe(true);
  });
});

describe("records finishers séparés", () => {
  it("compare uniquement les reps à la même charge sans contaminer les PR normaux", () => {
    const history = [set({ weight: 0, reps: 16, setType: SetType.finisher })];
    const priorNormal = RecordsEngine.buildRecords(PULLUPS, history);
    const priorFinisher = buildFinisherRecords(history);
    const improved = set({ weight: 0, reps: 18, setType: SetType.finisher });

    expect(priorNormal.isEmpty).toBe(true);
    expect(RecordsEngine.classify(improved, PULLUPS, priorNormal)).toBeNull();
    expect(isFinisherRepRecord(improved, priorFinisher)).toBe(true);
    expect(classifyFinisher(improved, priorFinisher)).toBe("finisherReps");
    expect(isFinisherRepRecord(set({ weight: 0, reps: 15, setType: SetType.finisher }), priorFinisher)).toBe(false);
  });

  it("affiche l'étoile finisher uniquement sur le meilleur nombre de reps à cette charge", () => {
    const previous = set({ id: "finisher-old", weight: 0, reps: 16, setType: SetType.finisher });
    const improved = set({ id: "finisher-new", weight: 0, reps: 18, setType: SetType.finisher });
    const logged = {
      id: "le-finisher",
      orderIndex: 0,
      notes: "",
      exerciseId: PULLUPS.id,
      exerciseName: PULLUPS.name,
      supersetGroupId: null,
      plateauWeakPoint: null,
      sets: [improved],
    };

    const displayed = RecordsEngine.displayedRecordSetIDs(logged, [previous, improved], PULLUPS);
    expect(displayed).toEqual(new Set([improved.id]));
  });
});
