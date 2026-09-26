/**
 * Fiche de personnage (Evan, 26/09/2026) : cinq caractéristiques sur 100, lues dans les données.
 *
 * - Force : niveau moyen sur les repères fiables (pas les machines, indicatives) des exercices
 *   pratiqués ces 8 dernières semaines, palier et avancée vers le suivant (Élite = 100).
 * - Endurance : séries par semaine sur les 4 semaines terminées (100 séries = 100).
 * - Régularité : semaines au bronze ou mieux sur les 12 dernières semaines terminées.
 * - Récupération : bilans des 14 derniers jours (sommeil rapporté à 8 h, soirs sans alcool,
 *   protéines, créatine), sur ce qui a été renseigné.
 * - Discipline : tenir le plan. Part des exercices des 4 dernières semaines dont la meilleure série
 *   a tenu ou battu la référence du moteur (rangs de séance). Mesurée par exercice et non série
 *   par série : les dernières séries baissent normalement. Le RIR ne départage pas (98 % des séries
 *   d'Evan sont à RIR 3 ou moins).
 */

import { exerciseBenchmarkForSets, resolveStandard, strengthLevelRank, type ExerciseBenchmark } from "@/lib/engines/benchmark";
import { weekStats } from "@/lib/engines/progress-stats";
import type { SessionRank } from "@/lib/engines/session-rank";
import type { Exercise, MuscleGoal, RecoveryCheckin, UserSettings, WorkoutSession } from "@/lib/models/types";

const DAY_MS = 86_400_000;

export const CHARACTER = {
  FORCE_WINDOW_DAYS: 56,
  ENDURANCE_WEEKS: 4,
  ENDURANCE_FULL_SETS: 100,
  REGULARITY_WEEKS: 12,
  RECOVERY_DAYS: 14,
  SLEEP_FULL_HOURS: 8,
  DISCIPLINE_DAYS: 28,
} as const;

export type CharacterKey = "force" | "endurance" | "regularite" | "recuperation" | "discipline";

export interface CharacterStat {
  key: CharacterKey;
  label: string;
  /** 0..100, `null` sans donnée. */
  value: number | null;
  detail: string;
}

const LEVEL_NAMES = ["Sous débutant", "Débutant", "Novice", "Intermédiaire", "Avancé", "Élite"];
const fr1 = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Niveau continu 0..5 : palier atteint + avancée vers le suivant, sur la valeur du repère. */
function continuousLevel(benchmark: ExerciseBenchmark): number | null {
  const { level, nextLevel, thresholds, currentE1RM } = benchmark;
  if (!benchmark.hasBenchmark || !level || !thresholds) return null;
  const rank = strengthLevelRank(level.key);
  if (!nextLevel) return rank;
  const from = level.key === "below_beginner" ? 0 : thresholds[level.key];
  const to = thresholds[nextLevel];
  return rank + (to > from ? Math.min(1, Math.max(0, (currentE1RM - from) / (to - from))) : 0);
}

function force(history: readonly WorkoutSession[], catalog: readonly Exercise[], settings: UserSettings, now: Date): CharacterStat {
  const since = now.getTime() - CHARACTER.FORCE_WINDOW_DAYS * DAY_MS;
  const levels: number[] = [];
  for (const exercise of catalog) {
    const standard = resolveStandard(exercise, settings);
    if (!standard || standard.isMachine) continue;
    const sessions = history.filter((session) => !session.isActive && session.exercises.some((logged) => logged.exerciseId === exercise.id));
    if (!sessions.some((session) => session.date.getTime() >= since)) continue;
    const sets = sessions.flatMap((session) => session.exercises.filter((logged) => logged.exerciseId === exercise.id)).flatMap((logged) => logged.sets.filter((set) => set.completed));
    const level = continuousLevel(exerciseBenchmarkForSets(exercise, sets, settings));
    if (level !== null) levels.push(level);
  }
  if (levels.length === 0) return { key: "force", label: "Force", value: null, detail: "Aucun repère fiable pratiqué" };
  const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  return {
    key: "force",
    label: "Force",
    value: Math.round((mean / 5) * 100),
    detail: `${LEVEL_NAMES[Math.floor(mean)]} en moyenne, sur ${levels.length} exercice${levels.length > 1 ? "s" : ""}`,
  };
}

export function characterSheet({
  history,
  catalog,
  goals,
  checkins,
  ranks,
  settings,
  now,
}: {
  history: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  goals: readonly MuscleGoal[];
  checkins: readonly RecoveryCheckin[];
  /** Rangs des séances passées (parcours), pour la discipline. */
  ranks: readonly { date: Date; rank: SessionRank | null }[];
  settings: UserSettings;
  now: Date;
}): CharacterStat[] {
  const weeks = weekStats(history, catalog, goals, now, CHARACTER.REGULARITY_WEEKS + 1);
  const completed = weeks.filter((week) => !week.inProgress);

  const recent = completed.slice(-CHARACTER.ENDURANCE_WEEKS);
  const weeklySets = recent.length > 0 ? recent.reduce((sum, week) => sum + week.sets, 0) / recent.length : null;
  const endurance: CharacterStat = {
    key: "endurance",
    label: "Endurance",
    value: weeklySets === null ? null : Math.round(Math.min(1, weeklySets / CHARACTER.ENDURANCE_FULL_SETS) * 100),
    detail: weeklySets === null ? "Pas encore de semaine terminée" : `${fr1(weeklySets)} séries par semaine`,
  };

  const held = completed.filter((week) => week.tier !== null).length;
  const regularite: CharacterStat = {
    key: "regularite",
    label: "Régularité",
    value: completed.length > 0 ? Math.round((held / completed.length) * 100) : null,
    detail: `${held} semaine${held > 1 ? "s" : ""} sur ${completed.length} au bronze ou mieux`,
  };

  const recoverySince = now.getTime() - CHARACTER.RECOVERY_DAYS * DAY_MS;
  const window = checkins.filter((checkin) => checkin.date.getTime() >= recoverySince && checkin.date <= now);
  const sleeps = window.map((checkin) => checkin.sleepHours).filter((hours): hours is number => typeof hours === "number" && hours > 0);
  const known = (pick: (checkin: RecoveryCheckin) => boolean | null) => window.map(pick).filter((value): value is boolean => value !== null);
  const alcohol = known((checkin) => checkin.hadAlcohol);
  const protein = known((checkin) => checkin.proteinTargetMet);
  const creatine = known((checkin) => checkin.tookCreatine);
  const parts: number[] = [];
  const sleep = sleeps.length > 0 ? sleeps.reduce((sum, hours) => sum + hours, 0) / sleeps.length : null;
  if (sleep !== null) parts.push(Math.min(1, sleep / CHARACTER.SLEEP_FULL_HOURS));
  if (alcohol.length > 0) parts.push(alcohol.filter((value) => !value).length / alcohol.length);
  if (protein.length > 0) parts.push(protein.filter(Boolean).length / protein.length);
  if (creatine.length > 0) parts.push(creatine.filter(Boolean).length / creatine.length);
  const drinks = alcohol.filter(Boolean).length;
  const recuperation: CharacterStat = {
    key: "recuperation",
    label: "Récupération",
    value: parts.length > 0 ? Math.round((parts.reduce((sum, part) => sum + part, 0) / parts.length) * 100) : null,
    detail:
      parts.length === 0
        ? "Aucun bilan ces 14 jours"
        : [sleep !== null ? `${fr1(sleep)} h de sommeil` : null, alcohol.length > 0 ? `${drinks} soir${drinks > 1 ? "s" : ""} d'alcool` : null]
            .filter(Boolean)
            .join(" · ") || "Bilans renseignés",
  };

  const disciplineSince = now.getTime() - CHARACTER.DISCIPLINE_DAYS * DAY_MS;
  const recentRanks = ranks.filter((entry) => entry.date.getTime() >= disciplineSince && entry.rank !== null).map((entry) => entry.rank!);
  const rated = recentRanks.reduce((sum, rank) => sum + rank.rated, 0);
  const kept = recentRanks.reduce((sum, rank) => sum + rank.performed + rank.held, 0);
  const discipline: CharacterStat = {
    key: "discipline",
    label: "Discipline",
    value: rated > 0 ? Math.round((kept / rated) * 100) : null,
    detail: rated > 0 ? `${kept} exercices sur ${rated} tenus ou battus` : "Pas encore de séance notée",
  };

  return [force(history, catalog, settings, now), endurance, regularite, recuperation, discipline];
}
