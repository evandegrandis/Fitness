# Calories d'une séance : méthode

Moteur : `lib/engines/calories.ts` (pur, testé dans `lib/engines/__tests__/calories.test.ts`).
Affiché dans le bilan de fin de séance, sur chaque ligne de l'Historique (`~260 kcal`) et dans le
détail d'une séance. Lu par Barbis via `GET /api/barbis/session-calories`.

Rien n'est stocké : l'estimation est recalculée à la lecture, donc toutes les séances passées en
bénéficient, et une correction du profil musculaire d'une machine ou une nouvelle pesée se répercute
d'elle-même.

## Ce qu'on sait vraiment (ordres de grandeur)

- **Compendium des activités physiques** (Ainsworth et al. 2011, mis à jour par Herrmann et al.
  2024) : la musculation « plusieurs exercices, 8 à 15 reps » vaut **~3,5 MET** ; un effort
  vigoureux (bodybuilding, force) **~6 MET**. 1 MET ≈ 1 kcal par kg et par heure. Pour 78 kg,
  une heure de séance dépense donc **~270 à 470 kcal au total**, repos inclus.
- **Une séance de 2 h ne dépense pas 1 000 kcal.** Cela supposerait ~6,5 MET tenus deux heures,
  c'est-à-dire un footing continu ; en musculation, l'essentiel du temps est du repos entre séries.
- **La masse musculaire engagée** domine le coût d'une série : une presse ou un squat consomment
  bien plus d'O2 qu'un exercice de petit groupe à effort égal (Farinatti & Castinheiras Neto 2011,
  JSCR 25(11)).
- **Le coût ne s'arrête pas à la série.** La récupération immédiate (dette d'O2 remboursée pendant
  le repos) pèse autant qu'une bonne partie de la série elle-même (Scott 2011, *Quantifying the
  immediate recovery energy expenditure of resistance training*, JSCR 25(4)). L'EPOC des heures
  suivantes reste modeste en musculation : quelques dizaines de kcal (Børsheim & Bahr 2003, Sports
  Med 33(14)).
- **Les MET sont imprécis** : ±20 à 30 % d'une personne à l'autre (Byrne et al. 2005, *Metabolic
  equivalent: one size does not fit all*). D'où une **fourchette**, jamais un chiffre au kcal près.

## Le modèle (hybride)

Pour chaque séance, au poids de corps connu à sa date :

1. **Fond** : tout le temps hors série à **1,8 MET** (debout, on marche jusqu'à la machine, on règle,
   on parle : Compendium 2024 ~1,8). Recalé le 26/09/2026 : 1,5 (immobile) sous-estimait les longues
   séances, où l'essentiel du temps se passe entre les séries (126 min sur 154 le 25/09).
2. **Chaque série validée** (`completed`, reps > 0) :
   - durée = reps × 3,5 s ;
   - **MET de série = 3,5 + 27 × fraction de masse musculaire sollicitée** (plafonné à 12).
     La fraction vient du profil muscles de l'exercice : Σ coefficient × volume du muscle fin /
     volume musculaire total (~28 L chez l'homme, Janssen et al. 2000 : ~38 % du poids). Les volumes
     par muscle sont des ordres de grandeur tirés des études d'IRM (Handsfield et al. 2014 pour la
     jambe, Holzbaur et al. 2007 pour le bras). Un **polyarticulaire** (pattern déclaré, ou deux
     groupes à ≥ 0,5) reçoit +15 % pour le gainage des muscles absents du profil. Sans profil, une
     fraction par pattern (squat/hinge ≈ 0,2, isolation ≈ 0,02).
     Exemples : curl ≈ 4 MET, tirage ≈ 5, presse à cuisses ≈ 9.
   - **+ travail mécanique de la charge** : reps × charge × g × amplitude / rendement 25 %
     (amplitude par pattern, 0,35 à 0,55 m). Au poids du corps, la charge est la part du corps
     déplacée (traction 95 %, pompe 65 %, crunch 35 %) ; lestée on ajoute le lest, assistée on
     retranche l'assistance.
   - **× intensité** selon le RIR rapporté : RIR 0 ×1,3 · 1 ×1,2 · 2 ×1,1 · 3 ×1 · 4+ ×0,95
     (non rapporté ×1,1) ; échauffement ×0,7.
3. **Récupération** : une part du coût net (au-dessus du fond) de chaque série, qui croît avec la
   proximité de l'échec : RIR 0 +100 % · 1 +85 % · 2 +70 % · 3 +60 % · 4+ +50 % (non rapporté
   +70 %, échauffement +50 %). Une série courte menée à l'échec est surtout anaérobie : sa dette
   d'oxygène se paie pendant le repos et augmente avec la lactatémie (Scott 2011). Recalé le
   26/09/2026 : l'échec (23 séries sur 37 le 25/09) pesait à peine plus qu'une série facile.
4. **Cardio loggé dans la séance** : watts → travail / rendement 22 % + repos (équivalent de
   l'équation ACSM du vélo) ; course avec distance → ~1 kcal/kg/km + repos ; sinon MET du
   Compendium par activité. Ses minutes ne comptent pas en plus comme repos de musculation.

**Durée et repos.** Durée réelle (`endTime − startTime`) si la séance est close, sinon l'étendue des
horodatages des séries, sinon 3,5 min par série (comme l'Historique). Des repos plus longs allongent
le fond : plus de kcal au total, moins par minute. Garde-fou : au plus 8 min par série + 20 min,
pour qu'une séance oubliée ouverte ne « brûle » pas une nuit.

**Poids de corps.** Dernière pesée connue à la date de la séance (celle du jour comprise), sinon la
première pesée, sinon le poids des réglages, sinon 75 kg (l'écran le dit).

**Fourchette.** Le repos (1 kcal/kg/h) est sûr ; la part active est donnée à ±25 %.

## Ce que ça donne (78 kg, mélange presse 140 kg / tirage 60 kg / curl 14 kg / tractions)

| Séance | RIR 1 | RIR 0 (échec) | Au-dessus du repos (RIR 1) |
|---|---|---|---|
| 45 min, 12 séries | ~270 kcal (220–320) | ~300 kcal | ~210 |
| 1 h, 16 séries | ~360 kcal (290–430) | ~400 kcal | ~280 |
| 1 h 30, 24 séries | ~540 kcal (430–640) | ~600 kcal | ~420 |
| 2 h, 32 séries | ~720 kcal (580–860) | ~800 kcal | ~560 |

Soit ~4,6 MET en moyenne pour une séance dense avec la presse, dans la plage du Compendium
(3,5 à 6 MET). Une séance réelle d'Evan, haut du corps : 1 h ≈ 290–300 kcal ; la séance « Upper »
du 25/09 (2 h 34, 37 séries dont 23 à l'échec, 73,7 kg) ≈ 615 kcal (510–720), dont ~430 au-dessus
du repos. La montre de son partenaire affichait 1 418 kcal (1 195 actives) : les montres déduisent
la dépense du rythme cardiaque, qui monte en musculation sans la consommation d'oxygène qui va
avec, d'où une surestimation forte sur ce type de séance.

## Deux chiffres, deux usages

- `kcal` : dépense totale pendant la séance (ce qu'affiche l'app, comme une montre en « total »).
- `activeKcal` : part au-dessus du métabolisme de repos. **C'est elle qu'il faut ajouter à une
  dépense journalière de base** (sinon le repos pendant la séance est compté deux fois).

## Limites assumées

- Les charges des machines ne sont pas des kg « vrais » (leviers, poulies) : le travail mécanique
  n'est qu'un terme parmi d'autres, la masse musculaire pèse davantage.
- Pas de fréquence cardiaque en musculation (elle surestime la dépense quand l'effort est
  intermittent et isométrique).
- Les constantes sont réglées pour retrouver le Compendium sur une séance type, pas mesurées sur
  Evan : ce sont des ordres de grandeur, présentés comme tels.
