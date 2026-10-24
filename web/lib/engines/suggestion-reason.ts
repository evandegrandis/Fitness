/**
 * Pourquoi le moteur propose cette série, en mots d'Evan (11/10/2026 : « Hypertrophie · 120 kg × 11 »
 * ne lui disait pas pourquoi 120 kg après sa série à 150 kg). Lecture seule des `reasonCodes` posés
 * par `progression.ts` : rien ici ne change une suggestion.
 *
 * Jamais de prévision, d'habitude ni de capacité (24/10/2026, Evan : savoir que le moteur le croit capable de moins que
 * la cible le pousse à viser ce moins) : ni « tu fais d'habitude N reps ici » (cible à battre), ni « tu perds d'habitude
 * N reps d'une série à l'autre » (perte apprise). Les raisons disent ce que fait la cible, pas ce qu'il ferait.
 */

import type { SetSuggestion } from "@/lib/engines/progression";

/** Code du moteur → raison affichée. Le premier code connu de la suggestion l'emporte. */
const REASONS: Record<string, string> = {
  top_set_done_first: "Série de retour à ta charge de travail, après ta série lourde",
  post_overreach_return_to_anchor: "Série de retour à ta charge de travail, après ta série lourde",
  backoff_v2: "Série allégée après ta série la plus lourde",
  top_set_to_backoff_transition: "Série allégée après ta série la plus lourde",
  backoff_same_load_prediction: "Série allégée après ta série la plus lourde",
  backoff_max_sets_reached: "Dernière série, plus légère",
  fallback_down_one_step: "Un cran plus léger : à la même charge, la fatigue t'aurait sorti de ta fourchette",
  fallback: "Un cran plus léger pour rester dans ta fourchette de reps",
  intermediate_fallback: "Un cran plus léger pour rester dans ta fourchette de reps",
  ramp_fallback: "Un cran plus léger pour rester dans ta fourchette de reps",
  top_set_fallback: "Un cran plus léger pour rester dans ta fourchette de reps",
  undershot_target_drop_load_next_set: "Plus léger : la série d'avant est passée sous ta fourchette",
  first_set_far_undershoot_drop_now: "Plus léger : la série d'avant est passée sous ta fourchette",
  backoff_under_target_drop_load: "Plus léger : la série d'avant est passée sous ta fourchette",
  first_weighted_set_under_target: "Plus léger : la série d'avant est passée sous ta fourchette",
  predicted_drop_same_load: "Même charge, la fatigue de la série d'avant retire des reps",
  bw_predicted_drop: "Même charge, la fatigue de la série d'avant retire des reps",
  bw_only_wbw_predicted_drop: "Même charge, la fatigue de la série d'avant retire des reps",
  bw_rep_v2_predicted: "Même charge, la fatigue de la série d'avant retire des reps",
  promotion_gate_passed: "Montée en charge : tes dernières séances l'ont gagnée",
  overshot_target_raise_load_next_set: "Plus lourd : la série d'avant a dépassé ta fourchette",
  first_set_far_overshoot_raise_now: "Plus lourd : la série d'avant a dépassé ta fourchette",
  backoff_overshot_raise_load: "Plus lourd : la série d'avant a dépassé ta fourchette",
  ramp_up_after_easy_set: "Plus lourd : la série d'avant a été facile",
  ramp_up_after_solid_set: "Plus lourd : la série d'avant a été solide",
  first_set_session_fatigue: "Allégé : la séance a déjà fatigué ce muscle",
  session_fatigue_load_reduction: "Allégé : la séance a déjà fatigué ce muscle",
  plateau_policy_test_heavier: "Plus lourd, pour casser le plateau",
  plateau_break_overreach_jump: "Plus lourd, pour casser le plateau",
  overreach_jump_policy: "Plus lourd, pour casser le plateau",
  bw_plateau_rep_target_v2: "Une rep de plus, pour casser le plateau",
  bw_plateau_rep_target: "Une rep de plus, pour casser le plateau",
  logical_set_completion: "Complète la série d'avant, trop courte pour compter seule",
  top_set_anchor_v2: "Première série, d'après tes dernières séances",
  top_set_anchor: "Première série, d'après tes dernières séances",
  straight_ref_v2: "Première série, d'après tes dernières séances",
  generic_first_anchor: "Première série, d'après tes dernières séances",
  main_target_attempt: "Première série, d'après tes dernières séances",
  bw_rep_v2_first_set: "Première série, d'après tes dernières séances",
  bw_only_wbw_first_set: "Première série, d'après tes dernières séances",
  ramp_opener: "Première série, d'après tes dernières séances",
  top_set_v2: "Série lourde, d'après ta première série du jour",
};

/** Codes qui viennent s'ajouter à la raison principale. */
const ADDENDA: Record<string, string> = {
  deload_after_gap: "reprise après une pause",
};

/**
 * La raison lisible d'une suggestion, ou `null` quand aucun code n'est connu (l'appelant garde
 * alors l'explication du moteur). Étalonnage et machine équivalente gardent la phrase du moteur,
 * qui nomme la machine de départ.
 */
export function suggestionReason(
  suggestion: Pick<SetSuggestion, "reasonCodes" | "explanation">
): string | null {
  const codes = suggestion.reasonCodes;
  if (codes.includes("equivalent_starting_point") || codes.includes("equivalent_conversion")) return null;
  const addenda = codes.map((code) => ADDENDA[code]).filter(Boolean);
  // Cible à battre (`target.ts`) : la raison l'assume, sans rien dire de ce qu'il ferait. Jusqu'au 24/10/2026 elle
  // ajoutait « À 72 kg, tu fais d'habitude 7 reps (au mieux 9) » : un chiffre sous la cible, à côté d'elle.
  if (codes.includes("target_to_beat")) {
    const base = codes.includes("target_after_attempt")
      ? "Cible à battre après ton essai lourd : retour à ta charge de travail"
      : codes.includes("target_lifted")
        ? "Cible à battre : le bas de ta fourchette"
        : "Cible à battre";
    return addenda.length > 0 ? `${base} (${addenda.join(", ")})` : base;
  }
  const main = codes.map((code) => REASONS[code]).find(Boolean);
  if (!main) return null;
  return addenda.length > 0 ? `${main} (${addenda.join(", ")})` : main;
}
