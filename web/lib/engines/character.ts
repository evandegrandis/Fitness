/**
 * Fiche de personnage (Evan, 26/09/2026) : cinq caractéristiques sur 100, lues dans les données.
 * Chacune dit comment elle se calcule, avec ses chiffres, et le geste qui la ferait monter le plus,
 * en points : une fiche qui ne dit pas quoi faire ne sert à rien (Evan).
 *
 * - Force : niveau moyen sur les repères fiables (pas les machines, indicatives) des exercices
 *   pratiqués ces 8 dernières semaines, palier et avancée vers le suivant (Novice 40, Intermédiaire
 *   60, Avancé 80, Élite 100).
 * - Endurance : séries par semaine sur les 4 semaines terminées (100 séries = 100).
 * - Régularité : semaines au bronze ou mieux sur les 12 dernières semaines terminées.
 * - Récupération : bilans des 14 derniers jours (sommeil rapporté à 8 h, soirs sans alcool,
 *   protéines, créatine), sur ce qui a été renseigné.
 * - Discipline : tenir le plan. Part des exercices des 4 dernières semaines dont la meilleure série
 *   a tenu ou battu la cible affichée sur sa 1re série (rangs de séance ; recalculée avant le 15/08/2026,
 *   quand elle n'était pas enregistrée). Mesurée par exercice et non série
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
  /** Comment la valeur se calcule, avec les chiffres d'Evan. */
  how: string;
  /** Le geste qui la ferait monter le plus, et de combien ; `null` au maximum. */
  next: string | null;
}

const LEVEL_NAMES = ["Sous débutant", "Débutant", "Novice", "Intermédiaire", "Avancé", "Élite"];
const fr1 = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const pts = (value: number) => {
  const rounded = Math.max(1, Math.round(value));
  return `+${rounded} pt${rounded > 1 ? "s" : ""}`;
};

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
  const entries: { exercise: Exercise; level: number; benchmark: ExerciseBenchmark }[] = [];
  for (const exercise of catalog) {
    const standard = resolveStandard(exercise, settings);
    if (!standard || standard.isMachine) continue;
    const sessions = history.filter((session) => !session.isActive && session.exercises.some((logged) => logged.exerciseId === exercise.id));
    if (!sessions.some((session) => session.date.getTime() >= since)) continue;
    const sets = sessions.flatMap((session) => session.exercises.filter((logged) => logged.exerciseId === exercise.id)).flatMap((logged) => logged.sets.filter((set) => set.completed));
    const benchmark = exerciseBenchmarkForSets(exercise, sets, settings);
    const level = continuousLevel(benchmark);
    if (level !== null) entries.push({ exercise, level, benchmark });
  }
  if (entries.length === 0) {
    return { key: "force", label: "Force", value: null, how: "Aucun exercice libre avec repère pratiqué ces 8 semaines.", next: null };
  }
  const n = entries.length;
  const mean = entries.reduce((sum, entry) => sum + entry.level, 0) / n;
  // Le palier le plus proche : celui qui rapporte des points pour le moins d'effort restant.
  const remaining = (level: number) => Math.floor(level) + 1 - level;
  const closest = entries
    .filter((entry) => entry.benchmark.nextLevel && entry.benchmark.gapToNext !== null)
    .sort((a, b) => remaining(a.level) - remaining(b.level))[0];
  let next: string | null = null;
  if (closest) {
    const gain = ((remaining(closest.level) / 5) * 100) / n;
    const gap = closest.benchmark.gapToNext!;
    const reps = Math.ceil(gap);
    const unit = closest.benchmark.primaryAxis === "reps" ? `${reps} rep${reps > 1 ? "s" : ""}` : `${fr1(gap)} kg de 1RM estimé`;
    next = `${closest.exercise.name} ${LEVEL_NAMES[strengthLevelRank(closest.benchmark.nextLevel!)]}, à ${unit} près\u00a0: ${pts(gain)}.`;
  }
  return {
    key: "force",
    label: "Force",
    value: Math.round((mean / 5) * 100),
    how: `Moyenne de tes niveaux sur ${n} exercice${n > 1 ? "s" : ""} libre${n > 1 ? "s" : ""} (Novice 40, Intermédiaire 60, Avancé 80, Élite 100) : ${LEVEL_NAMES[Math.floor(mean)]} en moyenne.`,
    next,
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
  const enduranceValue = weeklySets === null ? null : Math.round(Math.min(1, weeklySets / CHARACTER.ENDURANCE_FULL_SETS) * 100);
  const endurance: CharacterStat = {
    key: "endurance",
    label: "Endurance",
    value: enduranceValue,
    how:
      weeklySets === null
        ? "Pas encore de semaine terminée."
        : `${fr1(weeklySets)} séries par semaine en moyenne sur tes ${recent.length} dernières semaines ; 100 séries par semaine valent 100.`,
    next:
      enduranceValue !== null && enduranceValue < 100
        ? "chaque série de plus par semaine, en moyenne\u00a0: +1 pt. Des semaines or (~85 séries) te mettraient à 85."
        : null,
  };

  const held = completed.filter((week) => week.tier !== null).length;
  const regularity = completed.length > 0 ? Math.round((held / completed.length) * 100) : null;
  const regularite: CharacterStat = {
    key: "regularite",
    label: "Régularité",
    value: regularity,
    how: `${held} semaine${held > 1 ? "s" : ""} au bronze ou mieux sur les ${completed.length} dernières.`,
    next:
      regularity !== null && regularity < 100
        ? `chaque semaine au bronze (40 % de tes objectifs) qui remplace une semaine manquée\u00a0: ${pts(100 / completed.length)}.`
        : null,
  };

  const recoverySince = now.getTime() - CHARACTER.RECOVERY_DAYS * DAY_MS;
  const window = checkins.filter((checkin) => checkin.date.getTime() >= recoverySince && checkin.date <= now);
  const sleeps = window.map((checkin) => checkin.sleepHours).filter((hours): hours is number => typeof hours === "number" && hours > 0);
  const known = (pick: (checkin: RecoveryCheckin) => boolean | null) => window.map(pick).filter((value): value is boolean => value !== null);
  const alcohol = known((checkin) => checkin.hadAlcohol);
  const protein = known((checkin) => checkin.proteinTargetMet);
  const creatine = known((checkin) => checkin.tookCreatine);
  const sleep = sleeps.length > 0 ? sleeps.reduce((sum, hours) => sum + hours, 0) / sleeps.length : null;
  const drinks = alcohol.filter(Boolean).length;
  const components: { label: string; value: number; fix: string }[] = [];
  if (sleep !== null) components.push({ label: `${fr1(sleep)} h de sommeil sur 8`, value: Math.min(1, sleep / CHARACTER.SLEEP_FULL_HOURS), fix: "dormir 8 h en moyenne" });
  if (alcohol.length > 0) components.push({ label: `${drinks} soir${drinks > 1 ? "s" : ""} d'alcool sur ${alcohol.length}`, value: 1 - drinks / alcohol.length, fix: "aucun soir d'alcool sur 14 jours" });
  if (protein.length > 0) {
    const met = protein.filter(Boolean).length;
    components.push({ label: `protéines ${met}/${protein.length} j`, value: met / protein.length, fix: "tes protéines chaque jour" });
  }
  if (creatine.length > 0) {
    const taken = creatine.filter(Boolean).length;
    components.push({ label: `créatine ${taken}/${creatine.length} j`, value: taken / creatine.length, fix: "ta créatine chaque jour" });
  }
  const recovery = components.length > 0 ? Math.round((components.reduce((sum, part) => sum + part.value, 0) / components.length) * 100) : null;
  const weakest = components.reduce<(typeof components)[number] | null>((low, part) => (!low || part.value < low.value ? part : low), null);
  const recuperation: CharacterStat = {
    key: "recuperation",
    label: "Récupération",
    value: recovery,
    how:
      components.length === 0
        ? "Aucun bilan ces 14 jours : remplis-le après tes séances."
        : `Moyenne de tes bilans des 14 derniers jours : ${components.map((part) => part.label).join(", ")}.`,
    next: weakest && weakest.value < 1 ? `${weakest.fix}\u00a0: ${pts(((1 - weakest.value) / components.length) * 100)}.` : null,
  };

  const disciplineSince = now.getTime() - CHARACTER.DISCIPLINE_DAYS * DAY_MS;
  const recentRanks = ranks.filter((entry) => entry.date.getTime() >= disciplineSince && entry.rank !== null).map((entry) => entry.rank!);
  const rated = recentRanks.reduce((sum, rank) => sum + rank.rated, 0);
  const kept = recentRanks.reduce((sum, rank) => sum + rank.performed + rank.held, 0);
  const disciplineValue = rated > 0 ? Math.round((kept / rated) * 100) : null;
  const discipline: CharacterStat = {
    key: "discipline",
    label: "Discipline",
    value: disciplineValue,
    how:
      rated > 0
        ? `Sur 4 semaines, ${kept} exercices sur ${rated} ont tenu ou battu la cible : ta meilleure série vaut au moins la cible de la 1re série à une rep près (plus léger, 7,5 % de charge compte pour 1 rep).`
        : "Pas encore de séance notée ces 4 semaines.",
    next:
      disciplineValue !== null && disciplineValue < 100
        ? `chaque exercice tenu de plus\u00a0: ${pts(100 / rated)}. Garde la charge proposée plutôt que de la baisser.`
        : null,
  };

  return [force(history, catalog, settings, now), endurance, regularite, recuperation, discipline];
}
