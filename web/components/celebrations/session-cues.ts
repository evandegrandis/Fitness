/**
 * Ce que la séance doit fêter, série après série (Evan, 07/10/2026 : « je remarque rien quand je
 * suis pas loin de passer un palier ou quand je viens de le passer »).
 *
 * Fonctions pures : elles comparent l'état du rang et du jeu avant et après une série et rendent
 * les événements à jouer. Elles ne font que LIRE `rankScore`, `nextRankPlan` et `sessionGame` :
 * aucune règle de rang ni aucune suggestion n'est touchée ici.
 */

import { nextRankPlan, rankLetter, rankScore, SESSION_RANK, type NextRankPlan, type RankInput, type RankLetter } from "@/lib/engines/session-rank";
import type { CelebrationEvent } from "./store";

const ORDER: Record<RankLetter, number> = { C: 0, B: 1, A: 2, S: 3 };
const FLOOR: Record<RankLetter, number> = { C: 0, B: SESSION_RANK.THRESHOLDS.B, A: SESSION_RANK.THRESHOLDS.A, S: SESSION_RANK.THRESHOLDS.S };

/** Le rang suivant est « en vue » à deux séries (comptées pleines) ou à un record. */
export const NEAR_RANK_SETS = 2;

export interface RankApproach {
  score: number;
  letter: RankLetter;
  plan: NextRankPlan | null;
  /** Avancée entre le seuil du rang actuel et celui du suivant (au rang S : de 85 à 100), 0..1. */
  fraction: number;
  near: boolean;
}

export function rankApproach(input: RankInput): RankApproach {
  const score = rankScore(input);
  const letter = rankLetter(score);
  const plan = nextRankPlan(input);
  const from = FLOOR[letter];
  const to = plan ? FLOOR[plan.letter] : 100;
  const fraction = Math.min(1, Math.max(0, (score - from) / Math.max(1, to - from)));
  const near = plan !== null && ((plan.sets !== null && plan.sets <= NEAR_RANK_SETS) || plan.records === 1);
  return { score, letter, plan, fraction, near };
}

export interface CueState {
  /** Plus haut rang déjà fêté dans la séance : redescendre (série annulée) puis remonter ne refête pas. */
  best: RankLetter;
  /** Approches déjà annoncées (« A:2 », « A:1 », « A:r »). */
  announced: readonly string[];
  sets: number;
  records: number;
  beaten: number;
}

export interface GameCounts {
  beaten: number;
  combo: number;
}

export function initialCues(input: RankInput, game: GameCounts): CueState {
  return { best: rankLetter(rankScore(input)), announced: [], sets: input.sets, records: input.records, beaten: game.beaten };
}

/**
 * Événements entre deux états. Seule une série ou un record de plus déclenche quelque chose : un
 * changement venu d'ailleurs (historique rechargé, synchro) met l'état à jour sans rien jouer.
 */
export function sessionCues(state: CueState, input: RankInput, game: GameCounts): { events: CelebrationEvent[]; state: CueState } {
  const acted = input.sets > state.sets || input.records > state.records;
  const approach = rankApproach(input);
  const next: CueState = { ...state, sets: input.sets, records: input.records, beaten: game.beaten };
  if (!acted) return { events: [], state: next };

  const events: CelebrationEvent[] = [];
  if (ORDER[approach.letter] > ORDER[state.best] && approach.letter !== "C") {
    events.push({ kind: "rank-up", letter: approach.letter });
    next.best = approach.letter;
  }
  if (game.beaten > state.beaten) events.push({ kind: "beaten", combo: game.combo });
  const plan = approach.plan;
  if (plan && approach.near && plan.letter !== "C" && ORDER[plan.letter] > ORDER[next.best]) {
    const key = `${plan.letter}:${plan.sets !== null && plan.sets <= NEAR_RANK_SETS ? plan.sets : "r"}`;
    if (!state.announced.includes(key)) {
      next.announced = [...state.announced, key];
      events.push({ kind: "near-rank", letter: plan.letter, sets: plan.sets, records: plan.records, fraction: approach.fraction });
    }
  }
  return { events, state: next };
}
