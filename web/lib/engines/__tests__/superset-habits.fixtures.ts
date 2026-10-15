import type { Exercise, LoggedExercise, SupersetGroup, WorkoutSession } from "@/lib/models/types";
import { MuscleGroup } from "@/lib/models/muscles";

/**
 * Ses vraies paires, telles qu'enregistrées en base du 05 au 15/10/2026 (lecture seule, rôle
 * `barbis_backup`) : quels exercices il a liés, ou faits dans la même séance sans les lier. Les
 * charges ne comptent pas ici : une série par passage suffit.
 */
function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: "push",
    setPatternMode: "straight",
    repTargetMin: 8,
    repTargetMax: 12,
    smallestIncrement: 2.5,
    isFavorite: false,
    createdByUser: true,
    sortOrder: 0,
    suggestedRestSeconds: 120,
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
  };
}

export const WIDE = exercise("ex-wide", "Wide Chest Press Technogym");
export const LATERAL = exercise("ex-lateral", "Lateral raises");
export const PREACHER = exercise("ex-preacher", "Preacher Curl Technogym");
export const EXTENSION = exercise("ex-extension", "Extension triceps poulie");
export const CURL_SUP = exercise("ex-curl-sup", "Curl supination poulie");
export const TIRAGE = exercise("ex-tirage", "Tirage horizontal poulie basse");
export const CATALOG = [WIDE, LATERAL, PREACHER, EXTENSION, CURL_SUP, TIRAGE];

/** Une séance : exercices faits (une série chacun) et paires liées (ids catalogue). */
function session(iso: string, done: Exercise[], linked: [Exercise, Exercise][] = []): WorkoutSession {
  const date = new Date(iso);
  const id = `s-${iso.slice(0, 10)}`;
  const loggedId = (exercise: Exercise) => `${id}-${exercise.id}`;
  const groups: SupersetGroup[] = linked.map(([a, b], index) => ({
    id: `${id}-g${index}`,
    orderIndex: index,
    memberOrder: [loggedId(a), loggedId(b)],
  }));
  const groupOf = (exercise: Exercise) => groups.find((group) => group.memberOrder.includes(loggedId(exercise)))?.id ?? null;
  const exercises: LoggedExercise[] = done.map((exercise, index) => ({
    id: loggedId(exercise),
    orderIndex: index,
    notes: "",
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    supersetGroupId: groupOf(exercise),
    plateauWeakPoint: null,
    sets: [
      {
        id: `${loggedId(exercise)}-1`,
        weight: 50,
        reps: 10,
        setType: "work",
        timestamp: new Date(date.getTime() + index * 180_000),
        setSlotIndex: 0,
        completed: true,
        supersetRoundIndex: null,
      },
    ],
  }));
  return {
    id,
    date,
    startTime: date,
    endTime: new Date(date.getTime() + 3_600_000),
    notes: "",
    isActive: false,
    templateName: null,
    exercises,
    supersetGroups: groups,
    cardioEntries: [],
  };
}

/** 05/10 : Wide et Lateral alternés SANS lien (ne compte pas comme lié). */
export const S0510 = session("2026-10-05T12:15:00Z", [LATERAL, WIDE, PREACHER, EXTENSION]);
/** 06/10 : Wide + Lateral liés. */
export const S0610 = session("2026-10-06T16:56:00Z", [WIDE, LATERAL, TIRAGE, CURL_SUP, EXTENSION], [[WIDE, LATERAL]]);
/** 09/10 : Wide et Lateral faits séparément. */
export const S0910 = session("2026-10-09T15:09:00Z", [WIDE, LATERAL, PREACHER, TIRAGE]);
/** 11/10 : Wide + Preacher liés, Extension + Tirage liés, Lateral seul. */
export const S1110 = session(
  "2026-10-11T14:02:00Z",
  [WIDE, PREACHER, LATERAL, EXTENSION, TIRAGE, CURL_SUP],
  [[WIDE, PREACHER], [EXTENSION, TIRAGE]]
);
/** 13/10 : Wide + Lateral liés. */
export const S1310 = session("2026-10-13T17:08:00Z", [WIDE, LATERAL, PREACHER, TIRAGE, CURL_SUP, EXTENSION], [[WIDE, LATERAL]]);
/** 15/10 : Lateral + Wide liés, Extension + Curl supination liés (liés à la main ce soir-là). */
export const S1510 = session(
  "2026-10-15T17:08:00Z",
  [LATERAL, WIDE, EXTENSION, CURL_SUP, TIRAGE],
  [[LATERAL, WIDE], [EXTENSION, CURL_SUP]]
);

export const HISTORY_BEFORE_1510 = [S1310, S1110, S0910, S0610, S0510];
export const HISTORY_AFTER_1510 = [S1510, ...HISTORY_BEFORE_1510];
export { session as fixtureSession };
