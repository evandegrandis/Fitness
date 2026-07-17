# Jeera Web — Roadmap UX Finale (recherche marché + contre-expertise)

> Date : 2026-07-14 · Lead UX : Claude · Statut : validé pour implémentation
> Note méthodologique : la contre-expertise reçue était un payload de test (placeholder sans contenu substantiel : `verdict:"test"`, flaws/overEngineered/missing génériques). Aucune objection réelle n'a donc modifié le fond ; la roadmap ci-dessous est la recommandation initiale consolidée, avec un durcissement supplémentaire des critères d'écartement et un ordre de priorité affiné sur le critère unique : **battre Notes en vitesse dès la première séance**.

---

## 1. Résumé exécutif

La recherche converge sur un constat brutal : **la vitesse de log est LE facteur de rétention** (« too many taps » = plainte n°1 du marché ; des utilisateurs quittent Hevy pour Strong pour ~1 seconde gagnée par set), et la deuxième plainte est l'excès de features. La stratégie Jeera tient en trois volets :

1. **Copier les 4 standards non-négociables du marché** — pré-remplissage validable en 1 tap, rest timer auto au checkmark, réutilisation de séance en 1 tap, offline-first robuste — car leur absence disqualifie face à Notes.
2. **Creuser les 2 vides du marché où Jeera est déjà en avance** et où aucun leader n'a de gold standard :
   - la **suggestion de charge expliquée en une phrase** — l'opacité de l'algo est LA critique qui tue la confiance chez Fitbod/RP/Juggernaut (« it's right, do what it says » perçu comme un déni d'autorité) ;
   - le **bilan post-séance à verdict qualitatif** (performé / plateau / trop ambitieux), inexistant chez Strong et Hevy qui ne livrent que des charts bruts.
3. **Écarter sans pitié** tout ce qui est social, partage, vocal, check-ins multi-sliders et coaching envahissant — pour un usage mono-utilisateur, chaque écran en plus est une régression.

**Fil conducteur** : chaque set doit se logger en **1 tap quand l'algo a raison**, 2-3 taps quand il faut ajuster, **zéro tap de navigation en superset**.

---

## 2. Tableau priorisé

### IMPLÉMENTER MAINTENANT (quick-wins et fondations)

| # | Feature | App(s) source | Bénéfice | Effort |
|---|---------|---------------|----------|--------|
| 1 | **Suggestion algo pré-remplie, validable en 1 tap (checkmark)** — l'algo remplace les « ghost values » du dernier set ; perf de la dernière séance affichée en petit à côté (colonne PREVIOUS) | Strong, Hevy, Setgraph, Boostcamp, RepXP | Logger un set = 1 tap (~3 s) quand l'algo a raison. LE geste qui rend Jeera structurellement plus rapide que Notes : Notes exige d'écrire, Jeera exige de confirmer | **S** |
| 2 | **Explication une-phrase du « pourquoi » de chaque suggestion** (« 62,5 kg car 3×12 atteint la dernière fois » / « −2,5 kg : plateau depuis 3 séances ») | Liftosaur (contre-modèle transparent) ; RP/Juggernaut/Fitbod (contre-exemples opaques) | Confiance = adoption. Sans ça, Evan finira par ignorer les suggestions et l'app redevient un logger passif. Coût quasi nul (algo déterministe à règles : chaque décision a déjà une cause nommable) | **S** |
| 3 | **« Reprendre la dernière séance » en 1 tap** + templates triés par récence + « Sauvegarder comme routine » proposé APRÈS une séance libre (jamais avant) | Hevy (Copy Workout), Strong (templates), Jefit (tri récence) | Composer une séance habituelle = 1 tap. Répond mot pour mot à « ses séances sont souvent similaires ». Charges recalculées par l'algo, jamais rejouées (règle « suggest from today, never replay ») | **M** |
| 4 | **Rest timer auto au checkmark**, non-bloquant, ±15 s, vibration/notification — bulletproof PWA (timestamp de fin en localStorage, Wake Lock API, notification Service Worker) | Strong, Hevy, Liftin, Setgraph | Supprime le duo « Notes + app Horloge ». Zéro tap ajouté au flux. La fiabilité fait ou défait la rétention (plaintes documentées : timer Hevy qui s'arrête à 30 s, timer Strong annulé en quittant l'app) | **M** |
| 5 | **Offline-first blindé** : chaque set persisté en IndexedDB à la validation, sync différée, « reprendre la séance en cours ? » après crash/refresh | Strong, Hevy, FitNotes, Setgraph | Zéro séance perdue, zéro blocage sans réseau. Condition de survie face à Notes (qui ne perd jamais rien). En PWA, plus critique qu'en natif (tab kill, refresh) | **M** |
| 6 | **Steppers +/- gros (≥48 px) en thumb zone** — incrément propre à l'exercice pour le poids, ±1 rep ; clavier en fallback seulement | StrongLifts, Strong, Boostcamp | Corriger l'algo = 1-2 taps au pouce, sans popup clavier. Leçon Fitbod : une suggestion imparfaite est acceptée tant que la correction reste à 1 tap | **S** |
| 7 | **Superset : auto-avance au checkmark + code couleur par groupe** — repos zéro entre membres, plein en fin de tour (règle métier déjà existante) | Hevy (Smart Superset Scrolling), Jefit | Zéro navigation manuelle en superset : on valide, l'écran est déjà sur le bon exercice. Liaison en flux visible (2 exos → lier), pas cachée dans un menu « ⋯ » | **M** |
| 8 | **Bilan post-séance à verdict qualitatif** : 1 phrase de diagnostic par exercice (progressé / stable / trop ambitieux) + 1 verdict séance, chiffres en dessous | Aucune — gap marché documenté (Strong/Hevy = charts bruts) | Répond mot pour mot à l'objectif 4 d'Evan. Les signaux existent déjà (détection plateau, promotion gate, anchors). Diagnostic, pas motivation gadget (« camion » Hevy) | **M** |
| 9 | **Warmup sets auto-générés** en % du poids cible (40/60/80 %), marqués « W », skippables en bloc ; pas sous ~40 kg ni en bodyweight | Hevy (feature Pro payante) | Supprime le calcul mental d'échauffement. Déjà validé côté iOS Jeera (warmup 60 %) — portage direct | **S** |
| 10 | **Deload/override manuel « trop dur aujourd'hui »** par exercice (menu contextuel), abaisse les suggestions de la séance sans polluer l'historique | Dr. Muscle (More > Deload) ; RP (contre-exemple : deload tardif → contournement) | Evan garde le dernier mot sans « mentir » à l'algo. Ciblage par exercice, pas de deload global punitif | **S** |

### CONSIDÉRER (après que le chemin critique soit parfait)

| Feature | App(s) source | Bénéfice | Effort | Condition de déclenchement |
|---------|---------------|----------|--------|---------------------------|
| **Plate calculator** (disques par côté) depuis le champ poids | Hevy, Strong, RackMath, FitNotes | Traduit 72,5 kg en disques sans calcul mental | S | Seulement si Evan travaille beaucoup à la barre olympique ; inutile en machines/haltères |
| **RPE/RIR optionnel en 1 tap post-set** (chip discret, skip par défaut, jamais bloquant), alimentant l'algo | Boostcamp, Dr. Muscle, StrengthLog, RepXP | Signal de ressenti pour l'algo sans attendre une séance de données | M | Seulement si l'algo top-set/backoff montre des angles morts que les reps seules ne capturent pas. Jamais les 4 sliders RP (« too many knobs ») |

### ÉCARTER (et pourquoi)

| Feature | App(s) source | Pourquoi écarté | Effort évité |
|---------|---------------|-----------------|--------------|
| **Check-in readiness pré-séance** (sommeil/courbatures/motivation) | Juggernaut AI, RP | Contredit frontalement « minimum de clics, sans réfléchir » : questionnaire AVANT le premier set. Donnée peu fiable (cas RP documenté : volume effondré par surestimation de fatigue). Le deload manuel par exercice couvre le besoin de façon réactive, sans friction à froid | M |
| **Saisie vocale des sets** | Vora, W8Log, RepCount, Liftly | ~10 % d'échec de reconnaissance en salle bruyante (reconnu par RepCount), aucun leader ne l'a adopté, coût social de parler à son téléphone en salle. Le checkmark 1-tap est déjà plus rapide qu'une phrase + correction | L |
| **Bilan narratif partageable** (slides, streaks, « équivalent camion ») | Hevy | App mono-utilisateur : personne à qui partager. Le verdict qualitatif (#8) couvre le vrai besoin (diagnostic, pas motivation). Feature bloat typique | M |
| **Heatmap corporelle de récupération** (0-100 %) | Fitbod | Hors chemin critique : Evan réutilise des séances, il ne recompose pas selon une heatmap. Confiance fragile (calibrages aberrants Fitbod documentés). Si besoin : simple liste de muscles en déficit | L |
| **Live Activity / Dynamic Island** | Hevy, Liftin, Setgraph | Techniquement inaccessible à une PWA iOS (API native uniquement). Max atteignable en web = notification Service Worker fin de repos, déjà couverte par #4. Ne pas courir après une parité native impossible ; Wake Lock + app ouverte = compromis acceptable | L |

---

## 3. Top 5 à faire d'abord — implémentation concrète pour Jeera

### 1. Suggestion pré-remplie + checkmark 1 tap (S)
- Sur chaque ligne de set de l'exercice actif : champs poids/reps **pré-remplis avec la sortie du ProgressionEngine** (top-set + backoff, prédiction depuis les sets loggés AUJOURD'HUI, jamais replay de la dernière séance).
- Bouton checkmark unique à droite (cible ≥ 48 px) : 1 tap = set validé avec les valeurs affichées, ligne passe en état « done » (contraste fort, thème sombre).
- Colonne discrète **PREVIOUS** à gauche (ex. « 60×10 ») : perf de la dernière séance pour comparaison instantanée, non tapable, non éditable — pure référence visuelle (pattern Strong).
- Aucun clavier n'apparaît par défaut. Tap sur le chiffre = active les steppers (voir #6 du tableau) ; double-tap ou long-press = clavier numérique en fallback.
- Chrono cible : **≤ 3 s par set validé**, mesurable dès le premier build.

### 2. Explication une-phrase du « pourquoi » (S)
- Sous la suggestion du premier set de chaque exercice, une ligne de texte discrète (petite taille, couleur atténuée) qui verbalise la règle déclenchée : « **62,5 kg** — 3×12 atteint la dernière fois » / « **−2,5 kg** — plateau depuis 3 séances, tentative de relance » / « **Backoff −5 kg** — reps prédites sous ta fourchette » / « **Deload** — 12 j sans cet exercice ».
- Implémentation : le moteur retourne déjà une décision typée (promotion, backoff, plateau-break, deload absence, record attempt) → mapper chaque type sur un template de phrase FR avec les valeurs injectées. **Zéro nouvelle logique, uniquement de la surface.**
- Tap sur la phrase = petit sheet avec le détail (anchors des 5 dernières séances, condition de promotion, fourchette de reps). Jamais bloquant, jamais requis.
- C'est le différenciateur n°1 vs tout le marché : Liftosaur est le seul transparent (mais via code), Fitbod/RP/Juggernaut sont opaques et détestés pour ça.

### 3. « Reprendre la dernière séance » + save-as-template post-séance (M)
- Écran d'accueil : **bouton principal unique** = « Reprendre : [nom/date dernière séance] » avec la liste des exercices en aperçu. 1 tap → séance créée avec la même structure (exercices + nb de sets), **charges entièrement recalculées par l'algo** (récence, deload, plateau), jamais rejouées.
- En dessous : templates triés par **dernière exécution** (pas alphabétique, pas manuel), 1 tap chacun.
- À la fin d'une séance libre (non issue d'un template) : proposition discrète non-bloquante « Sauvegarder comme routine ? » dans le bilan — capture **a posteriori**, Evan ne « prépare » jamais une séance.
- Si une séance issue d'un template a divergé : mise à jour silencieuse ou chip discret « Mettre à jour la routine » dans le bilan. **Jamais** le dialogue bloquant « update template? » de Strong (piège documenté).

### 4. Rest timer auto bulletproof PWA (M)
- Déclenchement automatique au checkmark ; durée = réglage par exercice (existe déjà côté modèle) avec défaut global. Superset : skip entre membres, timer plein après le dernier membre du tour (règle métier existante).
- UI : bandeau non-bloquant en bas d'écran (thumb zone) avec temps restant, boutons −15 s / +15 s / passer. On peut continuer à naviguer/logger pendant qu'il tourne.
- **Fiabilité PWA (le vrai chantier)** :
  - à chaque démarrage de timer, persister `endTimestamp` en localStorage ; au retour de focus/visibilitychange/refresh, recalculer le restant depuis l'horloge — jamais de décompte en mémoire seule ;
  - **Wake Lock API** active pendant toute la séance (écran ne se verrouille pas) ;
  - notification de fin via **Service Worker** + vibration (`navigator.vibrate`) en fallback ;
  - tester explicitement : changement d'onglet, lock screen, kill de tab, mode avion.

### 5. Persistance locale à chaque set + reprise après crash (M)
- Écriture **IndexedDB à chaque checkmark** (pas à la fin de séance) : le set validé est committé localement avant tout feedback UI de succès.
- File de sync différée vers le backend : outbox pattern (opérations en attente rejouées au retour du réseau), idempotence par UUID de set.
- À l'ouverture de l'app : si une séance non terminée existe en local → bandeau « Reprendre la séance en cours ? » avec durée écoulée. Restauration complète : exercices, sets validés, timer, position dans le superset.
- Cas de test obligatoires : refresh en pleine séance, tab killée par iOS, perte réseau en sous-sol, fermeture PWA pendant le rest timer. **Zéro séance perdue = condition de survie face à Notes.**

---

## 4. Ordre d'exécution recommandé

1. **Sprint 1 (fondations du geste)** : #1 suggestion pré-remplie + #6 steppers + #2 explication une-phrase — les trois S qui définissent le geste central.
2. **Sprint 2 (fiabilité)** : #5 offline-first + #4 rest timer — les deux M qui conditionnent la confiance.
3. **Sprint 3 (réutilisation + flux)** : #3 reprendre la dernière séance + #7 superset auto-avance.
4. **Sprint 4 (intelligence visible)** : #8 bilan verdict + #9 warmup auto + #10 deload manuel.
5. Ensuite seulement : réévaluer plate calculator et RPE selon usage réel.
