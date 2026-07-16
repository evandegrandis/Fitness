# Jeera — Anti-plateau & progression : principes fondés sur la science

> Synthèse des principes evidence-based (Jeff Nippard, RP Strength/Israetel, Helms, méta-analyses
> volume/fréquence/RIR) — **principes résumés, appliqués à l'algo de Jeera** ; pas de reproduction de contenu.
> Complète `ALGO_SPEC.md`. Adapté à Evan : cap **10 reps**, bande de travail **6–10**, promotion **> 8**.

---

## 1. Principes retenus (et ce qu'on en fait)

### Double progression = moteur par défaut
- Monter les reps jusqu'au **haut de la fourchette** (10 pour Evan), **puis** ajouter du poids, et recommencer.
- Quand la **charge stagne** (poids bloqué), **ajouter une série** (volume) avant de forcer la charge.
- → C'est déjà la logique d'Evan (« > 8 reps → poids suivant »). L'algo l'applique par set/exercice.

### Proximité de l'échec (RIR)
- L'hypertrophie est optimale à **0–5 RIR** ; elle chute nettement au-delà de ~5 RIR (séries trop faciles).
- Le **nombre de reps** compte moins que la **proximité de l'échec** : 5 reps à RIR 1 ≈ 15 reps à RIR 1 comme « série dure ».
- → Signal **« pas assez ambitieux »** = séries finies loin de l'échec (toutes ≥ repMax facile) → monter le poids.
- → Signal **« trop ambitieux »** = échec net (< repMin, ~0 RIR forcé) répété → baisser.

### Rep range
- L'hypertrophie est comparable sur **~6–30 reps** près de l'échec ; le lourd (≤ ~8) favorise la **force**.
- → La méthode d'Evan (amorce 10 + top set 6–8 + backoff) couvre force **et** volume : on la garde.

### Volume (repères MEV / MAV / MRV, par muscle / semaine)
- **~10 séries dures/semaine/muscle** = seuil pour progresser (MEV) ; **rendements décroissants au-delà de ~15–20** (MRV).
- → Alimente les **objectifs hebdo** (`MuscleGoal`) et le bilan « assez de séries ? » : sous MEV = priorité ; au-dessus de MRV = risque de sur-fatigue → ne pas ajouter de volume, plutôt cycler/deload.

### Fréquence
- À volume égal, **1 à 6×/semaine** donnent des résultats similaires → pas de contrainte de fréquence imposée ; on raisonne en **volume hebdo glissant** (déjà le cas).

### Deload
- **Périodique** : toutes les **4–6 semaines**, réduire la charge à **~50–70 %** OU le volume de **30–50 %** pendant ~1 semaine.
- **Réactif** : quand plateau/échecs répétés ou fatigue élevée.
- → Complète le **deload d'absence** (déjà implémenté). Ajouter un deload **réactif** déclenché par l'anti-plateau (voir §2) et un rappel **périodique** (compteur de semaines de charge continue).

### Phases de spécialisation
- +20–40 % de volume sur **1–2 muscles** en retard, sur une période, au prix des autres.
- → Exploitable via le **tri déficit** du picker + Monk Mode ; signalé dans le bilan comme suggestion, pas imposé.

---

## 2. Échelle anti-plateau (ordre d'escalade appliqué par l'algo)

Quand un exercice **plateau** (≥ 3 séances même charge/reps sans progrès), escalader **dans cet ordre** ;
techniques d'intensité **sur les 1-2 derniers sets seulement**, **1–2 par groupe musculaire**, à **cycler (4–6 sem.)** :

1. **+ reps** (double progression) — si pas encore au cap 10.
2. **+ poids** (1 incrément) — quand le haut de fourchette est atteint (> 8).
3. **+ 1 série** (volume) — si la charge stagne mais reps au plafond, tant qu'on est **< MRV** du muscle.
4. **Technique d'intensité** sur le top set / dernier set : **overreach** (top set +1 incr, ~5 reps), **backoff plus lourd**, **rest-pause**, **myo-reps** ou **drop set** — 1 à la fois, cyclée.
5. **Variation d'exercice** — bascule vers une variante (ex : machine différente, angle) pour relancer le stimulus.
6. **Deload réactif** — −10 à −15 % (ou −30–50 % volume) sur ~1–2 séances, puis **re-tentative**.

**Anti-plateau échoué** : si l'étape tentée (surcharge/technique) donne une ancre **< plancher** la fois suivante
→ passer directement au **deload réactif (§step 6)** puis re-approcher ; le **bilan** le signale (« méthode X n'a pas
marché → deload appliqué, à changer »). On ne re-propose pas indéfiniment la même technique qui échoue.

---

## 3. Traduction en signaux moteur/bilan (concret)

- `plateauCounter ≥ 3` → activer l'échelle §2 à l'étape adaptée (selon reps au cap ou non, volume vs MRV).
- Chaque proposition d'intensité porte un `reasonCode` (`overreach`, `add_set`, `rest_pause`, `variation`, `reactive_deload`) et un **message FR** clair.
- **Cycle** : ne pas empiler les techniques ; une active à la fois par groupe, mémoriser le nb de semaines et forcer un deload périodique après 4–6 semaines de charge continue.
- **RIR implicite** (Evan ne note pas le RIR) : estimé via reps réalisées vs prédites (proche de l'échec si reps ≤ prédiction ; marge si nettement au-dessus).
- Le **bilan** de fin de séance restitue : plateau (entrée/sortie), technique tentée + résultat, sous-MEV / sur-MRV par muscle, « trop/pas assez ambitieux » (proxy RIR).

---

## Sources
- Jeff Nippard — progressive overload, phases de spécialisation, programmation evidence-based.
- RP Strength (Israetel) — repères de volume MEV/MAV/MRV, progression hypertrophie.
- Méta-analyses / synthèses : proximité de l'échec (RIR 0–5), rep range 6–30, fréquence à volume égal, deload 4–6 semaines.
