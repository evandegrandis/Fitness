# Jeera — Spécification de l'algorithme de progression v2

> Objectif : un algo **meilleur qu'Evan** pour prédire les reps qu'il fera au poids cible,
> qui **suit sa méthode**, **maximise la progression** et **minimise le plateau**.
> Ancré sur : (1) l'analyse empirique de son historique, (2) sa méthode déclarée, (3) la science
> (arvo.guru — top set + backoff, supersets, techniques d'intensité sur les 1-2 dernières séries).
> Règle absolue conservée : on **répare/étend** le ProgressionEngine, jamais de remplacement générique/ML.

---

## 0. Principes

- **Viser 10 reps max** par série de travail (jamais plus), SAUF rare série « finisher » de fin.
- **Prédire depuis le set fait AUJOURD'HUI**, jamais rejouer la séance passée.
- **Récence > ancienneté** : une perf récente pèse plus qu'un vieux record.
- **Chaque set connaît son contexte** : fatigue intra-séance, absence, muscle déjà travaillé.
- Techniques d'intensité (top set, backoff) = le pattern par défaut des composés ; supersets en début de séance.

---

## 1. Patterns empiriques détectés (historique réel, 33 séances)

| Exercice | Structure réelle | reps p1 / p2 / p3 | Pattern |
|---|---|---|---|
| Chest Press | set2 plus lourd 19/24, set3 ≈/↑ set1 | 10 / 6 / 5 | **TOP-SET + BACKOFF** |
| Tirage vertical muscle up | set2 ↑ 10/18 | 10 / 6 / 5 | TOP-SET + BACKOFF |
| DC assisté | set2 ↑ | 10 / 8 / 4 | TOP-SET + BACKOFF |
| Leg extension | set2 ↑ 8/11 | 10 / 10 / 6 | TOP-SET + BACKOFF |
| Pec deck | set2 ↑ 7/15 (bruité) | 10 / 5 / 5 | TOP-SET + BACKOFF (léger) |
| Tractions SN | 10 BW → +lest → BW, ou 3× BW si fatigue | 10 / 7 / 9 | LESTÉ VARIABLE / BW |
| HSPU | poids toujours 0 | 10 / 10 / 10 | **BW REP-BASED** (non lestable) |
| Ab roller genoux | toujours 3×10 | 10 / 10 / 10 | BW REP-BASED (facile) |
| Ab roller debout | 1 série, 3–10 reps, peine | 6 / 3 / 7 | **BW VARIANTE DURE** |
| Relevé jambes / Crunch | stable ~10 | 10 / 10 / 10 | BW REP-BASED |
| Curl debout | 1 série médiane, fin de séance | 6 / 5 / 5 | ISOLATION / FINISHER |
| Lateral raises | 1–2 séries, reps hautes | 8 / 7 | ISOLATION straight |
| Isolateral row | poids varie selon **marque machine** | 8 / 7 | STRAIGHT + baseline par machine |

**⚠️ Métadonnées à corriger** : Chest Press, Tirage vertical, DC assisté, Leg extension sont taggés
`straight` mais sont en réalité **top-set+backoff**. → l'algo doit **détecter le pattern depuis l'historique**
(ne pas se fier au seul `setPatternMode` figé), et/ou re-tagger ces exercices.

---

## 2. Détection du pattern par exercice (depuis l'historique)

Sur les N dernières séances (fenêtre 10) d'un exercice, classer automatiquement :
- **TOP_SET_BACKOFF** : le set 2 est plus lourd que le set 1 dans ≥ 50 % des séances à ≥ 2 sets, ET reps décroissantes (p1 > p2).
- **STRAIGHT** : poids ≈ constant entre sets (variations < 1 incrément), non-BW.
- **BW_REP** : poids ≈ 0 sur ≥ 60 % des sets (non lestable ou majoritairement au poids du corps).
- **WEIGHTED_BW_VARIABLE** : BW + lest alterné (ex Tractions SN : 0 → +20 → 0).
- **ISOLATION_FINISHER** : médiane de sets ≤ 1–2, souvent en fin de séance.
Le pattern détecté prime sur le `setPatternMode` figé quand l'historique est suffisant (≥ 3 séances).

---

## 3. Le modèle set-par-set (cœur)

### 3.1 Set 1 — l'AMORCE (« premier set de travail lourd mais convenable »)
- Cible = **poids de travail de référence** (voir §4, récence-pondéré) permettant **~10 reps**.
- **Ajusté à la baisse** par :
  - **fatigue intra-séance** : nombre de sets déjà faits aujourd'hui sur le même muscle parent + coût systémique (Σ sets × drop de fatigue). Plus le muscle a été sollicité tôt, plus l'amorce baisse.
  - **absence / gap** (deload daté §6).
- Le résultat du set 1 (reps réalisées) **jauge la forme du jour** et **recalibre** les sets suivants.

### 3.2 Set 2 — le TOP SET (« série de force, poids max pour 6–8 reps, vise 10 »)
- Cible = **le poids le plus lourd récent** qui a donné **6–8 reps** (viser 10).
- **Scalé par le set 1 d'aujourd'hui** :
  - set 1 ≥ 10 reps facile → top set = charge de référence **+1 incrément** (tentative de PR).
  - set 1 pile ~10 → top set = charge de référence habituelle.
  - set 1 < 8 reps → top set réduit (mauvais jour) : viser le plancher haut, pas un PR.
- Reps prédites au top set = **prédiction §5** (fonction du poids et de la forme du jour).

### 3.3 Set 3+ — le BACKOFF (« retour au poids du set 1, parfois plus, parfois moins »)
- Base = **poids du set 1**.
- Ajusté ± selon la perf set1 + set2 d'aujourd'hui :
  - top set réussi (≥ 8) + set1 solide → backoff = set1 **ou +1 incrément** (reps ~ set1 − fatigue).
  - top set difficile (< 6) → backoff = set1 **−1 incrément**, reps mid-range.
- Reps prédites = **prédiction §5** en tenant compte de la fatigue cumulée (sets déjà faits aujourd'hui).

### 3.4 Exercices STRAIGHT / ISOLATION
- Double progression classique sur la fourchette : tous les sets ≈ même poids ; promotion quand la cible reps est atteinte (§7). Isolation/finisher : 1–2 sets, tolérance reps plus large.

### 3.5 Exercices BW non lestables (HSPU, Crunch, Relevé, Ab roller genoux)
- Progression **par reps puis par sets** (pas par charge) : viser +1 rep jusqu'au cap (10), puis +1 set, puis (si l'exo le permet) lestage.

### 3.6 Variantes BW dur/facile (Ab roller debout ↔ genoux ; principe généralisable)
- **Ab roller debout** = version supérieure ; **objectif 4–5 reps** minimum (chemin vers 10).
- Stratégie proposée : **commencer par le debout** en visant un **max de reps** (cible 6–8, voire 10 selon le résultat précédent). 
  - Si Evan tient ≥ 4–5 reps → continuer en debout (progression par reps vers 10).
  - S'il s'effondre (< 4) → **bascule proposée vers Ab roller genoux** pour finir le volume (3×10).
- Généraliser : un exercice peut avoir une **variante plus facile** liée ; l'algo propose la bascule quand le plancher de reps n'est pas tenu.

---

## 4. Poids de travail de référence — pondéré par la récence

- Remplacer `targetLoad = max(ancres valides sur 5 séances)` (biais sur-ambition) par une **cible pondérée récence** :
  - Considérer les ancres valides (reps ≥ plancher) sur la fenêtre 10.
  - Pondérer par récence (décroissance exponentielle, ex α^k) : la charge de référence suit surtout les **3 dernières perfs**.
  - On ne **rechasse un ancien record que progressivement** : la cible ne dépasse pas la meilleure perf **récente (3 dernières séances)** de plus de **+1 incrément par séance**.
- Effet attendu (validé sur Isolateral row) : si Evan a fait 120 en mai mais 80–110 récemment, la cible ≈ **110–112**, pas 120.

---

## 5. Prédiction des reps au poids cible (le « meilleur que moi »)

Prédire `reps_attendues(poids P aujourd'hui)` :
- Base = reps historiques récentes à P (ou au poids le plus proche, ajusté ~ −1 rep par incrément au-dessus / +1 en dessous, dans la limite du réalisme).
- **Corrigé** par les signaux du jour :
  - reps set 1 vs son attendu (forme du jour) → décale toutes les prédictions de la séance.
  - fatigue cumulée intra-séance (position du set, muscle déjà travaillé) → −drop par set (drop selon classe de fatigue de l'exo : Heavy 2 / Medium 1.5 / Light 1).
  - gap/absence → prédictions revues à la baisse.
- **Bornes** : cap à 10 (sauf finisher) ; plancher réaliste ≥ 1.
- Sert (a) à pré-remplir la suggestion, (b) au bilan (« performé » = réalisé ≥ prédit).

---

## 6. Fatigue & absence

- **Intra-séance** : `SessionFatigueContext` étendu — coût systémique (Σ sets × drop) + sets sur le **même muscle parent** plus tôt dans la séance ⇒ abaisse l'amorce (set 1) et les prédictions.
- **Gap par exercice** (déjà implémenté, §deload) : jours depuis la dernière séance de CET exercice exact.
- **Absence globale** (deload daté, déjà implémenté) : ≤10j rien / 11–21j −1 incr / 22–42j −10 % / >42j −15 %, message « reprise après X semaines », **remontée rapide** (portillon assoupli tant que < niveau connu), override 1-tap « Je suis frais ».

---

## 7. Règles de progression / plateau

- **Promotion** : à un poids donné, si Evan fait **> 8 reps** → la séance suivante, **viser le poids suivant** (+1 incrément) sur le set concerné.
- **Trop haut** : si **< 6 reps** → il a visé trop haut pour ce set/ce jour/ce moment → réduire (−1 incrément) sans casser la référence (mauvais jour ≠ régression durable).
- **Bande de succès** ≈ 6–10 reps ; cap 10.
- **Plateau (mis à jour, `VARIATION_CYCLING_SPEC.md` — AUTORITÉ sur ce point, abroge la version précédente de cette ligne)** : le trigger est **daté** (≥ 14 jours calendaires sans nouveau record d'e1RM sur le rôle dominant, ET ≥ 2 séances dans cette fenêtre — `isPlateau`, pas un simple compteur de séances). **Aucune technique d'intensité n'est prescrite par l'app** (l'ancienne « surcharge top set +1 incr / rest-pause » est retirée, décision #3) : le levier est la **rotation de variation** (même pattern de mouvement, carry-over musculaire, cible le point faible — `lib/engines/variation-select.ts::selectAlternative`), proposée dans le **bilan** de fin de séance (carte accepter/refuser, non destructive — la bascule ne prend effet qu'à la séance suivante). Un indicateur préemptif discret (« progrès qui ralentit », `slowing`) apparaît dès qu'il stagne depuis ≥7 jours, avant même le plateau officiel.
- **Anti-plateau échoué** : si la rotation de variation ne relance pas non plus (ou aucun candidat trouvé) → **deload réactif −10 % sur 2 séances** (mécanisme inchangé, `detectAntiPlateauActive`) puis re-tentative ; le **bilan** le signale (« méthode à changer »).

---

## 8. Cas particuliers

- **Machine à marques multiples (Isolateral row…)** : le poids dépend du bras de levier ⇒ tenir une **baseline de charge par `machineSetting`** ; ne pas mélanger les baselines de deux machines pour la cible.
- **Tractions SN** : reconnaître le pattern « 10 BW → +lest → BW » quand la forme est bonne, vs « 3× BW » quand fatigué/désentraîné (gap élevé, coût intra-séance élevé) → l'algo choisit selon le contexte du jour.
- **Supersets en début de séance** : intégrer au **plan** (couverture musculaire, efficacité) et à la **fatigue** (les membres d'un superset comptent l'un pour l'autre dans le coût intra-séance).

---

## 9. Bilan de fin de séance (piloté par l'algo)

Répondre, par exercice et global : **performé ?** (réalisé vs prédit §5), **plateau** (entrée/sortie), **anti-plateau échoué**, **trop / pas assez ambitieux**, **couverture musculaire** (groupes travaillés, assez de séries), **records**. Remplace le proxy `nb PR / nb sets`.

---

## 10. Garde-fous d'implémentation

- **Golden-test** sur l'historique réel : tout changement de suggestion doit être expliqué par une règle ci-dessus (diff revu).
- Fenêtres documentées (décision, vélocité, référence) via constantes partagées.
- Le moteur reste **pur** ; ce qui se recalcule n'est pas persisté.
- FR partout ; arrondis au `smallestIncrement`.
