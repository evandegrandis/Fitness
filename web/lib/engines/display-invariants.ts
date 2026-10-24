/**
 * Invariants d'affichage : ce que l'écran dit ne se contredit jamais. Une seule définition pour le test de propriété
 * (`__tests__/target-invariants.test.ts`, séances tirées au hasard jouées dans le store) et le rejeu de tout
 * l'historique réel (`scripts/suggestions-audit/coherence.ts`).
 *
 * - D1 (24/10/2026, séance du 22/10) : le rang en direct (en-tête) est celui du bilan pour les mêmes séries.
 * - D2 : à une autre charge que la proposée, la cible dite (« Cible à 90 kg : 10 reps ») est celle de la règle du
 *   moteur à cette charge (`targetAtLoad`), jamais au-dessus de ce qu'une série au RIR 0-1 vient de montrer (I9).
 *   Jusqu'au 24/10 au soir, D2 portait sur « À 90 kg, cette cible vaut 10 reps », ligne retirée.
 * - D3 : la cible enregistrée avec la série est celle que l'écran a dite (charge et reps) : faire ses reps à cette
 *   charge est « tenue », une de plus « battue », une de moins « en dessous ». Jusqu'au 24/10 au soir, D3 vérifiait que
 *   « d'habitude » citait des séries réelles ; l'habitude n'est plus dite en séance (D4).
 * - D4 : aucun texte de la carte de saisie ne dit une prévision, une habitude ou une capacité (« prévoit », « prévu »,
 *   « d'habitude », « tu fais », « vaut », « capacité »…), et le seul nombre de reps qu'il cite est celui de la cible.
 */
import type { RankInput, SessionRank } from "@/lib/engines/session-rank";
import { rankLetter, rankScore } from "@/lib/engines/session-rank";
import { targetAtLoad, TARGET, type TodaySet } from "@/lib/engines/target";
import type { TargetPanel } from "@/lib/engines/target-display";
import { capacityLoad, maxRepsAfterLastSet } from "@/lib/engines/target-invariants";
import { versusReference } from "@/lib/engines/versus";
import type { Exercise } from "@/lib/models/types";

export type DisplayInvariant = "D1" | "D2" | "D3" | "D4";

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

/**
 * D2 : la cible dite à la charge des champs. `suggestion` : la proposition du moteur ; `panel` : ce que la carte affiche.
 */
export function atLoadViolations(
  exercise: Exercise,
  suggestion: Parameters<typeof targetAtLoad>[0],
  panel: Pick<TargetPanel, "target" | "weightChanged">,
  today: readonly TodaySet[],
  bodyweightKg: number | undefined
): DisplayViolation[] {
  if (!panel.weightChanged) return [];
  const out: DisplayViolation[] = [];
  const expected = targetAtLoad(suggestion, exercise, panel.target.weight, today, exercise.smallestIncrement, bodyweightKg);
  const shown = `${suggestion.weight} × ${suggestion.reps} → cible à ${panel.target.weight} kg : ${panel.target.reps}`;
  if (expected.reps !== panel.target.reps) out.push({ code: "D2", detail: `${shown}, la règle en donne ${expected.reps}` });
  if (!(panel.target.reps >= 1)) out.push({ code: "D2", detail: `${shown}, cible vide` });
  const last = [...today].reverse().find((set) => !set.continuation) ?? null;
  if (last) {
    const proven = maxRepsAfterLastSet(
      last,
      capacityLoad(exercise.setPatternMode, last.weight, bodyweightKg),
      capacityLoad(exercise.setPatternMode, panel.target.weight, bodyweightKg),
      exercise.smallestIncrement
    );
    if (Number.isFinite(proven) && panel.target.reps > Math.max(1, proven - TARGET.SAME_LOAD_AFTER_FAILURE_GAP)) {
      out.push({ code: "D2", detail: `${shown}, au-dessus de ${last.weight} × ${last.reps} au RIR ${last.rir}` });
    }
  }
  return out;
}

/** D3 : la cible enregistrée (`recorded`, ce que `SetEntry` passe à `logSet`) est celle que la carte a dite. */
export function recordedTargetViolations(
  exercise: Exercise,
  panel: Pick<TargetPanel, "target">,
  recorded: { suggestedWeight: number | null | undefined; suggestedReps: number | null | undefined }
): DisplayViolation[] {
  const { weight, reps } = panel.target;
  if (recorded.suggestedWeight !== weight || recorded.suggestedReps !== reps) {
    return [{ code: "D3", detail: `affichée ${weight} × ${reps}, enregistrée ${recorded.suggestedWeight} × ${recorded.suggestedReps}` }];
  }
  const verdicts = [reps - 1, reps, reps + 1].map((value) => (value >= 1 ? versusReference(exercise, { weight, reps: value }, panel.target) : "below"));
  if (verdicts.join() !== "below,met,beat") return [{ code: "D3", detail: `${weight} × ${reps - 1} / ${reps} / ${reps + 1} jugées ${verdicts.join(", ")}` }];
  return [];
}

/** Ce que la carte ne dit jamais en séance : une prévision, une habitude, une capacité, ce que « vaut » une cible. */
export const FORBIDDEN_SESSION_WORDS = /prévoi|prévu|prévision|d'habitude|habituellement|tu fais|vaut|valent|capacit|attendu|moteur|au mieux/i;

/** D4 : les textes de la carte de saisie (`targetPanel`) ne disent que la cible. */
export function sessionTextViolations(panel: Pick<TargetPanel, "target" | "headline" | "reason">): DisplayViolation[] {
  const out: DisplayViolation[] = [];
  for (const text of [panel.headline, panel.reason ?? ""]) {
    const word = FORBIDDEN_SESSION_WORDS.exec(text);
    if (word) out.push({ code: "D4", detail: `« ${text} » dit « ${word[0]} »` });
    // « × 1,13 » (facteur d'une machine équivalente) n'est pas un nombre de reps.
    for (const match of text.matchAll(/(\d+) reps?\b|× (\d+)(?![,.\d])/g)) {
      const reps = Number(match[1] ?? match[2]);
      if (reps !== panel.target.reps) out.push({ code: "D4", detail: `« ${text} » cite ${reps} reps, la cible en demande ${panel.target.reps}` });
    }
  }
  return out;
}
