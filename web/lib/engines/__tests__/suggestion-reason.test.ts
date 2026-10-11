import { describe, expect, it } from "vitest";
import { reprojectSuggestionAtWeight, type SetSuggestion } from "@/lib/engines/progression";
import { suggestionReason } from "@/lib/engines/suggestion-reason";
import { MuscleGroup } from "@/lib/models/muscles";
import { SetType } from "@/lib/models/enums";
import type { Exercise } from "@/lib/models/types";

/** La suggestion affichée à Evan le 11/10/2026 après 150 kg × 6 à RIR 1 (rejeu du store, horloge figée). */
const AFTER_HEAVY_SET: SetSuggestion = {
  weight: 120,
  reps: 11,
  setType: SetType.work,
  explanation: "Hypertrophie · 120 kg × 11",
  confidence: 0.85,
  reasonCodes: ["top_set_done_first"],
  mode: "fallback_hypertrophy",
  sessionFatigueWarning: null,
};

const WIDE_CHEST_PRESS: Exercise = {
  id: "wcp", name: "Wide Chest Press Technogym", category: "push", setPatternMode: "straight", repTargetMin: 8,
  repTargetMax: 12, smallestIncrement: 2.5, isFavorite: false, createdByUser: false, sortOrder: 0,
  suggestedRestSeconds: 120, machineSetting: "", setupNotes: "", benchmarkLow: null, benchmarkHigh: null,
  fatigueClass: "medium", progressionPolicy: null, voluntaryRepCap: 0,
  muscleMappings: [{ muscleGroup: MuscleGroup.pectStern, coefficient: 1 }], lastUsed: null, movementPattern: null,
  resistanceProfile: null, strengthStandardKey: null, benchmarkUnit: null,
};

describe("la ligne de suggestion dit pourquoi", () => {
  it("après une série lourde : série de retour, plus « Hypertrophie »", () => {
    expect(suggestionReason(AFTER_HEAVY_SET)).toBe("Série de retour à ta charge de travail, après ta série lourde");
  });

  it("une reprise après pause s'ajoute à la raison", () => {
    expect(suggestionReason({ ...AFTER_HEAVY_SET, reasonCodes: ["backoff_v2", "deload_after_gap"] })).toBe(
      "Série allégée après ta série la plus lourde (reprise après une pause)"
    );
  });

  it("code inconnu ou machine équivalente : l'explication du moteur reste", () => {
    expect(suggestionReason({ ...AFTER_HEAVY_SET, reasonCodes: ["inconnu"] })).toBeNull();
    expect(suggestionReason({ ...AFTER_HEAVY_SET, reasonCodes: ["generic_first_anchor", "equivalent_conversion"] })).toBeNull();
  });

  it("130 × 10 dans les champs n'était pas une autre proposition : c'est 120 × 11 projeté à 130 kg, même effort", () => {
    // 9 kg par rep autour de 120 kg (7,5 %) : 11 - 10/9 = 9,9, arrondi à 10.
    expect(reprojectSuggestionAtWeight(AFTER_HEAVY_SET, WIDE_CHEST_PRESS, 130).reps).toBe(10);
  });
});
