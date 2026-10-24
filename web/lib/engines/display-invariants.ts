/**
 * Invariants d'affichage (24/10/2026, séance du 22/10) : ce que l'écran dit ne se contredit jamais. Une seule
 * définition pour le test de propriété (`__tests__/target-invariants.test.ts`, séances tirées au hasard jouées dans
 * le store) et le rejeu de tout l'historique réel (`scripts/suggestions-audit/coherence.ts`).
 *
 * - D1 : le rang en direct (en-tête) est celui du bilan pour les mêmes séries (lettre, score, séries, records).
 * - D2 : la ligne « À X kg, cette cible vaut N reps » suit la cible par la règle de 7,5 % et la règle « battre » :
 *   faire N reps à X kg n'est jamais « en dessous » ; plus léger, N − 1 le serait ; plus lourd, N est la cible ramenée
 *   à X kg (7,5 % de sa charge = 1 rep), au moins le bas de la fourchette.
 * - D3 : « d'habitude » ne cite que des séries réelles à la charge de la cible, et seulement s'il y en a.
 */
import type { RankInput, SessionRank } from "@/lib/engines/session-rank";
import { rankLetter, rankScore } from "@/lib/engines/session-rank";
import { LOAD_HABIT, targetRepsAtLoad, type LoadHabit } from "@/lib/engines/target-display";
import { effectiveEffort, repsAtLoad, versusReference } from "@/lib/engines/versus";
import { SetType } from "@/lib/models/enums";
import { orderedSets, type Exercise, type WorkoutSession } from "@/lib/models/types";

export type DisplayInvariant = "D1" | "D2" | "D3";

export interface DisplayViolation {
  code: DisplayInvariant;
  detail: string;
}

/** D1 : le direct (`sessionRankInput` sur la séance en cours) contre le bilan (rang du parcours, mêmes séries). */
export function rankViolations(live: RankInput, bilan: Pick<SessionRank, "letter" | "score" | "sets" | "records"> | null): DisplayViolation[] {
  const liveScore = rankScore(live);
  const liveLetter = rankLetter(liveScore);
  const liveSets = Math.round(live.sets * 10) / 10;
  if (bilan === null) return live.sets > 0 ? [{ code: "D1", detail: `rang ${liveLetter} en direct, aucun au bilan` }] : [];
  if (bilan.letter !== liveLetter || bilan.score !== liveScore || bilan.records !== live.records || Math.abs(bilan.sets - liveSets) > 1e-9) {
    return [
      {
        code: "D1",
        detail: `direct ${liveLetter} ${liveScore} (${liveSets} séries, ${live.records} records) ≠ bilan ${bilan.letter} ${bilan.score} (${bilan.sets} séries, ${bilan.records} records)`,
      },
    ];
  }
  return [];
}

/** D2 : la ligne « À X kg » pour une cible et une charge choisie différente (`displayed` : les reps qu'elle affiche). */
export function atLoadViolations(
  exercise: Exercise,
  target: { weight: number; reps: number },
  load: number,
  displayed: number = targetRepsAtLoad(exercise, target, load)
): DisplayViolation[] {
  const gap = effectiveEffort(exercise, load) - effectiveEffort(exercise, target.weight);
  if (Math.abs(gap) < 0.01 || target.reps <= 0) return [];
  const reps = displayed;
  const shown = `${target.weight} × ${target.reps} → ${load} kg : ${reps} reps`;
  const out: DisplayViolation[] = [];
  if (versusReference(exercise, { weight: load, reps }, target) === "below") out.push({ code: "D2", detail: `${shown}, et les faire serait « en dessous »` });
  if (gap > 0) {
    const equivalent = Math.max(exercise.repTargetMin, Math.floor(repsAtLoad(exercise, target, load) + 0.5));
    if (reps !== equivalent) out.push({ code: "D2", detail: `${shown}, la règle de 7,5 % en donne ${equivalent}` });
    if (reps > Math.max(target.reps, exercise.repTargetMin)) out.push({ code: "D2", detail: `${shown}, plus lourd mais plus de reps que la cible` });
  } else {
    if (reps > 1 && versusReference(exercise, { weight: load, reps: reps - 1 }, target) !== "below") {
      out.push({ code: "D2", detail: `${shown}, ${reps - 1} reps la tiendraient déjà` });
    }
    if (reps < target.reps) out.push({ code: "D2", detail: `${shown}, plus léger mais moins de reps que la cible` });
  }
  return out;
}

/**
 * D3 : chaque nombre de « d'habitude » est les reps d'une série réelle à cette charge (séances terminées, séries de
 * travail, fenêtre de `LOAD_HABIT`), recomptées ici directement sur les séances ; et rien n'est dit sans série.
 */
export function habitViolations(
  exercise: Exercise,
  history: readonly WorkoutSession[],
  habit: LoadHabit,
  text: string,
  now: Date
): DisplayViolation[] {
  const since = now.getTime() - LOAD_HABIT.WINDOW_DAYS * 86_400_000;
  const real = history
    .filter((session) => !session.isActive && session.date.getTime() >= since)
    .flatMap((session) => session.exercises.filter((logged) => logged.exerciseId === exercise.id).flatMap((logged) => orderedSets(logged)))
    .filter(
      (set) =>
        set.completed &&
        (set.setType === SetType.work || set.setType === SetType.topSet || set.setType === SetType.backoff) &&
        Math.abs(set.weight - habit.load) < 0.01
    )
    .map((set) => set.reps);
  const out: DisplayViolation[] = [];
  const pool = [...real];
  for (const reps of habit.reps) {
    const index = pool.indexOf(reps);
    if (index < 0) out.push({ code: "D3", detail: `${reps} reps à ${habit.load} kg cité, aucune série réelle ne le porte` });
    else pool.splice(index, 1);
  }
  const sorted = [...habit.reps].sort((a, b) => a - b);
  const typical = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
  if (habit.typical !== typical || habit.best !== (sorted.at(-1) ?? null)) out.push({ code: "D3", detail: `habitude ${habit.typical}/${habit.best} ≠ séries ${sorted.join(", ")}` });
  // Seule la phrase qui suit « Cible à battre. » parle de ses séries à cette charge. (La perte apprise d'une série à
  // l'autre, dite hors cible, ne se dit qu'avec assez de paires réelles de l'exercice : `rep-drop.ts`.)
  const habitPart = text.startsWith("Cible à battre") ? text : "";
  if (habit.reps.length === 0 && /d'habitude|tu as fait/.test(habitPart)) out.push({ code: "D3", detail: `« ${text} » sans série à ${habit.load} kg` });
  const quotedNumbers = [...habitPart.matchAll(/(\d+) reps?\b|au mieux (\d+)|d'habitude (\d+)(?: à (\d+))?/g)].flatMap((match) =>
    match.slice(1).filter((value): value is string => value !== undefined).map(Number)
  );
  for (const quoted of quotedNumbers) {
    if (!habit.reps.includes(quoted)) out.push({ code: "D3", detail: `« ${text} » cite ${quoted}, absent de ses séries à ${habit.load} kg` });
  }
  return out;
}
