# Tendance d'un exercice : écart à ce que Jeera prévoyait, fatigue de séance comprise

Ce fichier explique comment Jeera dit qu'un exercice progresse, stagne ou baisse (Progrès › Exercices, bilan de séance,
`GET /api/barbis/training-state`, donc le bilan hebdo de Barbis), comment on l'a mesuré sur l'historique réel et comment
relancer la mesure. Code : `lib/engines/capacity-trend.ts`, appelé par `exerciseStats` (`lib/engines/progress-stats.ts`).

## 1. Pourquoi

Bilan hebdo de Barbis du lundi 12/10/2026 : « Progresse : Dips machine +23,1 %, … · en baisse : Dips −9,1 %, Lateral
raises −3,5 % (3 dernières séances contre les 3 d'avant) ». Evan : « ma performance en dips n'a pas baissé de 10 %.
Peut-être que tu compares un moment où je les ai faits en fin de séance à d'autres fois où je les faisais plus frais […]
Ce n'est pas une comparaison juste. C'est des choses que tu me dis toutes les semaines. »

L'ancienne tendance (`exerciseStats` jusqu'au 12/10) avait quatre défauts, tous mesurés (section 4) :

1. **Fatigue de séance corrigée par une règle fixe**, pas apprise : 1 rep par 6 de coût systémique, +1 après 3 séries du
   même muscle, 3 reps au plus. Les Dips du 08/09 (3e exercice, 2 séries avant) : 20 reps à RIR 2, capacité 22 ; ceux du
   05/10 (5e, 11 séries avant dont 4,3 du même muscle) : 15 à RIR 2, capacité 17 + 3 = 20. À l'intérieur d'un exercice,
   chaque série du même muscle faite avant laissait encore −1,7 % de capacité, chaque rang de plus −1,4 %.
2. **Meilleure des 3 dernières contre meilleure des 3 d'avant** : le maximum va chercher la séance exceptionnelle (Dips
   frais du 08/09, Lateral raises du 01/10 à 14 × 12).
3. **Seuils sous le bruit** : +1,5 % / −3 %, alors qu'une séance s'écarte de la suivante d'environ 4 à 5 % sur une
   machine et 10 % en reps au poids du corps. Remises dans un ordre au hasard, les mêmes séances donnaient 33 % de
   « progrès » et 21 % de « baisses ».
4. **Comparaison par-dessus une pause** : « Dips machine +23,1 % » comparait une séance du 12/05 (avant 4 mois sans
   l'exercice) à celles de fin septembre.

## 2. La prévision du moteur de suggestion ne convient pas

Idée évaluée d'abord : prendre la prévision par série du moteur (`suggest()`, prévision sans biais du 11/10,
`web/SUGGESTIONS.md`) et mesurer l'écart des séances récentes à elle. Rejeu du moteur actuel (`replay.ts`), première
série de chaque exercice, 180 séries depuis le 17/08 : écart moyen +0,20 rep, sans pente globale contre les séries
faites avant (−0,011 rep par série [−0,136 ; +0,088]), mais −0,30 rep par série du même muscle [−0,87 ; −0,01] à
l'intérieur d'un exercice, et pour les Dips : 09/09 (16 séries avant) −5 reps, 18/09 −4, 21/09 −3, 27/09 −3, 05/10 −1.
Elle aurait elle aussi annoncé « Dips en baisse ». Raison : sa fatigue de séance est l'EXCÈS sur l'habitude de
l'exercice (médiane de ses 5 dernières séances), en paliers entiers plafonnés à 3 reps, sans rien rendre quand
l'exercice est fait plus tôt que d'habitude ; et la première série au poids du corps suit les reps démontrées la
dernière fois. C'est un choix fait pour suggérer la série suivante, pas pour comparer des séances. Le moteur de
suggestion n'est pas touché par ce chantier.

## 3. Méthode (`lib/engines/capacity-trend.ts`)

- **Contexte d'une série** (`setContext`) : séries comptées comme dans l'Historique (RIR 3 = 0,75, RIR 4+ = 0,5),
  faites avant elle dans la séance par les autres exercices ; parmi elles, ce qui a travaillé le muscle principal de
  l'exercice, au coefficient du profil (un développé à 0,5 triceps compte une demi-série pour des dips).
- **Coût du contexte, appris** (`learnContextCost`, `learnContextCosts`) : pour chaque exercice, deux séances
  consécutives (28 jours au plus, RIR déclaré sur la meilleure série des deux) forment une paire. L'écart de capacité
  en reps jusqu'à l'échec (au poids du corps), ou ramené en reps par la règle d'Epley de la capacité (charge moyenne de
  la paire), est régressé sur l'écart de contexte : moindres carrés, la progression moyenne d'une séance à l'autre reste
  libre, bornes [0 ; 2] reps par série. Par axe (charge, reps au poids du corps), chaque axe rétréci vers le coût de tous
  les exercices, lui-même rétréci vers l'ancienne règle fixe rendue continue (0,25 rep par série, +1/3 par série du même
  muscle), qui vaut 30 paires : un nouvel utilisateur la garde. Au 12/10 : à une charge, 0,11 rep par série faite avant
  et 0,60 de plus par série du même muscle (146 paires) ; au poids du corps, 0,22 et 0,62 (22 paires, Dips et HSPU).
- **Capacité d'une séance** : sa meilleure série, 1RM estimé sur reps + RIR + reps que le contexte a coûtées (ou ces
  reps au poids du corps). C'est la courbe de Progrès › Exercices (« ≈ 22 à frais »).
- **Prévision et tendance** (`capacityTrend`) : la prévision d'une séance récente est le niveau des 3 séances d'avant,
  ramené à son contexte ; la tendance (`delta`, `deltaPct` pour Barbis) est l'écart moyen géométrique des 3 dernières
  séances à cette prévision. Une reprise après plus de 28 jours sans l'exercice repart de zéro (comme la table des
  séances de Barbis) : il faut 4 séances depuis.
- **Seuil** (`trendNoise`) : progression ou baisse seulement au-delà de 1,645 erreur-type (5 % de fausses alertes par
  sens). L'erreur-type vient du bruit de l'exercice d'une séance à la suivante (moitié de la variance des écarts de log
  de capacité entre séances consécutives, RIR déclaré, 28 jours au plus), rétréci vers celui de son axe (poids 4 paires),
  lui-même rétréci vers un a priori de 5 % à une charge et 10 % en reps (poids 8 paires). Au 12/10 : ±5,7 % pour les
  Lateral raises, ±12,4 % pour les Dips (`deltaThreshold`).
- **Une séance seule** (`sessionForecastGap`) : écart de la séance à la prévision tirée de ses 3 séances d'avant, avec
  le seuil d'une séance seule. C'est la « capacité face à la tendance » de la table des séances de Barbis
  (`capacity.vsTrendPct`) et la condition d'une baisse au bilan de séance.

Où c'est lu, une seule source : Progrès › Exercices (statut, filtre « En baisse », texte du détail qui donne l'écart et
le seuil), `GET /api/barbis/training-state` (`exercises[].status` et `deltaPct`, mêmes champs et mêmes valeurs ;
`definitions.trend` ; nouveau champ `trendMethod`, la méthode en une phrase à afficher telle quelle :
« 3 dernières séances contre ce que Jeera prévoyait d'après les 3 d'avant, fatigue de séance comprise »), la table des
séances (`capacity.vsTrendPct`) et le bilan de séance : « Dips : 3 reps de moins » n'y est plus dit quand la séance est à
la hauteur de ce que Jeera prévoyait compte tenu de sa place dans la séance ; une vraie baisse reste dite, avec son écart
à la prévision (`session-insights.ts`, `SESSION_INSIGHTS.DECLINE_MIN`).

## 4. Mesure (export lecture seule du 12/10/2026, 75 séances ; ancien moteur = `3767f47`)

Ligne du bilan de Barbis au lundi 12/10 06:00, calculée par `buildTrainingState` :

- avant (4 premiers progrès) : « Progresse : Dips machine +23,1 %, Traction pronation large +10,5 %, Wide Chest Press Technogym +9,5 %,
  Tirage horizontal poulie basse +8,6 % · en baisse : Dips −9,1 %, Lateral raises −3,5 % » ;
- après : « Progresse : Tirage horizontal poulie basse +13,0 %, Curl incliné +12,4 %, Wide Chest Press Technogym
  +10,3 % (3 dernières séances contre ce que Jeera prévoyait d'après les 3 d'avant, fatigue de séance comprise) ».
  Dips : plateau, −3,0 % (seuil ±12,4 %) ; Lateral raises : stable, +2,2 % (±5,7 %) ; Dips machine : 3 séances depuis la
  reprise, pas encore de tendance.

Dips, les 6 séances de la fenêtre :

| Séance | Rang | Séries avant (même muscle) | Meilleure série | Capacité avant | Capacité après | Fenêtre |
|---|---|---|---|---|---|---|
| 08/09 | 3/4 | 2,0 (0,4) | PDC × 20 | 22,0 | 22,7 | 3 d'avant |
| 09/09 | 8/8 | 16,0 (3,4) | PDC × 15 | 20,0 | 22,6 | 3 d'avant |
| 18/09 | 5/5 | 10,0 (3,3) | PDC × 15 | 20,0 | 21,2 | 3 d'avant |
| 21/09 | 9/9 | 18,0 (3,3) | PDC × 11 | 17,0 | 19,9 | 3 dernières |
| 27/09 | 6/9 | 11,0 (4,5) | PDC × 16 | 20,0 | 22,6 | 3 dernières |
| 05/10 | 5/8 | 11,0 (4,3) | PDC × 15 | 20,0 | 22,0 | 3 dernières |

Lateral raises : avant, 20,3 (16 × 8) contre 21,0 (14 × 12 du 01/10, fait après 9,5 séries) = −3,5 % ; après, moyenne
des 3 dernières (20,6 ; 19,8 ; 20,6) contre celle des 3 d'avant (21,1 ; 18,9 ; 19,7) = +2,2 %.

Statuts annoncés chaque lundi 06:00 du 24/08 au 12/10 (exercices de la salle actuelle) : avant, 74 « progrès » et
10 « baisses » (Dips chaque lundi depuis le 14/09, HSPU −16 % le 05/10, Lateral raises le 12/10) ; après, 25 et 0.
Les « progrès » de fin août (Dips +70 %, HSPU +42 %) comparent des séances d'avant le 17/08, sans RIR (capacité comptée à
l'échec), à des séances avec RIR : la transition, pas une tendance. Depuis le 14/09 : 2 à 3 progrès par lundi.

Écart de chaque séance à la moyenne de ses 3 séances d'avant, séances depuis le 17/08 dont les 3 d'avant ont un RIR,
pentes à l'intérieur de chaque exercice, bootstrap par séance :

| Méthode | Axe | Séances d'exercice (séances) | Écart moyen | Par série faite avant | Par série du même muscle | Par rang |
|---|---|---|---|---|---|---|
| Avant | tous | 112 (28) | +1,58 % [−0,00 ; +3,19] | −0,43 % [−0,83 ; +0,02] | −1,67 % [−3,63 ; −0,06] | −1,40 % [−2,30 ; −0,21] |
| Après | tous | 112 (28) | +1,71 % [+0,48 ; +2,91] | −0,20 % [−0,55 ; +0,18] | −0,37 % [−1,98 ; +1,11] | −0,76 % [−1,54 ; +0,27] |
| Après | charge | 94 (28) | +2,11 % [+1,04 ; +3,14] | −0,04 % [−0,26 ; +0,28] | −0,16 % [−1,64 ; +1,53] | −0,31 % [−0,90 ; +0,57] |
| Après | reps (poids du corps) | 18 (13) | −0,40 % [−6,00 ; +5,43] | −0,65 % [−1,60 ; +0,45] | −1,84 % [−8,85 ; +5,83] | −1,91 % [−3,97 ; +0,75] |
| Avant, depuis le 21/09 | tous | 58 (11) | +1,41 % [−1,05 ; +3,95] | −0,78 % [−1,35 ; −0,09] | −2,15 % [−6,52 ; +0,41] | −2,13 % [−3,29 ; −0,27] |
| Après, coût appris avant le 21/09 | tous | 58 (11) | +1,99 % [−0,19 ; +3,99] | −0,54 % [−1,08 ; +0,05] | +0,49 % [−2,79 ; +2,65] | −1,41 % [−2,52 ; +0,15] |
| Après, coût appris avant le 21/09 | charge | 49 (11) | +2,92 % [+1,56 ; +4,17] | −0,12 % [−0,60 ; +0,32] | +0,82 % [−1,79 ; +2,94] | −0,35 % [−1,50 ; +0,89] |
| Après, coût appris avant le 21/09 | reps (poids du corps) | 9 (6) | −3,08 % [−11,45 ; +5,48] | −1,98 % [−2,57 ; −0,59] | −3,16 % (intervalle inutilisable) | −4,59 % [−6,02 ; −1,19] |

- L'écart moyen n'est pas nul et ne doit pas l'être : c'est la progression moyenne d'Evan (une séance fait en moyenne
  1,7 % de plus que ses 3 précédentes, ≈ 0,7 rep). Ce qui compte : il ne dépend plus du contexte.
- À une charge (94 séances d'exercice sur 112), la dépendance au rang et aux séries faites avant a disparu, y compris
  hors échantillon (coût appris sur les séances d'avant le 21/09, jugé sur celles d'après).
- Fausses alertes : les 6 dernières séances de chaque exercice (16 exercices) réparties de toutes les façons possibles
  entre « 3 dernières » et « 3 d'avant » (aucune tendance, même dispersion) : avant, 33 % de « progrès » et 21 % de
  « baisses » ; après, 5 % et 5 %, le taux visé.

## 5. Limites

- **Poids du corps (Dips, HSPU)** : 22 paires seulement. Le coût appris réduit la dépendance au contexte (−1,30 % par
  série faite avant → −0,65 %, rang −3,59 % → −1,91 %) sans l'annuler, et hors échantillon il en reste (−1,98 % par
  série sur 9 séances). Le seuil de ces exercices est large (±12 %) : 10 séries de plus avant les dips pèsent encore
  ≈ −6 % dans l'écart, sous le seuil. Le coût de l'axe s'affine à chaque séance.
- **Démarrage** : avec peu de paires, le coût appris bouge (même muscle : 1,49 rep le 24/08 avec 14 paires, 0,60 le
  12/10 avec 146) ; l'a priori de 30 paires le contient.
- Aucune baisse annoncée sur les 8 lundis mesurés, période où Evan progresse en moyenne ; la méthode en annonce une dès
  que l'écart sort du bruit (test « une vraie baisse, au même placement, est annoncée »).
- Le moteur de suggestion garde sa propre fatigue de séance (excès sur l'habitude, paliers entiers) et le facteur de
  conversion entre machines équivalentes (`equivalence.ts`, `freshCapacity`) garde l'ancienne règle fixe : les
  remplacer par le coût appris changerait les suggestions, décision à part.
- Un seul pratiquant, RIR déclaré depuis le 17/08 ; la mesure suppose 1 RIR = 1 rep.

## 6. Relancer la mesure

Les données ne sont jamais commitées : les scripts refusent d'écrire leur sortie dans le dépôt.

```sh
cd web
D=~/jeera-audit
# 1. Export en lecture seule (rôle Neon barbis_backup ; jamais le .env, qui pointe sur la prod en écriture)
JEERA_READONLY_DATABASE_URL="$(security find-generic-password -s jeera-backup-database-url -w)" \
  npx tsx scripts/suggestions-audit/export-data.ts $D/export.json
# 2. Statuts de chaque lundi et écarts par séance, avec ce moteur (et le coût appris avant une date, hors échantillon)
TZ=Europe/Paris npx tsx scripts/suggestions-audit/tendance.ts $D/export.json $D/nouveau.jsonl --depuis 2026-08-24 --au 2026-10-12 --hors-echantillon 2026-09-21
# 3. Même chose avec un autre moteur, depuis son propre worktree (ici la branche principale d'avant ce chantier)
cd <autre worktree>/web && TZ=Europe/Paris npx tsx --tsconfig ./tsconfig.json <ce worktree>/web/scripts/suggestions-audit/tendance.ts \
  $D/export.json $D/ancien.jsonl --depuis 2026-08-24 --au 2026-10-12
# 4. Comparaison (et prévision du moteur de suggestion, avec le rejeu de `replay.ts`)
TZ=Europe/Paris npx tsx scripts/suggestions-audit/replay.ts $D/export.json $D/rejeu.jsonl
npx tsx scripts/suggestions-audit/tendance.ts --comparer $D/ancien.jsonl $D/nouveau.jsonl --rejeu $D/rejeu.jsonl
```
