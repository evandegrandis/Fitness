# ALGO_SPEC_HARDENED — Spécification implémentable de l'algorithme de progression v2

> Version durcie de `ALGO_SPEC.md` : **chaque règle est chiffrée, chaque cas a une seule issue**.
> Un implémenteur doit pouvoir coder ceci sans prendre une seule décision.
> Toutes les formules ont été **validées sur l'historique réel** (33 séances, 2026-03-20 → 2026-07-14,
> `data/jeera_backup.json` + `data/recent_sessions.json`).
> Règle absolue : on **répare/étend** `lib/engines/progression.ts`, on ne remplace pas.
> L'API `suggest(params)` est conservée (§11).

---

## 0. Glossaire, invariants, constantes

### Rôles de sets (nouveaux, dérivés — jamais persistés)
| Rôle | Définition (méthode d'Evan) |
|---|---|
| `amorce` | Set 1 : charge lourde mais faisable ~10 reps, jauge la forme du jour |
| `top` | Set 2 : poids max pour 6–8 reps (vise 10) |
| `backoff` | Set 3+ : retour ≈ charge de l'amorce, ± 1 incrément |
| `straight` | Tous sets ≈ même charge (double progression classique) |
| `bw` | Set au poids du corps (progression par reps puis par sets) |
| `finisher` | Isolation 1–2 sets en fin de séance |

### Constantes (à ajouter dans `lib/engines/constants.ts`)
```ts
export const ALGO_V2 = {
  RECENCY_ALPHA: 0.6,             // décroissance par séance des poids de récence (§4)
  REP_SLOPE_PCT: 0.075,           // 1 rep perdue par +7.5% de charge effective (§5)
  FORM_DELTA_MIN: -3,             // clamp bas correction forme-du-jour
  FORM_DELTA_MAX: 1,              // clamp haut correction forme-du-jour
  CLUSTER_TOL_PCT: 0.12,          // deux charges d'amorce = même cluster si écart ≤ 12 %
  CLUSTER_TOL_INCR: 2,            // ... ou ≤ 2 incréments (le max des deux tolérances)
  TOPSET_SHARE: 0.5,              // part de séances "set max ≠ set 1" pour classer TOP_SET_BACKOFF
  BW_SET_SHARE: 0.6,              // part de sets à poids 0 pour classer BW_REP
  WBW_MIXED_SESSIONS: 2,          // nb de séances mixtes (BW + lesté) pour WEIGHTED_BW_VARIABLE
  FINISHER_MAX_SETS: 2,           // médiane de sets ≤ 2 pour ISOLATION_FINISHER
  FINISHER_POS_RATIO: 0.6,        // position médiane relative ≥ 0.6 pour ISOLATION_FINISHER
  MIN_SESSIONS_FOR_PATTERN: 3,    // en dessous : on suit setPatternMode figé
  WORK_REP_CAP: 10,               // cap absolu de reps suggérées sur un set de travail
  PROMOTION_REPS: 9,              // "> 8 reps" => viser le poids suivant (seuil effectif : min(9, repTargetMax))
  DEMOTION_MARGIN: 2,             // reps < repMin - 2 => démotion d'un incrément
  PLATEAU_THRESHOLD: 3,           // ≥ 3 séances identiques => plateau
  ANTIPLATEAU_FACTOR: 0.9,        // deload -10 % après surcharge échouée
  ANTIPLATEAU_SESSIONS: 2,        // ... pendant 2 séances
  VARIANT_SWITCH_FLOOR: 4,        // < 4 reps sur variante dure => proposer variante facile
  DEFAULT_BODYWEIGHT_KG: 75,      // fallback si bodyweightKg non fourni
  FATIGUE_EXCESS_DIVISOR: 6,      // 1 rep de pénalité par 6 pts de coût systémique EXCÉDENTAIRE
  MAX_FATIGUE_REP_PENALTY: 3,     // pénalité de reps max liée à la fatigue intra-séance
  FRESH_SYSTEMIC_MAX: 6,          // coût systémique max pour proposer du lest (Tractions SN)
  LEST_DESCENT_STEP_KG: 2.5,      // pas de descente du lest (max(increment, 2.5))
  LEST_DESCENT_MAX_STEPS: 2,      // nb max de descentes de lest en une dérivation
  MAX_WORK_SETS_SUGGESTED: 4,     // au-delà : backoff -1 incr, confiance 0.5
} as const;
```

### Invariants conservés (non-négociables)
1. Prédire depuis le set logué **AUJOURD'HUI**, jamais rejouer la dernière séance.
2. Moteur **pur** (aucun état persisté ; tout est recalculé depuis l'historique).
3. Charges arrondies au `smallestIncrement` (arrondi half-away-from-zero), jamais < 0.
4. `currentSetIndex` reste dans l'API et reste **ignoré** (le signal est `doneToday`).
5. FR partout dans `explanation`.
6. Cap de reps suggérées sur un set de travail : `min(repTargetMax, 10)` — **sauf** exceptions
   explicites (§7.4 BW_REP plateau, burnout finisher). C'est la règle "viser 10 max" d'Evan.
   (Corrige les suggestions actuelles à 11 reps : Lateral raises 12×11, Pec deck 75×11, etc.)

### Arrondis et médianes (une seule définition)
- `roundToIncrement(x, incr)` = `max(0, roundHalfAway(x / incr) * incr)` (existant dans `deload.ts`).
- `median(xs)` : médiane standard, moyenne des deux valeurs centrales si pair. Aucun arrondi
  intermédiaire ; l'arrondi n'arrive qu'au moment de rendre la suggestion.

---

## 1. Pré-traitement de l'historique (avant toute dérivation)

Entrée : `recentHistory: LoggedSet[][]` (fenêtre `HISTORY_WINDOW = 10`, plus récent en premier),
chaque élément = les sets complétés de CET exercice dans une séance passée, ordre chronologique intra-séance.

Appliquer dans cet ordre, session par session :

**P1 — Filtre complétion.** Ne garder que `completed === true`. (Existant.)

**P2 — Reclassification des warmups mal taggés.** Un set `setType === "warmup"` est **reclassé
en set de travail** pour la dérivation si `weight ≥ 0.9 × amorceLoad_provisoire` ET `reps ≥ repTargetMin`,
où `amorceLoad_provisoire` = médiane des charges du set-au-max-de-reps des 5 séances précédentes
(sans reclassification ; si indisponible, ne pas reclasser).
*Justification données : 2026-05-04 et 2026-05-06, Chest Press `100×10 (W)` est en réalité l'amorce ;
le tag warmup fausse sinon l'amorce et le pattern.*
Les warmups non reclassés restent exclus de toute dérivation (comportement actuel).

**P3 — Rôles historiques par séance.** Pour chaque séance (sets de travail, ordre chronologique) :
- `amorce(session)` = le **premier** set (ordre chronologique) dont les reps = max de la séance.
  *(Vérifié : Chest Press → 100×10 même quand le top set 120 est fait avant ; Leg extension
  03-25 `85×10 | 100×10 | 100×6` → amorce 85 (premier des ex æquo).)*
- `top(session)` = le set le plus lourd avec `weight ≥ amorce.weight + 1 incrément` ET `reps ≥ 3`.
  S'il n'existe pas → séance sans top set. *(Le `140×2` du 04-13 est exclu par `reps ≥ 3` :
  il ne pollue pas `topRef`, mais alimente `failedOverreachLoads`, §8.)*
- `backoffs(session)` = les sets postérieurs au top.
- Exercice `weightedBodyweight` : les sets à `weight === 0` sont des sets `bw` (l'actuel filtre
  primer est conservé mais ils alimentent le profil de reps BW, §5).

**P4 — Ancre de séance (compatibilité).** `classifyAnchor` existant est conservé tel quel pour la
vélocité et les records. Pour les nouvelles références (§4), l'ancre v2 = `amorce(session)` pour
TOP_SET_BACKOFF, = set le plus lourd non-échec (comportement actuel) pour STRAIGHT/autres.

**P5 — Doublons intra-séance.** Si un exercice apparaît deux fois dans la même séance
(ex. Tractions SN 2026-04-10 en position 1 et 9), concaténer chronologiquement ; seuls les
3 premiers sets de travail alimentent les rôles P3 (le rappel tardif compte pour le volume
et les records, pas pour la structure set1/2/3).

---

## 2. Détection du pattern par exercice

Fenêtre : les 10 dernières séances de l'exercice (post-P1..P5). Soit `S` = nb de séances, `sets` = tous
les sets de travail de la fenêtre.

**Ordre d'évaluation strict (la première condition vraie gagne) :**

1. **Verrou** : si `exercise.setPatternMode === "assisted_bodyweight"` → pattern = `ASSISTED_BW`
   (sémantique de charge inversée, jamais overridée ; traitement = code actuel inchangé).
2. Si `S < MIN_SESSIONS_FOR_PATTERN (3)` → pattern = mapping du `setPatternMode` figé :
   `straight→STRAIGHT`, `top_set_backoff→TOP_SET_BACKOFF`, `bodyweight→BW_REP`,
   `weighted_bodyweight→WEIGHTED_BW_VARIABLE`, `ramping→STRAIGHT` (le ramping actuel reste
   disponible via `setPatternMode`, voir §11).
3. **WEIGHTED_BW_VARIABLE** : nb de séances contenant À LA FOIS ≥ 1 set `weight === 0` et
   ≥ 1 set `weight > 0` est `≥ WBW_MIXED_SESSIONS (2)`.
   *(Tractions SN : 05-28 et 05-30 dans la fenêtre → ✓. Si le lest disparaît de la fenêtre 10,
   l'exercice glisse naturellement vers BW_REP — voulu.)*
4. **BW_REP** : part des sets à `weight === 0` ≥ `BW_SET_SHARE (60 %)`.
   *(HSPU 100 %, Ab roller debout 100 %, Ab roller genoux 87.5 %, Relevé de jambes, Dips → ✓.)*
5. **TOP_SET_BACKOFF** : parmi les séances à ≥ 2 sets de travail, part des séances où le set le
   plus lourd (a) n'est PAS le premier set chronologique ET (b) dépasse le premier set d'au moins
   1 incrément, est `≥ TOPSET_SHARE (50 %)`.
   *(Vérifié : Chest Press 19/24 = 79 % ✓ ; Leg extension 8/9 = 89 % ✓ ; Tirage vertical muscle up
   11/16 = 69 % ✓ ; Pec deck 7/14 = 50 % ✓ (inclusif) ; DC assisté ✓. Ces 5 exos sont taggés
   `straight` : la détection les corrige sans re-tagger.)*
6. **ISOLATION_FINISHER** : `median(nb de sets de travail par séance) ≤ FINISHER_MAX_SETS (2)`
   ET `median(orderIndex_exo / (nbExos_séance − 1)) ≥ FINISHER_POS_RATIO (0.6)`.
   Nécessite que l'appelant fournisse la position (nouveau champ optionnel
   `SuggestParams.historyPositions?: { position: number; sessionExerciseCount: number }[]`
   aligné sur `recentHistory` ; s'il est absent → sauter ce test).
   *(Curl debout : med 1–2 sets, ratio ~0.85 ✓ ; Lateral raises : ratio ~0.75 ✓.)*
7. **STRAIGHT** : défaut. *(Isolateral row, Crunch déclinés, Pulley serré, Shoulder press…)*

Le pattern détecté **prime toujours** sur `setPatternMode` dès que `S ≥ 3` (sauf verrou n°1).
Exposer `detectPattern(exercise, history, positions?)` (pur, exporté pour tests).

---

## 3. Clusters de charge (machines à marques multiples)

Problème réel : Isolateral row = 120 kg sur une marque, 80 kg sur une autre (07-06), 110 (07-14).
`machineSetting` est un simple label ; la désambiguïsation se fait **par les charges** :

1. Prendre les charges d'amorce (ancre v2) des séances de la fenêtre 10 (exercices non-BW seulement).
2. Clustering agglomératif trivial : deux charges `a ≤ b` appartiennent au même cluster si
   `b − a ≤ max(CLUSTER_TOL_INCR × increment, CLUSTER_TOL_PCT × b)`. Fusion transitive
   (single-linkage), en partant des charges triées.
   *(Isolateral : |110−120| = 10 ≤ max(5, 14.4) → même cluster ; |80−110| = 30 > max(5, 13.2)
   → cluster séparé ✓. Chest Press : 100/110/120(inversion) → un seul cluster ✓.)*
3. **Cluster actif** = celui de la séance la plus récente. TOUTES les références (§4) et profils
   de reps (§5) sont dérivés **uniquement des séances du cluster actif**.
4. **Re-ancrage en séance** : si le premier set logué aujourd'hui a une charge qui s'écarte de
   ≥ 20 % de `amorceTarget`, re-dériver immédiatement les références depuis le cluster contenant
   cette charge (s'il existe), sinon traiter comme cold-start relatif au set du jour (règles
   génériques actuelles à partir de `last`). Signaler `reasonCode: "machine_cluster_switch"`.

---

## 4. Références pondérées récence

Tout est calculé sur le **cluster actif**, fenêtre 10, plus récent en premier (indice k = 0).

### 4.1 Moyenne pondérée récence
```
w_k = RECENCY_ALPHA^k        (α = 0.6 : les 3 dernières séances pèsent ~85 % du total)
WM(loads) = Σ w_k · load_k / Σ w_k
```

### 4.2 `amorceRef` (TOP_SET_BACKOFF) et `straightRef` (STRAIGHT / FINISHER)
Soit `anchors` = ancres v2 valides du cluster (`reps ≥ repTargetMin − 1`), `last` = ancre de la
séance la plus récente du cluster (même si non valide).

```
base = last.weight
si promotionGate(§4.4) passé            → target = base + 1 incrément
sinon si last.reps < repMin − DEMOTION_MARGIN (échec net)
                                        → target = base − 1 incrément
sinon si last.reps < repMin (mauvais jour, pas un effondrement)
                                        → target = base            // "mauvais jour ≠ régression"
sinon si WM(anchors.weights) < base − 1.5 incréments (régression multi-séances)
                                        → target = base − 1 incrément
sinon                                   → target = base
GARDE-FOU vieux record : target ≤ base + 1 incrément (toujours).   // +1 incr / séance max
GARDE-FOU amorce (TOP_SET_BACKOFF seulement) : target ≤ topTarget − 1 incrément.
```
*Exemple chiffré Isolateral row (état 14-07) : cluster actif {120×5 séances, 110} ; last = 110×6,
repMin 8 → 6 ∈ [6, 8) → mauvais jour → `straightRef` = **110** (pas 120 ✓). S'il fait 110×9 la
prochaine fois, promotion → **112.5**. La cible ne re-visite 120 qu'à +2.5/séance validée.*

### 4.3 `topRef` (TOP_SET_BACKOFF)
Soit `tops` = les `top(session)` du cluster (fenêtre 10), `lastTop` = le plus récent.
```
si tops vide → topTarget = amorceTarget + 2 incréments (init) ; sinon :
si lastTop.reps ≥ min(PROMOTION_REPS, repTargetMax)   → topTarget = lastTop.weight + 1 incrément
sinon si lastTop.reps < repMin − DEMOTION_MARGIN      → topTarget = lastTop.weight − 1 incrément
sinon → topTarget = min( roundToIncrement(WM(tops.weights), incr), lastTop.weight + 1 incrément )
GARDE-FOU : topTarget < min(failedOverreachLoads) s'il en existe (§8), strictement.
```
*Exemple chiffré Chest Press (état 14-07) : tops récents [120×7, 130×4, 130×6, 130×6, 120×4] →
WM = (120 + 0.6·130 + 0.36·130 + 0.216·130 + 0.1296·120) / 2.3056 ≈ 125.1 → 125 ;
cap lastTop+1incr = 122.5 → **topTarget = 122.5**. Le vieux 130 est re-chassé à +2.5/séance réussie.*

### 4.4 Portillon de promotion (par rôle)
- **Top set / STRAIGHT** : réactif (méthode d'Evan "> 8 → poids suivant") — **1 seule occurrence**
  `reps ≥ min(9, repTargetMax)` sur la dernière séance suffit.
- **Amorce** : stable — `FatigueClass` H : 2 des 3 dernières séances avec amorce **à la même charge
  que `last`** et `reps ≥ repTargetMax` ; M/L : 1 des 2 dernières. (Réutilise la mécanique
  `checkPromotionGate`, mais sur les amorces v2 et à charge égale.)
  *(Chest Press 14-07 : amorces [110×10, 100×10, 110×10, …] ; à 110 : 07-06 ✓ et 06-05 ✓ = 2/3 →
  amorceTarget = 112.5, sous le garde-fou topTarget − 1 incr = 120 ✓.)*
- La **remontée rapide post-deload** (`checkPromotionGateWithRecovery`, WS4) est conservée telle
  quelle, appliquée au rôle concerné.
- **Aucune promotion** si `fatigueConfirmed` (inchangé) ni pendant un anti-plateau actif (§8).

### 4.5 `lestRef` (WEIGHTED_BW_VARIABLE)
Sets lestés du cluster, fenêtre 10. `lastLest` = set lesté le plus récent.
```
gapLest = jours depuis la dernière SÉANCE CONTENANT un set lesté (≠ gap de l'exercice)
base = applyDeload(lastLest.weight, gapLest, max(increment, 1.25)).load
tant que predictReps(base, role=top_lesté) < repMin − 1 et étapes < LEST_DESCENT_MAX_STEPS (2) :
    base -= max(increment, LEST_DESCENT_STEP_KG)      // descente franche, pas 1.25 par 1.25
lestTarget = max(0, base)
```
*Exemple chiffré Tractions SN (état 14-07) : lastLest = 20×4 (05-30), gapLest ≈ 45 j → percent15 :
20 × 0.85 = 17 → arrondi incr 1.25 → 17.5 ; predictReps(17.5) ≈ 4 < 5 → −2.5 → 15 ;
predictReps(15) ≈ 5 = repMin − 1 → stop → **lestTarget = 15** (cohérent avec ses 15×6–7 d'avril).*

---

## 5. `predictReps(P, role, ctx)` — le cœur "meilleur que lui"

### 5.1 Charge effective
```
effTotal(P) = P                                    (modes externes)
            = bodyweightKg + P                     (weighted_bodyweight ; lest P ≥ 0)
            = bodyweightKg − P                     (assisted_bodyweight ; assistance P)
bodyweightKg = params.bodyweightKg ?? DEFAULT_BODYWEIGHT_KG (75)
```

### 5.2 Base empirique
`repProfile` = tous les sets de travail du cluster actif (fenêtre 10, post-P1..P5), indexés par
`(role, weight)` avec `role ∈ {amorce, top, backoff, straight, bw}` (P3). Pour STRAIGHT/FINISHER,
le rôle indexé est la **position du set** (1, 2, 3+) au lieu du triplet.

```
samples = repProfile[role][P]
si |samples| ≥ 2 :
    base = median(samples)
sinon :
    (Pn, medn, n) = charge la plus PROCHE de P (même rôle) avec n ≥ 2 échantillons
    si aucune → (Pn, medn) = charge la plus proche tous rôles confondus avec n ≥ 2
    si toujours aucune → base = ceil((repMin + repMax) / 2)   // cold start, sauter 5.3
    kgPerRep = max(increment, REP_SLOPE_PCT × effTotal(Pn))    // 1 rep ≈ 7.5 % de charge
    base = medn − (effTotal(P) − effTotal(Pn)) / kgPerRep
```
*Validation données : Chest Press top 120 → med 6 (n=13) ; pente kgPerRep = 9 → 130 prédit 4.9→5
(observé med 6, conservateur OK). Tirage vertical : 35→40, kgPerRep 2.6 → prédit 5.1 (observé 5 ✓).
Pec deck : 70→80, kgPerRep 5.25 → prédit 4.1 (observé 4 ✓). Tractions lest : kgPerRep sur
effTotal = 75 + lest ≈ 7.1 kg/rep → +5 kg de lest ≈ −0.7 rep (observé : 15×7 vs 20×5 ✓).*

### 5.3 Corrections du jour (dans cet ordre, additives sur `base`)
```
1. formDelta : si un set amorce/premier-set a été fait AUJOURD'HUI :
       expected0 = predictReps(amorce.weight, role_amorce) SANS corrections
       formDelta = clamp(amorce_reps_aujourdhui − expected0, FORM_DELTA_MIN(−3), FORM_DELTA_MAX(+1))
   sinon formDelta = 0.
2. fatiguePenalty (§6.1) : 0..MAX_FATIGUE_REP_PENALTY(3), soustrait.
3. gapPenalty : tier deload "increment" → −1 ; "percent10"/"percent15" → −1 (la charge est déjà
   réduite par le deload, ne pas double-punir) ; "none" → 0.
4. drop intra-exercice : si le set prédit suit ≥ 1 set de travail DU MÊME exercice aujourd'hui et
   qu'il n'y a AUCUN échantillon empirique pour ce rôle/charge (fallback pur), appliquer en plus
   le drop actuel `baseRepDrop` de la FatigueClass (H 2 / M 1.5 / L 1, cap 2 en BW). Si la base
   est empirique (5.2, |samples| ≥ 2 au même rôle), le drop est DÉJÀ dans la médiane : ne rien ajouter.
```

### 5.4 Bornes
```
reps = clamp(roundHalfAway(base), 1, cap)
cap = min(repTargetMax, WORK_REP_CAP=10)   pour tout set de travail
    = max(repTargetMax, lastReps + 2)      pour BW_REP en plateau (§7.4) et burnout finisher (§8)
```
La valeur sert : (a) au pré-remplissage de la suggestion, (b) au bilan («performé» = réalisé ≥ prédit).

---

## 6. Fatigue intra-séance et absences

### 6.1 Fatigue relative au CONTEXTE HABITUEL (anti-double-comptage)
Le profil empirique (§5.2) contient déjà la fatigue *habituelle* d'Evan (Chest Press est toujours
fait après le bloc calisthénie : ses médianes l'intègrent). On ne pénalise donc que **l'excès** :

`SessionFatigueContext` est étendu (champs optionnels, calculés par le store) :
```ts
interface SessionFatigueContextV2 {
  priorLoads: PriorLoad[];                 // existant
  baselineSystemicCost?: number;           // médiane du totalSystemicCost AVANT cet exercice
                                           // sur ses 5 dernières occurrences historiques
  baselineSameParentSets?: number;         // idem pour sameParentSets(parent)
}
```
```
excessSystemic = max(0, totalSystemicCost − (baselineSystemicCost ?? 0))
excessLocal    = max(0, sameParentSets(parent) − (baselineSameParentSets ?? 0))
fatiguePenalty = min(MAX_FATIGUE_REP_PENALTY,
                     roundHalfAway(excessSystemic / FATIGUE_EXCESS_DIVISOR) + (excessLocal ≥ 3 ? 1 : 0))
```
Si les baselines ne sont pas fournies (appels existants, golden) → baseline = 0 → comportement
strictement plus conservateur, jamais crashant.
En plus de la pénalité de reps : si `fatiguePenalty ≥ 2` avant le PREMIER set du jour →
`amorceTarget/straightRef −= 1 incrément` et `fatigueConfirmed = true` (branche fatigue existante).
`isSignificant()` et `fatigueNote()` existants sont conservés (avertissement UI).
*Validation : Shoulder press 14-07 en position 9/11 (coût ≈ 25 vs baseline ≈ 10) + gap 80 j →
charge 70 (deload 15 %) − 2.5, prédiction ~10 − 3 (fatigue) − 1 (gap) = 6 ; réalisé 4/2 — l'algo
actuel aurait proposé 80×7.*

### 6.2 Supersets
Les membres d'un superset comptent l'un pour l'autre : le store inclut dans `priorLoads` les sets
des PARTENAIRES de superset au fil des rounds (déjà le cas pour les exercices précédents ; il faut
ajouter les partenaires du groupe EN COURS, round par round). Aucun changement moteur : la formule
6.1 absorbe tout via `priorLoads`. Les supersets restent placés en début de séance par le
générateur de plan (hors périmètre moteur).

### 6.3 Absence (inchangé, WS4)
Barème `deload.ts` conservé : ≤10 j rien / 11–21 j −1 incr / 22–42 j −10 % / >42 j −15 %,
remontée rapide, override "Je suis frais". S'applique à `amorceTarget`, `straightRef`, `topTarget`
(même décalage), et `lestRef` via son gap dédié (§4.5). La pénalité de reps associée est en §5.3.

---

## 7. `suggest()` set par set — pseudocode normatif

```
suggest(params):
  P1..P5 (pré-traitement) ; pattern = detectPattern(...)
  clusters (§3) ; refs (§4) ; deload (§6.3) ; fatigue (§6.1)
  doneToday = sets de travail complétés aujourd'hui (règle actuelle de filtrage)
  dispatch selon pattern :
```

### 7.1 TOP_SET_BACKOFF
```
si doneToday vide :
    → { weight: amorceTarget, reps: predictReps(amorceTarget, amorce), setType: work,
        role: amorce, mode: record_attempt, confidence: fatigueConfirmed ? 0.72 : 0.92 }

set1 = doneToday[0]
// INVERSION (top set fait en premier, ex. Chest Press 06-29 120×7 puis 100×10) :
inversion = (set1.weight ≥ topTarget − 1 incr)

si doneToday.length == 1 :
    si inversion :
        → { weight: amorceTarget, reps: predictReps(amorceTarget, amorce) + formDelta implicite,
            role: amorce, setType: work, mode: fallback_hypertrophy, confidence: 0.85,
            reasonCodes: +"top_set_done_first" }
    formDelta = clamp(set1.reps − expected0, −3, +1)
    topAdj = topTarget
    si formDelta ≤ −2 : topAdj = min(topTarget, lastTop.weight − 1 incr) ; annuler promotion du jour
    si formDelta ≥ 0 et promotionGate(top) : topAdj = topTarget  // (déjà promu §4.3)
    → { weight: topAdj, reps: predictReps(topAdj, top), setType: topSet, role: top,
        mode: record_attempt si topAdj > lastTop.weight sinon transition_mode, confidence: 0.88 }

// set 3+ : BACKOFF
top = le set le plus lourd de doneToday ; backLoad = amorceTarget
si top.reps ≥ 8 et set1.reps ≥ expected0    : backLoad = amorceTarget + 1 incr   // top facile
si top.reps < repMin − DEMOTION_MARGIN (≤3) : backLoad = amorceTarget − 1 incr   // top raté net
// (top.reps ∈ [4, 7] → backLoad = amorceTarget, données : 120×4 → 100×5)
→ { weight: backLoad, reps: predictReps(backLoad, backoff), setType: backoff, role: backoff,
    mode: fallback_hypertrophy, confidence: 0.86 }
si doneToday.length ≥ MAX_WORK_SETS_SUGGESTED (4) :
    → backoff à amorceTarget − 1 incr, reps mid-range, confidence 0.5
```

### 7.2 STRAIGHT
Comportement actuel (`suggestGeneric` : candidats + scoring, floors, policies `testThenPromote` /
`voluntaryCap` / `overreachJump`) **conservé**, avec 4 amendements :
1. `derived.targetLoad` = `straightRef` (§4.2, cluster actif) au lieu de `max(ancres 5 séances)`.
2. Les reps des candidats passent par `predictReps` (§5) quand un profil empirique existe ; sinon
   les formules actuelles (`baseRepDrop`) restent le fallback.
3. Cap §5.4 appliqué à tous les candidats (plus jamais 11 reps suggérées).
4. Récupération post-overreach et floors : inchangés.

### 7.3 ISOLATION_FINISHER
Comme STRAIGHT avec : nb de sets visé = `median(nb sets fenêtre 5)` (1 ou 2) ; jamais de
`plateau_break` en surcharge de charge (un finisher casse son plateau par les reps) ; tolérance
d'un « burnout » : si `doneToday.length == nb visé` et l'utilisateur redemande une suggestion →
`weight − 1 incr, reps = cap` (cap exempté §5.4), `reasonCodes: +"finisher_burnout"`, confidence 0.6.

### 7.4 BW_REP
```
si doneToday vide :
    target = median(set1_reps des 3 dernières séances)   // PAS max : Ab roller debout med(3,4,6)=4
    → { weight: 0, reps: clamp(target, 1, cap), role: bw, mode: record_attempt }
sinon :
    last = dernier set ; pred = predictReps(0, position suivante)
    si last.reps < VARIANT_SWITCH_FLOOR (4) et exercise.easierVariantId ≠ null :
        → { weight: 0, reps: 10, switchToVariantId: easierVariantId, mode: fallback_hypertrophy,
            reasonCodes: ["variant_switch_easier"], confidence: 0.9,
            explanation: "Variante facile — finir le volume (3×10)" }
    sinon → { weight: 0, reps: pred, mode: record_attempt }
AJOUT DE SET (progression par sets) : si les 2 dernières séances ont TOUS leurs sets ≥ cap et
doneToday.length == median(nb sets fenêtre 5) et tous ≥ cap → suggérer un set de plus
(max MAX_WORK_SETS_SUGGESTED = 4), reasonCodes: +"bw_add_set".
LESTAGE : le message "pensez à vous lester" n'est émis QUE si l'historique fenêtre 10 contient
≥ 1 set lesté OU setPatternMode == weighted_bodyweight ET pattern ≠ BW_REP détecté.
(HSPU : 25 séances 100 % BW → jamais de suggestion de lest ; progression reps→sets seulement.)
Plateau BW (≥ 3 séances mêmes reps partout) : cible last.reps + 1, cap étendu §5.4 (existant).
```

### 7.5 WEIGHTED_BW_VARIABLE (Tractions SN)
```
si doneToday vide et pas de primer aujourd'hui :
    → primer BW : { weight: 0, reps: 10, role: bw, confidence: 0.95 }   // set 1 = 10 BW (donnée : 33/34 séances)
après le set 1 BW :
    lestAutorisé = (set1_bw.reps ≥ 10) ET (gapDays exercice ≤ 10) ET (sameParentSets < 3)
                   ET (totalSystemicCost ≤ FRESH_SYSTEMIC_MAX (6)) ET (pas d'anti-plateau actif)
    si lestAutorisé :
        → { weight: lestTarget (§4.5), reps: predictReps(lestTarget, top_lesté),
            setType: topSet, mode: record_attempt, confidence: 0.85 }
    sinon :   // jour fatigué / désentraîné → 3× BW
        → { weight: 0, reps: predictReps(0, position), mode: fallback_hypertrophy,
            reasonCodes: ["bw_day_fatigue_or_gap"] }
après le set lesté :
    → retour BW : { weight: 0, reps: predictReps(0, backoff_bw), setType: backoff }
      // donnée : médiane des BW post-lest = 8
échec net du lest (reps ≤ repMin − 2) : le fallback BW actuel (0×10) est conservé.
```

---

## 8. Progression, plateau, anti-plateau, techniques d'intensité

- **Promotion** : §4.4. Seuil unique : `reps ≥ min(9, repTargetMax)` (« > 8 reps → poids suivant »).
- **Trop haut** : `reps < repTargetMin` sur le set concerné → la référence de ce rôle ne monte pas ;
  la charge ne DESCEND que si `reps < repTargetMin − 2` (mauvais jour ≠ régression durable, §4.2).
- **Bande de succès** = [repMin, 10] ; cap 10 (§5.4).
- **Plateau (AUTORITÉ : `VARIATION_CYCLING_SPEC.md` §2-§8, remplace intégralement le paragraphe
  précédent — surcharge/rest-pause RETIRÉES, décision #3)** : le trigger officiel n'est plus
  `plateauCounter ≥ PLATEAU_THRESHOLD (3)` mais **daté** — `isPlateau` : ≥14 jours calendaires sans
  nouveau record d'e1RM (Epley) sur le rôle dominant (top pour TOP_SET_BACKOFF/WEIGHTED_BW_VARIABLE,
  ancre sinon), ET ≥2 séances de ce rôle dans cette fenêtre de 14j (anti faux-positif d'absence ;
  `plateauCounter` reste calculé comme valeur dérivée annexe, plus comme trigger). `plateauCounter`
  legacy reste le trigger sur le chemin v1 (`assisted_bodyweight`/`ramping`, décision d'impl. tracée,
  pas de date-based v1 en Phase 1). Un état préemptif à 3 niveaux (`progressing`/`slowing`/`plateaued`,
  dérivé de `progressVelocityScore`) prépare la réaction avant même le trigger officiel.
  **Aucune technique d'intensité n'est prescrite par l'app** : `plateauEscalation()` (surcharge
  `+1 incrément × 5 reps` / rest-pause `intensityTechnique:"rest_pause"`) est **supprimée**. Le
  levier devient la **rotation de variation** : sur `isPlateau`, `suggest()` cherche un candidat
  (`lib/engines/variation-select.ts::selectAlternative` — même pattern de mouvement, carry-over
  musculaire, lifecycle/novelty/goalFit, §6 pour le détail du score) et pose UNIQUEMENT
  `switchToVariantId` (un `Exercise.id` réel) + `reasonCodes: +"variation"` sur la suggestion —
  **aucune mutation de weight/reps/mode** (non destructif). La proposition « accepter/refuser »
  vit dans le **bilan** de fin de séance (`buildPlateauReview`, `PlateauReview.suggestedVariant`) ;
  accepter précharge la variante pour la **séance suivante** (`store/workout.ts::acceptVariantSwitch`,
  jamais en pleine séance — la bascule vide les sets). `intensityTechnique` reste dans le type
  `SetSuggestion` pour compat mais vaut désormais **toujours `null`**.
- **`failedOverreachLoads`** : charges des sets de la fenêtre 10 avec
  `weight ≥ topRef(à l'époque) + 1 incr` et `reps < repMin − 2` (ex. Chest 140×2). `topTarget`
  reste strictement inférieur (§4.3) tant qu'un palier intermédiaire n'a pas été validé. Ce
  mécanisme (référence de charge, pas une technique d'intensité) est **conservé**.
- **Anti-plateau échoué (CONSERVÉ, inchangé)** : si la séance k−1 contenait une tentative
  `plateau_break` (overreach v1 hors plateau, ou tout mode `plateauBreak` legacy) dont les reps
  < repMin − 2 → pour les séances k et k+1 (`ANTIPLATEAU_SESSIONS = 2`), toutes les références de
  charge sont multipliées par `ANTIPLATEAU_FACTOR (0.9)` (arrondi incrément), promotion gelée,
  `reasonCodes: +"antiplateau_deload"`. Détection **stateless** : compter les séances écoulées
  depuis la dernière tentative échouée dans la fenêtre. C'est le fallback §4 étape 4 de
  `VARIATION_CYCLING_SPEC.md` si la rotation de variation ne relance pas non plus (ou pas de
  candidat). Le bilan signale « méthode à changer » si un 2e cycle échoue sur le même exercice dans
  la fenêtre 10.

---

## 9. Cas particuliers (récapitulatif normatif)

| Cas | Règle |
|---|---|
| Isolateral row (marques) | Clusters §3 ; référence = cluster actif → 110 aujourd'hui, pas 120 ; retour à l'autre salle = re-ancrage par override de poids (≥ 20 % d'écart) |
| Tractions SN | §7.5 : primer 10 BW toujours ; lest seulement si frais (4 conditions chiffrées) ; lestTarget §4.5 (= 15 kg aujourd'hui) ; sinon 3×BW 10/9/8 |
| Ab roller debout ↔ genoux | `Exercise.easierVariantId` (nouveau champ, nullable) ; commencer debout, cible = médiane des 3 derniers set1 (= 4 aujourd'hui) ; si set < 4 → `switchToVariantId` vers genoux 3×10 (§7.4) |
| HSPU | BW_REP détecté (100 % BW) → jamais de suggestion de lest ; reps cap 10 → +1 set quand 2 séances pleines au cap (§7.4) ; aujourd'hui : 3 sets (07-14 : 10,7 → pas d'ajout) |
| Supersets | Fatigue croisée via `priorLoads` incluant les partenaires round par round (§6.2) ; positionnement début de séance = planificateur, hors moteur |
| Dips machine (assisté) | Verrou §2.1 : code actuel inchangé |

---

## 10. Incohérences de l'historique et traitement (sans sur-réaction)

| Incohérence observée (données réelles) | Traitement |
|---|---|
| Top set fait en premier (Chest 06-29 : 120×7 → 100×10) | Amorce historique = set au max de reps, pas le premier set (P3) ; en séance : branche inversion §7.1 |
| Warmups mal taggés (Chest 05-04/05-06 : 100×10 « W ») | Reclassification P2 (≥ 90 % amorce ET reps ≥ repMin) |
| Overreach isolé (Chest 140×2 le 04-13) | Exclu des tops (`reps ≥ 3`), mémorisé dans `failedOverreachLoads` (§8) — ne pollue ni targets ni prédictions |
| Mauvais jour (100×8 le 04-10 ; Isolateral 110×6 le 14-07) | `formDelta` n'affecte QUE la séance courante ; la référence ne bouge pas si reps ∈ [repMin−2, repMin) (§4.2) |
| Changement de machine (Isolateral 80×8 le 06-07) | Cluster séparé §3 : n'entre jamais dans la moyenne de l'autre machine |
| Doublon intra-séance (Tractions 2× le 10-04) | P5 : fusion chronologique, sets tardifs hors structure |
| Gaps 22–82 j (Shoulder press 80 j, Leg curl 82 j…) | Deload WS4 conservé + pénalité reps −1 (§5.3) + remontée rapide existante |
| Reps > cap (0×13, 0×15 Dips) | Clampées pour la PRÉDICTION (cap §5.4), conservées pour records/bilan |
| Dérive vers tout-BW (Tractions depuis le 01-06) | La fenêtre 10 fait glisser WEIGHTED_BW_VARIABLE → conditions §7.5 proposent 3×BW les jours non-frais, et un lest recalibré (15, pas 20) les jours frais |

Principe transversal : **une seule mauvaise séance ne peut jamais déplacer une référence de plus
de 1 incrément, ni une bonne séance de plus de 1 incrément.** Le bruit reste dans `formDelta`
(portée : la séance en cours uniquement).

---

## 11. Compatibilité avec `lib/engines/progression.ts`

### Ce qui NE change PAS
- Signature `suggest(params: SuggestParams): SetSuggestion` ; `currentSetIndex` ignoré (invariant 4).
- `classifyAnchor`, `progressVelocityScore`, `knownLevel`, remontée rapide WS4, `deload.ts`,
  `autoFatigueFlag`, floors (`recentWorkingFloor`/`recentFallbackFloor`), récupération
  post-overreach, policies (`testThenPromote`, `voluntaryCap`, `overreachJump`), branche
  `assisted_bodyweight`, branche `ramping` (accessible via `setPatternMode`, jamais détectée).
- Modes de suggestion, labels FR, scoring générique (pour STRAIGHT).

### Ce qui change
| Zone | Avant | Après |
|---|---|---|
| `deriveState` | `targetLoad = max(ancres valides, 5 séances)` | Refs par rôle §4, cluster actif §3, fenêtre 10 pondérée récence |
| Dispatch | sur `setPatternMode` seul | sur `detectPattern` (§2), `setPatternMode` en fallback (< 3 séances) |
| `suggestTopSetBackoff` | prédiction `last.reps − drop` | machine à rôles §7.1 + `predictReps` §5 |
| Reps suggérées | pouvaient dépasser 10 (ex. 12×11) | cap `min(repTargetMax, 10)` §5.4 |
| Fatigue séance | flag binaire `isSignificant` | + pénalité graduée sur l'EXCÈS vs baseline §6.1 |
| WBW premier set | primer puis `targetLoad` | décision lest/3×BW chiffrée §7.5 |

### Nouveaux champs (tous optionnels / rétro-compatibles)
```ts
// Exercise
easierVariantId?: string | null;          // défaut null (Ab roller debout → genoux)

// SuggestParams
bodyweightKg?: number;                    // défaut 75 (§5.1)
historyPositions?: { position: number; sessionExerciseCount: number }[];  // §2.6, aligné sur recentHistory

// SessionFatigueContext (classe étendue, constructeur rétro-compatible)
baselineSystemicCost?: number;
baselineSameParentSets?: number;

// SetSuggestion (ajouts, jamais retirés)
role?: "amorce" | "top" | "backoff" | "straight" | "bw" | "finisher";
switchToVariantId?: string | null;
intensityTechnique?: "rest_pause" | null;

// DerivedExerciseState (ajouts)
pattern: DetectedPattern; amorceLoad: number; topLoad: number | null;
activeClusterLoads: number[]; failedOverreachLoads: number[];
```

### Golden test (`__tests__/golden.test.ts`)
Procédure obligatoire : implémenter → `UPDATE_GOLDEN=1 npx vitest run lib/engines/__tests__/golden.test.ts`
→ **revoir le diff ligne par ligne contre la table ci-dessous** → committer le nouveau snapshot.
Diffs ATTENDUS (tout autre diff = bug) :

| Exercice | Avant (snapshot actuel) | Attendu v2 | Règle |
|---|---|---|---|
| Chest Press | 132.5×8 (promotion sur max 5 séances) | **112.5×10** (amorce) | §4.2/§4.4 — set 1 = amorce, plus jamais le top set |
| Isolateral row | 120×9 | **110×8** | §3 clusters + §4.2 (110×6 = mauvais jour) |
| Pec deck | 75×11 | **75×8** | §2.5 top-set détecté → amorce 75 ; cap 10 ; med set1 à 75 = 9→8 avec WM |
| Leg extension | 100×11 | **82.5×10** | amorce 80×10 ≥ cap → promotion L 1/2 (§4.4) ; cap 10 |
| Tirage vertical muscle up | 35×11 | **35×10** | amorce 35, cap 10 |
| Lateral raises | 12×11 | **12×10** | finisher, cap 10 |
| Leg curl | 75×11 | **60×10** | last anchor 60×8 (gap 82 j déjà subi) ; +garde +1 incr/séance |
| Curl debout | 20×7 | **20×6** | finisher, med set1 à 20 = 6 |
| Shoulder press | 80×7 | **70×6** | deload > 42 j (§6.3) + pénalité reps −1 (§5.3) |
| Crunch déclinés | 50×11 | **50×10** | cap 10 |
| Row uni / Tirage horizontal / Pulley serré / Extension triceps / Curl incliné / Dips machine | divers | même charge, reps ≤ 10 | STRAIGHT conservé + cap |
| Tractions SN, HSPU, Relevé, Traction pronation, Ab roller debout/genoux, Dips | 0×N | inchangés (±cap) | BW/WBW : premier set identique |

Ajouter en plus des tests unitaires ciblés : `detectPattern` (5 patterns, exemples §2),
`predictReps` (exemples chiffrés §5.2), clusters Isolateral (§3), inversion Chest (§7.1),
bascule Ab roller (§7.4), décision lest Tractions (§7.5), anti-plateau 2 séances (§8).

---

## 12. Exemples chiffrés de bout en bout (état des données au 14-07-2026)

### 12.1 Chest Press (prochaine séance, gap ≤ 10 j, contexte habituel)
Pattern TOP_SET_BACKOFF (79 %). Amorces récentes [110×10, 100×10, 110×10…], tops [120×7, 130×4, 130×6…].
- Refs : amorceTarget = **112.5** (gate H 2/3 à 110 ✓, ≤ topTarget − 1 incr) ; topTarget = **122.5**
  (WM 125.1 plafonné à lastTop 120 + 2.5).
- Set 1 → `112.5 × 10` (pred : med(110, amorce) = 10 ; pente 8.25 kg/rep → 9.7 → 10, cap 10).
- Il fait 112.5×10 → formDelta 0. Set 2 → `122.5 × 6` (topSet ; med(120, top) = 6 ; −2.5/9 → 5.7 → 6).
- Il fait 122.5×6 (∈ [4,7]) → Set 3 → `112.5 × 6` (backoff = amorce ; med(110, backoff) = 6.5 → 6).
- S'il avait fait set 1 = 8 reps (mauvais jour) : formDelta −2 → set 2 = `117.5 × 5`, pas de promotion.

### 12.2 Tractions SN (prochaine séance, position 1–2, frais : coût systémique ≤ 6)
Pattern WEIGHTED_BW_VARIABLE (2 séances mixtes fenêtre 10).
- Set 1 → `PDC × 10` (primer, 33/34 séances historiques).
- Il fait 10 → lest autorisé (10 ✓, gap 2 j ✓, parent < 3 ✓, coût ✓) →
  Set 2 → `15 kg × 5` (lestTarget §4.5 : 20 → deload 45 j → 17.5 → pred 4 < 5 → 15 → pred 5 ✓).
- Set 3 → `PDC × 8` (médiane backoff BW post-lest).
- Jour fatigué (3e exo pecs/dos ou coût > 6) : `PDC × 10`, `PDC × 9`, `PDC × 8` (3×BW, médianes).

### 12.3 Isolateral row (retour salle habituelle, gap ~7 j)
Pattern STRAIGHT. Cluster actif {120×5, 110} (le 80 du 06-07 est un cluster séparé).
- straightRef = **110** (110×6 = mauvais jour, pas de démotion, pas de retour direct à 120).
- Set 1 → `110 × 8` (pred : med(120, set1) = 8, +10 kg / 9 kg-par-rep → 9.1, tempéré par cap
  et arrondi → 9 ; l'implémentation rend 9 → clamp bande [repMin 8, cap 10] → **8–9**, valeur normative : 9).
- S'il fait ≥ 9 → prochaine séance 112.5 (promotion 1-occurrence §4.4) → « ~110–112, pas 120 » ✓.
- S'il se gare sur l'autre machine et tape 80 au premier set (écart ≥ 20 %) → re-ancrage cluster
  {80} : suggestion suivante `80 × 8`.

### 12.4 Ab roller debout (prochaine séance)
Pattern BW_REP, variante dure, `easierVariantId = Ab roller genoux`.
- Set 1 → `PDC × 4` (médiane des 3 derniers set1 : 3, 4, 6).
- Il fait 3 (< 4) → suggestion suivante : **bascule** `Ab roller genoux, PDC × 10` (compléter 3 sets
  de volume), reasonCode `variant_switch_easier`.
- Le bilan note : 5 séances consécutives < 5 reps en debout → recommander de re-construire via
  genoux 3×10 + 1 set debout max en ouverture (message, pas de changement de suggestion).

### 12.5 HSPU (contrôle négatif)
Pattern BW_REP (100 % BW sur 25 séances) → jamais « pensez à vous lester ».
07-11 : 3×10 ✓ mais 07-14 : 10, 7 (< cap) → pas d'ajout de set. Plan : `PDC × 10`, puis pred
set 2 = 10, set 3 = 10 (médianes) ; si un set casse (ex. 7), le suivant = pred empirique, plancher 1.

---

## 13. Ordre d'implémentation conseillé (chaque étape livre un moteur qui compile + tests verts)

1. Constantes ALGO_V2 + `detectPattern` + tests (§2).
2. P1–P5 + rôles historiques + clusters + tests (§1, §3).
3. Références §4 (`amorceRef/topRef/straightRef/lestRef`) + tests chiffrés (Isolateral, Chest).
4. `predictReps` §5 + tests (pentes validées §5.2).
5. Réécriture `suggestTopSetBackoff` (§7.1) + amendements STRAIGHT/FINISHER (§7.2–7.3).
6. BW_REP + WEIGHTED_BW_VARIABLE (§7.4–7.5) + `easierVariantId`.
7. Fatigue V2 (§6.1) + baselines côté store + supersets (§6.2).
8. Plateau/anti-plateau/techniques (§8).
9. Golden : régénérer, valider le diff contre la table §11, committer.
