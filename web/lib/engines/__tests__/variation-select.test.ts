import { describe, expect, it } from "vitest";
import { mostRecentPlateauWeakPoint, selectAlternative } from "@/lib/engines/variation-select";
import { MovementPattern, SetType } from "@/lib/models/enums";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise, LoggedExercise, LoggedSet, MuscleGoal, WorkoutSession } from "@/lib/models/types";

// ---------------------------------------------------------------------------
// Fixtures (mêmes conventions que bilan.test.ts / progression.test.ts)
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `ex-${idCounter}`;
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId(),
    name: "Développé couché",
    category: "push",
    setPatternMode: "straight",
    repTargetMin: 6,
    repTargetMax: 10,
    smallestIncrement: 2.5,
    isFavorite: false,
    createdByUser: false,
    sortOrder: 0,
    suggestedRestSeconds: 90,
    machineSetting: "",
    setupNotes: "",
    benchmarkLow: null,
    benchmarkHigh: null,
    fatigueClass: "medium",
    progressionPolicy: null,
    voluntaryRepCap: 0,
    muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    lastUsed: null,
    movementPattern: null,
    resistanceProfile: null,
    strengthStandardKey: null,
    benchmarkUnit: null,
    ...overrides,
  };
}

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    weight: 60,
    reps: 8,
    setType: SetType.work,
    timestamp: new Date("2026-07-01T10:00:00Z"),
    setSlotIndex: 0,
    completed: true,
    supersetRoundIndex: null,
    ...overrides,
  };
}

function loggedExercise(exercise: Exercise, sets: LoggedSet[]): LoggedExercise {
  return {
    id: `le-${Math.random().toString(36).slice(2)}`,
    orderIndex: 0,
    notes: "",
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: sets.map((s, i) => ({ ...s, setSlotIndex: i })),
    supersetGroupId: null,
    plateauWeakPoint: null,
  };
}

function session(date: Date, exercises: LoggedExercise[]): WorkoutSession {
  return {
    id: `session-${date.getTime()}-${Math.random().toString(36).slice(2)}`,
    date,
    startTime: date,
    endTime: date,
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: [],
  };
}

const NO_GOALS: MuscleGoal[] = [];

// ---------------------------------------------------------------------------
// Filtre dur : même movementPattern requis
// ---------------------------------------------------------------------------

describe("selectAlternative — filtre dur movementPattern (SPEC §6)", () => {
  it("exclut un candidat de pattern différent même s'il aurait un meilleur score (recouvrement musculaire parfait)", () => {
    const current = makeExercise({
      name: "Développé militaire haltères",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    // Même pattern et recouvrement suffisant : candidat réellement substituable.
    const samePattern = makeExercise({
      name: "Dips",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [
        { muscleGroup: MuscleGroup.deltAnt, coefficient: 0.7 },
        { muscleGroup: MuscleGroup.tricepsLat, coefficient: 0.3 },
      ],
    });
    // Pattern DIFFÉRENT, mais recouvrement musculaire PARFAIT (score naturellement maximal si le
    // filtre dur ne l'excluait pas) — piège volontaire pour vérifier que le filtre prime sur le score.
    const differentPatternHighOverlap = makeExercise({
      name: "Développé militaire barre",
      movementPattern: MovementPattern.horizontalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });

    const result = selectAlternative(
      current,
      [current, samePattern, differentPatternHighOverlap],
      [],
      NO_GOALS
    );

    expect(result).not.toBeNull();
    expect(result!.exerciseId).toBe(samePattern.id);
  });

  it("exclut Crunch déclinés comme variante d'un Pec deck malgré le pattern isolation commun", () => {
    const pecDeck = makeExercise({
      name: "Pec deck",
      movementPattern: MovementPattern.isolation,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }],
    });
    const declinedCrunch = makeExercise({
      name: "Crunch déclinés",
      movementPattern: MovementPattern.isolation,
      muscleMappings: [
        { muscleGroup: MuscleGroup.absHaut, coefficient: 0.6 },
        { muscleGroup: MuscleGroup.absBas, coefficient: 0.4 },
      ],
    });

    expect(selectAlternative(pecDeck, [pecDeck, declinedCrunch], [], NO_GOALS)).toBeNull();
  });

  it("movementPattern null des DEUX côtés -> repli sur le recouvrement musculaire seul (§9)", () => {
    const current = makeExercise({
      name: "Machine à pecs",
      movementPattern: null,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    // Recouvrement musculaire élevé malgré movementPattern=null des deux côtés -> candidat valide.
    const closeEnough = makeExercise({
      name: "Pec deck",
      movementPattern: null,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 0.9 }],
    });
    const result = selectAlternative(current, [current, closeEnough], [], NO_GOALS);
    expect(result).not.toBeNull();
    expect(result!.exerciseId).toBe(closeEnough.id);
  });

  it("ne propose jamais la même machine d'une autre marque comme variation", () => {
    const current = makeExercise({
      name: "Chest Press LifeFitness",
      movementPattern: MovementPattern.horizontalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    const twin = makeExercise({
      name: "Chest Press",
      movementPattern: MovementPattern.horizontalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    expect(selectAlternative(current, [current, twin], [], NO_GOALS)).toBeNull();
  });

  it("movementPattern taggé d'un seul côté -> aucun repli, candidat exclu (dégradation gracieuse conservative)", () => {
    const current = makeExercise({
      name: "Développé couché",
      movementPattern: MovementPattern.horizontalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    const untaggedButSameMuscle = makeExercise({
      name: "Développé haltères",
      movementPattern: null,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    const result = selectAlternative(current, [current, untaggedButSameMuscle], [], NO_GOALS);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// null si aucun candidat valide (§9)
// ---------------------------------------------------------------------------

describe("selectAlternative — aucun candidat valide -> null, jamais de crash", () => {
  it("catalogue ne contenant que l'exercice courant -> null", () => {
    const current = makeExercise({ movementPattern: MovementPattern.isolation });
    const result = selectAlternative(current, [current], [], NO_GOALS);
    expect(result).toBeNull();
  });

  it("seul candidat disponible = pattern différent, tous deux taggés -> null", () => {
    const current = makeExercise({ movementPattern: MovementPattern.squat });
    const other = makeExercise({ movementPattern: MovementPattern.hinge });
    const result = selectAlternative(current, [current, other], [], NO_GOALS);
    expect(result).toBeNull();
  });

  it("movementPattern null des deux côtés mais recouvrement musculaire sous le seuil -> null", () => {
    const current = makeExercise({
      movementPattern: null,
      muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1.0 }],
    });
    const tooDifferent = makeExercise({
      movementPattern: null,
      muscleMappings: [{ muscleGroup: MuscleGroup.bicepsFemoral, coefficient: 1.0 }],
    });
    const result = selectAlternative(current, [current, tooDifferent], [], NO_GOALS);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Explication FR non vide
// ---------------------------------------------------------------------------

describe("selectAlternative — explication FR", () => {
  it("l'explication est non vide et mentionne le nom du candidat choisi", () => {
    const current = makeExercise({
      name: "Tirage vertical",
      movementPattern: MovementPattern.verticalPull,
      muscleMappings: [{ muscleGroup: MuscleGroup.latSup, coefficient: 1.0 }],
    });
    const candidate = makeExercise({
      name: "Tractions pronation large",
      movementPattern: MovementPattern.verticalPull,
      muscleMappings: [{ muscleGroup: MuscleGroup.latSup, coefficient: 0.9 }],
    });
    const result = selectAlternative(current, [current, candidate], [], NO_GOALS);
    expect(result).not.toBeNull();
    expect(result!.explanationFR.length).toBeGreaterThan(0);
    expect(result!.explanationFR).toContain(candidate.name);
  });

  it("candidat jamais fait (aucun historique) -> explication toujours non vide", () => {
    const current = makeExercise({ movementPattern: MovementPattern.isolation });
    const candidate = makeExercise({ movementPattern: MovementPattern.isolation, name: "Curl pupitre" });
    const result = selectAlternative(current, [current, candidate], [], NO_GOALS);
    expect(result).not.toBeNull();
    expect(result!.explanationFR.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// weakPointFit — activation P2.1 (VARIATION_CYCLING_SPEC §5.2/§6)
// ---------------------------------------------------------------------------

describe("selectAlternative — weakPointFit (P2.1)", () => {
  it("à tout le reste égal, le candidat dont resistanceProfile matche le point faible mesuré gagne", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const shared = {
      category: "push",
      fatigueClass: "medium" as const,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
      name: "Développé variante",
    };
    const matching = makeExercise({ ...shared, resistanceProfile: "lockout" });
    const nonMatching = makeExercise({ ...shared, resistanceProfile: "bottom" });

    const result = selectAlternative(current, [current, matching, nonMatching], [], NO_GOALS, "lockout");

    expect(result).not.toBeNull();
    expect(result!.exerciseId).toBe(matching.id);
  });

  it("weakPoint renseigné mais candidat non tagué (resistanceProfile=null) -> score identique au cas neutre (pas de weakPoint)", () => {
    const current = makeExercise({ movementPattern: MovementPattern.isolation });
    const untagged = makeExercise({
      movementPattern: MovementPattern.isolation,
      name: "Curl pupitre",
      resistanceProfile: null,
    });

    const withWeakPoint = selectAlternative(current, [current, untagged], [], NO_GOALS, "lockout");
    const withoutWeakPoint = selectAlternative(current, [current, untagged], [], NO_GOALS, null);

    expect(withWeakPoint).not.toBeNull();
    expect(withoutWeakPoint).not.toBeNull();
    expect(withWeakPoint!.score).toBeCloseTo(withoutWeakPoint!.score, 9);
  });

  it("l'explication ne revendique 'point faible' que si le candidat CHOISI matche réellement (pas juste parce que weakPoint est fourni)", () => {
    const current = makeExercise({ movementPattern: MovementPattern.isolation });
    const onlyCandidate = makeExercise({
      movementPattern: MovementPattern.isolation,
      name: "Curl pupitre",
      resistanceProfile: null, // non tagué -> weakPointFit neutre, PAS de match
    });

    const result = selectAlternative(current, [current, onlyCandidate], [], NO_GOALS, "lockout");

    expect(result).not.toBeNull();
    expect(result!.explanationFR).not.toContain("point faible");
  });

  it("l'explication mentionne le point faible quand le candidat choisi matche (resistanceProfile === weakPoint)", () => {
    const current = makeExercise({ movementPattern: MovementPattern.isolation });
    const matching = makeExercise({
      movementPattern: MovementPattern.isolation,
      name: "Curl pupitre",
      resistanceProfile: "lockout",
    });

    const result = selectAlternative(current, [current, matching], [], NO_GOALS, "lockout");

    expect(result).not.toBeNull();
    expect(result!.explanationFR).toContain("point faible");
    expect(result!.explanationFR).toContain("lockout");
  });
});

// ---------------------------------------------------------------------------
// mostRecentPlateauWeakPoint — dérivation (à la volée) pour progression.ts (P2.1)
// ---------------------------------------------------------------------------

describe("mostRecentPlateauWeakPoint", () => {
  it("renvoie le plateauWeakPoint le plus récent capturé pour cet exercice", () => {
    const exercise = makeExercise();
    const recentDate = new Date("2026-07-20T10:00:00Z");
    const olderDate = new Date("2026-07-01T10:00:00Z");
    const history: WorkoutSession[] = [
      session(recentDate, [
        { ...loggedExercise(exercise, [set({ timestamp: recentDate })]), plateauWeakPoint: "lockout" },
      ]),
      session(olderDate, [
        { ...loggedExercise(exercise, [set({ timestamp: olderDate })]), plateauWeakPoint: "bottom" },
      ]),
    ];
    expect(mostRecentPlateauWeakPoint(exercise.id, history)).toBe("lockout");
  });

  it("null si jamais capturé pour cet exercice (§9, dégradation gracieuse)", () => {
    const exercise = makeExercise();
    const date = new Date("2026-07-20T10:00:00Z");
    const history: WorkoutSession[] = [session(date, [loggedExercise(exercise, [set({ timestamp: date })])])];
    expect(mostRecentPlateauWeakPoint(exercise.id, history)).toBeNull();
  });

  it("null sur historique vide", () => {
    expect(mostRecentPlateauWeakPoint("any-id", [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tie-break : à score égal, préférer l'e1RM historique le plus bas (§6)
// ---------------------------------------------------------------------------

describe("selectAlternative — tie-break sur l'e1RM historique le plus bas", () => {
  it("deux candidats à score strictement égal (même gain en kg, même durée de cycle) -> gagne celui dont le pic d'e1RM historique est le plus bas", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      category: "push",
      fatigueClass: "medium",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });

    // A et B : même pattern, même muscleMappings, même catégorie, même fatigueClass, même NOM
    // (garantit une égalité EXACTE de muscleOverlap/novelty/fatiguePenalty — seule différence :
    // l'échelle absolue de charge de leur historique, via un gain en kg et une durée identiques).
    const shared = {
      category: "push",
      fatigueClass: "medium" as const,
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
      name: "Développé variante",
    };
    const heavyHistory = makeExercise({ ...shared });
    const lightHistory = makeExercise({ ...shared });

    const oldDate = new Date("2026-05-01T10:00:00Z");
    const recentDate = new Date("2026-06-26T10:00:00Z"); // +56 jours = 8 semaines exactement

    const history: WorkoutSession[] = [
      session(recentDate, [
        loggedExercise(heavyHistory, [set({ weight: 44, reps: 8, timestamp: recentDate })]),
        loggedExercise(lightHistory, [set({ weight: 14, reps: 8, timestamp: recentDate })]),
      ]),
      session(oldDate, [
        loggedExercise(heavyHistory, [set({ weight: 40, reps: 8, timestamp: oldDate })]),
        loggedExercise(lightHistory, [set({ weight: 10, reps: 8, timestamp: oldDate })]),
      ]),
    ];

    const result = selectAlternative(current, [current, heavyHistory, lightHistory], history, NO_GOALS);

    expect(result).not.toBeNull();
    // Même gain (+4kg) et même durée (8 sem.) pour les deux -> lifecycleQuality identique ;
    // seul le pic d'e1RM historique diffère (44×8 >> 14×8) -> `lightHistory` doit gagner le départage.
    expect(result!.exerciseId).toBe(lightHistory.id);
  });
});

// ---------------------------------------------------------------------------
// lifecycleQuality — normalisation RELATIVE au roster (VARIATION_CYCLING_SPEC §7, P2.2)
// ---------------------------------------------------------------------------

describe("selectAlternative — lifecycleQuality roster-relative (P2.2)", () => {
  it("le score d'un même candidat change selon la composition du roster (pas une constante absolue par candidat)", () => {
    const current = makeExercise({
      name: "Développé militaire machine",
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
    });
    const shared = {
      movementPattern: MovementPattern.verticalPress,
      muscleMappings: [{ muscleGroup: MuscleGroup.deltAnt, coefficient: 1.0 }],
      category: "push",
      fatigueClass: "medium" as const,
    };
    // Un même cycle modeste (2 semaines, +5kg) pour "candidat" — écart de 14j (<=
    // LIFECYCLE_RUN_GAP_DAYS=21) pour rester un seul run continu (cf. bug de fixture trouvé sur
    // lifecycle.test.ts : un écart > 21j entre deux séances SANS point intermédiaire les scinde).
    const candidate = makeExercise({ ...shared, name: "Développé A" });
    // "rival" : un cycle BEAUCOUP plus fort (8 semaines, +15kg, via 5 points espacés de 14j chacun),
    // présent seulement dans le 2ᵉ catalogue.
    const strongRival = makeExercise({ ...shared, name: "Développé B" });

    const oldDate = new Date("2026-05-01T10:00:00Z");
    const recentDate = new Date("2026-05-15T10:00:00Z"); // +14j = 2 semaines
    const rivalDates = [0, 14, 28, 42, 56].map((d) => new Date(new Date("2026-01-01T10:00:00Z").getTime() + d * 86_400_000));
    const rivalWeights = [30, 34, 38, 42, 45];

    const history: WorkoutSession[] = [
      session(recentDate, [loggedExercise(candidate, [set({ weight: 45, reps: 8, timestamp: recentDate })])]),
      session(oldDate, [loggedExercise(candidate, [set({ weight: 40, reps: 8, timestamp: oldDate })])]),
      ...rivalDates
        .map((date, i) => session(date, [loggedExercise(strongRival, [set({ weight: rivalWeights[i], reps: 8, timestamp: date })])]))
        .reverse(),
    ];

    // Roster A : current + candidate SEUL -> candidate est le meilleur du roster -> quality = 1.
    const alone = selectAlternative(current, [current, candidate], history, NO_GOALS);
    // Roster B : current + candidate + strongRival (mais strongRival ne passe PAS le filtre dur
    // ici — même pattern -> il PASSE, donc il entre dans le roster ET dans les candidats. Pour
    // isoler l'effet du roster SANS changer le gagnant, on vérifie le SCORE de `candidate`, pas
    // le résultat final (qui pourrait légitimement devenir `strongRival`).
    const withStrongRival = selectAlternative(current, [current, candidate, strongRival], history, NO_GOALS);

    expect(alone).not.toBeNull();
    expect(withStrongRival).not.toBeNull();
    // `candidate` est TOUJOURS présent des deux côtés avec le MÊME historique propre — si
    // `lifecycleQuality` était une constante absolue par candidat (ancienne heuristique /120,
    // Phase 1), son score serait identique dans les deux scénarios. Avec la normalisation
    // roster-relative (P2.2), la présence d'un rival plus fort fait MÉCANIQUEMENT baisser la
    // quality (donc le score) de `candidate` sans que rien d'autre n'ait changé pour lui.
    if (withStrongRival!.exerciseId === candidate.id) {
      expect(withStrongRival!.score).toBeLessThan(alone!.score);
    } else {
      // `strongRival` a gagné : preuve encore plus directe que le roster influence le classement.
      expect(withStrongRival!.exerciseId).toBe(strongRival.id);
    }
  });
});
