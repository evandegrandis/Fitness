# Jeera — Niveaux de force (StrengthLevel) & signal de préparation — SPEC

> Corrige + généralise le système de benchmark, l'intègre à l'anti-plateau, le rend DYNAMIQUE.
> Décisions d'Evan verrouillées (mise à jour 2026-08-09). Référence disponible : homme, **80 kg, tranche 25–40 ans**.
> Données re-sourcées : `data/strength_standards_corrected.json` (source de vérité, complétée au fil de l'eau).
> Convention : Next non standard (`AGENTS.md`) → lire `node_modules/next/dist/docs/` avant tout code UI.
> DB : écritures NON destructives OK sur `getback4august` (host `ep-mute-sunset-atqb5xkv`), jamais DELETE/DROP/reset (cf. IMPL règle 9).

## 0. Contexte (pourquoi)
L'ancienne IA a saisi les benchmarks en étiquetant l'**Intermédiaire** StrengthLevel comme « Avancé » et en omettant le vrai Avancé (prouvé : Curl debout stocké [18,39] = SL Intermédiaire 22 / Élite 42 à 80 kg). Certaines valeurs sont carrément fausses (Leg extension [75,150] < Intermédiaire). → re-sourcer proprement, 5 paliers.

## 1. Modèle de données
- **Source de vérité** = `data/strength_standards_corrected.json` : par exercice `{ slSlug, unit: "load"|"reps"|"reps_and_load", convention: "per_arm"|"total"|"added"|"reps", isMachine, load?[5], reps?[5], loggedLoadMultiplier?, caveat? }`. `loggedLoadMultiplier` documente une conversion explicite entre la saisie Jeera et le standard (Plate loaded : par bras ×2 vers le total).
- `Exercise` gagne (nullable, dynamique) : `strengthStandardKey?: string` (clé dans le JSON) + `benchmarkUnit?: "load"|"reps"|"reps_and_load"`. Migration additive.
- `benchmarkLow/High` (legacy) : conservés comme **fallback manuel** si pas de `strengthStandardKey`.
- `resistanceProfile` : peupler les 30 depuis `data/strength_standards_corrected.json` → `resistanceProfiles` (UPDATE non destructif + seed JSON pour la persistance/dynamisme).

## 2. Moteur `benchmark.ts` (étendre l'existant, garder l'API)
- Remplacer les 2 tables embarquées par un chargement générique depuis le JSON. Les valeurs actuelles ne couvrent que **H80** : aucune interpolation n'est autorisée ; à un autre poids, masquer l'absolu et garder la progression personnelle. Garde âge 25–40.
- Gérer les 3 unités : `load` (kg, avec convention par_bras/total/lesté), `reps` (comparer au meilleur nb de reps), `reps_and_load` (2 jauges).
- Les finishers sont exclus de tous les repères StrengthLevel et gardent uniquement leur piste de records dédiée.
- L'UI affiche l'unité de chaque axe (`kg` ou `reps`) et compare les exercices par distance de palier normalisée, jamais par écart brut entre unités.
- **Machines (`isMachine:true`) → décision « les deux »** :
  1. jauge StrengthLevel **indicative** (bandeau caveat déjà présent dans `BenchmarkGauge`), ET
  2. **marqueur de progression perso** : percentile de la perf du jour vs l'historique de CET exercice (nouvelle fonction pure `personalProgress(exercise, history)` → position 0..1 sur [min..max e1RM historique]).
- Ajouter le palier **Avancé** manquant : les 5 tiers viennent du JSON, plus de trou.

## 3. Signal intra-séance « feu » (NE PAS montrer la jauge en séance, sauf…)
- La jauge benchmark **n'apparaît PAS** pendant la séance (elle reste sur l'onglet Progrès).
- **Exception** : `suggest()` calcule 2 flags sur le poids proposé (si atteint aux reps cibles) :
  - `readyForLevelUp` : l'e1RM résultant **franchirait le palier suivant** (StrengthLevel).
  - `readyForPR` : l'e1RM résultant **battrait le record e1RM** de l'exercice.
- Si l'un est vrai → `SetEntry.tsx` affiche le poids proposé avec **animation feu** (flamme animée, `prefers-reduced-motion` respecté) + libellé court (« PR en vue » / « passage Avancé »). Sinon, rien d'inhabituel.
- Champs additifs sur `SetSuggestion` : `readyForLevelUp?: boolean`, `readyForPR?: boolean`, `nextLevelName?: string`.

## 4. Dynamique (exos ajoutés plus tard)
- L'éditeur d'exo (`ExerciseEditorSheet.tsx`) gagne : un **sélecteur « standard StrengthLevel »** (liste des `slSlug` connus du JSON + « aucun »), le champ **unité**, et **convention**. Un exo mappé entre AUTOMATIQUEMENT dans jauge + feu + anti-plateau.
- `movementPattern` + `resistanceProfile` déjà dans l'éditeur (P2.1) → l'anti-plateau prend en compte tout nouvel exo sans code.
- Nouveau standard non listé : soit l'utilisateur saisit les 5 valeurs à la main (fallback), soit on ajoute la table au JSON.

## 5. Anti-plateau — cohérence
- `resistanceProfile` peuplé → `weakPointFit` de `variation-select.ts` (P2.1) devient réellement actif : au plateau, la variante proposée cible le point faible mesuré (capture 1-tap) en accord avec le profil de résistance des candidats.
- Rien d'autre à changer (le système P1/P2 est déjà branché et dynamique via `movementPattern`).

## 6. Sourcing restant (à compléter dans le JSON, NE PAS inventer)
Défauts validés par Evan (mapping par défaut, corriger si besoin) : Curl marteau→Hammer Curl (par bras) ; Extension triceps haltère→Overhead Tricep Ext ; Wrist curl→Barbell Wrist Curl (total) ; Shoulder press→Overhead Press barre (total) ; Rear delt fly→Dumbbell Rear Delt Fly (par bras) ; machines (Chest Press, Pec deck, Dips machine, Isolateral row, Pulley serré, Tirage horizontal, Tirage vertical muscle up)→équivalent SL `isMachine:true` (« les deux ») ; Crunch→Weighted Crunch ; Relevé jambes→Captain's Chair (reps) ; Ab roller→Ab Rollout (reps) ; Plate loaded lat raise→Machine Lateral Raise. Chaque table ajoutée au JSON s'active automatiquement.

## 7. Lots (résumables — voir VARIATION_CYCLING_IMPL.md, nouvelle Phase 3)
- **P3.1** — modèle + migration additive (`strengthStandardKey`, `benchmarkUnit`) + `benchmark.ts` générique (charge le JSON, 3 unités, référence fixe H80) + tests purs.
- **P3.2** — machines « les deux » : `personalProgress()` pur + affichage double dans `BenchmarkGauge`.
- **P3.3** — signal feu : flags dans `suggest()` + animation `SetEntry.tsx` (reduced-motion) ; jauge cachée en séance.
- **P3.4** — dynamique : sélecteur standard/unité/convention dans l'éditeur + peuplement `resistanceProfile` (DB non destructif + seed) + activation `weakPointFit`.
- **P3.5** — appliquer en base (non destructif) les benchmarks corrigés du JSON (relabel Intermédiaire→vraies valeurs, ajout Avancé) : UPDATE, host-gardé.
Vérif : `tsc` + `vitest` ; golden inchangé attendu (le premier set du jour ne déclenche pas le feu sans historique de séance).
