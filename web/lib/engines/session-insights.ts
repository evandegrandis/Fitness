/**
 * Ce que la séance apprend à Evan : des enseignements calculés sur SES données, chacun avec ses
 * chiffres (07/10/2026, retour d'Evan : « le bilan ne m'apprend rien, on ne voit pas les
 * supersets »). Moteur pur, aucune écriture, aucun appel réseau : la feuille de fin de séance, la
 * page d'une séance de l'Historique et la route de Barbis lisent les mêmes fonctions.
 *
 * Règles :
 *   - l'historique lu est celui d'AVANT la séance (`historyBefore`) : relue un mois plus tard dans
 *     l'Historique, une séance dit exactement ce qu'elle disait le soir même ;
 *   - une machine découverte (première séance) est de l'étalonnage : ni progression ni
 *     comparaison à la suggestion, comme partout ailleurs (`bilan.ts`, `records.ts`) ;
 *   - une séance ancienne sans suggestion enregistrée n'affiche simplement pas ce qui en dépend ;
 *   - aucune phrase sans chiffre ; la suggestion de charge n'est jamais recalculée autrement que
 *     par le moteur, ni modifiée.
 */

import {
  bestSetOfSession,
  buildSessionReview,
  mergeExerciseOccurrences,
  setVersusSuggestion,
  storedFirstSuggestions,
  type SessionReview,
} from "@/lib/engines/bilan";
import { sessionForecastGap } from "@/lib/engines/capacity-trend";
import { estimated1RM } from "@/lib/engines/e1rm";
import { weeklyProgress } from "@/lib/engines/effective-sets";
import { isRecordSet, normalRecordSets } from "@/lib/engines/records";
import { fatigueContextAtExerciseStart } from "@/lib/engines/session-fatigue-baselines";
import type { SessionFatigueContext } from "@/lib/engines/session-fatigue";
import { weekSessionPlan } from "@/lib/engines/session-focus";
import { WEEK_TIERS, exerciseStats, type WeekTier } from "@/lib/engines/progress-stats";
import { weekStatusFromRows } from "@/lib/engines/week-status";
import { physiologicalSetUnits } from "@/lib/engines/set-structure";
import { SetType, type TrainingPhase } from "@/lib/models/enums";
import { parentShortName, type MuscleParent } from "@/lib/models/muscles";
import {
  orderedSets,
  primaryParent,
  sessionsNewestFirst,
  type Exercise,
  type LoggedExercise,
  type LoggedSet,
  type MuscleGoal,
  type WorkoutSession,
} from "@/lib/models/types";
import { cleanWeight } from "@/lib/format";
import { versusReference } from "@/lib/engines/versus";
import { engineVersionAtLeast, ONE_IN_THREE_VERSION, storesPrediction } from "@/lib/engines/target";
import { isRated } from "@/lib/engines/session-game";

export const SESSION_INSIGHTS = {
  /** Enseignements montrés en tête ; le reste est dans le détail repliable. */
  HEADLINE_MAX: 3,
  /** Séances antérieures lues pour l'habitude d'un exercice (placement, repos, rythme). */
  HABIT_SESSIONS: 5,
  /** Écart entre deux séries au-delà duquel ce n'est plus un enchaînement de superset. */
  SUPERSET_MAX_GAP_S: 240,
  /** Séries d'un autre exercice tolérées d'affilée au milieu d'un superset (au-delà, il est fini). */
  SUPERSET_CHAIN_MAX_FOREIGN: 1,
  /** Écart de séries faites avant un exercice qui change sa fraîcheur (≈ un exercice entier). */
  PLACEMENT_DELTA_SETS: 3,
  /** Repos avant la meilleure série jugé nettement plus long que d'habitude. */
  LONGER_REST_RATIO: 1.4,
  /**
   * Baisse de capacité (1RM estimé) contre la séance d'avant à partir de laquelle on en parle, et seulement si la séance
   * est aussi sous ce que Jeera prévoyait, fatigue de séance comprise, au-delà du bruit de l'exercice
   * (`sessionForecastGap`, la même prévision que la tendance de Progrès et de Barbis). Avant le 12/10/2026, des dips
   * faits en fin de séance passaient pour une baisse.
   */
  DECLINE_MIN: 0.03,
  /** Exercices proposés pour la prochaine fois. */
  NEXT_TIME_MAX: 3,
} as const;

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type InsightKind = "progress" | "capacity" | "fatigue" | "superset" | "suggestion" | "next" | "week";

export interface SessionInsight {
  id: string;
  kind: InsightKind;
  /** Phrase courte et chiffrée. */
  title: string;
  /** La preuve, chiffrée. */
  detail: string;
  tone: "positive" | "neutral" | "warning";
  exerciseIds: string[];
  /** Importance pour choisir les enseignements de tête (plus haut = plus important). */
  weight: number;
}

export interface SupersetMemberSummary {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  /** Repos réel entre deux séries de CET exercice dans le superset (secondes, médiane). */
  restSeconds: number | null;
  /** Même mesure quand il est fait seul, sur ses dernières séances (null sans référence). */
  soloRestSeconds: number | null;
  /** Reps moyennes à la charge la plus utilisée aujourd'hui, en superset puis seul (même charge). */
  load: number | null;
  avgReps: number | null;
  soloAvgReps: number | null;
  /** Séries au niveau de la suggestion ou au-dessus / séries avec suggestion. */
  heldSuggestion: number;
  withSuggestion: number;
}

export interface SupersetSummary {
  /** Lié dans l'app (SupersetGroup) ou reconnu à l'alternance des séries. */
  linked: boolean;
  members: SupersetMemberSummary[];
  rounds: number;
  /** Durée du bloc, de la première à la dernière série (secondes). */
  durationSeconds: number;
  /** Temps médian pour passer d'un exercice à l'autre (secondes). */
  switchSeconds: number | null;
  /**
   * Durée estimée des mêmes séries faites l'une après l'autre, chaque exercice à son repos
   * habituel quand il est fait seul. `null` si un membre n'a jamais été fait seul.
   */
  soloEstimateSeconds: number | null;
}

export interface SuggestionTally {
  beat: number;
  met: number;
  below: number;
  /** Séries en dessous : où, et de combien. */
  belowDetails: { exerciseId: string; exerciseName: string; setNumber: number; label: string }[];
  /** Séries en dessous dans la seconde moitié de la séance (chronologique). */
  belowInSecondHalf: number;
  /** Toutes les cibles jugées viennent d'un moteur qui vise une cible battue une fois sur trois (≥ web-v2.6). */
  oneInThree: boolean;
}

export interface WeekTierStatus {
  scoreBefore: number;
  scoreAfter: number;
  tierBefore: WeekTier | null;
  tierAfter: WeekTier | null;
  nextTierLabel: string | null;
  setsToNextTier: number | null;
  /** Muscles à objectif encore sous leur objectif, du plus en retard au moins en retard. */
  remaining: { parent: MuscleParent; sets: number }[];
  sessionsLeftAfterToday: number;
}

/**
 * Moments à fêter, pour le chantier des animations de célébration : il lit cette liste et ne
 * recalcule rien. Ce module n'anime rien lui-même.
 */
export interface CelebrationMoment {
  kind: "record" | "progressStreak" | "weekTier" | "plateauBroken";
  label: string;
  exerciseId?: string;
}

export interface SessionInsights {
  headline: SessionInsight[];
  /** Tous les enseignements, rangés par famille, dans l'ordre d'affichage du détail. */
  sections: { kind: InsightKind; label: string; items: SessionInsight[] }[];
  supersets: SupersetSummary[];
  suggestionTally: SuggestionTally | null;
  week: WeekTierStatus | null;
  celebrations: CelebrationMoment[];
}

export interface SessionDebrief {
  review: SessionReview;
  insights: SessionInsights;
  /** Fatigue présente au début de chaque exercice (id de sa première occurrence). */
  fatigueByLoggedExerciseId: Record<string, SessionFatigueContext>;
}

export interface DebriefOptions {
  trainingPhase?: TrainingPhase | null;
  bodyweightKg?: number;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

/** Séances terminées strictement antérieures à `session` : jamais une séance postérieure. */
export function historyBefore(session: WorkoutSession, history: readonly WorkoutSession[]): WorkoutSession[] {
  return history.filter(
    (candidate) =>
      candidate.id !== session.id && !candidate.isActive && candidate.date.getTime() < session.date.getTime()
  );
}

/**
 * Bilan complet d'une séance terminée, recalculé sur l'historique tel qu'il était ce jour-là :
 * le bilan existant (rang de performance, plateaux, couverture, records) avec la fatigue de la
 * séance et la suggestion réellement montrée, plus les enseignements.
 */
export function debriefSession(
  session: WorkoutSession,
  history: readonly WorkoutSession[],
  catalog: Exercise[],
  goals: MuscleGoal[] = [],
  options: DebriefOptions = {}
): SessionDebrief {
  const prior = historyBefore(session, history);
  const fatigueByLoggedExerciseId = sessionFatigueByLoggedExercise(session, prior, catalog);
  const review = buildSessionReview(session, prior, catalog, goals, {
    trainingPhase: options.trainingPhase,
    bodyweightKg: options.bodyweightKg,
    sessionFatigueByLoggedExerciseId: fatigueByLoggedExerciseId,
    referenceSuggestionByLoggedExerciseId: storedFirstSuggestions(session),
  });
  const forecasts = sessionForecasts(session, prior, catalog, options.bodyweightKg ?? null);
  const insights = buildSessionInsights(session, prior, catalog, goals, review, fatigueByLoggedExerciseId, forecasts);
  return { review, insights, fatigueByLoggedExerciseId };
}

export type SessionForecast = NonNullable<ReturnType<typeof sessionForecastGap>>;

/**
 * Écart de chaque exercice de la séance à ce que Jeera prévoyait d'après ses séances d'avant, fatigue de séance comprise
 * (capacité à contexte neutre et bruit de `exerciseStats`, comme la tendance de Progrès et de Barbis). Absent pour une
 * machine sans assez de séances comparables.
 */
export function sessionForecasts(
  session: WorkoutSession,
  prior: readonly WorkoutSession[],
  catalog: readonly Exercise[],
  bodyweightKg: number | null
): Record<string, SessionForecast> {
  const result: Record<string, SessionForecast> = {};
  const stats = exerciseStats([...prior, session], catalog, session.date, bodyweightKg);
  for (const stat of stats) {
    const index = stat.points.findIndex((point) => point.convertedFrom === null && point.date.getTime() === session.date.getTime());
    const forecast = index >= 0 ? sessionForecastGap(stat.points, index, stat.noise) : null;
    if (forecast) result[stat.exercise.id] = forecast;
  }
  return result;
}

/** Fatigue au début de chaque exercice, indexée comme le bilan (première occurrence). */
export function sessionFatigueByLoggedExercise(
  session: WorkoutSession,
  prior: WorkoutSession[],
  catalog: Exercise[]
): Record<string, SessionFatigueContext> {
  const result: Record<string, SessionFatigueContext> = {};
  for (const logged of mergeExerciseOccurrences(session)) {
    result[logged.id] = fatigueContextAtExerciseStart(session, catalog, logged.exerciseId, prior);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

function isWorkSet(set: LoggedSet): boolean {
  return set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff;
}

/**
 * Nom court pour les titres : la marque de la machine (« Technogym », « LifeFitness »…) n'apporte
 * rien dans une phrase, le détail garde le nom complet.
 */
export function shortExerciseName(name: string): string {
  const short = name
    .replace(/\s+(technogym|life\s?fitness|pure\s?strength|hammer\s?strength|matrix|panatta|cybex|precor|nautilus|gym80)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return short.length > 0 ? short : name.trim();
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function setLabel(weight: number, reps: number): string {
  return weight > 0 ? `${cleanWeight(weight)} kg × ${reps}` : `${reps} reps`;
}

function duration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${String(rest).padStart(2, "0")}`;
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

/** « en premier » plutôt que « après 0 série ». */
function startedAfter(sets: number): string {
  return sets <= 0 ? "commencé en premier" : `commencé après ${plural(sets, "série")}`;
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** Séries de travail complétées d'un exercice dans une séance (toutes occurrences), chronologiques. */
function workSetsOf(session: WorkoutSession, exercise: Exercise): LoggedSet[] {
  const sets = session.exercises
    .filter((logged) => logged.exerciseId === exercise.id)
    .flatMap((logged) => orderedSets(logged))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return normalRecordSets(sets, exercise);
}

/** Capacité comparable d'une série : 1RM estimé si chargée, reps sinon (même charge seulement). */
function capacityOf(set: Pick<LoggedSet, "weight" | "reps">, exercise: Exercise): number {
  if (exercise.setPatternMode === "assisted_bodyweight" || set.weight <= 0) return set.reps;
  return estimated1RM(set.weight, set.reps);
}

function comparable(a: Pick<LoggedSet, "weight">, b: Pick<LoggedSet, "weight">, exercise: Exercise): boolean {
  if (exercise.setPatternMode === "assisted_bodyweight" || a.weight <= 0 || b.weight <= 0) {
    return Math.abs(a.weight - b.weight) < 0.01;
  }
  return true;
}

/** Séries de travail des autres exercices faites avant la première série de l'exercice. */
function setsBefore(session: WorkoutSession, exercise: Exercise, catalogById: ReadonlyMap<string, Exercise>): number | null {
  const first = workSetsOf(session, exercise)[0];
  if (!first) return null;
  let total = 0;
  for (const logged of session.exercises) {
    if (logged.exerciseId === exercise.id) continue;
    const other = catalogById.get(logged.exerciseId);
    total += physiologicalSetUnits(
      logged.sets.filter((set) => set.timestamp < first.timestamp),
      { increment: other?.smallestIncrement }
    );
  }
  return Math.round(total);
}

/** Écarts (secondes) entre séries successives d'un exercice. */
function restsOf(sets: readonly LoggedSet[]): number[] {
  const rests: number[] = [];
  for (let index = 1; index < sets.length; index += 1) {
    const gap = (sets[index].timestamp.getTime() - sets[index - 1].timestamp.getTime()) / 1000;
    if (gap > 0 && gap < 20 * 60) rests.push(gap);
  }
  return rests;
}

interface ExerciseOccurrence {
  session: WorkoutSession;
  best: LoggedSet;
  sets: LoggedSet[];
}

/** Séances antérieures (plus récentes d'abord) où l'exercice a des séries de travail. */
function priorOccurrences(prior: readonly WorkoutSession[], exercise: Exercise): ExerciseOccurrence[] {
  const result: ExerciseOccurrence[] = [];
  for (const session of sessionsNewestFirst(prior)) {
    const merged = mergeExerciseOccurrences(session).find((logged) => logged.exerciseId === exercise.id);
    if (!merged) continue;
    const best = bestSetOfSession(merged, exercise);
    if (!best) continue;
    result.push({ session, best, sets: workSetsOf(session, exercise) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Supersets : liés dans l'app ou reconnus à l'alternance
// ---------------------------------------------------------------------------

export interface SupersetBlock {
  linked: boolean;
  exerciseIds: string[];
}

/** Supersets d'une séance : groupes liés dans l'app, puis alternances reconnues (A, B, A, B). */
export function supersetBlocks(session: WorkoutSession): SupersetBlock[] {
  const loggedById = new Map(session.exercises.map((logged) => [logged.id, logged]));
  const blocks: SupersetBlock[] = [];
  const grouped = new Set<string>();
  for (const group of session.supersetGroups ?? []) {
    const exerciseIds = [
      ...new Set(
        group.memberOrder
          .map((id) => loggedById.get(id))
          .filter((logged): logged is LoggedExercise => logged !== undefined && logged.sets.some((set) => set.completed))
          .map((logged) => logged.exerciseId)
      ),
    ];
    if (exerciseIds.length < 2) continue;
    exerciseIds.forEach((id) => grouped.add(id));
    blocks.push({ linked: true, exerciseIds });
  }

  // Alternance non liée (A, B, A, B…) : au moins trois passages de l'un à l'autre, chacun en moins
  // de 4 min, comme la détection automatique de la séance.
  const sequence = session.exercises
    .flatMap((logged) => logged.sets.filter((set) => set.completed && isWorkSet(set)).map((set) => ({ set, exerciseId: logged.exerciseId })))
    .sort((a, b) => a.set.timestamp.getTime() - b.set.timestamp.getTime());
  const switches = new Map<string, number>();
  for (let index = 1; index < sequence.length; index += 1) {
    const previous = sequence[index - 1];
    const current = sequence[index];
    if (previous.exerciseId === current.exerciseId) continue;
    const gap = (current.set.timestamp.getTime() - previous.set.timestamp.getTime()) / 1000;
    if (gap > SESSION_INSIGHTS.SUPERSET_MAX_GAP_S) continue;
    const key = [previous.exerciseId, current.exerciseId].sort().join("|");
    switches.set(key, (switches.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...switches.entries()].sort((a, b) => b[1] - a[1])) {
    if (count < 3) continue;
    const exerciseIds = key.split("|");
    if (exerciseIds.some((id) => grouped.has(id))) continue;
    exerciseIds.forEach((id) => grouped.add(id));
    blocks.push({ linked: false, exerciseIds });
  }
  return blocks;
}

/** Séances antérieures où l'exercice a été fait seul (hors superset lié ou alterné). */
function soloOccurrences(prior: readonly WorkoutSession[], exercise: Exercise): ExerciseOccurrence[] {
  return priorOccurrences(prior, exercise).filter(
    (occurrence) => !supersetBlocks(occurrence.session).some((block) => block.exerciseIds.includes(exercise.id))
  );
}

function mostUsedLoad(sets: readonly LoggedSet[]): number | null {
  const counts = new Map<number, number>();
  for (const set of sets) counts.set(set.weight, (counts.get(set.weight) ?? 0) + 1);
  let best: { load: number; count: number } | null = null;
  for (const [load, count] of counts) {
    if (!best || count > best.count || (count === best.count && load > best.load)) best = { load, count };
  }
  return best?.load ?? null;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Les séries enchaînées du superset : la plus longue suite de séries de ses membres, qu'interrompent au plus
 * `SUPERSET_CHAIN_MAX_FOREIGN` séries d'un autre exercice d'affilée (un exercice glissé dans un tour, non lié, reste
 * dedans). Une série d'un membre faite ensuite, seule, n'en fait plus partie : le 22/10/2026, une 3e série
 * d'élévations faite 24 min plus tard, après les triceps et les abdos, comptait dans « 8 séries en 40 min 39 » d'un
 * superset qui avait duré 17 min.
 */
function chainedSetIds(session: WorkoutSession, exerciseIds: readonly string[]): Set<string> {
  const members = new Set(exerciseIds);
  const sequence = session.exercises
    .flatMap((logged) => logged.sets.filter((set) => set.completed && isWorkSet(set)).map((set) => ({ set, exerciseId: logged.exerciseId })))
    .sort((a, b) => a.set.timestamp.getTime() - b.set.timestamp.getTime());
  const runs: { ids: Set<string>; exercises: Set<string> }[] = [];
  let current: { ids: Set<string>; exercises: Set<string> } | null = null;
  let foreign = 0;
  for (const { set, exerciseId } of sequence) {
    if (!members.has(exerciseId)) {
      foreign += 1;
      if (foreign > SESSION_INSIGHTS.SUPERSET_CHAIN_MAX_FOREIGN) current = null;
      continue;
    }
    foreign = 0;
    if (!current) {
      current = { ids: new Set(), exercises: new Set() };
      runs.push(current);
    }
    current.ids.add(set.id);
    current.exercises.add(exerciseId);
  }
  const best = runs
    .filter((run) => run.exercises.size >= 2)
    .reduce<(typeof runs)[number] | null>((kept, run) => (!kept || run.ids.size > kept.ids.size ? run : kept), null);
  return best?.ids ?? new Set();
}

function summarizeSupersets(
  session: WorkoutSession,
  prior: readonly WorkoutSession[],
  catalogById: ReadonlyMap<string, Exercise>,
  calibrating: ReadonlySet<string>
): SupersetSummary[] {
  const summaries: SupersetSummary[] = [];
  for (const block of supersetBlocks(session)) {
    const exercises = block.exerciseIds.map((id) => catalogById.get(id)).filter((e): e is Exercise => e !== undefined);
    if (exercises.length < 2) continue;
    // Séance importée sans horaires (toutes les séries à la même seconde) : ni ordre ni durée ; seules les reps se lisent.
    const memberSets = exercises.flatMap((exercise) => workSetsOf(session, exercise));
    const timed = new Set(memberSets.map((set) => set.timestamp.getTime())).size > 1;
    const inBlock = timed ? chainedSetIds(session, block.exerciseIds) : new Set(memberSets.map((set) => set.id));
    const blockSets = (exercise: Exercise) => workSetsOf(session, exercise).filter((set) => inBlock.has(set.id));
    const members: SupersetMemberSummary[] = exercises.map((exercise) => {
      const sets = blockSets(exercise);
      const solo = soloOccurrences(prior, exercise).slice(0, SESSION_INSIGHTS.HABIT_SESSIONS);
      const load = mostUsedLoad(sets);
      const atLoad = (list: readonly LoggedSet[]) =>
        load === null ? [] : list.filter((set) => Math.abs(set.weight - load) < 0.01).map((set) => set.reps);
      const soloAtLoad = solo.flatMap((occurrence) => atLoad(occurrence.sets));
      const judged = calibrating.has(exercise.id)
        ? []
        : sets.map((set) => setVersusSuggestion(exercise, set)).filter((verdict) => verdict !== null);
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: sets.length,
        restSeconds: median(restsOf(sets)),
        soloRestSeconds: median(solo.flatMap((occurrence) => restsOf(occurrence.sets))),
        load,
        avgReps: average(atLoad(sets)),
        soloAvgReps: soloAtLoad.length > 0 ? average(soloAtLoad) : null,
        heldSuggestion: judged.filter((verdict) => verdict !== "below").length,
        withSuggestion: judged.length,
      };
    });
    const all = exercises
      .flatMap((exercise) => blockSets(exercise).map((set) => ({ set, exerciseId: exercise.id })))
      .sort((a, b) => a.set.timestamp.getTime() - b.set.timestamp.getTime());
    const switchGaps: number[] = [];
    for (let index = 1; index < all.length; index += 1) {
      if (all[index].exerciseId === all[index - 1].exerciseId) continue;
      const gap = (all[index].set.timestamp.getTime() - all[index - 1].set.timestamp.getTime()) / 1000;
      if (gap <= SESSION_INSIGHTS.SUPERSET_MAX_GAP_S) switchGaps.push(gap);
    }
    const soloRests = members.map((member) => member.soloRestSeconds);
    const soloEstimateSeconds = timed && soloRests.every((rest): rest is number => rest !== null)
      ? members.reduce((sum, member, index) => sum + Math.max(0, member.sets - 1) * soloRests[index]!, 0) +
        (members.length - 1) * (median(soloRests as number[]) ?? 0)
      : null;
    // Sans tour enchaîné, rien de vrai à dire ; sans horaires, pas de durée (0 s n'en est pas une).
    const rounds = Math.min(...members.map((member) => member.sets));
    if (rounds < 1) continue;
    const durationSeconds = timed && all.length > 1 ? (all.at(-1)!.set.timestamp.getTime() - all[0].set.timestamp.getTime()) / 1000 : 0;
    summaries.push({
      soloEstimateSeconds,
      linked: block.linked,
      members,
      rounds,
      durationSeconds,
      switchSeconds: timed ? median(switchGaps) : null,
    });
  }
  return summaries;
}

function supersetInsight(summary: SupersetSummary, index: number): SessionInsight {
  const names = summary.members.map((member) => shortExerciseName(member.exerciseName)).join(" + ");
  const totalSets = summary.members.reduce((sum, member) => sum + member.sets, 0);
  const estimate = summary.soloEstimateSeconds;
  const timed = summary.durationSeconds > 0;
  const parts: string[] = [
    `${plural(totalSets, "série")}${timed ? ` en ${duration(summary.durationSeconds)}` : ""}${estimate !== null ? ` (l'une après l'autre : ~${duration(estimate)})` : ""}${
      summary.switchSeconds !== null ? `, ${duration(summary.switchSeconds)} pour passer de l'un à l'autre` : ""
    }${summary.linked ? "" : " (alternance non liée)"}.`,
  ];

  let worst: { member: SupersetMemberSummary; delta: number } | null = null;
  const yieldBits: string[] = [];
  for (const member of summary.members) {
    if (member.load === null || member.avgReps === null || member.soloAvgReps === null) continue;
    const delta = member.avgReps - member.soloAvgReps;
    const load = member.load > 0 ? ` à ${cleanWeight(member.load)} kg` : "";
    yieldBits.push(`${member.exerciseName}${load} : ${oneDecimal(member.avgReps)} reps par série (seul ${oneDecimal(member.soloAvgReps)})`);
    if (!worst || delta < worst.delta) worst = { member, delta };
  }
  if (yieldBits.length > 0) parts.push(`${yieldBits.join(" ; ")}.`);
  else {
    const held = summary.members.filter((member) => member.withSuggestion > 0);
    if (held.length > 0) {
      parts.push(`${held.map((member) => `${member.exerciseName} : ${member.heldSuggestion}/${member.withSuggestion} séries à la suggestion ou au-dessus`).join(" ; ")}.`);
    }
  }

  const rested = summary.members.filter((member) => member.restSeconds !== null && member.soloRestSeconds !== null);
  const restToday = median(rested.map((member) => member.restSeconds!));
  const restSolo = median(rested.map((member) => member.soloRestSeconds!));
  const costly = worst !== null && worst.delta <= -1;
  const faster = timed && estimate !== null && summary.durationSeconds <= estimate * 0.8;
  const longerRests = restToday !== null && restSolo !== null && restToday >= restSolo * SESSION_INSIGHTS.LONGER_REST_RATIO;
  const loss = costly
    ? `${shortExerciseName(worst!.member.exerciseName)} perd ${oneDecimal(-worst!.delta)} rep${-worst!.delta >= 2 ? "s" : ""} par série`
    : "";
  const title = costly && faster
    ? `${names} : ${duration(summary.durationSeconds)} au lieu de ~${duration(estimate!)}, mais ${loss}`
    : costly
      ? `${names} : ${loss} en superset`
      : faster
        ? `${names} : ${duration(summary.durationSeconds)} au lieu de ~${duration(estimate!)} l'un après l'autre`
        : longerRests
          ? `${names} : ~${Math.round(restToday! / 60)} min de repos par exercice, contre ~${Math.round(restSolo! / 60)} seul`
          : `${names} : ${plural(summary.rounds, "tour")}${timed ? ` en ${duration(summary.durationSeconds)}` : ""}`;
  return {
    id: `superset-${index}`,
    kind: "superset",
    title,
    detail: parts.join(" "),
    tone: costly ? "warning" : faster || longerRests ? "positive" : "neutral",
    exerciseIds: summary.members.map((member) => member.exerciseId),
    weight: costly ? 68 : faster || longerRests ? 58 : 50,
  };
}

// ---------------------------------------------------------------------------
// Progression, fatigue, suggestion
// ---------------------------------------------------------------------------

interface ExerciseFacts {
  exercise: Exercise;
  loggedId: string;
  calibrating: boolean;
  best: LoggedSet;
  sets: LoggedSet[];
  previous: ExerciseOccurrence[];
  /** Variation de capacité contre la séance précédente (fraction) ; `null` si incomparable. */
  delta: number | null;
  /** Reps gagnées à charge égale contre la séance précédente. */
  repsAtSameLoad: number | null;
  /** Séances de suite en hausse (aujourd'hui compris). */
  streak: number;
  setsBefore: number | null;
  habitSetsBefore: number | null;
  fatigueReps: number;
  /** Écart à ce que Jeera prévoyait, fatigue de séance comprise (`sessionForecasts`) ; `null` sans prévision. */
  forecast: SessionForecast | null;
}

/**
 * La meilleure série `a` fait-elle mieux que `b` ? La règle unique de l'app (`versusReference`, `versus.ts`) :
 * même charge, plus de reps ; plus lourd, reps dans la fourchette ; plus léger, reps ramenées à la charge de `b`
 * par la règle 7,5 %. Avant le 24/10/2026, un 1RM d'Epley : « Tirage horizontal : +6 kg (2 reps de moins) »
 * comptait comme une hausse (78 × 5 contre 72 × 7, +2 % d'Epley), alors que par la règle de l'app 78 × 5 vaut
 * 72 × 6 et que 5 reps sont sous sa fourchette.
 */
function improvesOn(a: Pick<LoggedSet, "weight" | "reps">, b: Pick<LoggedSet, "weight" | "reps">, exercise: Exercise): boolean {
  if (!comparable(a, b, exercise)) return false;
  return versusReference(exercise, a, b) === "beat";
}

function streakOf(today: LoggedSet, previous: readonly ExerciseOccurrence[], exercise: Exercise): number {
  let streak = 0;
  let current: Pick<LoggedSet, "weight" | "reps"> = today;
  for (const occurrence of previous) {
    if (!improvesOn(current, occurrence.best, exercise)) break;
    streak += 1;
    current = occurrence.best;
  }
  return streak;
}

/** « +3 reps à 20 kg », « +5 kg (1 rep de moins) », « 2 reps de moins au poids du corps ». */
function gainLabel(today: Pick<LoggedSet, "weight" | "reps">, before: Pick<LoggedSet, "weight" | "reps">): string {
  const repsDiff = today.reps - before.reps;
  if (Math.abs(today.weight - before.weight) < 0.01) {
    const where = today.weight > 0 ? `à ${cleanWeight(today.weight)} kg` : "au poids du corps";
    return repsDiff >= 0 ? `+${plural(repsDiff, "rep")} ${where}` : `${plural(-repsDiff, "rep")} de moins ${where}`;
  }
  const loadDiff = today.weight - before.weight;
  const load = `${loadDiff > 0 ? "+" : "−"}${cleanWeight(Math.abs(loadDiff))} kg`;
  if (repsDiff === 0) return `${load} à reps égales`;
  return repsDiff > 0 ? `${load} et +${plural(repsDiff, "rep")}` : `${load} (${plural(-repsDiff, "rep")} de moins)`;
}

function progressInsight(facts: ExerciseFacts, catalogById: ReadonlyMap<string, Exercise>): SessionInsight | null {
  const { exercise, best, previous, delta } = facts;
  const last = previous[0];
  if (!last || delta === null) return null;
  const improved = improvesOn(best, last.best, exercise);
  // Une séance n'est en baisse que sous la prévision, fatigue de séance comprise : moins de reps qu'à la séance d'avant
  // parce que l'exercice venait plus tard n'en est pas une.
  const declined = !improved && delta <= -SESSION_INSIGHTS.DECLINE_MIN && facts.forecast?.direction === "down";
  if (!improved && !declined) return null;

  const sameLoad = Math.abs(best.weight - last.best.weight) < 0.01;
  const gain = gainLabel(best, last.best);
  const streakText = facts.streak >= 2 ? `, ${facts.streak}e séance de suite en hausse` : "";

  // Pourquoi : ce qui a changé par rapport à l'habitude de CET exercice, en chiffres.
  const reasons: string[] = [];
  const habit = previous.slice(0, SESSION_INSIGHTS.HABIT_SESSIONS);
  if (facts.setsBefore !== null && facts.habitSetsBefore !== null && habit.length >= 2) {
    const diff = facts.setsBefore - facts.habitSetsBefore;
    if (improved && diff <= -SESSION_INSIGHTS.PLACEMENT_DELTA_SETS) {
      reasons.push(`${startedAfter(facts.setsBefore)} (d'habitude après ${Math.round(facts.habitSetsBefore)}), donc plus frais`);
    } else if (improved && diff >= SESSION_INSIGHTS.PLACEMENT_DELTA_SETS) {
      reasons.push(`malgré ${plural(facts.setsBefore, "série")} avant (d'habitude ${Math.round(facts.habitSetsBefore)})`);
    } else if (declined && diff >= SESSION_INSIGHTS.PLACEMENT_DELTA_SETS) {
      reasons.push(`${startedAfter(facts.setsBefore)} (d'habitude après ${Math.round(facts.habitSetsBefore)})`);
    }
  }
  const bestIndex = facts.sets.findIndex((set) => set.id === best.id);
  const restBeforeBest = bestIndex > 0 ? (best.timestamp.getTime() - facts.sets[bestIndex - 1].timestamp.getTime()) / 1000 : null;
  const habitRest = median(habit.flatMap((occurrence) => restsOf(occurrence.sets)));
  if (restBeforeBest !== null && habitRest !== null && restBeforeBest >= habitRest * SESSION_INSIGHTS.LONGER_REST_RATIO) {
    reasons.push(`${duration(restBeforeBest)} de repos avant cette série (d'habitude ${duration(habitRest)})`);
  }
  const gapDays = (facts.best.timestamp.getTime() - last.session.date.getTime()) / 86_400_000;
  const habitGap = median(
    habit.slice(0, -1).map((occurrence, index) => (occurrence.session.date.getTime() - habit[index + 1].session.date.getTime()) / 86_400_000)
  );
  if (habitGap !== null && gapDays >= 3 && gapDays >= habitGap * 1.5) {
    reasons.push(`${Math.round(gapDays)} jours depuis la dernière fois (d'habitude ${Math.round(habitGap)})`);
  }
  if (improved && !sameLoad && best.weight > last.best.weight && best.suggestedWeight != null && Math.abs(best.suggestedWeight - best.weight) < 0.01) {
    reasons.push(`charge proposée par l'app et tenue`);
  }
  if (declined && facts.fatigueReps >= 1) {
    reasons.push(`la fatigue de la séance coûtait ~${plural(facts.fatigueReps, "rep")}`);
  }
  if (declined && facts.forecast) {
    reasons.push(`${Math.round(-facts.forecast.gap * 100)} % sous ce que Jeera prévoyait, fatigue de séance comprise`);
  }
  void catalogById;

  const reasonText =
    reasons.length > 0
      ? ` Contexte : ${reasons.join(" ; ")}.`
      : improved && facts.setsBefore !== null && facts.habitSetsBefore !== null && habit.length >= 2
        ? ` Même place dans la séance que d'habitude (${startedAfter(facts.setsBefore)}) : un gain réel, pas de la fraîcheur.`
        : "";

  return {
    id: `progress-${exercise.id}`,
    kind: "progress",
    title: `${shortExerciseName(exercise.name)} : ${gain}${improved ? streakText : ""}`,
    detail: `${setLabel(best.weight, best.reps)} contre ${setLabel(last.best.weight, last.best.reps)} le ${dayLabel(last.session.date)}.${reasonText}`,
    tone: improved ? "positive" : "warning",
    exerciseIds: [exercise.id],
    weight: improved ? 60 + Math.min(25, facts.streak * 7) + Math.min(10, Math.round(Math.max(0, delta) * 200)) : 58,
  };
}

function fatigueInsights(facts: readonly ExerciseFacts[], tally: SuggestionTally | null): SessionInsight[] {
  const affected = facts
    .filter(
      (fact) =>
        !fact.calibrating &&
        fact.fatigueReps >= 1 &&
        fact.setsBefore !== null &&
        // Commencé plus tôt que d'habitude : parler de fatigue contredirait le placement affiché.
        (fact.habitSetsBefore === null || fact.setsBefore > fact.habitSetsBefore)
    )
    .sort((a, b) => b.fatigueReps - a.fatigueReps);
  if (affected.length === 0) return [];
  const total = affected.reduce((sum, fact) => sum + fact.fatigueReps, 0);
  const lines = affected.map((fact) => {
    const habit = fact.habitSetsBefore !== null ? ` (d'habitude après ${Math.round(fact.habitSetsBefore)})` : "";
    const fresh = fact.best.weight > 0 ? `, ${setLabel(fact.best.weight, fact.best.reps)} vaut ~${setLabel(fact.best.weight, fact.best.reps + fact.fatigueReps)} à frais` : "";
    return `${fact.exercise.name} ${startedAfter(fact.setsBefore!)}${habit}${fresh}`;
  });
  const lateBelow = tally && tally.below > 0 ? ` ${tally.belowInSecondHalf} des ${plural(tally.below, "série")} sous la suggestion sont dans la seconde moitié de la séance.` : "";
  return [
    {
      id: "fatigue",
      kind: "fatigue",
      title:
        affected.length === 1
          ? `Fatigue de séance : ~${plural(total, "rep")} perdue${total > 1 ? "s" : ""} sur ${shortExerciseName(affected[0].exercise.name)}`
          : `Fatigue de séance : ~${plural(total, "rep")} perdues sur ${plural(affected.length, "exercice")}`,
      detail: `${lines.join(" ; ")}. Déjà déduit de la cible de l'app.${lateBelow}`,
      tone: "neutral",
      exerciseIds: affected.map((fact) => fact.exercise.id),
      weight: 50 + Math.min(20, total * 6),
    },
  ];
}

// ---------------------------------------------------------------------------
// Face à sa capacité du jour (24/10/2026)
// ---------------------------------------------------------------------------

/**
 * Ce qu'il pouvait faire à la charge prise, à ce moment de la séance : la prévision du moteur enregistrée avec la série
 * (`predictedRepsAtActualWeight`, sans marge, fatigue de la séance comprise), seulement pour les moteurs qui l'enregistrent
 * comme prévision (≥ web-v2.3). Ramenée au haut de la fourchette par la reprojection : au-delà, elle ne dit rien.
 */
function capacityOfTheDay(set: LoggedSet, exercise: Exercise): number | null {
  if (!storesPrediction(set.suggestionEngineVersion) || set.predictedRepsAtActualWeight == null) return null;
  const capacity = Math.round(set.predictedRepsAtActualWeight);
  if (exercise.setPatternMode !== "bodyweight" && capacity >= exercise.repTargetMax && set.reps > capacity) return null;
  return capacity;
}

function signedReps(gap: number): string {
  if (gap === 0) return "pile ta capacité";
  return `${gap > 0 ? "+" : "−"}${Math.abs(gap)} rep${Math.abs(gap) > 1 ? "s" : ""}`;
}

/**
 * Evan, 24/10 : « c'est dans le bilan que je sais à quel point je me suis dépassé ou pas car le bilan sait ma capacité
 * réelle sur les exercices ». Par exercice : sa meilleure série face à sa capacité du jour à cette charge, et l'écart
 * sur toutes ses séries. En séance, l'écran ne dit que la cible (`target-display.ts`).
 */
function capacityInsights(facts: readonly ExerciseFacts[]): SessionInsight[] {
  const out: SessionInsight[] = [];
  for (const fact of facts) {
    if (fact.calibrating) continue;
    const measured = fact.sets
      .map((set) => ({ set, capacity: capacityOfTheDay(set, fact.exercise) }))
      .filter((entry): entry is { set: LoggedSet; capacity: number } => entry.capacity !== null);
    if (measured.length === 0) continue;
    const best = measured.find((entry) => entry.set.id === fact.best.id) ?? [...measured].sort((a, b) => b.set.reps - b.capacity - (a.set.reps - a.capacity))[0];
    const gap = best.set.reps - best.capacity;
    const total = measured.reduce((sum, entry) => sum + entry.set.reps - entry.capacity, 0);
    const name = shortExerciseName(fact.exercise.name);
    out.push({
      id: `capacity-${fact.exercise.id}`,
      kind: "capacity",
      title: `${name} : ${setLabel(best.set.weight, best.set.reps)}, ta capacité du jour était ${setLabel(best.set.weight, best.capacity)}, ${signedReps(gap)}`,
      detail:
        measured.length > 1
          ? `Sur tes ${measured.length} séries : ${total === 0 ? "pile ta capacité au total" : `${signedReps(total)} au total`}.`
          : "Une seule série mesurée.",
      tone: gap > 0 ? "positive" : gap < 0 ? "warning" : "neutral",
      exerciseIds: [fact.exercise.id],
      weight: gap > 0 ? 62 + Math.min(16, 4 * gap) : gap < 0 ? 52 + Math.min(8, 2 * -gap) : 45,
    });
  }
  // La définition, une fois, sous l'enseignement le plus fort (celui qui monte en tête).
  const top = [...out].sort((a, b) => b.weight - a.weight)[0];
  if (top) top.detail = `${top.detail} Ta capacité du jour : ce que tes séances disent que tu pouvais faire à cette charge, à ce moment de la séance, fatigue comprise.`;
  return out;
}

function buildTally(
  session: WorkoutSession,
  facts: readonly ExerciseFacts[]
): SuggestionTally | null {
  const judged: { fact: ExerciseFacts; set: LoggedSet; verdict: "beat" | "met" | "below"; setNumber: number }[] = [];
  for (const fact of facts) {
    if (fact.calibrating) continue;
    // Les séries que juge l'en-tête de séance (`sessionGame`), séries à compléter comprises : un seul compte.
    session.exercises
      .filter((logged) => logged.exerciseId === fact.exercise.id)
      .flatMap((logged) => orderedSets(logged).filter(isRated))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .forEach((set, index) => {
        const verdict = setVersusSuggestion(fact.exercise, set);
        if (verdict) judged.push({ fact, set, verdict, setNumber: index + 1 });
      });
  }
  if (judged.length === 0) return null;
  const times = session.exercises.flatMap((logged) => logged.sets.filter((set) => set.completed).map((set) => set.timestamp.getTime()));
  const midpoint = (Math.min(...times) + Math.max(...times)) / 2;
  const below = judged.filter((entry) => entry.verdict === "below");
  return {
    beat: judged.filter((entry) => entry.verdict === "beat").length,
    met: judged.filter((entry) => entry.verdict === "met").length,
    below: below.length,
    belowInSecondHalf: below.filter((entry) => entry.set.timestamp.getTime() > midpoint).length,
    oneInThree: judged.every((entry) => engineVersionAtLeast(entry.set.suggestionEngineVersion, ONE_IN_THREE_VERSION)),
    belowDetails: below.map(({ fact, set, setNumber }) => {
      const sameLoad = Math.abs(set.weight - (set.suggestedWeight ?? 0)) < 0.01;
      const gap = sameLoad
        ? `${set.reps - (set.suggestedReps ?? 0)} rep${Math.abs(set.reps - (set.suggestedReps ?? 0)) > 1 ? "s" : ""}`
        : `${setLabel(set.weight, set.reps)} pour ${setLabel(set.suggestedWeight ?? 0, set.suggestedReps ?? 0)}`;
      const short = sameLoad
        ? `${(set.suggestedReps ?? 0) - set.reps} rep${(set.suggestedReps ?? 0) - set.reps > 1 ? "s" : ""} de moins`
        : set.reps === set.suggestedReps && set.weight > 0
          ? `${cleanWeight(set.weight)} kg au lieu de ${cleanWeight(set.suggestedWeight ?? 0)}`
          : gap;
      return {
        exerciseId: fact.exercise.id,
        exerciseName: fact.exercise.name,
        setNumber,
        label: `série ${setNumber} : ${short}`,
      };
    }),
  };
}

function suggestionInsight(tally: SuggestionTally): SessionInsight {
  const total = tally.beat + tally.met + tally.below;
  const byExercise = new Map<string, { name: string; labels: string[]; id: string }>();
  for (const detail of tally.belowDetails) {
    const entry = byExercise.get(detail.exerciseId) ?? { name: detail.exerciseName, labels: [], id: detail.exerciseId };
    entry.labels.push(detail.label);
    byExercise.set(detail.exerciseId, entry);
  }
  const where = [...byExercise.values()]
    .sort((a, b) => b.labels.length - a.labels.length)
    .map((entry) => `${entry.name} (${entry.labels.join(", ")})`)
    .join(" ; ");
  // « Une sur trois » n'est vrai que des cibles du moteur réglé ainsi (24/10/2026) ; avant, il en visait plus.
  const expected = tally.oneInThree ? ", le moteur en attend une sur trois" : "";
  return {
    id: "suggestion",
    kind: "suggestion",
    title: `${tally.beat} cible${tally.beat > 1 ? "s" : ""} battue${tally.beat > 1 ? "s" : ""} sur ${total}${expected}`,
    detail:
      tally.below === 0
        ? `${tally.met > 0 ? `${tally.met} tenue${tally.met > 1 ? "s" : ""}, aucune en dessous.` : "Aucune en dessous."}`
        : `${tally.met > 0 ? `${tally.met} tenue${tally.met > 1 ? "s" : ""}. ` : ""}En dessous : ${where}.`,
    tone: tally.below > tally.beat ? "warning" : "positive",
    exerciseIds: [...byExercise.values()].map((entry) => entry.id),
    // Face au tiers attendu, le taux de la séance dit s'il s'est dépassé : il passe devant les supersets et la semaine.
    weight: tally.oneInThree ? 61 : tally.below >= Math.max(3, 0.4 * total) ? 55 : 42,
  };
}

// ---------------------------------------------------------------------------
// Prochaine fois : la série exacte qui vaudrait une étoile, ou le placement à changer
// ---------------------------------------------------------------------------

/** Plus petite série qui décroche une étoile, à la charge du jour puis un cran au-dessus. */
export function recordTarget(
  exercise: Exercise,
  allSets: LoggedSet[],
  load: number,
  at: Date
): { weight: number; reps: number }[] {
  const increment = exercise.smallestIncrement > 0 ? exercise.smallestIncrement : 2.5;
  const loads = exercise.setPatternMode === "assisted_bodyweight" || load <= 0 ? [load] : [load, load + increment];
  const targets: { weight: number; reps: number }[] = [];
  for (const weight of loads) {
    if (exercise.maxLoad && exercise.maxLoad > 0 && weight > exercise.maxLoad + 1e-9) continue;
    for (let reps = Math.max(1, exercise.repTargetMin); reps <= 40; reps += 1) {
      const candidate = {
        id: "target",
        weight,
        reps,
        setType: SetType.work,
        timestamp: at,
        setSlotIndex: 0,
        completed: true,
        supersetRoundIndex: null,
      } as unknown as LoggedSet;
      // La règle des étoiles de l'Historique (`isRecordSet`), celle que le bilan et le rang comptent.
      if (isRecordSet(candidate, [...allSets, candidate], exercise)) {
        // Un cran plus lourd ne vaut d'être proposé que s'il demande moins de reps.
        if (targets.length === 0 || reps < targets[0].reps) targets.push({ weight, reps });
        break;
      }
    }
  }
  return targets;
}

function nextTimeInsights(
  facts: readonly ExerciseFacts[],
  supersets: readonly SupersetSummary[],
  tally: SuggestionTally | null,
  prior: readonly WorkoutSession[],
  session: WorkoutSession
): SessionInsight[] {
  const result: SessionInsight[] = [];
  const used = new Set<string>();

  // 1. Un exercice en dessous de sa cible ET fait plus tard que d'habitude : le remonter.
  const belowIds = new Set((tally?.belowDetails ?? []).map((detail) => detail.exerciseId));
  for (const fact of facts) {
    if (result.length >= SESSION_INSIGHTS.NEXT_TIME_MAX) break;
    if (!belowIds.has(fact.exercise.id) || fact.setsBefore === null || fact.habitSetsBefore === null) continue;
    if (fact.setsBefore - fact.habitSetsBefore < SESSION_INSIGHTS.PLACEMENT_DELTA_SETS) continue;
    used.add(fact.exercise.id);
    result.push({
      id: `next-place-${fact.exercise.id}`,
      kind: "next",
      title: `${shortExerciseName(fact.exercise.name)} : le placer plus tôt`,
      detail: `${startedAfter(fact.setsBefore).replace("commencé", "Commencé")} (d'habitude après ${Math.round(fact.habitSetsBefore)}) et sous la suggestion aujourd'hui.`,
      tone: "neutral",
      exerciseIds: [fact.exercise.id],
      weight: 56,
    });
  }

  // 2. Un membre de superset qui y perd nettement, sans que le superset fasse gagner de temps : le
  // faire seul. (S'il fait gagner du temps, l'échange est dit dans l'enseignement du superset.)
  for (const summary of supersets) {
    const faster = summary.soloEstimateSeconds !== null && summary.durationSeconds <= summary.soloEstimateSeconds * 0.8;
    if (faster) continue;
    for (const member of summary.members) {
      if (result.length >= SESSION_INSIGHTS.NEXT_TIME_MAX || used.has(member.exerciseId)) continue;
      if (member.avgReps === null || member.soloAvgReps === null || member.load === null) continue;
      if (member.soloAvgReps - member.avgReps < 1) continue;
      used.add(member.exerciseId);
      result.push({
        id: `next-solo-${member.exerciseId}`,
        kind: "next",
        title: `${shortExerciseName(member.exerciseName)} : seul plutôt qu'en superset`,
        detail: `${member.load > 0 ? `À ${cleanWeight(member.load)} kg` : "Au poids du corps"} : ${oneDecimal(member.soloAvgReps)} reps de moyenne seul, ${oneDecimal(member.avgReps)} en superset aujourd'hui.`,
        tone: "neutral",
        exerciseIds: [member.exerciseId],
        weight: 56,
      });
    }
  }

  // 3. Les exercices en hausse : la série précise qui décroche une étoile.
  const climbing = facts
    .filter((fact) => !fact.calibrating && !used.has(fact.exercise.id) && fact.delta !== null && fact.delta > 0)
    .sort((a, b) => b.streak - a.streak || (b.delta ?? 0) - (a.delta ?? 0));
  for (const fact of climbing) {
    if (result.length >= SESSION_INSIGHTS.NEXT_TIME_MAX) break;
    const allSets = [
      ...priorOccurrencesAllSets(prior, fact.exercise),
      ...session.exercises.filter((logged) => logged.exerciseId === fact.exercise.id).flatMap((logged) => orderedSets(logged)),
    ];
    const targets = recordTarget(fact.exercise, allSets, fact.best.weight, new Date(session.date.getTime() + 2 * 86_400_000));
    if (targets.length === 0) continue;
    used.add(fact.exercise.id);
    result.push({
      id: `next-record-${fact.exercise.id}`,
      kind: "next",
      title: `${shortExerciseName(fact.exercise.name)} : ${targets.map((target) => setLabel(target.weight, target.reps)).join(" ou ")} pour une étoile`,
      detail: `Aujourd'hui : ${setLabel(fact.best.weight, fact.best.reps)}${fact.streak >= 2 ? `, ${fact.streak}e séance de suite en hausse` : ""}. ${targets.length > 1 ? "Chacune vaut" : "Elle vaut"} une étoile de l'Historique.`,
      tone: "positive",
      exerciseIds: [fact.exercise.id],
      weight: 56,
    });
  }
  return result;
}

function priorOccurrencesAllSets(prior: readonly WorkoutSession[], exercise: Exercise): LoggedSet[] {
  return [...prior]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .flatMap((session) => session.exercises.filter((logged) => logged.exerciseId === exercise.id).flatMap((logged) => orderedSets(logged)));
}

// ---------------------------------------------------------------------------
// Semaine : le palier, ce qui reste et où
// ---------------------------------------------------------------------------

function weekStatus(
  session: WorkoutSession,
  prior: WorkoutSession[],
  catalog: Exercise[],
  goals: MuscleGoal[]
): WeekTierStatus | null {
  // Même calcul que l'en-tête de séance et l'accueil (`week-status.ts`).
  const before = weekStatusFromRows(weeklyProgress(prior, catalog, goals, session.date));
  const after = weekStatusFromRows(weeklyProgress(prior, catalog, goals, session.date, session));
  if (after.goalTotal <= 0) return null;
  const plan = weekSessionPlan(prior, session.date);
  return {
    scoreBefore: before.score,
    scoreAfter: after.score,
    tierBefore: before.tier,
    tierAfter: after.tier,
    nextTierLabel: after.next?.label ?? null,
    setsToNextTier: after.setsToNext,
    // Où une série comptait encore : haut du corps d'abord (11/10/2026, « Reste surtout : Ischios 9,
    // Fessiers 9, Mollets 9 » quand les 3 séries de l'or ne pouvaient venir que des abdos).
    remaining: after.where.map((row) => ({ parent: row.parent, sets: Math.max(1, Math.round(row.remaining)) })),
    sessionsLeftAfterToday: Math.max(0, plan.sessionsLeftIncludingToday - 1),
  };
}

function weekInsight(status: WeekTierStatus): SessionInsight {
  const tierLabel = (tier: WeekTier | null) => WEEK_TIERS.find((entry) => entry.tier === tier)?.label.toLowerCase() ?? null;
  const percent = (score: number) => `${Math.round(score * 100)} %`;
  const reached = status.tierAfter !== null && status.tierAfter !== status.tierBefore;
  const current = tierLabel(status.tierAfter);
  const title =
    status.setsToNextTier === null
      ? `Semaine en or (${percent(status.scoreAfter)})`
      : reached
        ? `Palier ${current} atteint (${percent(status.scoreAfter)}) · ${status.nextTierLabel} à ${status.setsToNextTier} séries`
        : `${current ? `Semaine ${current}` : "Semaine"} à ${percent(status.scoreAfter)} · ${status.nextTierLabel} à ${status.setsToNextTier} séries`;
  const where = status.remaining.slice(0, 3).map((row) => `${parentShortName[row.parent]} ${row.sets}`).join(", ");
  const whereSentence = where
    ? status.setsToNextTier !== null && status.nextTierLabel
      ? ` Les séries pour ${({ Bronze: "le bronze", Argent: "l'argent", Or: "l'or" } as Record<string, string>)[status.nextTierLabel] ?? status.nextTierLabel} comptent sur : ${where}.`
      : ` Reste surtout : ${where}.`
    : "";
  const perSession =
    status.setsToNextTier !== null && status.sessionsLeftAfterToday > 0
      ? status.sessionsLeftAfterToday === 1
        ? ` 1 séance habituelle d'ici dimanche : ${status.setsToNextTier} séries à y faire.`
        : ` ${status.sessionsLeftAfterToday} séances habituelles d'ici dimanche : ~${Math.ceil(status.setsToNextTier / status.sessionsLeftAfterToday)} séries chacune.`
      : "";
  return {
    id: "week",
    kind: "week",
    title,
    detail: `Cette séance : ${percent(status.scoreBefore)} → ${percent(status.scoreAfter)}.${whereSentence}${perSession}`,
    tone: reached ? "positive" : "neutral",
    exerciseIds: [],
    weight: reached ? 78 : status.setsToNextTier !== null && status.setsToNextTier <= 8 ? 57 : 40,
  };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

const SECTION_LABEL: Record<InsightKind, string> = {
  progress: "Progression",
  capacity: "Face à ta capacité du jour",
  fatigue: "Fatigue de la séance",
  superset: "Supersets",
  suggestion: "Face à la cible",
  next: "La prochaine fois",
  week: "Palier de la semaine",
};

const SECTION_ORDER: InsightKind[] = ["capacity", "progress", "superset", "fatigue", "suggestion", "next", "week"];

export function buildSessionInsights(
  session: WorkoutSession,
  prior: WorkoutSession[],
  catalog: Exercise[],
  goals: MuscleGoal[],
  review: SessionReview,
  fatigueByLoggedExerciseId: Record<string, SessionFatigueContext> = {},
  forecasts: Record<string, SessionForecast> = {}
): SessionInsights {
  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const calibrating = new Set(review.exercises.filter((entry) => entry.calibrating).map((entry) => entry.exerciseId));

  const facts: ExerciseFacts[] = [];
  for (const merged of mergeExerciseOccurrences(session).sort((a, b) => a.orderIndex - b.orderIndex)) {
    const exercise = catalogById.get(merged.exerciseId);
    if (!exercise) continue;
    const best = bestSetOfSession(merged, exercise);
    const sets = workSetsOf(session, exercise);
    if (!best || sets.length === 0) continue;
    const previous = priorOccurrences(prior, exercise);
    const last = previous[0];
    const delta =
      last && comparable(best, last.best, exercise)
        ? capacityOf(best, exercise) / Math.max(1e-6, capacityOf(last.best, exercise)) - 1
        : null;
    const habitBefore = previous
      .slice(0, SESSION_INSIGHTS.HABIT_SESSIONS)
      .map((occurrence) => setsBefore(occurrence.session, exercise, catalogById))
      .filter((value): value is number => value !== null);
    const context = fatigueByLoggedExerciseId[merged.id];
    facts.push({
      exercise,
      loggedId: merged.id,
      calibrating: calibrating.has(exercise.id) || previous.length === 0,
      best,
      sets,
      previous,
      delta,
      repsAtSameLoad: last && Math.abs(best.weight - last.best.weight) < 0.01 ? best.reps - last.best.reps : null,
      streak: last ? streakOf(best, previous, exercise) : 0,
      setsBefore: setsBefore(session, exercise, catalogById),
      habitSetsBefore: median(habitBefore),
      fatigueReps: context ? context.fatiguePenalty(primaryParent(exercise)) : 0,
      forecast: forecasts[exercise.id] ?? null,
    });
  }

  const supersets = summarizeSupersets(session, prior, catalogById, calibrating);
  const tally = buildTally(session, facts);
  const week = weekStatus(session, prior, catalog, goals);

  const all: SessionInsight[] = [
    ...facts.filter((fact) => !fact.calibrating).map((fact) => progressInsight(fact, catalogById)).filter((insight): insight is SessionInsight => insight !== null),
    ...capacityInsights(facts),
    ...supersets.map((summary, index) => supersetInsight(summary, index)),
    ...fatigueInsights(facts, tally),
    ...(tally ? [suggestionInsight(tally)] : []),
    ...nextTimeInsights(facts, supersets, tally, prior, session),
    ...(week ? [weekInsight(week)] : []),
  ];

  const sections = SECTION_ORDER.map((kind) => ({
    kind,
    label: SECTION_LABEL[kind],
    items: all.filter((insight) => insight.kind === kind).sort((a, b) => b.weight - a.weight),
  })).filter((section) => section.items.length > 0);

  // En tête : les plus importants, une seule famille à la fois (trois progressions d'affilée
  // cacheraient les supersets ou la fatigue).
  const headline: SessionInsight[] = [];
  for (const insight of [...all].sort((a, b) => b.weight - a.weight)) {
    if (headline.length >= SESSION_INSIGHTS.HEADLINE_MAX) break;
    if (headline.some((picked) => picked.kind === insight.kind)) continue;
    headline.push(insight);
  }

  const celebrations: CelebrationMoment[] = [
    ...review.records.map((record) => ({ kind: "record" as const, label: record.label })),
    ...facts
      .filter((fact) => !fact.calibrating && fact.streak >= 3)
      .map((fact) => ({ kind: "progressStreak" as const, label: `${fact.exercise.name}, ${fact.streak}e séance de suite en hausse`, exerciseId: fact.exercise.id })),
    ...review.plateausBroken.map((name) => ({ kind: "plateauBroken" as const, label: `Plateau débloqué : ${name}` })),
    ...(week && week.tierAfter && week.tierAfter !== week.tierBefore
      ? [{ kind: "weekTier" as const, label: `Semaine ${WEEK_TIERS.find((entry) => entry.tier === week.tierAfter)!.label.toLowerCase()}` }]
      : []),
  ];

  return { headline, sections, supersets, suggestionTally: tally, week, celebrations };
}
