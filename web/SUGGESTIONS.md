# Suggestions de charges et de reps : méthode, mesure, réglages

Ce fichier explique comment le moteur (`lib/engines/progression.ts`) prévoit la série suivante, comment on vérifie qu'il
a raison sur l'historique réel, et comment relancer cette vérification. Le moteur est amélioré, jamais remplacé
(règle du dépôt : « Progression algorithm stays »).

## 1. Ce qu'on mesure

Pour chaque série réelle, on rejoue le store avec l'horloge figée juste avant cette série : le moteur ne voit que les
séances d'avant et les séries déjà faites ce jour-là (aucune fuite). On compare ce qu'il prévoyait avec ce qui a été fait :

- **reps faites au RIR visé** = reps + RIR déclaré − 1 (RIR « 4+ » compté 4) : le moteur vise RIR 1 ;
- **reps prévues à la charge choisie** = la suggestion reprojetée à la charge réellement prise, par la règle du moteur
  (7,5 % de charge = 1 rep, `reprojectSuggestionAtWeight`, en continu) ; à charge égale, ce sont les reps suggérées ;
- **écart** = faites − prévues (négatif : moteur trop optimiste) ; **erreur moyenne** = écart en valeur absolue.

Population : séries de travail avec RIR, hors étalonnage (1re séance d'une machine), compléments de série, finishers,
échauffements et repli « 20 kg par défaut ». Intervalles à 95 % par bootstrap PAR SÉANCE (les séries d'une séance ne sont
pas indépendantes) ; comparaisons multiples corrigées par Holm ; aucune conclusion sous 20 séries ou 8 séances.

## 2. La perte de reps d'une série à la suivante est apprise (`lib/engines/rep-drop.ts`)

Audit du 11/10/2026 (31 séances, 439 séries, 17/08 au 11/10) : la 1re série d'un exercice était juste (écart +0,6 rep),
les suivantes trop optimistes (−1,5 à la 2e, −1,9 à la 3e, −2,5 à la 4e). Cause : à charge égale, Evan perd 2,5 reps
[2,1 ; 2,9] d'une série à la suivante, le moteur retirait une constante par classe de fatigue (1 / 1,5 / 2). La perte varie
selon l'exercice (biceps et deltoïde latéral ~2, abdos ~3, triceps ~3,5) sans que la classe ne l'explique (légers et
moyens perdent autant, ~2,4).

Méthode, pure, refaite depuis l'historique à chaque suggestion :

1. **Paires** : deux séries normales consécutives du même exercice dans une séance, même charge, RIR déclaré sur les deux,
   ni complément de série ni arrêt pour douleur ou matériel, hors 1re séance de l'exercice. Perte = reps au RIR visé de la
   1re − celles de la 2e, bornée à [−2 ; 6].
2. **Récence** : chaque paire pèse 0,5^(âge en jours / 60). Le moteur suit les habitudes qui changent.
3. **A priori** : moyenne pondérée de TOUTES les paires de l'historique, rétrécie vers la constante de la classe de fatigue
   avec un poids de 5 paires. Un nouvel utilisateur garde donc les constantes d'origine.
4. **Exercice** : moyenne pondérée de ses paires, rétrécie vers l'a priori avec un poids de 4 paires (bayésien empirique,
   poids propre W / (W + 4)). Un nouvel exercice part de l'a priori.
5. **Bornes** : [0,5 ; 4] reps.

Où elle sert : séries 2+ du chemin général (« garder la charge », « baisser d'un cran », montée après dépassement), séries
de retour du schéma série lourde + retours, §5.3.4 de `predictReps`, et la charge max d'une machine. La constante de classe
(`FATIGUE_CLASS_PROPERTIES.baseRepDrop`) reste la seule source du coût de fatigue de SÉANCE (`session-fatigue.ts`) : rien
dans le rejeu ne justifiait d'y toucher.

Réglages (`REP_DROP`), choisis par rejeu sur les séries d'avant le 21/09/2026 seulement, puis vérifiés sur les séries
d'après : poids de l'exercice {1, 2, 4, 8, 16}, poids de la classe {5, 10, 20, 40}, demi-vie {30, 60, 120 jours, sans}.
Entre les réglages essayés, l'erreur moyenne varie de moins de 0,1 rep : le choix compte peu.

Essayé et écarté, faute de gain sur les séries d'avant le 21/09 (étude par paires, sans fuite) :

- **repos** : une pente globale selon l'écart entre le repos attendu (habitude de l'exercice, seul ou en superset) et
  l'habitude ; erreur 1,76 contre 1,75 sans. Le repos réel n'est connu qu'après la série ;
- **muscle** : un niveau muscle entre l'exercice et l'a priori ; erreur 1,77 contre 1,74 sans ;
- **paires du jour** (les séries déjà faites dans la séance) : erreur 1,92 contre 1,89 sans ;
- **RIR de la série d'avant** : erreur 1,75 contre 1,74 sans.

## 3. Les autres changements du 11/10/2026

- **« Baisser d'un cran »** : les reps partent de la série qui vient d'être faite (au RIR visé, moins la perte apprise),
  converties à la charge plus légère par la règle 7,5 %, au lieu du milieu de fourchette (3,8 reps de trop en moyenne).
- **Série de retour** (schéma série lourde + retours) : les reps partent de la DERNIÈRE série faite, plus seulement du top,
  et la charge n'est jamais plus lourde que cette dernière série (après 150 × 6 puis 130 × 9, le moteur remontait à 142,5 :
  9 des 30 séries de retour de l'audit).
- **Plus de « Point de départ 20 kg »** après une série du jour : quand les planchers écartent toutes les propositions, le
  moteur garde la charge qui vient d'être faite (15 séries sur tout l'historique, dont 7 depuis le 17/08).
- **Poids du corps** : la 1re série suit les reps démontrées (décision de septembre 2026). Le décalage appris
  (`prediction_bias_calibrated`) la re-plafonnait au haut de la fourchette (Dips : 15 + 2 devenait 12) et la reprojection
  plafonnait la prévision enregistrée sur la série, ce qui nourrissait ce décalage. Les deux sont corrigés. La fatigue de
  séance retire maintenant des reps à cette 1re série comme aux autres premières séries ; sans cela, des HSPU faites en fin
  de séance étaient prévues comme fraîches.
- **Jamais sous la fourchette** (`sizeLoadToRange`) : une suggestion chargée (externe, lestée ou assistée) dont les reps
  prévues passent sous `repTargetMin` descend cran par cran, avec la règle 7,5 %, jusqu'à prévoir le minimum. Plancher :
  la charge effective habituelle (médiane des séries de travail des 5 dernières séances) moins 15 %
  (`ALGO_V2.LOAD_FLOOR_PCT`). Si le plancher ne suffit pas, il est proposé avec ses reps prévues et la raison le dit
  (« Allégé jusqu'à ton plancher de charge »). Inchangés : poids du corps pur (pas de charge à alléger ; règle existante de
  la variante plus facile), finishers, test de plateau, compléments de série.
  Les 15 % : avant le 21/09, Evan n'est descendu à plus de 14,3 % sous sa charge habituelle que sur 5 % de ses séries 2+ ;
  l'erreur moyenne avant le 21/09 varie de moins de 0,02 rep entre un plancher à 10 % et aucun plancher.
- **Raison lisible** (`suggestion-reason.ts`) : quand la perte apprise vient de l'exercice lui-même, « tu perds d'habitude
  2,5 reps d'une série à l'autre ici » ; « Allégé pour rester dans ta fourchette de reps » quand la charge a été
  dimensionnée.
- Version du moteur : `web-v2.3-2026-10-11` (`SUGGESTION_ENGINE_VERSION`).

Inchangés : premières séries chargées (mêmes prévisions, série pour série), test de plateau, conversion 7,5 % (Epley faisait
pire sur l'historique : erreur 4,50 contre 2,34 sur 246 séries faites à une autre charge).

## 4. Résultat du rejeu (11/10/2026, ancien moteur contre nouveau, mêmes 439 séries, 31 séances)

| Contexte | Séries (séances) | Erreur ancien → nouveau | Différence [IC 95 %] | Écart ancien → nouveau |
|---|---|---|---|---|
| Toutes les séries | 439 (31) | 2,35 → 1,86 | −0,49 [−0,65 ; −0,33] | −0,81 → +0,06 |
| Hors échantillon (à partir du 21/09) | 171 (11) | 2,13 → 1,82 | −0,32 [−0,56 ; −0,08] | −0,81 → +0,32 |
| Séries 2+, hors échantillon | 98 (11) | 2,16 → 1,60 | −0,56 [−0,96 ; −0,12] | −1,77 → +0,45 |
| 1re série de l'exercice | 180 (31) | 2,20 → 2,05 | −0,15 [−0,34 ; +0,01] | +0,58 → +0,20 |
| 2e série | 138 (30) | 2,40 → 1,83 | −0,58 [−0,90 ; −0,27] | −1,49 → −0,02 |
| 3e série | 79 (29) | 2,31 → 1,57 | −0,74 [−1,22 ; −0,27] | −1,92 → −0,09 |
| 4e série et plus | 42 (25) | 2,92 → 1,73 | −1,19 [−2,04 ; −0,53] | −2,47 → +0,06 |
| Même charge que la série d'avant | 152 (31) | 2,54 → 1,82 | −0,72 [−1,05 ; −0,41] | −1,87 → −0,30 |
| Plus léger que la série d'avant | 79 (25) | 2,51 → 1,69 | −0,81 [−1,40 ; −0,25] | −1,79 → +0,56 |
| Branche « baisser d'un cran » | 54 (26) | 3,90 → 1,46 | −2,44 [−3,43 ; −1,60] | −3,83 → +0,91 |
| Branche « garder la charge » | 71 (26) | 1,75 → 1,35 | −0,40 [−0,70 ; −0,09] | −1,41 → −0,25 |
| Séries de retour | 29 (18) | 2,48 → 1,62 | −0,86 [−1,79 ; −0,09] | −2,41 → +0,74 |
| Test de plateau | 35 (15) | 1,05 → 1,05 | 0,00 [−0,23 ; +0,24] | −0,44 → −0,10 |
| Série 2+ enchaînée | 126 (30) | 2,92 → 1,74 | −1,18 [−1,59 ; −0,77] | −2,42 → −0,35 |
| Série 2+ alternée (superset) | 133 (29) | 2,02 → 1,72 | −0,29 [−0,55 ; −0,06] | −1,17 → +0,27 |
| Moins de 3 min depuis la série d'avant | 44 (22) | 3,42 → 2,06 | −1,36 [−2,25 ; −0,59] | −2,98 → −1,05 |

Tests pré-déclarés (t robuste par séance, Holm sur les 4 tests de gain) : toutes séries p < 0,001 ; séries 2+ p < 0,001 ;
hors échantillon p = 0,029 (Holm 0,058) ; séries 2+ hors échantillon p = 0,033 (Holm 0,058). Le hors échantillon ne
couvre que le réglage des constantes : la forme des changements vient de l'audit, qui a vu toute la période.

Suggestions sous la fourchette (charge externe, lestée ou assistée, hors test de plateau), sur les 439 séries :
27 avec l'ancien moteur, 116 avec la perte apprise seule, 50 après dimensionnement (45 au plancher, 5 compléments de
série, voulus courts). Erreur sur les 116 : ancien 2,94, perte apprise seule 1,58, après dimensionnement 1,61. Le
dimensionnement ne change presque pas la prévision à la charge choisie (+0,01 [−0,01 ; +0,02], aucune case dégradée après
Holm), mais la charge proposée s'éloigne de celle qu'Evan prend : écart médian sur les séries 2+ de 5,0 % (ancien) et
3,8 % (perte apprise seule) à 8,3 %.

À part : séries au poids du corps faites en finisher, 5,17 → 5,91 d'erreur (23 séries, 16 séances), l'ancien plafond
tombant par hasard plus près ; 1res séries au poids du corps de travail, 4,46 → 3,46 (26 séries, 16 séances).

Ce que le moteur avait appris au 11/10/2026 (a priori : 2,32 reps) : Lateral raises 2,1 (27 paires), Abdominal LifeFitness
2,5 (14), Curl incliné 1,8 (10), HSPU 3,1 (10), Dips 2,5 (9), Curl debout 2,4 (8), Preacher Curl 2,2 (6), Rear delt fly
2,8 (6), Total Abdominal 3,0 (6), Wide Chest Press 1,9 (5), Tractions SN 2,7 (5), Extension triceps poulie 2,6 (4).

## 5. Limites

- Un seul pratiquant, 8 semaines de RIR. Le RIR est déclaré ; la mesure suppose 1 RIR = 1 rep, comme le moteur.
- Les effets en chaîne (une autre charge proposée ensuite) ne sont pas observables : l'historique a été fait avec l'ancien
  moteur. On mesure la prévision à la charge réellement prise.
- Le repos reste la principale source d'erreur des séries 2+ (moins de 3 min : encore −1,1 rep) ; il n'est connu qu'une
  fois la série faite.
- Rejouer un vieil historique utilise le catalogue d'aujourd'hui (fourchettes, charges max).

## 6. Relancer l'audit

Les données ne sont jamais commitées : les scripts refusent d'écrire leur sortie dans le dépôt.

```sh
cd web
# 1. Export en lecture seule (rôle Neon barbis_backup ; jamais le .env, qui pointe sur la prod en écriture)
JEERA_READONLY_DATABASE_URL="$(security find-generic-password -s jeera-backup-database-url -w)" \
  npx tsx scripts/suggestions-audit/export-data.ts ~/jeera-audit/export.json
# 2. Rejeu du moteur de ce worktree (et d'un autre moteur, depuis son propre web/, pour comparer)
TZ=Europe/Paris npx tsx scripts/suggestions-audit/replay.ts ~/jeera-audit/export.json ~/jeera-audit/nouveau.jsonl
cd ../../autre-worktree/web && TZ=Europe/Paris npx tsx --tsconfig ./tsconfig.json \
  ../../ce-worktree/web/scripts/suggestions-audit/replay.ts ~/jeera-audit/export.json ~/jeera-audit/ancien.jsonl
# 3. Rapport par contexte (un moteur, ou ancien contre nouveau), série par série pour des séances choisies
npx tsx scripts/suggestions-audit/report.ts ~/jeera-audit/ancien.jsonl ~/jeera-audit/nouveau.jsonl --split 2026-09-21 --seance 2026-10-11
# 4. Ce que le moteur a appris, exercice par exercice
npx tsx scripts/suggestions-audit/rep-drops.ts ~/jeera-audit/export.json
# Réglage : `replay.ts ... --set SHRINK_K=4 --set PRIOR_K=5 --set HALF_LIFE_DAYS=60`, comparé sur une période seulement
```
