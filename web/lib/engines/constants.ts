/**
 * Constantes partagées des moteurs de suggestion.
 *
 * `HISTORY_WINDOW` — nombre de séances passées (les plus récentes en
 * premier) que le store fournit à `suggest()` via `recentHistory`. Avant
 * WS1, le store ne passait que 3 séances (`lib/store/workout.ts:937`) alors
 * que `deriveState` (dans `progression.ts`) est écrit pour en consommer
 * jusqu'à 10 :
 *   - décision (targetLoad, plateauCounter, promotionGate) : 5 premières
 *     séances de `recentHistory` (`history.slice(0, 5)` dans `deriveState`)
 *   - vélocité (`progressVelocityScore`) : jusqu'à 10 séances
 *     (`history.slice(0, 10)` dans `deriveState`)
 * Avec seulement 3 séances fournies par le store, la vélocité et même la
 * fenêtre de décision (5) étaient tronquées à 3 dans les faits — bug
 * silencieux. `HISTORY_WINDOW` aligne l'appelant (store) sur le maximum
 * réellement consommé par le moteur (10), pour que les 5 et les 10 aient
 * vraiment de la matière.
 */
export const HISTORY_WINDOW = 10;

/** Fenêtre pour les records (PRs) : volontairement plus large, voir `lib/store/workout.ts::records()`. */
export const RECORDS_HISTORY_WINDOW = 20;

/**
 * Constantes de l'algorithme de progression v2 — voir `web/ALGO_SPEC_HARDENED.md` §0.
 * Chaque valeur est justifiée et référencée dans la spec ; ne pas modifier sans
 * mettre à jour la spec ET régénérer le golden test.
 */
export const ALGO_V2 = {
  /** Décroissance par séance des poids de récence (§4.1) : α^k, k=0 = séance la plus récente. */
  RECENCY_ALPHA: 0.6,
  /** 1 rep perdue par +7.5% de charge effective (§5.2). */
  REP_SLOPE_PCT: 0.075,
  /** Clamp bas de la correction forme-du-jour (§5.3.1). */
  FORM_DELTA_MIN: -3,
  /** Clamp haut de la correction forme-du-jour (§5.3.1). */
  FORM_DELTA_MAX: 1,
  /** Deux charges d'amorce appartiennent au même cluster si écart relatif <= 12% (§3). */
  CLUSTER_TOL_PCT: 0.12,
  /** ... ou si écart <= 2 incréments (le max des deux tolérances gagne, §3). */
  CLUSTER_TOL_INCR: 2,
  /** Part de séances "set max != set 1" pour classer TOP_SET_BACKOFF (§2.5). */
  TOPSET_SHARE: 0.5,
  /** Part de sets à poids 0 pour classer BW_REP (§2.4). */
  BW_SET_SHARE: 0.6,
  /** Nb de séances mixtes (BW + lesté) pour classer WEIGHTED_BW_VARIABLE (§2.3). */
  WBW_MIXED_SESSIONS: 2,
  /** Médiane de sets <= 2 pour classer ISOLATION_FINISHER (§2.6). */
  FINISHER_MAX_SETS: 2,
  /** Position médiane relative >= 0.6 pour classer ISOLATION_FINISHER (§2.6). */
  FINISHER_POS_RATIO: 0.6,
  /** En dessous de ce nombre de séances, on suit `setPatternMode` figé (§2, étape 2). */
  MIN_SESSIONS_FOR_PATTERN: 3,
  /** Cap absolu de reps suggérées sur un set de travail (§0 invariant 6, §5.4). */
  WORK_REP_CAP: 10,
  /** "> 8 reps" => viser le poids suivant ; seuil effectif = min(9, repTargetMax) (§4.4, §8). */
  PROMOTION_REPS: 9,
  /** reps < repMin - 2 => démotion d'un incrément (§4.2, §8). */
  DEMOTION_MARGIN: 2,
  /** >= 3 séances identiques => plateau (§8). */
  PLATEAU_THRESHOLD: 3,
  /** Deload -10% après surcharge échouée (§8, anti-plateau échoué). */
  ANTIPLATEAU_FACTOR: 0.9,
  /** ... pendant 2 séances (§8). */
  ANTIPLATEAU_SESSIONS: 2,
  /** < 4 reps sur variante dure => proposer la variante facile (§7.4, §9). */
  VARIANT_SWITCH_FLOOR: 4,
  /** Fallback si bodyweightKg non fourni par l'appelant (§5.1). */
  DEFAULT_BODYWEIGHT_KG: 75,
  /** 1 rep de pénalité par 6 pts de coût systémique EXCÉDENTAIRE (§6.1). */
  FATIGUE_EXCESS_DIVISOR: 6,
  /** Pénalité de reps max liée à la fatigue intra-séance (§6.1). */
  MAX_FATIGUE_REP_PENALTY: 3,
  /** Coût systémique max pour proposer du lest (Tractions SN, §7.5). */
  FRESH_SYSTEMIC_MAX: 6,
  /** Pas de descente du lest : max(increment, 2.5) (§4.5). */
  LEST_DESCENT_STEP_KG: 2.5,
  /** Nb max de descentes de lest en une dérivation (§4.5). */
  LEST_DESCENT_MAX_STEPS: 2,
  /** Au-delà : backoff -1 incrément, confiance 0.5 (§7.1). */
  MAX_WORK_SETS_SUGGESTED: 4,
  /**
   * Trigger de plateau date-based (VARIATION_CYCLING_SPEC §2) : `isPlateau` si
   * `plateauStalledDays >= PLATEAU_STALL_DAYS` ET `sessionsInWindow >= PLATEAU_MIN_SESSIONS`.
   * Remplace `plateauCounter >= PLATEAU_THRESHOLD` comme trigger officiel (voir §2 blast radius).
   */
  PLATEAU_STALL_DAYS: 14,
  /** Nb minimum de séances du rôle dominant dans la fenêtre de 14 j pour qu'un plateau soit valide (anti faux-positif d'absence, §2/§9). */
  PLATEAU_MIN_SESSIONS: 2,
  /** `slowing` : stagnation >= 7 j (et non encore `isPlateau`) déclenche l'indice préemptif discret (§3). */
  SLOWING_STALL_DAYS: 7,
  /** `slowing` : vélocité <= ce seuil (progressVelocityScore, §3) ; "reps↑ à poids constant" (>= 1.0) reste toujours `progressing`. */
  SLOWING_VELOCITY: 0.25,
  /** Anti-thrash (§8, Phase 2) : après une rotation de variation acceptée, geler toute nouvelle proposition pour cet exo pendant N jours. */
  ROTATION_COOLDOWN_DAYS: 14,
  /**
   * `lib/engines/lifecycle.ts` (§7, P2.2) — deux séances d'un même exercice appartiennent au même
   * "run" (cycle continu) si l'écart entre elles est <= N jours ; au-delà, on considère que le run
   * précédent est terminé (rotation vers une autre variante OU simple abandon — `computeLifeCycle`
   * ne distingue pas les deux, purement local à un `exerciseId`) et qu'un nouveau run démarre.
   * Valeur choisie : assez large pour tolérer une semaine de deload/voyage SANS casser un run actif
   * (le trigger de plateau §2 est déjà à 14j ; un run de vie complet dure des semaines selon la
   * méthode, §7 "roster 12-18 variantes, tracking durée/force") — 21j (3 semaines) évite de fausser
   * `ended`/`weeks` sur une pause normale tout en restant strictement < aux cycles typiques observés
   * (spec §6, exemple "cycle précédent 8 sem.").
   */
  LIFECYCLE_RUN_GAP_DAYS: 21,
} as const;
