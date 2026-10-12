/**
 * Le parcours (Evan, 26/09/2026) : rang de chaque séance, jalons à collectionner, succès cachés.
 *
 * Tout est recalculé à la lecture, séance par séance, dans l'ordre chronologique et avec seulement
 * ce qui précédait chaque séance : le passé a ses rangs, ses jalons et ses secrets datés au jour
 * où ils ont été gagnés, sans rien stocker. Même définitions que le reste de l'app : les séries
 * sont celles de l'Historique et de la semaine, les records ses étoiles.
 */

import { buildSessionReview, storedFirstSuggestions } from "@/lib/engines/bilan";
import { exerciseBenchmarkForSets, strengthLevelRank } from "@/lib/engines/benchmark";
import { buildWeightTrend, WEIGHT_MILESTONES_PCT } from "@/lib/engines/body-weight";
import { SECRETS, type SecretContext } from "@/lib/engines/career-secrets";
import { currentWeekWindow } from "@/lib/engines/effective-sets";
import { recordEvents, weekStats, weekStreak } from "@/lib/engines/progress-stats";
import { ghostDelta, ghostFor } from "@/lib/engines/session-game";
import { cutAt, rankSession, type SessionRank } from "@/lib/engines/session-rank";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import type { BodyWeightEntry, Exercise, LoggedSet, MuscleGoal, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Jalons
// ---------------------------------------------------------------------------

export type MilestoneFamily = "sessions" | "sets" | "records" | "streak" | "level" | "weight";

/** Paliers de chaque famille. `level` : rang du niveau de force (3 = Intermédiaire, 5 = Élite). */
export const MILESTONES: Record<MilestoneFamily, { label: string; tiers: readonly number[] }> = {
  sessions: { label: "Séances", tiers: [10, 25, 50, 75, 100, 150, 200, 250, 300, 365, 500, 750, 1000] },
  sets: { label: "Séries", tiers: [100, 250, 500, 1000, 1500, 2000, 3000, 4500, 6000, 8000, 10000] },
  records: { label: "Records", tiers: [10, 25, 50, 100, 150, 200, 300, 500] },
  streak: { label: "D'affilée", tiers: [4, 8, 12, 16, 26, 52] },
  level: { label: "Niveau", tiers: [3, 4, 5] },
  weight: { label: "Poids", tiers: WEIGHT_MILESTONES_PCT },
};

export const MILESTONE_FAMILIES: readonly MilestoneFamily[] = ["sessions", "sets", "records", "streak", "level", "weight"];

const LEVEL_NAMES: Record<number, string> = { 3: "Intermédiaire", 4: "Avancé", 5: "Élite" };

function thousands(value: number): string {
  return value.toLocaleString("fr-FR").replace(/ | /g, " ");
}

/** Libellé d'un jalon atteint (« 100e séance », « Premier Avancé »…). */
export function milestoneLabel(family: MilestoneFamily, tier: number): string {
  switch (family) {
    case "sessions":
      return tier === 1 ? "1re séance" : `${thousands(tier)}e séance`;
    case "sets":
      return `${thousands(tier)} séries`;
    case "records":
      return `${thousands(tier)} records`;
    case "streak":
      return `${tier} semaines d'affilée`;
    case "level":
      return `Premier ${LEVEL_NAMES[tier] ?? "niveau"}`;
    case "weight":
      return `−${tier} % de poids`;
  }
}

export function levelName(rank: number): string | null {
  return LEVEL_NAMES[rank] ?? null;
}

export interface MilestoneReached {
  tier: number;
  date: Date;
  /** Séance qui l'a décroché (`null` pour une pesée). */
  sessionId: string | null;
}

export interface MilestoneProgress {
  family: MilestoneFamily;
  /** Valeur actuelle (séances, séries, records, meilleure série de semaines, rang de niveau, % perdu). */
  value: number;
  reached: MilestoneReached[];
  next: number | null;
  /** Avancée vers `next`, depuis le palier précédent (0..1 ; 1 quand tout est atteint). */
  fraction: number;
}

// ---------------------------------------------------------------------------
// Parcours
// ---------------------------------------------------------------------------

export type CareerUnlock =
  | { kind: "milestone"; family: MilestoneFamily; tier: number; label: string }
  | { kind: "secret"; id: string; title: string; description: string }
  /** Quête de la semaine bouclée par la séance (ajoutée par le bilan, weekly-quest.ts). */
  | { kind: "quest"; label: string };

export interface CareerSession {
  sessionId: string;
  rank: SessionRank | null;
  /**
   * Série de rangs S d'affilée qui se termine à cette séance (1 = premier S de la série), 0 si la
   * séance n'est pas au rang S. Une séance sans rang (aucune série : cardio seule) ne casse ni
   * n'allonge la série : elle vaut 0 ici, et la suivante reprend le compte.
   */
  sStreak: number;
  unlocks: CareerUnlock[];
}

/** Série de rangs S d'affilée : celle en cours (après la dernière séance) et la plus longue. */
export interface SStreak {
  current: number;
  best: number;
}

export interface SecretFound {
  id: string;
  title: string;
  description: string;
  date: Date;
  sessionId: string;
}

export interface Career {
  bySession: ReadonlyMap<string, CareerSession>;
  milestones: MilestoneProgress[];
  secrets: SecretFound[];
  sStreak: SStreak;
}

export interface CareerInput {
  history: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  goals: readonly MuscleGoal[];
  bodyWeights: readonly BodyWeightEntry[];
  settings: UserSettings;
  now: Date;
}

function durationMinutes(session: WorkoutSession): number | null {
  const lastSet = session.exercises
    .flatMap((logged) => logged.sets)
    .filter((set) => set.completed)
    .reduce<number | null>((latest, set) => Math.max(latest ?? 0, set.timestamp.getTime()), null);
  const end = session.endTime?.getTime() ?? lastSet;
  if (end === null) return null;
  return Math.max(0, (end - session.startTime.getTime()) / 60_000);
}

function weeksBetween(from: Date, to: Date): number {
  return Math.round((currentWeekWindow(to).start.getTime() - currentWeekWindow(from).start.getTime()) / (7 * DAY_MS));
}

export function buildCareer({ history, catalog, goals, bodyWeights, settings, now }: CareerInput): Career {
  const sessions = history.filter((session) => !session.isActive).sort((a, b) => a.date.getTime() - b.date.getTime());
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const bySession = new Map<string, CareerSession>();
  const reached = new Map<MilestoneFamily, MilestoneReached[]>(MILESTONE_FAMILIES.map((family) => [family, []]));
  const secrets: SecretFound[] = [];
  const found = new Set<string>();
  const sStreak: SStreak = { current: 0, best: 0 };
  if (sessions.length === 0) return { bySession, milestones: progressOf(reached, emptyValues()), secrets, sStreak };

  // Records (étoiles de l'Historique) et paliers de semaine, en un passage chacun.
  const events = recordEvents(sessions, catalog);
  const starredBySession = new Map<string, { sets: number; exercises: Set<string> }>();
  for (const event of events) {
    const entry = starredBySession.get(event.sessionId) ?? { sets: 0, exercises: new Set<string>() };
    entry.sets += 1;
    entry.exercises.add(event.exerciseId);
    starredBySession.set(event.sessionId, entry);
  }
  const firstDate = sessions[0].date;
  const weeks = weekStats(sessions, catalog, goals, now, weeksBetween(firstDate, now) + 1, events);
  const weekIndexOf = (date: Date) => weeks.findIndex((week) => date >= week.start && date < week.end);
  const lastSessionOfWeek = new Map<number, string>();
  for (const session of sessions) lastSessionOfWeek.set(weekIndexOf(session.date), session.id);

  const values = emptyValues();
  const unlock = (family: MilestoneFamily, value: number, date: Date, sessionId: string | null, into: CareerUnlock[] | null) => {
    const list = reached.get(family)!;
    for (const tier of MILESTONES[family].tiers) {
      if (value >= tier && !list.some((entry) => entry.tier === tier)) {
        list.push({ tier, date, sessionId });
        into?.push({ kind: "milestone", family, tier, label: milestoneLabel(family, tier) });
      }
    }
  };

  const ranks: (SessionRank | null)[] = [];
  const setsByExercise = new Map<string, LoggedSet[]>();
  const levelByExercise = new Map<string, number>();
  const levelFractionByExercise = new Map<string, number>();
  const sessionsPerWeek = new Map<number, number>();
  const setsPerWeek = new Map<number, number>();
  const ranksPerWeek = new Map<number, (SessionRank | null)[]>();
  const recordSetsPerWeek = new Map<number, number>();
  const weekdays = new Set<number>();
  let goldInARow = 0;
  let lastCountedWeek = -1;

  for (const [index, session] of sessions.entries()) {
    const previous = sessions.slice(0, index);
    const unlocks: CareerUnlock[] = [];
    // Discipline : la meilleure série face à la cible affichée sur la 1re série, comme le bilan (recalculée
    // seulement quand elle manque, avant le 15/08/2026).
    const review = buildSessionReview(session, previous, [...catalog], [...goals], {
      trainingPhase: settings.trainingPhase,
      referenceSuggestionByLoggedExerciseId: storedFirstSuggestions(session),
    });
    const starred = starredBySession.get(session.id);

    const sessionSets = session.exercises.reduce(
      (sum, logged) => sum + physiologicalSetUnits(logged.sets, { increment: byId.get(logged.exerciseId)?.smallestIncrement }),
      0
    );
    const rank = rankSession({
      review,
      catalog: byId,
      sets: sessionSets,
      records: starred?.sets ?? 0,
      cut: cutAt(session.date, bodyWeights, settings),
    });

    // Niveaux de force et fantôme, exercice par exercice.
    let levelUps = 0;
    let bestGhostGain: number | null = null;
    for (const logged of session.exercises) {
      const exercise = byId.get(logged.exerciseId);
      const done = logged.sets.filter((set) => set.completed);
      if (!exercise || done.length === 0) continue;
      const ghost = ghostFor(exercise, previous, session.date);
      const gain = ghost ? ghostDelta(ghost, done) : null;
      if (gain !== null) bestGhostGain = Math.max(bestGhostGain ?? -Infinity, gain);
      const before = setsByExercise.get(exercise.id) ?? [];
      const all = [...before, ...done];
      setsByExercise.set(exercise.id, all);
      // Jalon de niveau : repères fiables seulement. Une machine se compare à titre indicatif
      // (stack de la salle ≠ repère), elle ne décroche pas « Premier Avancé ».
      const benchmark = exerciseBenchmarkForSets(exercise, all, settings);
      if (!benchmark.hasBenchmark || !benchmark.level || benchmark.isMachine) continue;
      const levelRank = strengthLevelRank(benchmark.level.key);
      const known = levelByExercise.get(exercise.id);
      if (known !== undefined && levelRank > known) levelUps += 1;
      levelByExercise.set(exercise.id, Math.max(known ?? 0, levelRank));
      levelFractionByExercise.set(exercise.id, levelFraction(benchmark));
    }

    // Cumuls.
    const weekIndex = weekIndexOf(session.date);
    sessionsPerWeek.set(weekIndex, (sessionsPerWeek.get(weekIndex) ?? 0) + 1);
    setsPerWeek.set(weekIndex, (setsPerWeek.get(weekIndex) ?? 0) + sessionSets);
    ranksPerWeek.set(weekIndex, [...(ranksPerWeek.get(weekIndex) ?? []), rank]);
    recordSetsPerWeek.set(weekIndex, (recordSetsPerWeek.get(weekIndex) ?? 0) + (starred?.sets ?? 0));
    weekdays.add(session.date.getDay());
    values.sessions = index + 1;
    values.sets += sessionSets;
    values.records += starred?.sets ?? 0;
    values.level = Math.max(0, ...levelByExercise.values());
    values.levelFraction = Math.max(
      0,
      ...[...levelByExercise].filter(([, rank]) => rank === values.level).map(([id]) => levelFractionByExercise.get(id) ?? 0)
    );

    // Série de semaines au bronze ou mieux, comptée à la dernière séance de chaque semaine.
    if (lastSessionOfWeek.get(weekIndex) === session.id && weekIndex > lastCountedWeek) {
      for (let k = lastCountedWeek + 1; k <= weekIndex; k += 1) {
        goldInARow = weeks[k]?.tier === "or" ? goldInARow + 1 : 0;
      }
      lastCountedWeek = weekIndex;
      // Même série que l'en-tête de semaine, jokers compris.
      values.streak = Math.max(values.streak, weekStreak(weeks.slice(0, weekIndex + 1)).weeks);
    }

    unlock("sessions", values.sessions, session.date, session.id, unlocks);
    unlock("sets", Math.round(values.sets), session.date, session.id, unlocks);
    unlock("records", values.records, session.date, session.id, unlocks);
    unlock("streak", values.streak, session.date, session.id, unlocks);
    unlock("level", values.level, session.date, session.id, unlocks);

    const context: SecretContext = {
      session,
      sessionCount: index + 1,
      firstSessionDate: firstDate,
      gapDays: index > 0 ? (session.date.getTime() - sessions[index - 1].date.getTime()) / DAY_MS : null,
      startHour: session.startTime.getHours(),
      durationMinutes: durationMinutes(session),
      rated: rank?.rated ?? 0,
      performed: rank?.performed ?? 0,
      recordExercises: starred?.exercises.size ?? 0,
      levelUps,
      bestGhostGain,
      rank,
      previousRanks: ranks,
      sessionsPerWeek: weeks.slice(0, weekIndex + 1).map((_, k) => sessionsPerWeek.get(k) ?? 0),
      weekSets: setsPerWeek.get(weekIndex) ?? 0,
      weekRanks: ranksPerWeek.get(weekIndex) ?? [],
      weekRecordSets: recordSetsPerWeek.get(weekIndex) ?? 0,
      weekdays,
      goldWeeksInARow: goldInARow,
    };
    for (const secret of SECRETS) {
      if (found.has(secret.id) || !secret.unlocked(context)) continue;
      found.add(secret.id);
      secrets.push({ id: secret.id, title: secret.title, description: secret.description, date: session.date, sessionId: session.id });
      unlocks.push({ kind: "secret", id: secret.id, title: secret.title, description: secret.description });
    }

    if (rank) {
      sStreak.current = rank.letter === "S" ? sStreak.current + 1 : 0;
      sStreak.best = Math.max(sStreak.best, sStreak.current);
    }
    ranks.push(rank);
    bySession.set(session.id, { sessionId: session.id, rank, sStreak: rank?.letter === "S" ? sStreak.current : 0, unlocks });
  }

  // Poids : jalons de perte depuis le début de la phase (même lecture que la carte Poids).
  const weighIns = [...bodyWeights].sort((a, b) => a.measuredOn.getTime() - b.measuredOn.getTime());
  for (const entry of weighIns) {
    const trend = buildWeightTrend(
      weighIns.filter((candidate) => candidate.measuredOn <= entry.measuredOn),
      settings.trainingPhaseStartedAt
    );
    values.weight = Math.max(values.weight, -(trend.deltaPct ?? 0));
    unlock("weight", values.weight, entry.measuredOn, null, null);
  }

  return { bySession, milestones: progressOf(reached, values), secrets, sStreak };
}

type CareerValues = Record<MilestoneFamily, number> & { levelFraction: number };

function emptyValues(): CareerValues {
  return { sessions: 0, sets: 0, records: 0, streak: 0, level: 0, weight: 0, levelFraction: 0 };
}

/** Avancée du niveau atteint vers le suivant, sur la valeur du repère (1RM estimé ou reps). */
function levelFraction(benchmark: ReturnType<typeof exerciseBenchmarkForSets>): number {
  const { thresholds, level, nextLevel, currentE1RM } = benchmark;
  if (!thresholds || !level || !nextLevel || level.key === "below_beginner") return nextLevel ? 0 : 1;
  const from = thresholds[level.key];
  const to = thresholds[nextLevel];
  return to > from ? Math.min(1, Math.max(0, (currentE1RM - from) / (to - from))) : 0;
}

function progressOf(reached: Map<MilestoneFamily, MilestoneReached[]>, values: CareerValues): MilestoneProgress[] {
  return MILESTONE_FAMILIES.map((family) => {
    const value = family === "sets" ? Math.round(values.sets) : values[family];
    const tiers = MILESTONES[family].tiers;
    const next = tiers.find((tier) => value < tier) ?? null;
    const previous = [...tiers].reverse().find((tier) => value >= tier) ?? 0;
    const fraction =
      next === null
        ? 1
        : family === "level"
          ? value >= next - 1 ? values.levelFraction : 0
          : Math.min(1, Math.max(0, (value - previous) / (next - previous)));
    return { family, value, reached: reached.get(family) ?? [], next, fraction };
  });
}

// ---------------------------------------------------------------------------
// Cache : un seul calcul par état du store, partagé par le bilan, l'Historique et Progrès.
// ---------------------------------------------------------------------------

let cached: { key: readonly unknown[]; career: Career } | null = null;

export function careerFor(input: Omit<CareerInput, "now">): Career {
  const key = [input.history, input.catalog, input.goals, input.bodyWeights, input.settings];
  if (cached && cached.key.length === key.length && cached.key.every((value, index) => value === key[index])) {
    return cached.career;
  }
  const career = buildCareer({ ...input, now: new Date() });
  cached = { key, career };
  return career;
}
