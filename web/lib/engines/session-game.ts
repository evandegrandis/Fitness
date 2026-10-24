/**
 * Le jeu de la séance (Evan, 26/09/2026) : suggestions battues, combo, boss du jour, fantôme.
 *
 * Règle absolue : rien ici ne calcule ni ne modifie une charge ou des reps. Les suggestions
 * restent celles du moteur de progression ; ce module ne fait que LIRE ce qui a été proposé et ce
 * qui a été fait, pour le raconter. Le « maître du jeu » (choix du boss) est un jeu de règles
 * fixes, sans intelligence artificielle.
 */

import { setVersusSuggestion } from "@/lib/engines/bilan";
import { estimated1RM } from "@/lib/engines/e1rm";
import { currentWeekWindow } from "@/lib/engines/effective-sets";
import { buildRecords } from "@/lib/engines/records";
import type { SetSuggestion } from "@/lib/engines/progression";
import { SetPatternMode, SetType } from "@/lib/models/enums";
import {
  orderedSets,
  type Exercise,
  type LoggedSet,
  type RecoveryCheckin,
  type WorkoutSession,
} from "@/lib/models/types";

const DAY_MS = 86_400_000;
const RATED_SET_TYPES: ReadonlySet<string> = new Set([SetType.work, SetType.topSet, SetType.backoff]);

export const SESSION_GAME = {
  /** Fantôme : la séance la plus proche d'il y a 4 semaines, cherchée entre 3 et 5 semaines. */
  GHOST_TARGET_DAYS: 28,
  GHOST_MIN_DAYS: 21,
  GHOST_MAX_DAYS: 35,
  /** Maître du jeu : pas de boss après une nuit courte ou de l'alcool (check-in de moins de 36 h). */
  TIRED_SLEEP_HOURS: 6,
  CHECKIN_WINDOW_HOURS: 36,
  /** Deux boss au plus par semaine civile : un boss doit rester un événement. */
  MAX_BOSSES_PER_WEEK: 2,
} as const;

/** Séries jugées face à leur cible : celles de l'en-tête, et celles que compte le bilan (`session-insights.ts`). */
export const isRated = (set: LoggedSet) => set.completed && RATED_SET_TYPES.has(set.setType);

/** Exercices déjà pratiqués avant la séance : les autres sont en étalonnage, jamais jugés. */
function knownExerciseIds(history: readonly WorkoutSession[], sessionId: string): Set<string> {
  const ids = new Set<string>();
  for (const session of history) {
    if (session.id === sessionId || session.isActive) continue;
    for (const logged of session.exercises) if (logged.sets.some((set) => set.completed)) ids.add(logged.exerciseId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Suggestions battues et combo
// ---------------------------------------------------------------------------

export interface SessionGame {
  /** Séries jugées (exercice déjà connu, suggestion enregistrée). */
  rated: number;
  beaten: number;
  /** Séries qui font exactement l'effort demandé. */
  held: number;
  below: number;
  /** Suggestions battues d'affilée, en cours. Une série tenue ne le casse pas, une série en dessous oui. */
  combo: number;
  bestCombo: number;
}

export function sessionGame(
  session: WorkoutSession,
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[]
): SessionGame {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const known = knownExerciseIds(history, session.id);
  const sets = session.exercises
    .filter((logged) => known.has(logged.exerciseId) && byId.has(logged.exerciseId))
    .flatMap((logged) => orderedSets(logged).filter(isRated).map((set) => ({ set, exercise: byId.get(logged.exerciseId)! })))
    .sort((a, b) => a.set.timestamp.getTime() - b.set.timestamp.getTime());

  const game: SessionGame = { rated: 0, beaten: 0, held: 0, below: 0, combo: 0, bestCombo: 0 };
  for (const { set, exercise } of sets) {
    const verdict = setVersusSuggestion(exercise, set);
    if (verdict === null) continue;
    game.rated += 1;
    if (verdict === "beat") {
      game.beaten += 1;
      game.combo += 1;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
    } else if (verdict === "below") {
      game.below += 1;
      game.combo = 0;
    } else {
      game.held += 1;
    }
  }
  return game;
}

// ---------------------------------------------------------------------------
// Boss du jour (maître du jeu)
// ---------------------------------------------------------------------------

export interface SessionBoss {
  loggedExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  /** Le boss est un passage de palier (plus rare qu'un record). */
  levelName: string | null;
}

/**
 * Pas de boss quand le dernier check-in dit une nuit courte ou de l'alcool : la suggestion reste la
 * même, seule l'annonce disparaît (le maître du jeu ne pousse pas un jour de fatigue).
 */
export function tiredToday(checkins: readonly RecoveryCheckin[], now: Date): boolean {
  const since = now.getTime() - SESSION_GAME.CHECKIN_WINDOW_HOURS * 3_600_000;
  return checkins.some(
    (checkin) =>
      checkin.date.getTime() >= since &&
      checkin.date.getTime() <= now.getTime() + DAY_MS &&
      ((checkin.sleepHours !== null && checkin.sleepHours < SESSION_GAME.TIRED_SLEEP_HOURS) || checkin.hadAlcohol === true)
  );
}

/**
 * Le boss : parmi les exercices de la séance, celui dont la première série proposée par le moteur
 * franchirait un palier, sinon battrait un record (`readyForLevelUp` / `readyForPR`, calculés par le
 * moteur lui-même). À égalité de nature, le plus ambitieux (plus fort gain de 1RM estimé).
 * Se décide avant la première série et seulement là : une séance déjà entamée (autre appareil,
 * stockage effacé) n'a pas de boss plutôt qu'un boss qui changerait en cours de route.
 */
export function pickBoss(
  session: WorkoutSession,
  catalog: readonly Exercise[],
  history: readonly WorkoutSession[],
  suggestionFor: (loggedExerciseId: string) => SetSuggestion,
  checkins: readonly RecoveryCheckin[],
  now: Date
): SessionBoss | null {
  if (tiredToday(checkins, now)) return null;
  if (session.exercises.some((logged) => logged.sets.some((set) => set.completed))) return null;
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const pastSets = (exerciseId: string) =>
    history
      .filter((past) => past.id !== session.id && !past.isActive)
      .flatMap((past) => past.exercises)
      .filter((logged) => logged.exerciseId === exerciseId)
      .flatMap((logged) => logged.sets);

  let best: { boss: SessionBoss; rank: number; gain: number } | null = null;
  for (const logged of [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const exercise = byId.get(logged.exerciseId);
    if (!exercise) continue;
    const suggestion = suggestionFor(logged.id);
    if (!suggestion.readyForPR && !suggestion.readyForLevelUp) continue;
    const records = buildRecords(exercise, pastSets(exercise.id));
    const proposed = suggestion.weight > 0 ? estimated1RM(suggestion.weight, suggestion.reps) : suggestion.reps;
    const previous = suggestion.weight > 0 ? records.bestE1RM : records.bestBodyweightReps;
    const gain = previous > 0 ? proposed / previous - 1 : 0;
    const rank = suggestion.readyForLevelUp ? 2 : 1;
    const boss: SessionBoss = {
      loggedExerciseId: logged.id,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      weight: suggestion.weight,
      reps: suggestion.reps,
      levelName: suggestion.readyForLevelUp ? suggestion.nextLevelName ?? null : null,
    };
    if (!best || rank > best.rank || (rank === best.rank && gain > best.gain + 1e-9)) best = { boss, rank, gain };
  }
  return best?.boss ?? null;
}

export interface BossAnnouncement {
  sessionId: string;
  /** ISO */
  date: string;
}

/** Il reste un boss à annoncer cette semaine civile (hors la séance elle-même, déjà comptée). */
export function bossAvailable(announcements: readonly BossAnnouncement[], sessionId: string, now: Date): boolean {
  const { start, end } = currentWeekWindow(now);
  const thisWeek = announcements.filter((entry) => {
    const date = new Date(entry.date);
    return entry.sessionId !== sessionId && date >= start && date < end;
  });
  return thisWeek.length < SESSION_GAME.MAX_BOSSES_PER_WEEK;
}

/** Vaincu dès qu'une série de l'exercice du boss décroche une étoile de record ou le palier visé. */
export function bossDefeated(
  boss: SessionBoss,
  session: WorkoutSession,
  justHitRecord: Readonly<Record<string, unknown>>
): boolean {
  const logged = session.exercises.find((candidate) => candidate.id === boss.loggedExerciseId);
  return !!logged && logged.sets.some((set) => set.completed && justHitRecord[set.id] !== undefined);
}

// ---------------------------------------------------------------------------
// Fantôme : toi, il y a 4 semaines
// ---------------------------------------------------------------------------

export interface Ghost {
  date: Date;
  weight: number;
  reps: number;
  /** Valeur comparée : 1RM estimé (charge) ou reps (poids du corps pur). */
  value: number;
  byReps: boolean;
}

function bestOf(sets: readonly LoggedSet[], byReps: boolean): LoggedSet | null {
  return sets.reduce<LoggedSet | null>((top, set) => {
    const value = byReps ? set.reps : estimated1RM(set.weight, set.reps);
    const topValue = top ? (byReps ? top.reps : estimated1RM(top.weight, top.reps)) : -Infinity;
    return value > topValue ? set : top;
  }, null);
}

/**
 * La séance de cet exercice la plus proche d'il y a 4 semaines (entre 3 et 5). Même exercice
 * seulement : une machine d'une autre salle ne se compare pas. Pas de fantôme pour un exercice
 * assisté (l'assistance inverse le sens de la charge).
 */
export function ghostFor(exercise: Exercise, history: readonly WorkoutSession[], now: Date): Ghost | null {
  if (exercise.setPatternMode === SetPatternMode.assistedBodyweight) return null;
  const target = now.getTime() - SESSION_GAME.GHOST_TARGET_DAYS * DAY_MS;
  const min = now.getTime() - SESSION_GAME.GHOST_MAX_DAYS * DAY_MS;
  const max = now.getTime() - SESSION_GAME.GHOST_MIN_DAYS * DAY_MS;
  let chosen: { date: Date; sets: LoggedSet[] } | null = null;
  for (const session of history) {
    if (session.isActive || session.date.getTime() < min || session.date.getTime() > max) continue;
    const sets = session.exercises.filter((logged) => logged.exerciseId === exercise.id).flatMap((logged) => orderedSets(logged).filter(isRated));
    if (sets.length === 0) continue;
    if (!chosen || Math.abs(session.date.getTime() - target) < Math.abs(chosen.date.getTime() - target)) chosen = { date: session.date, sets };
  }
  if (!chosen) return null;
  const byReps = chosen.sets.every((set) => set.weight <= 0);
  const best = bestOf(chosen.sets, byReps);
  if (!best) return null;
  return { date: chosen.date, weight: best.weight, reps: best.reps, value: byReps ? best.reps : estimated1RM(best.weight, best.reps), byReps };
}

/** Écart en direct avec le fantôme (+0,04 = +4 %), dès la première série du jour ; `null` avant. */
export function ghostDelta(ghost: Ghost, todaySets: readonly LoggedSet[]): number | null {
  const rated = todaySets.filter(isRated).filter((set) => (ghost.byReps ? set.weight <= 0 : set.weight > 0));
  const best = bestOf(rated, ghost.byReps);
  if (!best || ghost.value <= 0) return null;
  const value = ghost.byReps ? best.reps : estimated1RM(best.weight, best.reps);
  return value / ghost.value - 1;
}
