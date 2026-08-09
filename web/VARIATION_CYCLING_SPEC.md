# Jeera — Variation Cycling & Anti-plateau data-driven (SPEC, v2 post-audit)

> Implémente l'étape 5 (« Variation d'exercice ») de `ANTI_PLATEAU_SCIENCE.md`, restée non codée, en la
> transformant en **levier principal, préemptif et data-driven** — méthode « Infinite Progression »
> (rotation de variations par pattern de mouvement) validée sur les transcripts jonwalland.
> **Autorité** : ce doc **prime** sur `ANTI_PLATEAU_SCIENCE.md §2` (ordre d'escalade, trigger) et sur
> `ALGO_SPEC.md §7` / `ALGO_SPEC_HARDENED.md §8` **pour la partie plateau/anti-plateau uniquement**
> (les §8 techniques d'intensité y sont abrogées, voir §4). Le reste des specs (patterns, refs, predictReps) est conservé.
> **Convention** : ce n'est PAS le Next.js standard (`AGENTS.md`) → lire `node_modules/next/dist/docs/` avant tout code UI.

---

## 0. Décisions verrouillées (Evan)

1. **Trigger de plateau = 2 semaines calendaires** (pas « 3 séances »). Basé sur les **dates**.
2. **Indicateur « je m'approche d'un plateau »**, intelligent : *pas de progrès de poids MAIS reps↑ = je NE m'approche PAS d'un plateau*.
3. **Variation = levier prioritaire.** Si incompatible avec l'ajout de volume → **suivre la méthode (variation)**, pas le volume. **Aucune technique d'intensité prescrite dans l'app** (overreach de plateau, rest-pause, myo-reps, drop set) → **retirées**.
4. **Ultra data-driven**, en profondeur.
5. **UX contextuelle** : apparaît au bon moment, **disparaît quand inutile**.
6. Tout doit être **réellement branché et utilisé** (fin du code mort `switchToVariantId`).

---

## 1. Métrique de progression (RÉUTILISE l'existant)

`lib/engines/e1rm.ts` fournit déjà **`estimated1RM(weight, reps)`** (Epley : `weight × (1 + reps/30)`) et **`bestE1RM(sets)`**. On **réutilise** — ne rien recréer.

- `P_séance(exo)` = `bestE1RM(sets de travail de la séance).e1rm` (sets `SetType ∈ {work, top_set}`, warmups/finisher exclus — `enums.ts`).
- **Propriété clé** : `estimated1RM` croît avec le poids **ET** avec les reps → « +1 rep à charge constante » ⇒ `P` ↑ ⇒ **progrès** (décision #2 satisfaite by design).
- Bodyweight/assisted : `bestE1RM` prend la charge externe ; brancher `effTotal()` (`predict.ts:29`, gère `bodyweightKg`) pour un e1RM effectif cohérent avec le moteur.
- **Dates** : elles sont déjà présentes via `LoggedSet.timestamp` (`types.ts`). Aucun nouveau paramètre à plomber ; les ancres portent leur date.

---

## 2. Détection de plateau — en dates (remplace le compteur de séances)

Aujourd'hui : `deriveStateV2` (`progression.ts:688-692`) et `deriveState` v1 (`:441`) calculent `plateauCounter` = nb de séances consécutives à même (charge, reps) sur le **rôle dominant** (top pour TOP_SET_BACKOFF/WEIGHTED_BW, amorce sinon), seuil `PLATEAU_THRESHOLD:3`.

**Nouveau (dérivé, pur)** — ajouter à l'état dérivé :
```
lastProgressDate = date (LoggedSet.timestamp) de la dernière ancre du rôle dominant ayant établi
                   un nouveau max de P (e1RM) sur le run courant de la variation.
plateauStalledDays = lastSessionDate − lastProgressDate
sessionsInWindow   = nb d'ancres du rôle dominant dans les 14 derniers jours
isPlateau = plateauStalledDays ≥ 14  ET  sessionsInWindow ≥ 2
```
- **Anti-bruit** : un gain de P `< max(1%, estimated1RM(charge, repMin+1)−estimated1RM(charge,repMin))` ne compte pas comme progrès.
- **Absence** : si `sessionsInWindow < 2`, ce n'est pas un plateau (c'est un gap → deload d'absence existant `deload.ts`). Ne jamais déclencher de plateau juste après une longue absence.
- **`run courant`** : ancres du rôle dominant depuis la dernière rotation de variation vers cet exo (cf. §7 bookkeeping). Au cold-start (pas de rotation connue) = toutes les ancres de la fenêtre `HISTORY_WINDOW`.

**Blast radius (à traiter, ne rien oublier)** — remplacer/re-router le test `plateauCounter ≥ 3` par `isPlateau` aux sites :
`progression.ts` **1938** (trigger escalade → devient trigger variation, §4), **1545**, **1600**, **775**, **828**, **1163**, **1262** (revoir chacun : promotion-gating vs plateau) ; `bilan.ts` **329-368** (messages « depuis N séances » → « depuis N jours / 2 semaines »). Conserver `plateauCounter` comme valeur dérivée annexe si un site en dépend, mais le **trigger officiel = `isPlateau`**.

---

## 3. Indicateur « proximité de plateau » (préemptif) — sur l'existant

Se **branche sur `progressVelocityScore()`** (`progression.ts:276-295`), qui encode déjà :
`weight↑ & reps≥ → +1.5` ; **`même poids & reps↑ → +1.0`** ; `stagnation → 0` ; `reps↓ → −0.5` (α=0.84, récence-pondéré). **C'est déjà la règle #2.**

État à 3 niveaux (dérivé) :
```
v = progressVelocityScore(exo, run courant)          // ≈ [−0.5, 1.5]
état = plateaued   si isPlateau (§2)
     = slowing     si v ≤ SLOWING_VELOCITY (≈ 0.25)  ET  plateauStalledDays ≥ 7   ET  NON isPlateau
     = progressing sinon
```
- **Garde-fou #2 automatique** : tant que les reps montent à charge constante, `v ≥ 1.0` → jamais `slowing`. (Vérifié dans le code de `progressVelocityScore`.)
- Mapping méthode (vidéo `UPATcQCTGlU`, 4 phases) : `progressing`=phases 1-2, `slowing`=phase 3, `plateaued`=phase 4. On **prépare** la rotation dès `slowing` (préemptif), on la **déclenche** à `isPlateau` (filet). Cf. anti-thrash §8.
- Constantes à ajouter dans `ALGO_V2` : `PLATEAU_STALL_DAYS: 14`, `SLOWING_STALL_DAYS: 7`, `SLOWING_VELOCITY: 0.25`, `PLATEAU_MIN_SESSIONS: 2`.

---

## 4. Nouvelle échelle anti-plateau (abroge ANTI_PLATEAU_SCIENCE §2.4-5 et ALGO_SPEC(_HARDENED) §8)

Ordre appliqué — **sans volume-add ni technique d'intensité** :
1. **Double progression** (reps↑ jusqu'au cap 10, puis charge↑) — moteur actuel, inchangé.
2. **`slowing`** → **préparer** une variation (préemptif, non intrusif : indice UI + pré-calcul du candidat).
3. **`isPlateau`** → **proposer la rotation de variation** (§6-7) dans le bilan.
4. Échec (le candidat ne relance pas non plus, ou pas de candidat) → **deload réactif** (existant `detectAntiPlateauActive` + `ANTIPLATEAU_FACTOR 0.9` / `ANTIPLATEAU_SESSIONS 2`, `progression.ts:1365`), puis re-tentative.

**À retirer (décision #3)** — code + specs + tests :
- **`plateauEscalation()`** (`progression.ts:1388-1413`) : supprimer la branche **rest-pause** ET l'**overreach de plateau** (`plateau_break +incr×5`). Le bloc d'invocation (`:1937-1956`) ne fait plus d'escalade d'intensité ; il pose le **signal de variation** (§6).
- Champ `SetSuggestion.intensityTechnique` (`progression.ts:100`) : devient toujours `null` (le garder pour compat de type, ou le retirer partout — décision d'impl., tracée dans le checklist).
- Mettre à jour `ALGO_SPEC.md §7` (ligne 132) et `ALGO_SPEC_HARDENED.md §8` (lignes 441-464) : remplacer « surcharge / rest-pause » par « rotation de variation ».
- **Tests impactés** à réécrire : `algo-v2.test.ts` (attentes `intensityTechnique:"rest_pause"`, `reasonCodes:"rest_pause"`, `"plateau_break"`), `bilan.test.ts`, **regénérer `golden.test.ts`** et revoir le diff.
- **On CONSERVE** : `set-structure.ts` (détection composite rest-pause/drop dans l'historique = analyse, pas prescription) ; le **deload réactif** (gestion de charge, pas une technique d'intensité) ; la policy `overreachJump` **hors plateau** si elle sert la progression normale STRAIGHT (à confirmer au site `:780/:833` — ne pas casser la progression normale).

---

## 5. Données manquantes (proprement, une fois) + purité

Sur `Exercise` (`types.ts:23-48`, `enums.ts`, `db/schema.ts` + migration Drizzle, seed `jeera_backup.json` + `scripts/seed.ts`, et l'éditeur `components/exercise/ExerciseEditorSheet.tsx`) :

1. **`movementPattern: MovementPattern`** — `horizontal_press | vertical_press | horizontal_pull | vertical_pull | squat | hinge | isolation`. **Clé de carry-over.** Taguer les 29 exos. **Dégradation gracieuse** : si `null`, la rotation retombe sur le recouvrement musculaire seul (jamais de crash).
2. **`resistanceProfile: 'bottom' | 'mid' | 'lockout' | 'even' | null`** — où l'exo est le plus dur (pour cibler le point faible). Taguer les 29.
3. **Point faible mesuré** = **seule donnée réellement nouvelle à persister** (input utilisateur, pas d'état dérivé → ne viole PAS l'invariant de pureté) : à l'entrée en plateau, **1 tap** « où ça a calé ? » `{ bottom | mid | lockout }`, stocké sur `LoggedExercise` (nouvelle colonne nullable `plateau_weak_point`) ou table `plateau_diagnoses`. Optionnel : si non renseigné, `weakPointFit` neutre.

**Purité (invariant HARDENED §0.2)** : le suivi de life-cycle (durée + force gagnée, §7) est **entièrement dérivé de l'historique à la volée**, **jamais persisté**. Supprimer `VARIANT_LINKS` codé en dur (`variants.ts`) ; les candidats deviennent dynamiques (§6). (NB : `ALGO_SPEC_HARDENED §11` avait planifié `Exercise.easierVariantId` jamais implémenté — abrogé, remplacé par la sélection dynamique.)

---

## 6. Sélection de variation (`lib/engines/variation-select.ts`, pur, testé)

`selectAlternative(current, catalog, historyByExercise, goals, weakPoint?)` → `{ exerciseId, score, explanationFR } | null`.

**Filtre dur** : candidat tel que `movementPattern === current.movementPattern` (si `null` des deux → fallback recouvrement musculaire ≥ seuil) ET `id ≠ current.id` ET pas dans le run courant.

**Score pondéré (data-driven)** :
```
0.35·muscleOverlap   // carry-over : cosinus sur muscleMappings (aggregateCoefficient, types.ts:270)
0.20·weakPointFit    // resistanceProfile candidat == weakPoint mesuré (1 / 0.5 si inconnu / 0)
0.20·lifecycleQuality// roster dérivé §7 : (durée × force gagnée) passées, normalisé ; 0.5 si jamais fait
0.15·novelty         // resistanceProfile ≠ / category ≠ / dissimilarité de nom (proxy équipement)
0.10·goalFit         // rollingPriorities() (effective-sets.ts:374) : muscles en retard
− pénalité si fatigueClass(candidat) > fatigueClass(current)
```
- À `weakPointFit` égal → préférer le candidat où l'**e1RM historique de l'utilisateur est le plus bas** (méthode « variante la plus faible », `DZ7PO1sJPjx`/`DZW5KPPphHR`).
- **Aucun candidat valide** (catalogue 29, isolation/core sans pair) → renvoyer `null` → §4 étape 4 (deload réactif) + message « pas de variante pertinente, deload d'1-2 séances ».
- **Explication FR** générée : *« Plateau sur X depuis 15 j. → Y (même vertical press → force reportée ; cible ton point faible “lockout” ; cycle précédent 8 sem./+15 kg). »*
- Réutilise `aggregateCoefficient`, `rollingPriorities`, `collectExerciseHistory` — rien de neuf côté muscle.

---

## 7. Life cycles & roster (dérivé, PUR — pas de persistance)

`lib/engines/lifecycle.ts` (pur) :
- `computeLifeCycle(exerciseId, history)` → `{ startDate, weeks, e1rmGain, ended }`, dérivé du run continu courant (via `collectExerciseHistory` `patterns.ts:47`, dates via `timestamp`, force via `bestE1RM`).
- **Roster** = classement dérivé à la volée sur la fenêtre d'historique : pour chaque variante déjà pratiquée d'un pattern, `lifecycleQuality = normalize(durée × e1rmGain)` des runs passés. Alimente §6. Cible méthode : roster de ~12-18 variantes (émergent, non stocké).
- **Bookkeeping du « run courant »** (pour §2/§3) : une rotation = un changement d'`exerciseId` sur le même `movementPattern`. Détecté depuis l'historique (dernière fois que cet exo a (re)commencé après un autre exo du même pattern). Si l'utilisateur swap/édite manuellement → le run repart proprement (edge-case §9).

---

## 8. UX contextuelle (décision #5) — apparaît/disparaît

- **`progressing`** : **rien** (zéro bruit anti-plateau).
- **`slowing`** : indice **discret** sur `ExerciseCard.tsx` (« progrès qui ralentit »). Disparaît dès retour `progressing`.
- **`plateaued`** : carte de suggestion dans le **bilan de fin de séance** (`buildPlateauReview()` `bilan.ts:321`) : point faible (1 tap si absent) → variante proposée (§6) avec **accepter / refuser**. **Non destructif** : accepter **pré-charge Y pour la prochaine séance** (via `replaceExercise()` `store/workout.ts:988`, qui efface les sets — donc jamais en pleine séance). La carte **disparaît** une fois traitée.
- **Anti-thrash** : après une rotation acceptée, geler toute nouvelle proposition de rotation pour cet exo pendant `≥ ROTATION_COOLDOWN_DAYS (≈14)` ou jusqu'à un nouveau `isPlateau` sur la nouvelle variante (ne pas re-proposer en boucle).
- **Câblage réel** : `switchToVariantId` porte désormais un **exerciseId** (plus un nom) ; émettre `reasonCodes:["variation"]` (déjà listé dans `SetEntry.tsx:17-25`). **Le consommer** dans `SetEntry.tsx` / `ExerciseCard.tsx` (0 hit aujourd'hui) et dans le bilan. Corriger la constante UI `"variant_switch"` → `"variant_switch_easier"` (mismatch réel, `SetEntry.tsx:23` vs `progression.ts:1538`).

---

## 9. Cas limites (à couvrir explicitement)

| Cas | Règle |
|---|---|
| Pas de candidat (catalogue restreint / isolation-core) | `selectAlternative` → `null` → deload réactif + message ; jamais de crash |
| `movementPattern`/`resistanceProfile` non tagué (null) | Fallback recouvrement musculaire seul ; `weakPointFit` neutre |
| Longue absence puis reprise | `sessionsInWindow < 2` → PAS plateau ; deload d'absence existant prime |
| Swap/édition manuelle de l'exo | Le « run courant » repart ; pas de fausse détection de plateau héritée |
| Exo fait 1×/semaine | 14 j ≈ 2 séances → `PLATEAU_MIN_SESSIONS:2` garde le sens |
| v1 (`assisted_bodyweight`/`ramping`) | `deriveState` v1:441 : router aussi vers `isPlateau` OU documenter que le date-based ne s'applique qu'à v2 (décision d'impl. tracée) |
| Messages | **FR** partout (bilan, indices, explications) |
| Anti-thrash | §8 cooldown après rotation acceptée |

---

## 10. Fidélité méthode (audit transcripts — pour mémoire)

Capturé et fidèle : 6 patterns (énum. exacte `zs-1oo7zTvs`), life cycle 4 phases (`UPATcQCTGlU`), trigger « 2 semaines » (`DZfAcXkJdxz`), sélection = même pattern + assez différent + cible point faible (`DZfAcXkJdxz`, `DaNfy-DpRo9`), double progression haut-de-fourchette + plus petit incrément (`DaVZJYKJooY`, `zs-1oo7zTvs`), roster 12-18 + tracking durée/force (`zs-1oo7zTvs`), carry-over, rotation préemptive (`DYalapQpecF`), « ne PAS changer si ça progresse encore » (couvert par `progressing`). **Ajouts méthode intégrés** : démarrer par le **pattern le plus faible** et avec **2 variantes** (onboarding, `zs-1oo7zTvs`) ; rotation préemptive motivée par la **gestion de fatigue** (`UPATcQCTGlU`). Non pertinent (ignoré) : sèche, douleur articulaire, mindset, recommandations d'exos spécifiques.

---

## 11. Lots d'implémentation (résumables — cf. `VARIATION_CYCLING_IMPL.md`)

**Phase 1 — fondations data-driven + câblage réel**
1. Constantes `ALGO_V2` (PLATEAU_STALL_DAYS, etc.) + helpers e1rm réutilisés.
2. État dérivé : `lastProgressDate`, `plateauStalledDays`, `isPlateau`, `state` (via `progressVelocityScore`).
3. Re-router les 9 sites `plateauCounter≥3` → `isPlateau` (revue par site) + messages bilan en jours.
4. Champ `movementPattern` + migration + tag des 29 exos + éditeur.
5. `variation-select.ts` v1 (muscle+novelty+goal+lifecycle ; weakPointFit neutre) + tests purs.
6. Câbler `switchToVariantId`(id) + `reasonCode:"variation"` de bout en bout ; retirer intensity techniques ; MAJ specs §8 + tests + **golden regen**.

**Phase 2 — profondeur méthode**
7. `resistanceProfile` + capture point faible 1-tap → `weakPointFit` actif.
8. `lifecycle.ts` (dérivé) + roster classé.
9. Rotation **préemptive** (`slowing`) + anti-thrash (cooldown).

Chaque brique du moteur (pur) est **testable en isolation** (Vitest). Golden regénéré et diff revu à la fin de la Phase 1.
