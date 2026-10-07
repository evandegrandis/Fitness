import { describe, expect, it } from "vitest";

import { initialCues, rankApproach, sessionCues } from "@/components/celebrations/session-cues";
import type { RankInput } from "@/lib/engines/session-rank";

const base: RankInput = { sets: 10, records: 1, cut: false, recordsPossible: true };

/** Rejoue une séance série par série et collecte les événements. */
function play(steps: Array<Partial<RankInput> & { beaten?: number; combo?: number }>) {
  let state = initialCues(base, { beaten: 0, combo: 0 });
  const all: string[][] = [];
  for (const step of steps) {
    const { beaten = state.beaten, combo = 0, ...rank } = step;
    const result = sessionCues(state, { ...base, ...rank }, { beaten, combo });
    state = result.state;
    all.push(result.events.map((event) => (event.kind === "near-rank" ? `near-${event.letter}-${event.sets}` : event.kind === "rank-up" ? `up-${event.letter}` : event.kind === "beaten" ? `beaten-${event.combo}` : event.kind)));
  }
  return all;
}

describe("célébrations de séance", () => {
  it("annonce le rang suivant à deux puis une série, puis fête son passage, une seule fois", () => {
    // 10 séries + 1 record : 37 (C). B à 45.
    expect(rankApproach(base).letter).toBe("C");
    const events = play([{ sets: 11 }, { sets: 12 }, { sets: 13 }, { sets: 12 }, { sets: 13 }]);
    expect(events[0]).toEqual(["near-B-2"]);
    expect(events[1]).toEqual(["near-B-1"]);
    expect(events[2]).toEqual(["up-B"]);
    // Série annulée puis refaite : ni nouvelle annonce, ni nouveau passage.
    expect(events[3]).toEqual([]);
    expect(events[4]).toEqual([]);
  });

  it("une suggestion battue encourage, avec le combo en cours", () => {
    const events = play([{ sets: 11, beaten: 1, combo: 1 }, { sets: 11.75, beaten: 2, combo: 2 }]);
    expect(events[0]).toContain("beaten-1");
    expect(events[1]).toContain("beaten-2");
  });

  it("un changement sans série de plus (synchro, historique rechargé) ne joue rien", () => {
    const state = initialCues(base, { beaten: 0, combo: 0 });
    const reloaded = sessionCues(state, { ...base, recordsPossible: false }, { beaten: 3, combo: 3 });
    expect(reloaded.events).toEqual([]);
    expect(reloaded.state.beaten).toBe(3);
  });

  it("au rang S, plus rien à annoncer ; l'avancée mesure la marge au-dessus de 85", () => {
    const top = rankApproach({ sets: 22, records: 4, cut: false, recordsPossible: true });
    expect(top).toMatchObject({ letter: "S", plan: null, fraction: 1, near: false });
  });
});
