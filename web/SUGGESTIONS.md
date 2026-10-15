# Suggestions de charges et de reps : méthode, mesure, réglages

Ce fichier explique comment le moteur (`lib/engines/progression.ts`) prévoit la série suivante, comment l'app en tire
la cible à battre qu'elle affiche, comment on vérifie les deux sur l'historique réel, et comment relancer cette
vérification. Le moteur est amélioré, jamais remplacé (règle du dépôt : « Progression algorithm stays »).

## 0. Deux couches : la prévision et la cible à battre

Evan, 11/10/2026 : « je vois la suggestion affichée comme quelque chose à battre -> son but est de me pousser à donner
le meilleur de moi-même, constamment me dépasser en charges ou reps ». Le moteur a donc deux couches :

- **la prévision** (interne, `suggest()` sans `target`, et `SetSuggestion.prediction` quand la cible est construite) dit
  ce qu'il fera, sans biais : perte de reps apprise, séries ancrées sur la dernière série (sections 2 et 3). Elle sert à
  la reprojection quand il change le poids (« À 130 kg, le moteur prévoit N reps »), à `predictedRepsAtActualWeight`
  (donc au décalage appris et à la marge d'ambition), au bilan des anciennes séances ;
- **la cible** (affichée, enregistrée dans `suggestedWeight` / `suggestedReps`, donc lue par le compteur, le combo, le
  bilan, l'Historique, la Discipline et Barbis) est construite sur la prévision par `lib/engines/target.ts`. Le bilan et
  la Discipline jugent la meilleure série de chaque exercice contre la cible enregistrée sur sa 1re série
  (`storedFirstSuggestions`, `bilan.ts`) ; elle n'est recalculée que si elle manque (séances d'avant le 15/08).

Charge et reps de la cible (refaites le 15/10/2026, section 7) : la cible doit être cohérente avec ce qu'il vient de
faire, avant d'être juste. Elle part de la charge de la dernière série (1re série : celle du moteur ; montée du moteur
gardée si elle reste cohérente ; juste après un essai quasi maximal : la charge de travail d'avant l'essai), ne monte
jamais après une série finie au RIR 0-1 en bas de fourchette ou en dessous, ne demande jamais plus que le 1RM estimé
qu'il a montré dans la séance ni, à charge égale ou plus lourde, plus de reps que la série qu'il vient de finir au RIR
0-1 (reps + RIR), et se ramène dans la fourchette : quand la prévision à cette charge tombe sous le bas de
la fourchette, la charge baisse d'un cran à la fois jusqu'à ce que le bas soit à portée de `TARGET.RANGE_STRETCH`
(2) reps au-dessus de la prévision plus la marge, puis la cible le demande ; plus légère que la dernière série, elle en
demande au moins les reps (une de moins après une série à l'échec). Après une série LOURDE (reps au RIR visé sous la
fourchette, à au moins un cran au-dessus de sa charge de travail habituelle), elle part de la charge de retour (celle de
la prévision, ou au moins 11 % plus léger) et n'y remonte pas. Juste après un essai, pas d'étirement : la cible garde la
fatigue de l'essai. L'ancienne règle (garder la charge, décrocher d'un ou deux crans sous repMin − 2,7,
plancher repMin − 3) laissait 39 % des cibles sous la fourchette et permettait 127,5 × 1 après 100 × 8.

Reps de la cible : prévision à cette charge + marge d'ambition, pour qu'il la batte un peu moins d'une fois sur deux
(objectif 35 % depuis le 15/10/2026, « légèrement optimiste », sections 7 et 7.5 ; avant : 50 %). Atkinson, 1957 : motivation
maximale à probabilité de réussite intermédiaire ; Locke et Latham : un objectif difficile mais atteignable bat un
objectif facile. « Battre » est la définition unique de l'app (`setVersusSuggestion`,
`lib/engines/versus.ts`, section 4.3).
La marge est apprise sur les séries enregistrées par un moteur à deux couches (prévision stockée contre reps faites),
pondérées par l'âge (demi-vie 28 jours), par contexte (1re série, séries suivantes), rétrécie vers le global (poids 10)
puis vers un a priori (poids 10 ; part battue avec une marge de −1, 0, 1, 2 reps : 0,64 / 0,45 / 0,25 / 0,11, mesurée
avant le 21/09 sur 272 séries), bornée à [−1 ; 2]. Sans historique, la marge vaut +0,5 rep (objectif 35 %). Une boucle
de long terme la corrige, par contexte, sur les cibles battues À LA CHARGE DE LA CIBLE (ailleurs, le verdict dépend de la
charge choisie, pas des reps visées) : au-delà de l'objectif + 5 points, + 0,5 rep ; en deçà de l'objectif − 5 points,
− 0,5 (jusqu'au 15/10, 45-55 % codés en dur).
Ni la courbe (reps faites contre prévision) ni la boucle (même charge) ne lisent le verdict d'une série faite à une autre
charge : la règle du 12/10 (4.3) ne change aucune cible, rejouées série pour série (1 300 sur 1 300).

Raison affichée : « Cible à battre : tu fais d'habitude 6 à 7 ici » (prévision au RIR visé, et une rep de plus à
l'échec) ; « Cible à battre : le bas de ta fourchette, tu fais d'habitude 6 à 7 ici » quand la fourchette relève la
cible ; « Cible à battre après ton essai lourd : retour à ta charge de travail, … » juste après un essai.

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

**Perte proportionnelle (15/10/2026).** À charge égale, il perd 2,9 reps après une série en haut de fourchette, 1,6 en
bas, presque rien en dessous, contre 2,25 appris partout (rejeu du 15/10). La perte est maintenant un TAUX (reps
perdues par rep de la série d'avant, au RIR visé), appris comme la perte (rapport des sommes pondérées, a priori = toutes
les paires plus la constante de classe ramenée à une série de 10 reps, poids 5 ; exercice rétréci vers l'a priori,
poids 4), borné à [0,03 ; 0,45] ; la perte d'une série = taux × ses reps au RIR visé (`learnedRepDrop(..., reps)`,
`repDropAfter`). Étude par paires sans fuite : erreur 1,56 → 1,37 rep, 1,51 → 1,35 sur les paires d'après le 21/09 ;
la forme a été suggérée par toute la période, les poids n'ont pas été réglés.

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
- **Raison lisible** (`suggestion-reason.ts`) : « Cible à battre : tu fais d'habitude 6 à 7 ici » pour la cible ; sans
  couche cible, « tu perds d'habitude 2,5 reps d'une série à l'autre ici » quand la perte apprise vient de l'exercice.
- Version du moteur : `web-v2.3-2026-10-11` (`SUGGESTION_ENGINE_VERSION`).

Inchangés : premières séries chargées (mêmes prévisions, série pour série), test de plateau, conversion 7,5 % (Epley faisait
pire sur l'historique : erreur 4,50 contre 2,34 sur 246 séries faites à une autre charge).

## 4. Résultat du rejeu (11/10/2026, ancien moteur contre nouveau, mêmes 439 séries, 31 séances)

### 4.1 La prévision

| Contexte | Séries (séances) | Erreur ancien → nouveau | Différence [IC 95 %] | Écart ancien → nouveau |
|---|---|---|---|---|
| Toutes les séries | 439 (31) | 2,35 → 1,85 | −0,50 [−0,66 ; −0,33] | −0,81 → +0,05 |
| Hors échantillon (à partir du 21/09) | 171 (11) | 2,13 → 1,81 | −0,32 [−0,56 ; −0,10] | −0,81 → +0,31 |
| Séries 2+, hors échantillon | 98 (11) | 2,16 → 1,59 | −0,58 [−0,97 ; −0,15] | −1,77 → +0,45 |
| 1re série de l'exercice | 180 (31) | 2,20 → 2,05 | −0,14 [−0,33 ; +0,02] | +0,58 → +0,20 |
| 2e série | 138 (30) | 2,40 → 1,82 | −0,58 [−0,91 ; −0,28] | −1,49 → −0,02 |
| 3e série | 79 (29) | 2,31 → 1,56 | −0,75 [−1,22 ; −0,28] | −1,92 → −0,10 |
| 4e série et plus | 42 (25) | 2,92 → 1,67 | −1,25 [−2,05 ; −0,60] | −2,47 → −0,08 |
| Même charge que la série d'avant | 152 (31) | 2,54 → 1,79 | −0,75 [−1,07 ; −0,43] | −1,87 → −0,34 |
| Plus léger que la série d'avant | 79 (25) | 2,51 → 1,69 | −0,82 [−1,40 ; −0,26] | −1,79 → +0,56 |
| Branche « baisser d'un cran » | 54 (26) | 3,90 → 1,45 | −2,46 [−3,43 ; −1,62] | −3,83 → +0,84 |
| Branche « garder la charge » | 71 (26) | 1,75 → 1,34 | −0,41 [−0,73 ; −0,09] | −1,41 → −0,22 |
| Séries de retour | 29 (18) | 2,48 → 1,57 | −0,91 [−1,82 ; −0,11] | −2,41 → +0,57 |
| Test de plateau | 35 (15) | 1,05 → 1,05 | 0,00 [−0,22 ; +0,25] | −0,44 → −0,10 |
| Série 2+ enchaînée | 126 (30) | 2,92 → 1,75 | −1,17 [−1,57 ; −0,77] | −2,42 → −0,35 |
| Série 2+ alternée (superset) | 133 (29) | 2,02 → 1,68 | −0,33 [−0,60 ; −0,08] | −1,17 → +0,22 |
| Moins de 3 min depuis la série d'avant | 44 (22) | 3,42 → 2,11 | −1,31 [−2,16 ; −0,56] | −2,98 → −1,09 |

Tests pré-déclarés (t robuste par séance, Holm sur les 4 tests de gain) : toutes séries p < 0,001 ; séries 2+ p < 0,001 ;
hors échantillon p = 0,023 (Holm 0,046) ; séries 2+ hors échantillon p = 0,026 (Holm 0,046). Le hors échantillon ne
couvre que le réglage des constantes : la forme des changements vient de l'audit, qui a vu toute la période.

À part : séries au poids du corps faites en finisher, 5,17 → 5,91 d'erreur (23 séries, 16 séances), l'ancien plafond
tombant par hasard plus près ; 1res séries au poids du corps de travail, 4,46 → 3,46 (26 séries, 16 séances).

Ce que le moteur avait appris au 11/10/2026 (a priori : 2,32 reps) : Lateral raises 2,1 (27 paires), Abdominal LifeFitness
2,5 (14), Curl incliné 1,8 (10), HSPU 3,1 (10), Dips 2,5 (9), Curl debout 2,4 (8), Preacher Curl 2,2 (6), Rear delt fly
2,8 (6), Total Abdominal 3,0 (6), Wide Chest Press 1,9 (5), Tractions SN 2,7 (5), Extension triceps poulie 2,6 (4).

### 4.2 La cible à battre

Rejeu simulé (`replay.ts --simuler`) : comme si ce moteur avait tourné depuis le début, chaque série gardant la cible et
la prévision qu'il aurait enregistrées (la marge s'apprend sur elles). Séries jugées depuis le 17/08 (445, 31 séances) ;
« vécu » = cibles réellement affichées à l'époque. Intervalles par bootstrap par séance.

| Contexte | Vécu | Ancien moteur rejoué | Nouveau | Nouveau, à la charge de la cible |
|---|---|---|---|---|
| Toutes les séries | 37 % | 33 % | 43 % [37 ; 48] | 49 % (208 séries) |
| Avant le 21/09 (réglages) | 39 % | 33 % | 38 % | 48 % |
| Depuis le 21/09 (hors échantillon) | 35 % | 32 % | 50 % [44 ; 56] | 50 % |
| 1re série | 51 % | 49 % | 45 % [37 ; 53] | 42 % |
| 2e série | 28 % | 24 % | 41 % [32 ; 50] | 44 % |
| 3e série et plus | 27 % | 19 % | 42 % | |

- 1res séries, 51 % vécus contre 45 % : la cause est dans la prévision, pas dans la cible. Sur les 181 premières séries,
  18 cibles changent sans simulation, toutes au poids du corps (HSPU, Dips : le plafond retiré, 11,4 → 15,2 reps visées,
  battues 67 % → 28 %) ; en simulation, le décalage appris du moteur se recale sur les nouvelles prévisions et relève de
  0,3 rep 77 premières séries chargées (48 % → 42 %). La marge négative ramène vers 50 % autant que les reps entières le
  permettent : avec ses séries, une rep de moins donnerait 64 %, la marge 0 donne 45 %.
- Après une série lourde (33 cas, 22 séances) : 45 % de cibles battues contre 12 % avec l'ancien moteur ; la nouvelle
  cible du 11/10 après 150 × 6 est 120 × 11 (au lieu de 145 × 4).
- Prévision : erreur 2,35 → 1,85 sans simulation, 1,90 [1,74 ; 2,06] en simulation.
- Écart entre la charge de la cible et celle qu'il prend (séries 2+, médiane) : 5,0 % avec l'ancien moteur, 8,3 % avec le
  correctif « plancher à −15 % » essayé puis retiré, 3,8 % avec la cible.
- Jeu en séance (même calcul que l'en-tête) : 6,5 cibles battues par séance avec la cible, contre 5,4 vécues et 5,0 avec
  l'ancien moteur rejoué (sur 15,4 séries jugées) ; meilleur combo moyen 2,9 contre 2,5 et 2,4.

### 4.3 « Battre » : une seule règle, celle du moteur (décision d'Evan du 12/10/2026)

Avant : une série à une autre charge que la cible était jugée par les 1RM d'Epley (reps dans la fourchette exigées).
Epley compte 1 rep pour 2,5 à 3 % de charge, le moteur 1 rep pour 7,5 % : une série plus légère devait faire environ
trois fois plus de reps en plus que ce que le moteur lui-même prévoit à cette charge, et ne comptait presque jamais comme
battue. Mesure présentée à Evan le 11/10 (règle 7,5 % pour les séries plus légères, reps dans la fourchette exigées :
52 % de cibles battues, 7,4 par séance, combo 3,7) ; il a choisi cette variante le 12/10.

Règle (`versusReference`, `lib/engines/versus.ts`), pour le compteur, le combo, le bilan, l'Historique, la Discipline,
`sessionGame` (donc Barbis, `/api/barbis/training-state`) et la marge de `target.ts` :

- à la charge de la cible : plus de reps = battue, autant = tenue, moins = en dessous ;
- à une autre charge, les reps doivent atteindre `repTargetMin`, sinon en dessous ;
- plus lourd : battue. C'est ce que donnait Epley 64 fois sur 65 (cibles vécues) et 59 sur 61 (cibles du moteur) ; la
  règle 7,5 % appliquée aussi aux séries plus lourdes n'en aurait gardé que 33 et 42, contre « me dépasser en charges
  ou reps » (Evan, 11/10) ;
- plus léger : reps de la série ramenées à la charge de la cible (`repsAtLoad` : 7,5 % de sa charge effective = 1 rep,
  au moins un cran ; poids du corps par défaut du moteur, pour qu'une pesée ne change pas le verdict d'une série
  passée), arrondies comme les reps affichées, puis comparées aux reps de la cible.

« Tenir » (`heldReference`) suit la même conversion : au plus une rep de moins, ramenée à la charge de la
référence (avant : 97 % du 1RM d'Epley, la même rep de marge à charge égale). Plus aucun 1RM d'Epley ne juge une cible.
Les records gardent leurs règles (`classify`) ; la meilleure série d'un exercice au bilan reste choisie par capacité
(Epley, comme les records) : la choisir par la nouvelle règle ne changerait le verdict que d'un exercice sur 220.

Avant/après, mêmes séries, calculés par les fonctions de l'app (`jeu.ts`, séances du 17/08 au 11/10 ; « avant » = le
même script lancé sur le moteur de `bf02350`) :

| Cibles | | Battues | Battues par séance | Meilleur combo moyen | Bilan : exercices au-dessus, records compris (tenus) |
|---|---|---|---|---|---|
| Vécues (affichées à l'époque, 460 séries, 30 séances) | avant | 37 % | 5,6 | 2,6 | 75 % (5 %) |
| | après | 41 % | 6,3 | 3,0 | 81 % (8 %) |
| Moteur actuel, rejeu simulé (478 séries, 31 séances) | avant | 42 % | 6,5 | 2,9 | 64 % (13 %) |
| | après | 51 % | 7,8 | 3,9 | 71 % (17 %) |

Discipline de la fiche : elle jugeait la meilleure série contre la prévision recalculée (`career.ts` appelait
`buildSessionReview` sans les cibles enregistrées), pas contre la cible affichée. Depuis le 12/10 elle juge contre la
cible de la 1re série, comme le bilan (une seule vérité), recalculée seulement quand elle manque :

| Discipline | 28 derniers jours (101 exercices) | Depuis le 17/08 (191) |
|---|---|---|
| Avant (Epley, contre la prévision recalculée) | 77 % | 73 % |
| Règle du moteur, contre la prévision recalculée | 86 % | 83 % |
| Règle du moteur, contre la cible affichée (cibles vécues) | 93 % | 89 % |
| Règle du moteur, contre la cible affichée (cibles du moteur actuel, rejeu simulé) | 89 % | 88 % |

Le « 74 % » annoncé le 11/10 venait d'une réplique Python sans les records ni les séries tenues au poids du corps.

Par contexte (`report.ts`, rejeu simulé, 445 séries de l'audit ; avant = Epley, après = règle du moteur ; cibles
identiques) :

| Contexte | Avant | Après [IC 95 %] | À la charge de la cible |
|---|---|---|---|
| Toutes les séries | 43 % | 52 % [46 ; 58] | 49 % (208) |
| Avant le 21/09 | 38 % | 48 % [41 ; 56] | 48 % (132) |
| Depuis le 21/09 | 50 % | 58 % [51 ; 65] | 50 % (76) |
| 1re série | 45 % | 52 % [44 ; 60] | 42 % (93) |
| 2e série | 41 % | 50 % [42 ; 58] | 44 % (66) |
| 3e série | 42 % | 56 % [44 ; 67] | 69 % (35) |
| 4e et plus | 43 % | 50 % [32 ; 69] | 71 % (14) |
| Retour plus léger que la série d'avant | 43 % | 70 % [58 ; 82] | 100 % (7) |

La boucle de marge vise toujours la moitié dans ses deux contextes : 52 % de cibles battues en 1re série comme aux
séries suivantes, rien à réajuster. Le retour après une série plus lourde est battu 70 % du temps : la cible y garde
souvent une charge qu'il quitte, et la série plus légère dans la fourchette la bat (les cas extrêmes comme 80 × 2 sont
réglés par le plancher, section 0). À suivre avec `report.ts --depuis` sur ses vraies séances.

## 5. Limites

- Un seul pratiquant, 8 semaines de RIR. Le RIR est déclaré ; la mesure suppose 1 RIR = 1 rep, comme le moteur.
- Les effets en chaîne (une autre charge proposée ensuite) ne sont pas observables : l'historique a été fait avec l'ancien
  moteur. On mesure la prévision à la charge réellement prise.
- Le repos reste la principale source d'erreur des séries 2+ (moins de 3 min : encore −1,1 rep) ; il n'est connu qu'une
  fois la série faite.
- Rejouer un vieil historique utilise le catalogue d'aujourd'hui (fourchettes, charges max).
- La cible change ce qu'il voit, donc peut-être ce qu'il fait : le rejeu juge ses séries réelles, faites face aux
  anciennes cibles. Le vrai taux se lira dans quelques semaines (`report.ts`, table « Cibles battues »).

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
# 4. Le jeu tel que l'app le compte (battues, combo, Discipline, bilan), cibles vécues ou celles d'un rejeu
TZ=Europe/Paris npx tsx scripts/suggestions-audit/jeu.ts ~/jeera-audit/export.json --depuis 2026-08-17 --au 2026-10-11 [--cibles ~/jeera-audit/nouveau.jsonl]
# 5. Ce que le moteur a appris, exercice par exercice
npx tsx scripts/suggestions-audit/rep-drops.ts ~/jeera-audit/export.json
# Réglage : `replay.ts ... --set SHRINK_K=4 --set TARGET.HALF_LIFE_DAYS=28 --set ALGO_V2.CLE=v`, comparé sur une période
# Cible : `replay.ts ... --simuler` (le moteur « en service depuis le début »), puis `report.ts ... --depuis 2026-08-17`
# 6. Critères du moteur fiable (section 7) : prévision, cible, invariants, séance par séance ; `--au` pour régler
npx tsx scripts/suggestions-audit/criteres.ts ~/jeera-audit/base-sim.jsonl ~/jeera-audit/nouveau-sim.jsonl --split 2026-09-21 --seance 2026-10-13 [--au 2026-09-21] [--json sortie.json]
# 7. Invariants sur des séances tirées au hasard, jouées dans le store (400 par défaut ; 10 000 le 15/10 : zéro violation)
SEEDS=10000 npx vitest run lib/engines/__tests__/target-invariants.test.ts
```

## 7. Moteur fiable (15/10/2026) : critères, invariants, rejeu

Demande d'Evan (14/10), après sa séance du 13/10 (127,5 × 1 proposé après 100 × 8, 157,5 × 7 « à finir » juste après un
essai à 160 × 1, 14 × 5 après 16 × 7) : un moteur extrêmement fiable, légèrement optimiste, sans incohérence grossière,
qui se sert de tout le contexte. Journal du chantier (critères écrits avant les itérations, chaque itération chiffrée,
itérations rejetées) et rapport avant/après série par série : hors dépôt (données personnelles),
`~/.local/share/barbis-dev/jeera-fiable-data/RAPPORT.md`.

### 7.1 Les critères

Rejeu simulé (`replay.ts --simuler`), séries de travail hors compléments, étalonnage et repli ; bootstrap par séance ;
différences appariées ; Holm sur les contextes ; aucune conclusion sous 20 séries ou 8 séances ; réglages choisis sur les
séances jusqu'au 21/09, vérifiés après (`criteres.ts`).

- (a) Prévision à la charge choisie (reps au RIR 1 − prévues) : non-infériorité contre le moteur précédent, biais dans
  [−0,3 ; +0,3], part à une rep près pas en baisse.
- (b) Cible légèrement optimiste. Écart de cible = reps faites ramenées à la charge de la cible (règle 7,5 % de
  `versus.ts`) − reps de la cible : moyen dans [−1 ; −0,2], médian dans [−1 ; 0] ; cibles battues (`versus.ts`, règle
  d'Evan inchangée) dans [35 % ; 50 %] ; battues ou tenues ≥ 50 % ; moins de cibles à 3 reps ou plus de ce qu'il a fait ;
  écart de charge cible / série faite pas en hausse. Avec un bruit de ±2,7 reps, une prévision juste est battue 45 % du
  temps : « légèrement optimiste » = environ une demi-rep au-dessus de ce qu'il fera.
- (c) Invariants (`lib/engines/target-invariants.ts`), ZÉRO violation sur tout le rejeu et en test de propriété
  (`target-invariants.test.ts`, séances tirées au hasard jouées dans le store) :
  - I1 cible chargée dans la fourchette (sauf test de plateau explicite, poids du corps, charge max, cran trop grossier,
    plancher de charge) ;
  - I2 plus légère que la dernière série ⇒ au moins ses reps (une de moins après une série à l'échec, au plus le haut de
    la fourchette ; cède à I4 quand les deux ne tiennent pas ensemble) ;
  - I3 jamais plus lourde après une série finie au RIR 0-1 avec reps ≤ repMin + 1 ;
  - I4 1RM estimé (Epley, reps cible + 1) ≤ meilleur 1RM montré dans la séance (séries à RIR 0 à 3 ; une cible d'une rep
    est le plancher) ;
  - I5 juste après un essai quasi maximal (RIR ≤ 1, 4 reps au plus jusqu'à l'échec, plus lourd que les séries d'avant) :
    charge de travail ou moins, 1RM strictement sous celui d'avant l'essai ;
  - I6 « série à finir » jamais après un essai, jamais hors de portée en enchaînant (RIR + reps rendues par la baisse de
    charge), jamais plus de 30 % plus légère (au-delà, c'est une nouvelle série ; il enchaîne à 15-25 % plus léger) ;
  - ajoutés en lisant les cibles rejouées : I7 jamais au-delà de la charge max de la machine, I8 jamais de cible vide (Ab
    roller : reps `NaN` par une division par zéro dans `empiricalBase`, corrigée) ;
  - I10 (15/10) : jamais une charge hors de la grille de la machine (section 7.5) ;
  - I9 (relecture du 15/10) : à charge égale ou plus lourde que la série qu'il vient de faire au RIR 0-1, jamais plus de
    reps que ses reps + RIR (120 × 8 juste après 120 × 7 à l'échec). Une charge plus légère de moins d'une rep par la règle
    7,5 % compte comme la même (115 × 8 après 120 × 7 : non ; 110 × 8 : oui). Série de référence : la dernière hors
    complément enchaîné (le 22/09, 30 × 4 enchaînées 9 s après 35 × 7 au RIR 0 : la référence est 35 × 7). Aucune
    exception de repos : sur 146 séries faites à charge égale ou plus lourde après une série au RIR 0-1, il n'a dépassé
    reps + RIR que 3 fois (2 %), entre 5 et 10 min. Pas d'extension aux charges plus légères : plus de 5 % plus léger, il
    dépasse la règle 7,5 % une fois sur quatre (98 cas), elle ne prouve rien (essayée : 10 × 8 après 16 × 5).

### 7.2 Ce qui a changé

- `target.ts` : `chooseTarget` (charge par la fourchette sous plafonds de cohérence, étirement κ = 4 puis 2 (§7.5), plafond de
  capacité et I9, retour après essai sans étirement, `ATTEMPT_COST` = 0,5 perte, a priori faute de cas),
  `completionTarget`, objectif de la marge 40 %, boucle centrée sur l'objectif. Après I9, la grille de réglage a été
  refaite (même règle) : κ = 4 et l'objectif 35 % ou 40 % à égalité sur tous les critères déclarés ; 40 % gardé (déjà en
  place, plus proche du « une fois sur deux » du 11/10), sans regarder la période de test.
- `rep-drop.ts` : perte proportionnelle aux reps de la série d'avant (section 2).
- `progression.ts` : la couche cible lit les séries du jour (compléments compris), l'essai quasi maximal et la charge de
  travail habituelle (`SetSuggestion.usualLoad`) ; `backoff_max_sets_reached` jamais plus lourd que la dernière série.
- `store/workout.ts` : la « série à finir » passe par `completionTarget` (un cran plus léger et 8 − reps devenait 157,5 × 7
  juste après 160 × 1).
- `predict.ts` : plus de division par zéro au poids du corps sans incrément.
- Version `web-v2.5-2026-10-15`.

### 7.3 Résultat (rejeu simulé, 76 séances, mêmes séries que le moteur web-v2.4)

| Critère | web-v2.4 | web-v2.5 | Après le 21/09 (hors réglage) |
|---|---|---|---|
| (a) Erreur de prévision (465 séries, 32 séances) | 1,96 [1,80 ; 2,11] | 1,89 [1,73 ; 2,05] | 1,97 → 1,78, −0,19 [−0,32 ; −0,07], p Holm 0,002 |
| (a) Biais / part à une rep près | −0,03 / 45 % | −0,09 / 50 % | +0,17 → +0,16 / 42 → 50 % |
| (b) Écart de cible moyen (467 séries) | +0,49 [+0,18 ; +0,79] | −0,18 [−0,42 ; +0,06] | +0,65 → −0,10 [−0,44 ; +0,26] |
| (b) Cibles battues | 52 % [46 ; 57] | 41 % [37 ; 45] | 56 → 43 % |
| (b) Battues ou tenues | 64 % | 57 % | 67 → 58 % |
| (b) Cibles à 3 reps ou plus | 25 % | 19 % | 24 → 14 % |
| (b) Écart de charge médian, séries 2+ | 5,0 % | 3,6 % | 4,3 → 3,6 % |
| Cibles chargées sous la fourchette | 190 / 406 | 0 hors exceptions (tests de plateau, compléments) | |
| (c) Violations d'invariants (1 324 cibles) | 565 (dont I9 : 8) | 0 | |

Par contexte : 1re série écart −0,23, battues 48 % ; séries suivantes −0,14, 36 % ; juste après un essai ou une série
lourde (55 séries) −0,39, 31 %. L'écart moyen global (−0,18) est à la limite de la bande visée (−0,2 ; −0,23 sur la
période de réglage). Les cibles relevées par la fourchette (37 % des séries) le sont de 1,4 rep au-dessus de la
prévision mais ne ratent que de 0,31 rep (battues 32 %, battues ou tenues 50 %).

Itérations rejetées (journal) : charge ramenée dans la fourchette sans étirement (écart de charge 20,6 %, 8 kg × 8 aux
élévations latérales après 16 × 7) ; correction apprise par séries du même muscle faites avant (test 1,97 → 2,06) ; rang
dans la séance (1,97 → 2,03). Piste non concluante : après plus de 14 jours d'arrêt, il fait 1,5 rep de plus que prévu
(17 séries, sous le seuil).

### 7.4 Limites

- La forme de la perte proportionnelle et l'étirement viennent d'une lecture de toute la période ; seuls les réglages
  numériques sont choisis avant le 21/09. Le gain de prévision n'apparaît qu'après le 21/09 (+0,02 avant).
- L'objectif « légèrement optimiste » est atteint de justesse : écart −0,18 sur toutes les séries (bande visée
  [−1 ; −0,2]), battues 41 % ; les 1res séries sont battues 48 % du temps, les séries suivantes 36 %.
- Familles encore visibles (relecture du 15/10) : au poids du corps ou à la charge max d'une machine, la cible suivante
  est ramenée au haut de la fourchette (Dips : 0 × 12 après 0 × 20 au RIR 2), préexistant ; après une série courte à
  l'échec, une cible plus légère relevée au bas de la fourchette bien au-delà de la règle 7,5 % (Crunch : 37,5 × 10 après
  50 × 3 au RIR 0 ; 7 cas), effet de κ = 4 (réduit par κ = 2, §7.5).
- Essais quasi maximaux : 7 dans l'historique, 4 suivis d'une vraie série. Leur coût (0,5 perte) est un a priori.
- Le rejeu juge ses séries réelles, faites face à d'autres cibles : une cible qui le pousse peut changer ce qu'il fait.

### 7.5 Séance du 15/10 : grille des machines, charge égale après l'échec, réglage refait

- **Grille de charges (I10).** Une cible ne propose jamais une charge qui n'existe pas sur la machine
  (`lib/engines/load-grid.ts`) : pas = `smallestIncrement`, décalage = `Exercise.loadOffset` (colonne `load_offset`,
  migration 0017, nulle = 0 ; une pile 29, 31, 33 = pas 2, décalage 1), charge max toujours valide, 0 toujours valide
  pour un lesté ou un assisté. La cible part de la grille (une charge saisie hors grille, 72,5 sur une poulie de 6 en 6,
  repart vers le bas), monte et descend d'un point de la grille à la fois ; la série à finir, l'échauffement, le point
  de départ d'une machine équivalente et le mode Beast aussi. Le 72,5 venait de là : la cible gardait la charge saisie
  et se décalait d'un cran depuis elle. Grilles déduites des charges qu'il saisit, à valider par Evan avant toute
  écriture en base (liste hors dépôt, `jeera-fiable-data/GRILLES-A-VALIDER.md`).
- **Charge égale après une série au RIR 0-1** (15/10 : 120 × 8 redemandé après 120 × 8 au RIR 0, il a fait 100 × 10) :
  la cible demande au plus reps + RIR − 2 (`TARGET.SAME_LOAD_AFTER_FAILURE_GAP`). Sur 133 séries suivantes à charge
  égale : reps + RIR battues 3 %, − 1 : 12 %, − 2 : 28 % avant le 21/09 (37 % après), − 3 : 54 % ; − 2 est le plus proche
  de l'objectif, côté optimiste. Une charge plus légère de moins d'une rep par la règle 7,5 % compte comme la même, pour
  I9 et pour I2 (`lighterByARep`).
- **Charge max de la machine** : plus de plafond au haut de la fourchette (la progression y passe par les reps).
- **Rejetés.** (1) Poids du corps, séries 2+ ancrées sur la série d'avant sans plafond (0 × 12 après 0 × 20 au RIR 2) :
  erreur du contexte poids du corps 2,93 → 3,00, +0,07 [−0,15 ; +0,30], hors de la non-infériorité. (2) Limiter le
  relèvement à ce que la série courte à l'échec prouve (Crunch : 37,5 × 10 après 50 × 3) : la famille passe de 9 à 7 cas
  seulement, la cible part bien plus léger que ce qu'il prend (27,5 × 10 quand il fait 40 × 4) et l'écart de charge
  monte (5,0 → 6,3 %). κ plus petit (2, ci-dessous) réduit l'effet.
- **Réglage refait** (même règle, période jusqu'au 21/09) : à égalité dans les tolérances déclarées, le plus petit κ,
  soit κ = 2 ; objectif 35 % (ne rate qu'un critère par contexte, contre deux à 30 %).
- **Résultat** (export du 15/10, 33 séances, contre web-v2.4 rejoué) : prévision 1,98 → 1,90, après le 21/09 −0,20
  [−0,32 ; −0,07], p Holm 0,008 ; écart de cible +0,52 → −0,23 [−0,48 ; +0,02], battues 52 → 41 %, à 3 reps ou plus
  25 → 20 %, écart de charge 5,5 → 5,4 % (après le 21/09 : 5,0 → 6,3 %) ; 1res séries −0,62 (battues 43 %), séries
  suivantes +0,04 (39 %). Violations : 567 → 0 (dont I10 : 7 → 0 aux grilles en base, 17 → 0 aux grilles proposées),
  0 sur 10 000 séances aléatoires (grilles décalées et saisies hors grille comprises).
