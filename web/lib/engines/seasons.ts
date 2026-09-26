/**
 * Saisons (Evan, 26/09/2026) : quatre trimestres d'objectifs réalistes, projetés sur ses six
 * dernières semaines (perte ≈ 0,45 kg/semaine, force +13 à 25 % en 8 semaines en poids libres,
 * 60 à 80 séries par semaine), rythmes ralentis comme ils le font toujours.
 *
 * Les objectifs de force sont relatifs au début de la saison : ils se recalent d'eux-mêmes sur ses
 * vrais chiffres. Les cibles absolues (poids, séances) se relisent à chaque fin de saison.
 * « Poids libres » = exercices dont le repère n'est pas une machine et se lit en charge.
 */

import { exerciseBenchmarkForSets, resolveStandard, strengthLevelRank } from "@/lib/engines/benchmark";
import { smoothedSeries } from "@/lib/engines/body-weight";
import { estimated1RM } from "@/lib/engines/e1rm";
import { weekStats } from "@/lib/engines/progress-stats";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import type { BodyWeightEntry, Exercise, LoggedSet, MuscleGoal, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;
const STRENGTH_WINDOW_DAYS = 28;

export type SeasonObjective =
  | { kind: "weight"; label: string; targetKg: number }
  | { kind: "weightStable"; label: string; targetKg: number; toleranceKg: number }
  | { kind: "strength"; label: string; minPct: number; maxPct: number }
  | { kind: "weeks"; label: string; weeks: number }
  | { kind: "levelUps"; label: string; count: number }
  | { kind: "exerciseLevel"; label: string; standardKey: string; level: "advanced" }
  | { kind: "totalSessions"; label: string; count: number }
  | { kind: "totalSets"; label: string; count: number };

export interface SeasonDefinition {
  id: string;
  name: string;
  theme: string;
  start: Date;
  /** Exclu. */
  end: Date;
  objectives: SeasonObjective[];
}

export const SEASONS: readonly SeasonDefinition[] = [
  {
    id: "automne-2026",
    name: "Automne",
    theme: "Finir la sèche",
    start: new Date(2026, 9, 1),
    end: new Date(2027, 0, 1),
    objectives: [
      { kind: "weight", label: "Poids", targetKg: 72 },
      { kind: "strength", label: "Force en poids libres", minPct: 3, maxPct: 6 },
      { kind: "weeks", label: "Semaines au bronze", weeks: 10 },
    ],
  },
  {
    id: "hiver-2027",
    name: "Hiver",
    theme: "La force revient",
    start: new Date(2027, 0, 1),
    end: new Date(2027, 3, 1),
    objectives: [
      { kind: "strength", label: "Force en poids libres", minPct: 8, maxPct: 10 },
      { kind: "weightStable", label: "Poids stable", targetKg: 72, toleranceKg: 1 },
      { kind: "levelUps", label: "Niveaux franchis", count: 2 },
    ],
  },
  {
    id: "printemps-2027",
    name: "Printemps",
    theme: "Ton premier Avancé",
    start: new Date(2027, 3, 1),
    end: new Date(2027, 6, 1),
    objectives: [
      { kind: "exerciseLevel", label: "Latérales Avancé", standardKey: "Lateral raises", level: "advanced" },
      { kind: "strength", label: "Force en poids libres", minPct: 5, maxPct: 8 },
      { kind: "weeks", label: "Semaines au bronze", weeks: 10 },
    ],
  },
  {
    id: "ete-2027",
    name: "Été",
    theme: "Un an",
    start: new Date(2027, 6, 1),
    end: new Date(2027, 9, 1),
    objectives: [
      { kind: "totalSessions", label: "Séances depuis le début", count: 260 },
      { kind: "totalSets", label: "Séries depuis le début", count: 3750 },
      { kind: "strength", label: "Force en poids libres", minPct: 4, maxPct: 6 },
    ],
  },
];

export interface ObjectiveProgress {
  objective: SeasonObjective;
  /** 0..1 */
  progress: number;
  done: boolean;
  /** Ce que la carte affiche : « 74,4 → 72 kg », « +2,1 % · visé +3 à 6 % », « 4 / 10 »… */
  display: string;
}

export interface SeasonState {
  season: SeasonDefinition;
  status: "upcoming" | "running" | "ended";
  /** Jours avant le début (à venir) ou jours écoulés (en cours). */
  day: number;
  totalDays: number;
  objectives: ObjectiveProgress[];
  next: SeasonDefinition | null;
}

export interface SeasonInput {
  history: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  goals: readonly MuscleGoal[];
  bodyWeights: readonly BodyWeightEntry[];
  settings: UserSettings;
  now: Date;
}

const fr1 = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const signedPct = (value: number) => `${value >= 0 ? "+" : "−"}${fr1(Math.abs(value))} %`;
const thousands = (value: number) => value.toLocaleString("fr-FR").replace(/ | /g, " ");

function weightAt(bodyWeights: readonly BodyWeightEntry[], date: Date): number | null {
  const points = smoothedSeries(bodyWeights.filter((entry) => entry.measuredOn < date));
  return points.at(-1)?.smoothedKg ?? null;
}

/** Exercices « poids libres » : repère fiable (pas une machine) lu en charge. */
function freeWeightExercises(catalog: readonly Exercise[], settings: UserSettings): Exercise[] {
  return catalog.filter((exercise) => {
    const standard = resolveStandard(exercise, settings);
    return standard !== null && !standard.isMachine && standard.primaryAxis === "load";
  });
}

function setsOf(history: readonly WorkoutSession[], exerciseId: string, from: Date, to: Date): LoggedSet[] {
  return history
    .filter((session) => !session.isActive && session.date >= from && session.date < to)
    .flatMap((session) => session.exercises.filter((logged) => logged.exerciseId === exerciseId))
    .flatMap((logged) => logged.sets.filter((set) => set.completed && set.weight > 0 && set.setType !== "warmup"));
}

const bestE1RM = (sets: readonly LoggedSet[]) => Math.max(0, ...sets.map((set) => estimated1RM(set.weight, set.reps)));

/** Gain moyen de 1RM estimé (en %) des poids libres : 28 jours avant `start` contre les 28 derniers jours. */
export function strengthGain(input: SeasonInput, start: Date): number | null {
  const gains: number[] = [];
  for (const exercise of freeWeightExercises(input.catalog, input.settings)) {
    const before = bestE1RM(setsOf(input.history, exercise.id, new Date(start.getTime() - STRENGTH_WINDOW_DAYS * DAY_MS), start));
    const now = bestE1RM(setsOf(input.history, exercise.id, new Date(input.now.getTime() - STRENGTH_WINDOW_DAYS * DAY_MS), new Date(input.now.getTime() + 1)));
    if (before > 0 && now > 0) gains.push((now / before - 1) * 100);
  }
  return gains.length > 0 ? gains.reduce((sum, gain) => sum + gain, 0) / gains.length : null;
}

function measure(objective: SeasonObjective, season: SeasonDefinition, input: SeasonInput, started: boolean): ObjectiveProgress {
  const finished = input.history.filter((session) => !session.isActive);
  switch (objective.kind) {
    case "weight": {
      const startKg = weightAt(input.bodyWeights, season.start) ?? weightAt(input.bodyWeights, input.now);
      const nowKg = weightAt(input.bodyWeights, new Date(input.now.getTime() + DAY_MS));
      const span = startKg !== null ? startKg - objective.targetKg : 0;
      const progress = started && startKg !== null && nowKg !== null && span > 0 ? (startKg - nowKg) / span : 0;
      return {
        objective,
        progress: Math.min(1, Math.max(0, progress)),
        done: nowKg !== null && nowKg <= objective.targetKg + 0.05,
        display: nowKg !== null ? `${fr1(nowKg)} → ${fr1(objective.targetKg)} kg` : `${fr1(objective.targetKg)} kg`,
      };
    }
    case "weightStable": {
      const nowKg = weightAt(input.bodyWeights, new Date(input.now.getTime() + DAY_MS));
      const inside = nowKg !== null && Math.abs(nowKg - objective.targetKg) <= objective.toleranceKg;
      return {
        objective,
        progress: started && inside ? 1 : 0,
        done: started && inside,
        display: `${nowKg !== null ? `${fr1(nowKg)} kg · ` : ""}visé ${fr1(objective.targetKg)} ± ${fr1(objective.toleranceKg)} kg`,
      };
    }
    case "strength": {
      const gain = started ? strengthGain(input, season.start) : null;
      return {
        objective,
        progress: gain !== null ? Math.min(1, Math.max(0, gain / objective.minPct)) : 0,
        done: gain !== null && gain >= objective.minPct,
        display: `${gain !== null ? `${signedPct(gain)} · ` : ""}visé +${objective.minPct} à ${objective.maxPct} %`,
      };
    }
    case "weeks": {
      const weeks = started
        ? weekStats([...input.history], [...input.catalog], [...input.goals], input.now, 16).filter(
            (week) => week.start >= season.start && week.start < season.end && week.tier !== null
          ).length
        : 0;
      const seasonWeeks = Math.round((season.end.getTime() - season.start.getTime()) / (7 * DAY_MS));
      return {
        objective,
        progress: Math.min(1, weeks / objective.weeks),
        done: weeks >= objective.weeks,
        display: started ? `${weeks} / ${objective.weeks}` : `${objective.weeks} sur ${seasonWeeks}`,
      };
    }
    case "levelUps": {
      let count = 0;
      if (started) {
        for (const exercise of freeWeightExercises(input.catalog, input.settings)) {
          const before = setsOf(input.history, exercise.id, new Date(0), season.start);
          const after = [...before, ...setsOf(input.history, exercise.id, season.start, season.end)];
          const from = exerciseBenchmarkForSets(exercise, before, input.settings).level;
          const to = exerciseBenchmarkForSets(exercise, after, input.settings).level;
          if (from && to) count += Math.max(0, strengthLevelRank(to.key) - strengthLevelRank(from.key));
        }
      }
      return { objective, progress: Math.min(1, count / objective.count), done: count >= objective.count, display: started ? `${count} / ${objective.count}` : `${objective.count}` };
    }
    case "exerciseLevel": {
      const exercise = input.catalog.find((candidate) => candidate.strengthStandardKey === objective.standardKey);
      const benchmark = exercise ? exerciseBenchmarkForSets(exercise, setsOf(input.history, exercise.id, new Date(0), new Date(input.now.getTime() + 1)), input.settings) : null;
      const threshold = benchmark?.thresholds?.[objective.level] ?? null;
      const value = benchmark?.currentE1RM ?? 0;
      return {
        objective,
        progress: threshold ? Math.min(1, value / threshold) : 0,
        done: threshold !== null && value >= threshold,
        display: threshold ? `${value > 0 ? `${fr1(value)} / ` : ""}${fr1(threshold)} kg` : "Avancé",
      };
    }
    case "totalSessions": {
      const count = finished.length;
      return { objective, progress: Math.min(1, count / objective.count), done: count >= objective.count, display: `${thousands(count)} / ${thousands(objective.count)}` };
    }
    case "totalSets": {
      const byId = new Map(input.catalog.map((exercise) => [exercise.id, exercise]));
      const count = Math.round(
        finished.reduce(
          (sum, session) =>
            sum + session.exercises.reduce((acc, logged) => acc + physiologicalSetUnits(logged.sets, { increment: byId.get(logged.exerciseId)?.smallestIncrement }), 0),
          0
        )
      );
      return { objective, progress: Math.min(1, count / objective.count), done: count >= objective.count, display: `${thousands(count)} / ${thousands(objective.count)}` };
    }
  }
}

/** Saison en cours, sinon la prochaine (à venir), sinon la dernière terminée. */
export function seasonState(input: SeasonInput): SeasonState | null {
  const now = input.now;
  const index = SEASONS.findIndex((season) => now < season.end);
  const season = index >= 0 ? SEASONS[index] : SEASONS.at(-1);
  if (!season) return null;
  const status = now < season.start ? "upcoming" : now < season.end ? "running" : "ended";
  const totalDays = Math.round((season.end.getTime() - season.start.getTime()) / DAY_MS);
  const day =
    status === "upcoming"
      ? Math.ceil((season.start.getTime() - now.getTime()) / DAY_MS)
      : Math.min(totalDays, Math.floor((now.getTime() - season.start.getTime()) / DAY_MS) + 1);
  const started = status !== "upcoming";
  return {
    season,
    status,
    day,
    totalDays,
    objectives: season.objectives.map((objective) => measure(objective, season, input, started)),
    next: index >= 0 ? SEASONS[index + 1] ?? null : null,
  };
}
