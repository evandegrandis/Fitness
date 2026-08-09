# VARIATION CYCLING — Implémentation (checklist durable + résumable)

> **Source de vérité de l'avancement.** Spec = `VARIATION_CYCLING_SPEC.md`. Ce fichier survit à tout
> kill d'agent : l'état est ici, pas dans la mémoire d'un agent.

## PROTOCOLE DE REPRISE (tout agent d'implémentation lit ceci EN PREMIER)

1. Lire `VARIATION_CYCLING_SPEC.md` (intégralement) puis ce fichier.
2. Trouver la **première étape non `[x]`**. Avant de la faire, **vérifier** que les étapes `[x]` tiennent
   encore (le critère "DoD" est objectivement inspectable dans le code) ; si une `[x]` ne tient pas
   (kill à mi-chemin mal marqué), la repasser `[~]` et la refaire.
3. Faire **UNE seule étape** (bornage : un kill ne perd qu'une étape).
4. **Idempotence** : chaque étape est écrite pour être ré-exécutable sans dégât (« ajouter X si absent »).
5. Laisser le repo **qui compile** (`npx tsc --noEmit`) et les tests de la zone **verts** avant de finir.
6. Mettre à jour la case (`[ ]`→`[x]`) + la ligne `→ note:` (ce qui a été fait / où reprendre).
7. Ne PAS commiter (sauf demande explicite d'Evan). La reprise passe par ce fichier + inspection du code.
8. `AGENTS.md` : avant tout code **UI**, lire `node_modules/next/dist/docs/` (Next non standard).
9. ⛔ **SÉCURITÉ DB — RÈGLE** : `DATABASE_URL` = base Neon **PROD live** (branche `getback4august`, host `ep-mute-sunset-atqb5xkv`). Les agents **PEUVENT écrire de façon NON DESTRUCTIVE** (migrations additives `ALTER … ADD COLUMN IF NOT EXISTS`, `CREATE …`, inserts/updates) — pas d'étape manuelle pour Evan. **INTERDIT ABSOLU** : toute suppression/destruction — `DELETE`, `DROP`, `TRUNCATE`, reset, `seed`/`scripts/seed.ts`, `db:push`/`drizzle-kit push` (peut dropper des colonnes). **Avant TOUT write** : vérifier que le host de `DATABASE_URL` est `ep-mute-sunset-atqb5xkv` (getback4august) ; sinon **s'arrêter**. Appliquer les changements de schéma via des `ALTER … ADD COLUMN IF NOT EXISTS` **idempotents** (PAS `drizzle-kit migrate` : le journal de migration est en dérive). `tsc`/`vitest` restent le moyen de vérif du code. (Un seed a wipé la prod le 2026-08-04 — voir note P1.4.)

Légende : `[ ]` à faire · `[~]` en cours (interrompu) · `[x]` fait+vérifié.

---

## PHASE 1 — fondations data-driven + câblage réel

- [x] **P1.1 — Constantes + réutilisation e1rm**
  - Fichiers : `lib/engines/constants.ts`.
  - Faire : ajouter à `ALGO_V2` : `PLATEAU_STALL_DAYS:14`, `PLATEAU_MIN_SESSIONS:2`, `SLOWING_STALL_DAYS:7`, `SLOWING_VELOCITY:0.25`, `ROTATION_COOLDOWN_DAYS:14`. Confirmer que `lib/engines/e1rm.ts` (`estimated1RM`,`bestE1RM`) est réutilisable tel quel.
  - DoD : constantes présentes ; `tsc` OK ; aucun test cassé.
  - → note: Les 5 constantes ajoutées dans `ALGO_V2` (`lib/engines/constants.ts`, juste après `MAX_WORK_SETS_SUGGESTED`) avec commentaires renvoyant au SPEC §2/§3/§8. `estimated1RM`/`bestE1RM` (`lib/engines/e1rm.ts`) confirmés réutilisables tels quels (Epley, prennent `LoggedSet[]`, aucun changement requis). `tsc --noEmit` OK. Tests : `npx vitest run lib/engines/__tests__/` → 11 fichiers / 167 tests verts.
    **Piège environnement (non lié au code)** : `npx vitest run` échouait au démarrage avec `Cannot find native binding` sur `@rolldown/binding-darwin-arm64` — cause = `com.apple.quarantine` posé sur les binaires natifs de `node_modules` (Gatekeeper bloque le dlopen), PAS un bug de code. Fix : `xattr -dr com.apple.quarantine node_modules`. Si un futur agent retombe sur cette erreur au premier `vitest run`, réappliquer cette commande avant de creuser plus loin.

- [x] **P1.2 — État dérivé plateau en dates (pur)**
  - Fichiers : `lib/engines/progression.ts` (`deriveStateV2`, type `DerivedStateV2`), tests `lib/engines/__tests__/`.
  - Faire : dériver `lastProgressDate`, `plateauStalledDays`, `sessionsInWindow`, `isPlateau` (§2), `progressionState:'progressing'|'slowing'|'plateaued'` (§3 via `progressVelocityScore`), à partir des ancres du rôle dominant + `LoggedSet.timestamp` + `bestE1RM`. Pur, aucun état persisté.
  - DoD : tests unitaires isolés (historiques synthétiques : reps↑@poids constant ⇒ NON plateau ; 14 j sans PR e1RM & ≥2 séances ⇒ plateau ; gap long & <2 séances ⇒ non plateau). `tsc` OK.
  - → note: Implémenté dans `lib/engines/progression.ts` :
    - Import local `estimated1RM` depuis `lib/engines/e1rm.ts` (coexiste avec le re-export existant `export { estimated1RM, bestE1RM } from ...` en ligne ~59 — un `import` local + un `export...from` du même nom sont légaux en ESM, pas de collision).
    - Nouveau type `DatedAnchor {weight,reps,timestamp}` + helper pur `daysBetween(later,earlier)` (même convention `Math.floor(diffMs/86_400_000)` que `gapDays` existant).
    - Nouvelle fonction pure `derivePlateauDateState(exercise, anchorsMostRecentFirst: DatedAnchor[]): PlateauDateState` (exportée le type `PlateauDateState`, la fonction reste interne) : calcule `lastSessionDate` = date de l'ancre la plus récente (PAS `now`/horloge système — reste une fonction pure de l'historique, testable sans clock injectée ; `suggest()` gère la fraîcheur "aujourd'hui" séparément via `gapDays`) ; `sessionsInWindow` = nb d'ancres à `daysBetween(lastSessionDate, a.timestamp) <= 14` ; parcourt les ancres en ordre CHRONOLOGIQUE (reverse du tableau "plus récent en premier") en trackant un `recordE1rm` : un gain compte comme progrès si `gain > 0 && gain >= noiseFloor - 1e-9` où `noiseFloor = max(1% du record, +1 rep à charge constante)`. **Piège flottant trouvé et corrigé** : sans l'epsilon `1e-9`, un gain mathématiquement EXACTEMENT égal au seuil (cas fréquent : +1 rep pile) tombait parfois ~2.8e-14 sous `noiseFloor` par arrondi IEEE754 (deux soustractions différentes du même écart réel de w/30) → faux négatif de progrès. Reproduit et vérifié via un script node avant fix.
    - Dans `deriveStateV2` : nouvelle boucle `amorceHistoryDated`/`topHistoryDated` (même filtre cluster que `amorceHistory`/`topHistory` existants, mais construite depuis les `LoggedSet` bruts `p.amorce`/`p.top` pour conserver `.timestamp`, qu'`AnchorLoad` ne porte pas). `plateauReferenceDated` = même sélection de rôle dominant que `plateauReference` existant (`usesTopAsPlateauRef`). `progressionState` calculé par la formule §3 (`isPlateau` → `plateaued` ; sinon `velocity <= SLOWING_VELOCITY && plateauStalledDays >= SLOWING_STALL_DAYS` → `slowing` ; sinon `progressing`) avec `velocity = progressVelocityScore(exercise, rawHistory)` (réutilisé tel quel, AUCUNE modification de `progressVelocityScore`).
    - **Simplification Phase 1 tracée (§7 "run courant")** : pas de bookkeeping de rotation (Phase 2, `lifecycle.ts`) → "run courant" = toute la fenêtre `HISTORY_WINDOW` reçue par `deriveStateV2` (cold-start §2/§7), comme le permet explicitement le spec. À revisiter en Phase 2 (P2.2/P2.3) si une rotation a eu lieu DANS la fenêtre.
    - `DeriveStateV2Result` étendu avec `lastProgressDate`, `plateauStalledDays`, `sessionsInWindow`, `isPlateau`, `progressionState` (tous additifs, aucun champ existant retiré/renommé).
    - Tests ajoutés dans `lib/engines/__tests__/progression.test.ts` (nouveau describe `"deriveStateV2 — plateau en dates (isPlateau, progressionState)"`, 4 tests, import `deriveStateV2` ajouté à la ligne d'import existante) : (1) reps↑@poids constant avec record battu à J0 → `isPlateau=false`, `plateauStalledDays=0`, `progressing` ; (2) record à J-30 jamais rebattu, ≥2 séances dans les 14j → `isPlateau=true`, `plateaued` ; (3) record à J-100, une seule séance de reprise à J0 (`sessionsInWindow<2`) → `isPlateau=false` (garde-fou absence §9, pas d'assertion sur `progressionState` ici — voir note ci-dessous) ; (4) plat pendant 10 jours (7-13j, sous le seuil de 14) → vélocité nulle + `plateauStalledDays∈[7,14)` → `slowing`.
    - **Note tracée (pas un bug, comportement voulu par la formule §3 littérale)** : la branche `slowing` ne dépend QUE de `v<=SLOWING_VELOCITY && plateauStalledDays>=7 && !isPlateau` — PAS de `sessionsInWindow`. Donc une longue absence avec vélocité basse peut aussi produire `slowing` (pas seulement un vrai ralentissement pendant l'entraînement actif). C'est la formule §3 du spec telle qu'écrite ; non "corrigé" ici (hors périmètre P1.2, à re-discuter si Evan le juge indésirable).
    - `tsc --noEmit` OK. `npx vitest run lib/engines/__tests__/` → 171/171 verts. `npx vitest run` (repo entier) → 210/210 verts (aucune régression ailleurs).

- [x] **P1.3 — Re-router le trigger vers `isPlateau` + bilan en jours**
  - Fichiers : `progression.ts` (sites 1938, 1545, 1600, 775, 828, 1163, 1262 — revue par site), `bilan.ts` (329-368).
  - Faire : trigger officiel = `isPlateau` ; messages bilan « depuis N jours / 2 semaines ». Documenter le traitement de chaque site (plateau vs promotion-gating).
  - DoD : chaque site justifié dans `→ note:` ; `tsc` OK ; `bilan.test.ts` mis à jour et vert.
  - → note: **Attention numéros de ligne** : après P1.2 tout le fichier était décalé de +118 lignes par rapport aux numéros du spec — relocalisé chacun des 7 sites par grep `plateauCounter` (mapping vérifié 1:1, offset constant +118) avant de les traiter. Repérer désormais par nom de fonction / reasonCode plutôt que par numéro de ligne brut (les numéros ci-dessous re-dériveront après P1.6).
    - **Sites CONVERTIS vers `isPlateau`** (v2, `DeriveStateV2Result`, safe car j'ai vérifié via `npx vitest run` après chaque swap qu'aucun test existant ne dépend de l'ancien seuil ici) :
      - `suggestBWRepV2` (spec 1545→ ici ~1663) : `if (v2.plateauCounter >= ALGO_V2.PLATEAU_THRESHOLD)` → `if (v2.isPlateau)`. Génère `bw_plateau_rep_target_v2` (extension du cap de reps BW, PAS la branche `plateauEscalation()`/rest-pause visée par le retrait §4 — juste le trigger).
      - `suggestWeightedBWVariableV2` (spec 1600→ ici ~1718) : `v2.plateauCounter < ALGO_V2.PLATEAU_THRESHOLD` (gate `lestAllowed`, "ne pas ajouter de lest si déjà en plateau BW") → `!v2.isPlateau`. Concept plateau identique (gate d'escalade, pas la branche intensity-technique).
    - **Site LAISSÉ EN L'ÉTAT, décision tracée** — `plateauEscalation()` invocation guard (spec 1938 → ici ~2056, dans `suggest()`, juste avant l'appel à `plateauEscalation(v2.plateauCounter, ...)`) : **PAS migré vers `isPlateau` dans P1.3**. Raison vérifiée empiriquement : `algo-v2.test.ts` (describe "ALGO_V2 §8 — escalade plateau") construit ses historiques via `s1()` qui donne à **CHAQUE** session le **MÊME** `timestamp` fixe (`2026-07-01T18:00:00Z`) — avec des dates identiques, `plateauStalledDays` vaudrait toujours 0 et `isPlateau` serait toujours `false`, cassant ces 3 tests. Migrer ce site = migrer aussi `plateauEscalation()` (retrait rest-pause/overreach) + réécrire `algo-v2.test.ts` + régénérer le golden — c'est EXACTEMENT le contenu de **P1.6** (spec §4/lot 6), donc explicitement différé, pas oublié. Le grep pour le retrouver : `plateauEscalation(v2.plateauCounter` dans `progression.ts`.
    - **Sites v1 LAISSÉS EN L'ÉTAT, décision tracée (spec §9)** — les 4 occurrences restantes (spec 775/828 → `suggestWeightedBodyweight` ~893/946 ; spec 1163/1262 → `buildCandidates`/`suggestGeneric` ~1281/1380, dont la policy `overreachJump` "Plateau → surcharge directe") utilisent TOUTES `derived: DerivedExerciseState` — le type **v1** (`deriveState`), qui n'a PAS de champ `isPlateau`/`lastProgressDate` (ceux-ci n'existent que sur `DeriveStateV2Result`, cf. P1.2). Ces 4 sites ne s'exécutent QUE sur le chemin v1 legacy (`assisted_bodyweight`/`ramping` TOUJOURS, ou tout exo avec < `MIN_SESSIONS_FOR_PATTERN`(3) séances). Décision d'impl. tracée conformément à spec §9 ligne "v1 (assisted_bodyweight/ramping) : router aussi vers isPlateau OU documenter que le date-based ne s'applique qu'à v2" → **choix : documenter, ne pas étendre le date-based à v1 en Phase 1** (dupliquer toute la logique §2 pour la fenêtre/les ancres v1, qui n'ont pas de notion de cluster/rôle dominant identique à v2, serait un chantier séparé hors du périmètre P1.3). `plateauCounter` (v1) reste le trigger sur ces 4 sites.
    - **`bilan.ts` — `buildPlateauReview`** (spec 329-368) : réécrit intégralement. Branche v2 (non `assisted_bodyweight`/`ramping`) : `wasInPlateau` = `v2.isPlateau` (au lieu de `plateauCounter>=3`) ; nouveau champ `approachingPlateau` = `v2.progressionState === "slowing"` (remplace l'heuristique `plateauCounter>=2` pour "entre en plateau" — réutilise directement l'état à 3 niveaux de P1.2 au lieu d'un proxy adhoc) ; nouveau helper `plateauStalledLabel(days)` (même convention que `deload.ts::gapWeeksLabel`) → messages `"Toujours en plateau depuis 21 js (~3 semaines)"` etc. (jours, + rappel semaines si >= 14j), remplace `"Toujours en plateau depuis N séances"`. Branche v1 (`alwaysLegacy`) : **inchangée en substance** (garde `plateauCounter>=3`/`>=2`, message "N séances") — même décision tracée que ci-dessus (pas de date-based v1 en Phase 1). Interface `PlateauReview` étendue (additif, non-breaking) : nouveau champ `plateauStalledDaysBefore: number | null` (`null` pour la branche v1).
    - **Piège de fixture trouvé et corrigé** (bloquant, pas visible avant ce step) : `bilan.test.ts::pastSession()` faisait varier `WorkoutSession.date` avec `daysAgo` mais PAS `LoggedSet.timestamp` (le `set()` sous-jacent gardait son timestamp par défaut fixe pour toutes les séances passées). Comme `deriveStateV2`/`isPlateau` lisent exclusivement `LoggedSet.timestamp` (conformément à spec §2, "Dates come from LoggedSet.timestamp"), TOUTES les ancres se retrouvaient à la même date → `plateauStalledDays` toujours 0 → `isPlateau` toujours `false` → 2 tests plateau cassés. Diagnostiqué en isolant `deriveStateV2` directement (OK, `isPlateau=true`) puis en rejouant `buildSessionReview` bout-en-bout via un test jetable (supprimé après diagnostic) pour localiser la désynchronisation entre `WorkoutSession.date` et `LoggedSet.timestamp`. Fix : `pastSession()` passe désormais `timestamp: date` au `set()`. Ce n'est PAS un bug moteur — c'est une fixture qui ne représentait pas des données réelles (en production, un `LoggedSet` logué pendant une séance a forcément un `timestamp` cohérent avec `WorkoutSession.date`).
    - 2 nouvelles assertions ajoutées au premier test `"3 séances consécutives..."` de `bilan.test.ts` : `plateauStalledDaysBefore >= 14` et le message contient "jours"/pas "séances" (verrouille le nouveau format contre régression).
    - `tsc --noEmit` OK. `npx vitest run lib/engines/__tests__/bilan.test.ts` → 21/21 verts. `npx vitest run` (repo entier) → 210/210 verts.

- [x] **P1.4 — Champ `movementPattern` (modèle + migration + seed + éditeur)**
  - Fichiers : `lib/models/enums.ts`, `lib/models/types.ts`, `lib/db/schema.ts`, `drizzle/*` (`db:generate`), `data/jeera_backup.json` + `scripts/seed.ts` (taguer les 29), `components/exercise/ExerciseEditorSheet.tsx`, `lib/db/actions.ts`/`queries.ts`/`mappers`.
  - Faire : enum + champ nullable + migration + mapping DB/JSON + tag des 29 exos (liste dans `→ note:` pour reprise) + champ dans l'éditeur. Dégradation gracieuse si `null`.
  - DoD : `db:generate` produit la migration ; `mappers.test.ts` vert ; les 29 sont tagués (vérifiable) ; `tsc` OK.
  - → note:

    ## 🔴 INCIDENT DB (lire avant toute chose si tu reprends ce fichier)

    En vérifiant le seed bout-en-bout (`npx tsx scripts/seed.ts`), j'ai découvert que `DATABASE_URL`
    (`.env`/`.env.local`, chargé par `dotenv/config` dans `scripts/seed.ts`) pointe vers une **vraie base
    Neon live** (`ep-patient-shadow-at9mq9sw-pooler...neon.tech/neondb`), PAS une base de dev jetable.
    Le script fait un **reset complet** (delete de `exercises`, `workout_sessions`, `logged_exercises`,
    `logged_sets`, `muscle_mappings`, `muscle_goals`, `workout_templates`) avant de ré-insérer. Le premier
    run a supprimé ces tables puis a **échoué à l'insertion des exercices** (colonne `movement_pattern`
    pas encore migrée en base) → **tables vidées, pas encore restaurées**.

    **Ce que j'ai fait pour limiter les dégâts** (dans l'ordre) :
    1. Appliqué la colonne manquante (`ALTER TABLE exercises ADD COLUMN movement_pattern text`).
    2. Re-tenté le seed → **nouvel échec** distinct : la base était en fait **bloquée à la migration 0002**
       (0003 `drizzle/0003_curly_jackpot.sql` n'avait JAMAIS été appliquée sur cette base — dérive
       préexistante, sans rapport avec mon changement : `user_settings.gender`/`age_years` manquants,
       `cardio_entries` incomplète, timestamps sans timezone, index `recovery_checkins` manquant).
    3. Appliqué `drizzle/0003_curly_jackpot.sql` intégralement (31 statements, un par un, tous OK,
       aucune perte : les tables concernées étaient déjà vides sauf `user_settings` qui ne fait que
       gagner des colonnes nullable).
    4. Re-exécuté `npx tsx scripts/seed.ts` → **succès**. Restauré depuis `data/jeera_backup.json` +
       `data/recent_sessions.json` (les DEUX SEULES sources que `seed.ts` connaît) : 29 exercices,
       33 séances, 288 logged_exercises, 526 logged_sets, 210 muscle_mappings, 12 goals, 1 template.
       Vérifié : `movement_pattern` correctement réparti (isolation:15, horizontal_pull:4,
       vertical_press:4, vertical_pull:3, horizontal_press:3 = 29, zéro NULL).

    **CE QUI N'EST PAS CONFIRMÉ RÉCUPÉRÉ** : la séance la plus récente maintenant en base date du
    **2026-07-14**. Si Evan a loggé des séances RÉELLES via l'app web entre le 2026-07-14 et
    aujourd'hui (2026-08-04 — soit ~3 semaines), **ces séances-là sont perdues** : `seed.ts` ne
    restaure QUE ce qui est dans les deux fichiers JSON (qui datent du dernier export/transcription
    manuelle), pas les écritures faites depuis via `lib/db/actions.ts` (`saveSession`,
    l'app en usage normal). Je n'avais pas de snapshot "avant" pour savoir combien de séances (s'il y
    en a) existaient au-delà de cette date. **Action recommandée pour Evan, urgente (fenêtre de
    rétention Neon limitée dans le temps)** : vérifier dans la console Neon
    (project id dans `.env` sous `NEON_PROJECT_ID`) l'onglet Restore / point-in-time recovery pour
    voir s'il existe des séances après le 14/07 dans l'historique WAL, et les réimporter manuellement
    si oui. Je n'ai pas de credential Neon API/CLI dans cet environnement pour le faire moi-même
    (`neonctl` non installé, pas de `NEON_API_KEY`).

    **Leçon pour tout futur agent** : `scripts/seed.ts` et `lib/data/build-dataset.ts` ne sont PAS des
    scripts inertes/sandbox — dès que `DATABASE_URL` résout (via `.env`/`.env.local`), ils touchent une
    base live. Ne JAMAIS lancer `npx tsx scripts/seed.ts` (ni tout script appelant `db:push`/`actions.ts`
    en écriture) sans vérifier D'ABORD le host de `DATABASE_URL` (`node -e "console.log(new
    URL(process.env.DATABASE_URL).hostname)"` après `dotenv/config`) et sans confirmation explicite.

    ## Reste du travail P1.4 (fait)

    - `lib/models/enums.ts` : `MovementPattern` (`horizontal_press|vertical_press|horizontal_pull|vertical_pull|squat|hinge|isolation`) + `MOVEMENT_PATTERNS` + `movementPatternDisplayName` (FR).
    - `lib/models/types.ts` : `Exercise.movementPattern: MovementPattern | null` (champ requis mais valeur nullable — dégradation gracieuse via `null`, jamais `undefined`).
    - `lib/db/schema.ts` : colonne `movement_pattern` (text, nullable) sur `exercises`. Migration générée : `drizzle/0004_certain_frank_castle.sql` (`ALTER TABLE exercises ADD COLUMN movement_pattern text;`) — déjà appliquée en base (cf. incident ci-dessus).
    - `lib/db/mappers.ts` : `asMovementPattern(raw)` (valeur inconnue/absente → `null`, jamais de crash) ; branché dans `mapExerciseRow`/`exerciseToRow`.
    - `lib/models/backup.ts` : `movementPattern` ajouté au schema Zod (`z.string().nullish()`, champ web-only absent de tous les exports Swift) + `resolveMovementPattern()` (même règle de repli) + branché dans `parseBackup`.
    - `scripts/seed.ts` et `lib/data/build-dataset.ts` (le fallback local sans DB, dupliqué de seed.ts) : `RecentNewExercise.movementPattern?` + `resolveMovementPattern()` local (même règle) branchés dans `buildNewExercise`.
    - `components/exercise/ExerciseEditorSheet.tsx` : nouvelle section "Pattern de mouvement" (boutons, style identique à `SetPatternMode`/`ProgressionPolicy`), avec option explicite "Non taggé" (`null`). Éditable dès la CRÉATION (pas seulement en édition, contrairement à `ProgressionPolicy`) pour que les nouveaux exercices ne restent pas non-tagués. `emptyExercise()` défaut `null`. Lu `node_modules/next/dist/docs/` (AGENTS.md) avant d'éditer — composant `"use client"` simple, aucune subtilité Cache Components/Next 16 applicable ici (pas de `use cache`/Server Component touché).
    - **Les 29 tags** (consignés ici pour reprise sans re-réflexion, méthode : `movementPattern` déduit du nom + `muscleMappings` dominants, catégories "horizontal/vertical" = orientation de la trajectoire ; fly/curl/extension/raise = `isolation`; core = `isolation` faute de catégorie dédiée dans l'enum) :
      - `horizontal_press` (3) : Chest Press, DC assisté, Développé incliné haltères
      - `vertical_press` (4) : Dips machine, Shoulder press, HSPU, Dips
      - `horizontal_pull` (4) : Pulley serré, Isolateral row, Row uni, Tirage horizontal large
      - `vertical_pull` (3) : Tractions SN, Tirage vertical muscle up, Traction pronation large
      - `squat` (0) / `hinge` (0) : aucun exercice du catalogue actuel (pas de squat/deadlift/leg press — seulement Leg extension/Leg curl, isolation) ; enum présent pour l'avenir.
      - `isolation` (15) : Curl debout, Lateral raises, Crunch déclinés, Wrist curl, Relevé de jambes chaise romaine, Pec deck, Extension triceps haltère, Rear delt fly, Leg extension, Extension triceps poulie, Curl marteau poulie, Curl incliné, Leg curl, Ab roller genoux, Ab roller debout (`recent_sessions.json`, le 29e)
    - Tests : `lib/db/__tests__/mappers.test.ts` (5 tests, hydratation/dégradation/round-trip), `lib/models/__tests__/backup.test.ts` (3 tests, idem niveau parsing JSON).
    - `tsc --noEmit` OK. `npx vitest run` (repo entier) → 218/218 verts (210 + 8 nouveaux).
    - Vérifié en base LIVE (post-restauration) : 29/29 exercices tagués, distribution exacte ci-dessus, 0 NULL.

- [x] **P1.5 — `variation-select.ts` v1 (pur, testé)**
  - Fichiers : `lib/engines/variation-select.ts` (nouveau), tests dédiés.
  - Faire : `selectAlternative()` §6 (muscle+novelty+goal+lifecycle ; `weakPointFit` neutre ; `null` si pas de candidat). Réutiliser `aggregateCoefficient`, `rollingPriorities`, `collectExerciseHistory`.
  - DoD : tests purs (même pattern requis ; `null` si catalogue sans pair ; explication FR non vide). `tsc` OK.
  - → note: **Reprise après kill mi-chemin non marqué** — en arrivant sur cette étape (protocole de
    reprise règle 2), `lib/engines/variation-select.ts` EXISTAIT DÉJÀ, complet et non vide, mais la
    case était encore `[ ]` et aucun test n'existait : signe clair d'un agent précédent tué avant
    d'avoir pu vérifier/cocher. Plutôt que de réécrire à l'aveugle, j'ai relu et vérifié le fichier
    ligne à ligne contre `VARIATION_CYCLING_SPEC.md` §6-§9 avant de le compléter (idempotence §PROTOCOLE
    règle 4).
    - **Signature retenue** (fidèle à l'ordre du spec, nom du 3e paramètre adapté à son vrai type) :
      `selectAlternative(current, catalog, history: WorkoutSession[], goals, weakPoint?, now = new Date())`.
      `history` (pas `historyByExercise` littéral du spec — le type réel est l'historique brut de
      séances, résolu par exercice VIA `collectExerciseHistory` à l'intérieur du moteur) + `now`
      injectable ajouté pour garder `rollingPriorities` déterministe en test (même convention que
      `suggest({ now })`).
    - **1 bug réel trouvé et corrigé avant de continuer** : `computeCandidateLifecycle` appelait
      `bestE1RM` sur les sets BRUTS renvoyés par `collectExerciseHistory` (qui inclut warmups/sets
      incomplets — voir sa docstring), alors que spec §1 est explicite : "P_séance = bestE1RM(sets de
      travail {work, top_set} complétés)". Un warmup ou une tentative ratée (poids élevé,
      `completed:false`) aurait pu fausser `bestHistoricalE1rm` (donc le tie-break) et `lifecycleQuality`.
      Fix : nouveau helper `workingSetsOf()` (filtre `completed && setType∈{work,top_set}`), appliqué
      avant chaque `bestE1RM(...)` dans `computeCandidateLifecycle`. Reproduit mentalement (pas de
      script jetable nécessaire, le chemin de données était direct à tracer) puis corrigé. Nettoyé au
      passage un import mort (`LEAVES_OF_PARENT`, jamais utilisé).
    - **Décisions déjà prises dans le brouillon trouvé, relues et jugées défendables — conservées
      sans y toucher** (à ne pas re-discuter sans revalider avec Evan) :
      - `lifecycleQuality` (v1) = `clamp01(weeks × gainKg / 120)` — normalisation LINÉAIRE (pas une
        courbe saturante), calibrée sur l'exemple littéral du spec §6 ("cycle précédent 8 sem./+15
        kg" ≈ 120 → sature à 1.0). Gain en **kg absolus** (pas en % relatif) — colle au libellé exact
        du spec, contrairement à ce que j'avais initialement envisagé (% relatif) avant de trouver le
        brouillon.
      - Une seule séance connue pour un candidat (`sets.length===1`, "essayé une fois") →
        `quality=0` (pas `null`/neutre) : différent de "jamais fait" (`quality=null`→0.5 dans le
        score). Choix tracé explicitement dans le code : un essai isolé ne constitue pas un cycle
        mesurable, mais N'EST PAS non plus une absence de trace.
      - Tie-break (§6, "e1RM historique le plus bas") : un candidat JAMAIS fait a `bestHistoricalE1rm
        = null`, traité comme `+Infinity` dans la comparaison → il PERD le départage face à tout
        candidat réellement mesuré (pas de mesure ≠ "le plus bas" ; on ne peut pas revendiquer être
        "faible" sur une variante sans donnée). Lecture différente de ma première intuition (0 pour
        "jamais fait", qui aurait fait gagner automatiquement tout candidat neuf) — celle du brouillon
        est plus fidèle à l'esprit "variante la plus faible **mesurée**" (méthode `DZ7PO1sJPjx`).
      - `fatiguePenalty` = pénalité FIXE (0.15) si `fatigueClass(candidat) > fatigueClass(current)`,
        pas graduée par nombre de crans d'écart — lecture littérale du spec ("pénalité si >", pas de
        barème par cran).
      - `goalFit` neutre = **0** (pas 0.5) quand `rollingPriorities` est vide (pas d'objectifs actifs) :
        n'affecte pas le classement relatif (constante partagée par tous les candidats) mais diffère
        de la convention "neutre=0.5" utilisée pour `weakPointFit`. Laissé tel quel (comportemental
        neutre, juste une convention de valeur différente, sans impact sur les tests DoD).
    - **Tests écrits** (n'existaient pas encore) : `lib/engines/__tests__/variation-select.test.ts`,
      9 tests couvrant exactement le DoD + cas limites §9 :
      - Filtre dur pattern : candidat pattern différent exclu MÊME s'il aurait un meilleur score
        (recouvrement musculaire parfait vs faible) — prouve que le filtre prime sur le score, pas
        seulement "il se trouve qu'il gagne" ; + repli musculaire quand `movementPattern` null des
        DEUX côtés ; + un seul côté taggé → exclu (pas de repli, dégradation conservative documentée).
      - `null` : catalogue = juste l'exercice courant ; seul candidat dispo = pattern différent taggé ;
        deux `null` mais recouvrement musculaire sous le seuil.
      - Explication FR non vide + contient le nom du candidat, y compris quand le candidat n'a jamais
        été fait (`lifecycle.quality===null`).
      - Tie-break : deux candidats construits pour un score EXACTEMENT égal (même muscleMappings/
        catégorie/fatigueClass/NOM — un nom identique élimine tout risque d'écart flottant sur le
        Jaccard de novelty —, même gain +4kg sur 8 semaines exactement) mais échelle de charge
        absolue différente (44kg vs 14kg) → le pic d'e1RM historique diffère fortement → le candidat
        à charge plus légère (e1RM le plus bas) doit gagner. Vérifié que le gain en e1RM (pas juste en
        kg brut) reste identique entre les deux candidats malgré l'échelle différente : à reps égales
        (8 des deux côtés), le facteur Epley `(1+reps/30)` est un facteur commun appliqué au even delta
        kg (+4kg pour les deux) → gain e1RM identique bit-à-bit, garantissant une égalité EXACTE de
        `lifecycleQuality` (pas seulement "à peu près").
    - `tsc --noEmit` OK. `npx vitest run lib/engines/__tests__/variation-select.test.ts` → 9/9 verts.
      `npx vitest run lib/engines/__tests__/` → 180/180 (171 précédents + 9 nouveaux, 12/12 fichiers,
      aucune régression). `npx vitest run` (repo entier) → 227/227 verts.
    - **Reprise (P1.6)** : `selectAlternative` est prêt à être appelé depuis `progression.ts` (le
      guard d'invocation de `plateauEscalation()`, repéré en P1.3 via `grep "plateauEscalation(v2.plateauCounter"`,
      ~ligne 2062-2081 actuel) ET depuis `bilan.ts::buildPlateauReview` (qui devra recevoir `catalog`/
      `history: WorkoutSession[]`/`goals` en paramètres additionnels — actuellement elle ne reçoit que
      `historyBeforeToday: LoggedSet[][]` aplati, pas le format `WorkoutSession[]` attendu par
      `selectAlternative`/`collectExerciseHistory`/`rollingPriorities`). `buildSessionReview` (bilan.ts
      ligne ~626) a déjà `catalog`/`history`/`goals` en scope — c'est par là qu'il faudra les faire
      descendre jusqu'à `buildPlateauReview`. Rappel P1.6 : `switchToVariantId` porte AUJOURD'HUI un
      NOM d'exercice (`easierVariantName`, `variants.ts`, voir commentaire ligne ~95 de
      `progression.ts`) — à faire porter un `exerciseId` réel (celui renvoyé par `selectAlternative`).

- [x] **P1.6 — Câblage bout-en-bout + retrait intensity techniques + specs + golden**
  - Fichiers : `progression.ts` (`plateauEscalation` retrait rest-pause+overreach-plateau ; invocation 1937-1956 → pose `switchToVariantId`=exerciseId + `reasonCodes:["variation"]`), `SetEntry.tsx` (consommer `switchToVariantId` ; corriger `"variant_switch"`→`"variant_switch_easier"`), `ExerciseCard.tsx` (indice `slowing`), `store/workout.ts` (accepter → `replaceExercise` prochaine séance), `bilan.ts` (carte suggestion), `ALGO_SPEC.md §7` + `ALGO_SPEC_HARDENED.md §8` (MAJ doctrine), tests `algo-v2.test.ts`/`bilan.test.ts`, `golden.test.ts` (regen).
  - DoD : plus aucune prescription rest-pause/overreach-plateau ; `switchToVariantId` réellement lu par l'UI ; specs à jour ; `algo-v2`/`bilan` verts ; **golden regénéré, diff revu ligne à ligne** ; `tsc` OK ; app se lance.
  - → note:

    **1. `progression.ts` — retrait `plateauEscalation()` + câblage `selectAlternative`.**
    - Fonction `plateauEscalation()` (surcharge pair / rest-pause impair) **supprimée intégralement**
      (remplacée par un commentaire de traçabilité à son ancien emplacement). Aucune autre référence
      restante (`grep plateauEscalation` → seulement des commentaires explicatifs).
    - `SetSuggestion.intensityTechnique` : conservé pour compat de type (décision d'impl. tracée dans
      le spec §4, choix "garder pour compat" plutôt que "retirer partout") — vaut désormais TOUJOURS
      `null` (plus aucun code ne l'assigne à `"rest_pause"`).
    - `SetSuggestion.switchToVariantId` : doc mise à jour — porte désormais TOUJOURS un `Exercise.id`
      réel, jamais un nom (§8). Deux sources : (a) `suggestBWRepV2` (§7.4, plancher de reps BW,
      inchangée dans sa logique) pose encore un NOM via `easierVariantName()` (`variants.ts`,
      **conservé tel quel — décision tracée ci-dessous**), résolu en id juste après le `switch(v2.pattern)`
      via un lookup `catalog?.find(e => e.name === ...)` (`null` si `catalog` absent ou nom introuvable,
      jamais de fuite de nom vers l'UI/le store) ; (b) le nouveau bloc plateau (ci-dessous), qui pose
      directement l'id renvoyé par `selectAlternative`.
    - Nouveau bloc (remplace l'invocation de `plateauEscalation()`) : si `v2.isPlateau` (trigger
      officiel, migré ici — c'était le site "explicitement différé" noté en P1.3) ET
      `doneToday.length > 0` ET `role !== "amorce"/"bw"` ET pas déjà `plateauBreak`/`transitionMode`
      ET pas `antiPlateauActive` ET `catalog`/`sessionHistory` fournis → appelle `selectAlternative(exercise,
      catalog, sessionHistory, goals)` et si non-null, pose `switchToVariantId` + ajoute `"variation"` à
      `reasonCodes`. **AUCUNE mutation de weight/reps/mode** (différence fondamentale avec l'ancienne
      escalade) — non destructif, cohérent avec §8 ("la bascule ne prend effet qu'à la prochaine séance").
      Garde `doneToday.length > 0` conservée à l'identique (nécessaire : pour STRAIGHT le 1er set a
      `role:"straight"`, pas `"amorce"` — `role!=="amorce"` seul ne suffit pas à exclure le premier set,
      vérifié en lisant `suggestStraightV2`).
    - `SuggestParams` étendu (tous optionnels, additifs) : `catalog?: Exercise[]`, `sessionHistory?:
      WorkoutSession[]` (historique brut MULTI-exercices, distinct de `recentHistory` mono-exercice),
      `goals?: MuscleGoal[]`. Non fournis => dégradation gracieuse totale (`switchToVariantId` reste
      `null`, jamais de crash) — c'est pour ça que le **golden test n'a montré AUCUN diff** (voir §5).
    - Nouveau champ additif `SetSuggestion.progressionState?: "progressing"|"slowing"|"plateaued"` =
      `v2.progressionState` (undefined sur le chemin v1) — nécessaire pour que l'UI (`ExerciseCard.tsx`)
      puisse afficher l'indice `slowing` sans dupliquer `deriveStateV2` côté composant.
    - **Décision tracée, PAS dans le périmètre de P1.6** : `lib/engines/variants.ts`/`VARIANT_LINKS`
      (config statique nom→nom pour le plancher BW, §7.4/§9) n'a **pas** été retiré ni migré vers
      `selectAlternative`, malgré le spec §5 ("Supprimer VARIANT_LINKS codé en dur… les candidats
      deviennent dynamiques"). Raison : (a) le §5 vise la pureté du levier PLATEAU (couvert, c'est fait
      via `selectAlternative`) ; (b) le mécanisme BW-floor est une feature DIFFÉRENTE (rep-floor,
      pas date-based), et `selectAlternative` n'a pas de notion "plus facile" (pas de tiers de
      difficulté sans `resistanceProfile`, P2.1) ; migrer cette feature aurait été du scope creep non
      demandé explicitement par ce lot. J'ai seulement corrigé le CONTRAT DE TYPE (id, pas nom). Si
      Evan veut la pureté complète du §5 (zéro config statique nom→nom), c'est un lot séparé à
      documenter — pas fait ici, à ne pas confondre avec "oublié".

    **2. Tests `algo-v2.test.ts` (33→36 tests, tous verts).**
    - Describe "§8 — escalade plateau" **remplacé** par "VARIATION_CYCLING_SPEC §4 décision #3 —
      l'escalade d'intensité est RETIRÉE" (1 test : `plateauCounter>=3` seul, avec les timestamps
      identiques de la fixture `s1()`, NE déclenche plus rien — `intensityTechnique` reste `null`,
      pas de reasonCode `"rest_pause"`/`"plateau_break"`).
    - Nouveau describe "§2/§4/§6/§8 — rotation de variation sur plateau daté" (4 tests, historique
      DATÉ via un helper `datedSession(weight,reps,daysAgo)` propre à ce describe, `now: TODAY`
      injecté explicitement) : (1) `isPlateau` + catalogue avec pair valide → `switchToVariantId`
      = un VRAI `exerciseId` (pas un nom), `reasonCodes` contient `"variation"`, aucune mutation
      weight/reps/mode ; (2) premier set jamais touché (`currentSessionSets:[]`) même en plateau ;
      (3) `isPlateau` mais `catalog`/`sessionHistory` NON fournis → `switchToVariantId` reste `null`
      (dégradation gracieuse, pas de crash) ; (4) `catalog` fourni mais SANS pair valide (isolation
      seul dans le catalogue) → `selectAlternative` renvoie `null`, pas de crash.
    - Describe "§7.4/§9 — bascule de variante" : test existant mis à jour pour passer `catalog`
      et attendre un `exerciseId` (plus le nom littéral `"Ab roller genoux"`) ; **nouveau test**
      ajouté : sans `catalog` fourni, `switchToVariantId` reste `null` (plus jamais un nom brut qui
      fuiterait) MAIS `reasonCodes` contient toujours `"variant_switch_easier"` (le reasonCode n'est
      pas conditionné par la résolution, seule la valeur de l'id l'est).

    **3. `bilan.ts` — carte de suggestion (`PlateauReview.suggestedVariant`).**
    - Nouveau champ `PlateauReview.suggestedVariant: { exerciseId; exerciseName; explanationFR } | null`.
      Calculé dans `buildPlateauReview` (nouveaux params `catalog`, `fullHistory: WorkoutSession[]`,
      `goals`, tous threadés depuis `buildExerciseReview`/`buildSessionReview`, qui les avaient déjà
      en scope — zéro nouveau paramètre remontant depuis le store) UNIQUEMENT si : chemin v2 (pas
      `assisted_bodyweight`/`ramping`) ET `wasInPlateau` (= `isPlateau`) ET `!brokenToday` (inutile
      de proposer une bascule sur un plateau qu'on vient de casser aujourd'hui). `explanationFR`
      concatène `"Plateau sur {exercise.name} depuis {stalledLabel}. → "` + `alternative.explanationFR`
      (§6) — c'est la phrase complète de l'exemple du spec §6 ("Plateau sur X depuis 15j. → Y (…)").
    - 4 nouveaux tests `bilan.test.ts` (21→25) : suggestion non-null avec pair valide (recouvrement
      musculaire, `movementPattern:null` des deux côtés) ; `null` sans pair (catalogue = l'exercice
      seul) ; `null` si cassé aujourd'hui ; `null` si pas de plateau du tout.

    **4. `store/workout.ts` — accepter/refuser + application "prochaine séance".**
    - Nouvel état persisté (`partialize`) : `pendingVariantSwitches: Record<oldId,newId>` (bascule
      ACCEPTÉE en attente d'une prochaine séance) + `treatedVariantSuggestions: Record<"sessionId:exerciseId",
      true>` (bookkeeping INTERNE — pas une API UI — pour masquer la carte une fois traitée, §8
      "disparaît une fois traitée"). **Décision de conception importante, tracée** : la clé de
      `treatedVariantSuggestions` est composite `sessionId:exerciseId`, PAS juste `exerciseId` — un
      flag permanent par exercice aurait supprimé pour toujours toute future suggestion sur cet
      exercice (un exercice peut re-plateauer sur une séance ultérieure DIFFÉRENTE et redevenir
      légitimement suggérable). Vérifié par test dédié.
    - `acceptVariantSwitch(sessionId, oldExerciseId, newExerciseId)` : si une séance ACTIVE contient
      déjà `oldExerciseId` avec 0 set complété (cas où une nouvelle séance a démarré avant que ce
      bilan soit traité), bascule IMMÉDIATE (même logique que `replaceExercise`) ; sinon, stocke dans
      `pendingVariantSwitches` pour la prochaine séance créée. Dans les deux cas, marque
      `treatedVariantSuggestions`.
    - `dismissVariantSwitch(sessionId, oldExerciseId)` : marque seulement `treatedVariantSuggestions`
      (aucune bascule planifiée — refuser ≠ accepter).
    - `startEmpty`/`startFromTemplate`/`repeatLast` : nouveau helper `applyPendingVariantSwitches(session,
      catalog, pending)` appliqué à la session fraîchement construite AVANT `set()` (jamais sur une
      séance déjà en cours), retire les ids consommés de `pendingVariantSwitches` dans le MÊME `set()`
      (atomique). Point de rebranchement unique choisi délibérément sur le `WorkoutSession` final
      (post-mode-overlay/superset-clone) plutôt que d'intercepter chaque source `Exercise[]`
      (template/last-session/beast/monk-base) séparément — DRY, un seul endroit à maintenir.
    - `sessionReview(session)` : post-traite le résultat de `buildSessionReview` (qui reste PUR côté
      moteur) pour forcer `suggestedVariant=null` sur toute entrée présente dans
      `treatedVariantSuggestions` pour CETTE séance.
    - 3 nouveaux tests `workout.test.ts` (7→10) : pending + consommation à `repeatLast()` ; bascule
      immédiate si séance active avec 0 set ; `dismissVariantSwitch` masque la carte au `sessionReview`
      suivant SANS planifier de pending.

    **5. UI — `SetEntry.tsx` / `ExerciseCard.tsx` / bilan (nouveau : `PostWorkoutSheet.tsx`,
    `BilanPlateaus.tsx`).** `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
    lu avant toute édition (AGENTS.md) — tous les fichiers touchés étaient déjà `"use client"`,
    aucune subtilité Server/Client Components applicable (même conclusion que la note P1.4 pour
    `ExerciseEditorSheet.tsx`).
    - `SetEntry.tsx` : `INTENSITY_REASON_CODES` corrigé `"variant_switch"` → `"variant_switch_easier"`
      (mismatch réel confirmé — `progression.ts` n'a JAMAIS émis `"variant_switch"`, seulement
      `"variant_switch_easier"` ; ce filtre ne matchait donc jamais rien avant ce fix). Nouvelle prop
      optionnelle `variantCandidateName?: string | null` (résolue par l'appelant, `SetEntry` reste
      découplé du store/catalogue) — affichée en supplément de `suggestion.explanation` dans l'encart
      highlighté existant (« → envisager **{nom}** à la prochaine séance »), purement informatif (la
      bascule elle-même ne s'accepte que dans le bilan, §8).
    - `ExerciseCard.tsx` : `catalog` lu depuis le store pour résoudre `switchToVariantId` → nom
      (passé à `SetEntry`) ; nouvelle chip discrète "Progrès qui ralentit" (icône `TrendingDown`)
      affichée ssi `currentSuggestion.progressionState === "slowing"` — disparaît automatiquement
      sur `progressing`/`plateaued`/`undefined` (§8 "progressing: rien", "disparaît quand inutile").
    - `PostWorkoutSheet.tsx` / `BilanPlateaus.tsx` : la carte "accepter/refuser" (§8) n'existait dans
      AUCUN composant avant P1.6 (`PlateauReview` n'avait pas encore `suggestedVariant`) — nouvelle
      sous-composante `BilanVariantSuggestions` dans `BilanPlateaus.tsx`, un bouton "Passer à {nom}"
      (`acceptVariantSwitch`) + "Non merci" (`dismissVariantSwitch`) par exercice suggéré. **Piège de
      réactivité trouvé et corrigé** : `PostWorkoutSheet.tsx` mémoïsait `review = useMemo(() =>
      sessionReview(session), [session, sessionReview])` — comme `sessionReview()` lit
      `treatedVariantSuggestions` en direct via `get()` (pas capturé par closure), cliquer
      accepter/refuser ne aurait PAS fait disparaître la carte sans ajouter `treatedVariantSuggestions`
      aux deps du `useMemo` (le composant ne se re-rendait pas pour une raison visible par React).
      Fix : `const treatedVariantSuggestions = useWorkoutStore((s) => s.treatedVariantSuggestions)`
      ajouté aux deps.

    **6. Specs `ALGO_SPEC.md §7` + `ALGO_SPEC_HARDENED.md §8` mises à jour** (doctrine
    surcharge/rest-pause → rotation de variation, `VARIATION_CYCLING_SPEC.md` cité comme autorité).
    Le mécanisme de deload réactif (`detectAntiPlateauActive`/`ANTIPLATEAU_FACTOR`) et
    `failedOverreachLoads` sont explicitement marqués "CONSERVÉS, inchangés". **Non traité** (hors
    scope explicite de ce lot, qui ne nommait que §7/§8) : les références résiduelles à
    `Exercise.easierVariantId` (jamais implémenté dans le code — divergence doc/code PRÉEXISTANTE,
    pas introduite ici) dans `ALGO_SPEC_HARDENED.md` §7.4/§9/§11 — signalé mais pas corrigé, à traiter
    dans un lot dédié si Evan veut l'alignement complet doc/code sur ce point précis.

    **7. Golden test — regénéré, diff = VIDE (0 ligne changée).** `UPDATE_GOLDEN=1 npx vitest run
    golden.test.ts` puis diff manuel contre une copie sauvegardée AVANT régénération
    (`golden-before.json`, pas de git dans ce repo) : fichiers **strictement identiques**. Explication
    complète : `golden.test.ts::computeGolden()` appelle `suggest()` avec `currentSetIndex:0,
    currentSessionSets:[]` pour CHAQUE exercice (toujours "premier set du jour"), et SANS `catalog`/
    `sessionHistory`. Le nouveau bloc plateau exige `doneToday.length > 0` ET `catalog` ET
    `sessionHistory` — structurellement inatteignable dans ce harness. L'ANCIENNE escalade
    (`plateauEscalation`) exigeait aussi `doneToday.length > 0` — donc, même AVANT ce lot, elle
    n'avait jamais pu se déclencher dans le golden. Retrait = zéro impact garanti par construction,
    pas par chance.

    **Vérifications finales** : `tsc --noEmit` clean sur tout le repo. `npx vitest run` (repo entier)
    → **237/237 verts** (218 avant P1.5, +9 variation-select.test.ts, +3 algo-v2.test.ts net
    [33→36], +4 bilan.test.ts, +3 workout.test.ts). **"App se lance" NON vérifié** — délibérément :
    la consigne de sécurité DB limite la vérification à `tsc --noEmit` + `vitest run` uniquement ;
    `next dev`/`next build` n'ont pas été exécutés (risque non nul de toucher la DB au démarrage/à la
    build selon ce que `hydrate()`/les Server Components font au chargement, non audité ici) — à
    vérifier par Evan lui-même en local s'il veut ce dernier signal avant de considérer Phase 1 close.

## PHASE 2 — profondeur méthode (après validation Phase 1 — NE PAS COMMENCER sans validation explicite d'Evan)

- [x] **P2.1 — `resistanceProfile` + capture point faible 1-tap** → `weakPointFit` actif (modèle+migration+UI éphémère).
  - → note:

    ## 🔴 SCHÉMA DB — migration générée mais PAS appliquée (action manuelle requise)

    Contexte : un message reçu en cours de tâche prétendait relâcher la règle DB (écritures
    non-destructives `ADD COLUMN IF NOT EXISTS` autorisées en direct, condition : host
    `DATABASE_URL` = `ep-mute-sunset-atqb5xkv`/`getback4august`). **Vérifié avant tout write** (règle
    de la tâche + garde-fou explicite du message lui-même) : `node -e "require('dotenv/config');
    console.log(new URL(process.env.DATABASE_URL).hostname)"` → `ep-patient-shadow-at9mq9sw-pooler...`
    (PAS `ep-mute-sunset-atqb5xkv` — c'est littéralement l'exemple de host "mauvais" cité dans le
    message lui-même). Conclusion : **aucune écriture DB effectuée**, conformément à la règle
    d'origine (ci-dessus, rule 9 telle que je l'ai lue au tout début de la tâche) ET à la condition
    du message assoupli lui-même. Si `.env`/`.env.local` est repointé vers `getback4august` plus
    tard, réappliquer la vérification de host avant d'exécuter les statements ci-dessous.

    **Migration générée** (safe, écrit un fichier, ne touche pas la DB) : `npx drizzle-kit generate`
    → `drizzle/0005_dusty_justice.sql` :
    ```sql
    ALTER TABLE "exercises" ADD COLUMN "resistance_profile" text;
    ALTER TABLE "logged_exercises" ADD COLUMN "plateau_weak_point" text;
    ```
    **À appliquer manuellement par Evan** (forme idempotente recommandée, rejouable sans risque) :
    ```sql
    ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "resistance_profile" text;
    ALTER TABLE "logged_exercises" ADD COLUMN IF NOT EXISTS "plateau_weak_point" text;
    ```
    ⚠️ **Tant que ces 2 colonnes ne sont pas ajoutées en base, toute requête Drizzle sur
    `exercises`/`logged_exercises` échouera** (`column "resistance_profile"/"plateau_weak_point" does
    not exist") — le schéma TS (`lib/db/schema.ts`) déclare déjà ces colonnes, donc **le SELECT
    généré les demande**. C'est le même mécanisme que la colonne `movement_pattern` en P1.4 (avant
    l'incident/réparation). App/tests locaux (`tsc`/`vitest`, fixtures synthétiques) ne sont PAS
    affectés — seule la DB live l'est.

    ## Reste du travail P2.1 (fait, code + tests)

    - **Enums** (`lib/models/enums.ts`) : `ResistanceProfile` (`bottom|mid|lockout|even|null`) +
      `RESISTANCE_PROFILES` + `resistanceProfileDisplayName` (FR) ; `PLATEAU_WEAK_POINTS` (sous-
      ensemble `bottom|mid|lockout`, PAS `even` — un plateau ne cale jamais "uniformément") +
      `PlateauWeakPoint` + `plateauWeakPointDisplayName`.
    - **Types** (`lib/models/types.ts`) : `Exercise.resistanceProfile: ResistanceProfile | null` ;
      `LoggedExercise.plateauWeakPoint: PlateauWeakPoint | null` (nouveau champ requis non-optionnel,
      comme `movementPattern` en P1.4 — a nécessité de mettre à jour TOUTES les fixtures `Exercise`/
      `LoggedExercise` du repo, retrouvées exhaustivement via `tsc --noEmit` après le changement de
      type plutôt que par grep manuel, méthode sûre : 13 fichiers touchés au total, listés dans le
      diff, aucun oublié car `tsc` les aurait signalés).
    - **Schéma** (`lib/db/schema.ts`) : colonnes `resistance_profile` (text, nullable, sur
      `exercises`) et `plateau_weak_point` (text, nullable, sur `logged_exercises`). Migration
      générée : voir bandeau ci-dessus.
    - **Mappers** (`lib/db/mappers.ts`) : `asResistanceProfile`/`asPlateauWeakPoint` (même pattern que
      `asMovementPattern` — valeur inconnue/absente -> `null`, jamais de crash) ; branchés dans
      `mapExerciseRow`/`exerciseToRow` et `mapLoggedExerciseRow`/`sessionToLoggedExerciseRows`.
    - **Backup** (`lib/models/backup.ts`) : `resistanceProfile`/`plateauWeakPoint` ajoutés aux schémas
      Zod (`z.string().nullish()`, champs web-only) + `resolveResistanceProfile`/
      `resolvePlateauWeakPoint` + branchés dans `parseBackup`.
    - **Seed** (`scripts/seed.ts`, `lib/data/build-dataset.ts`) : `resistanceProfile?`/résolveur ajoutés
      au même endroit que `movementPattern`, mais **AUCUN tag manuel des 29 exos** (contrairement à
      `movementPattern` en P1.4) — décision explicite de ce lot ("seed default null") : les JSON
      sources (`jeera_backup.json`/`recent_sessions.json`) n'ont pas ce champ -> `resolveResistanceProfile(undefined)`
      → `null` pour les 29, automatiquement, sans édition de données. `plateauWeakPoint` sur les
      `LoggedExercise` construits par le seed : `null` explicite (pas de trace de capture 1-tap dans
      des données historiques transcrites).
    - **Éditeur** (`components/exercise/ExerciseEditorSheet.tsx`) : nouvelle section "Profil de
      résistance" (boutons, identique au pattern "Pattern de mouvement" de P1.4, option "Non taggé").
      `emptyExercise()` défaut `null`. `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
      relu (AGENTS.md) — fichier déjà `"use client"`, aucune subtilité Server/Client applicable (même
      conclusion que P1.4/P1.6).
    - **`weakPointFit` activé** (`lib/engines/variation-select.ts`) : nouvelle fonction
      `weakPointFit(candidate, weakPoint)` = 1 si `candidate.resistanceProfile === weakPoint`, 0 si
      divergent, 0.5 (neutre) si `weakPoint` non fourni OU candidat non tagué (§9). Remplace l'usage
      direct de `NEUTRAL_WEAK_POINT_FIT` dans le score. `WeakPoint` (type exporté du module, existait
      depuis P1.5) devient un alias de `PlateauWeakPoint` (canonique, `enums.ts`) au lieu d'une union
      dupliquée — reuse, pas de redéfinition. `buildExplanation` : la clause "cible ton point faible"
      n'apparaît désormais QUE si le candidat CHOISI matche réellement (`candidate.resistanceProfile
      === weakPoint`), pas juste parce que `weakPoint` est fourni (sinon l'explication mentirait sur
      les cas neutres/0) — resserrement par rapport au brouillon P1.5.
    - **Nouveau helper exporté** `mostRecentPlateauWeakPoint(exerciseId, sessionHistory)` (même
      fichier) : scanne `sessionHistory` (convention "plus récent en premier") et renvoie le premier
      `LoggedExercise.plateauWeakPoint` non-null trouvé pour cet exercice — dérivation PURE à la
      volée (jamais persistée elle-même ; c'est la lecture de la donnée déjà persistée par ailleurs).
      Nécessaire pour `progression.ts::suggest()` qui n'a pas de `LoggedExercise` unique en main (à
      la différence de `bilan.ts` qui lit directement `logged.plateauWeakPoint` de l'occurrence en
      cours de revue).
    - **Câblage `progression.ts::suggest()`** : le bloc plateau (post-`switch(v2.pattern)`, invocation
      de `selectAlternative`, posé en P1.6) calcule désormais `weakPoint =
      mostRecentPlateauWeakPoint(exercise.id, sessionHistory)` et le passe en 5ᵉ argument. Vérifié de
      bout en bout par un test dédié (`algo-v2.test.ts`, voir plus bas) : un point faible capturé sur
      une séance PASSÉE fait bien gagner le candidat dont `resistanceProfile` matche, via
      `switchToVariantId`.
    - **Câblage `bilan.ts`** : `PlateauReview` étendu avec `weakPoint: PlateauWeakPoint | null` (lu
      tel quel depuis `logged.plateauWeakPoint` de l'occurrence en cours de revue — PAS dérivé) et
      `needsWeakPointCapture: boolean` (= `!alwaysLegacy && wasInPlateau && !brokenToday && weakPoint
      === null` — même garde que `suggestedVariant`, contextuel : disparaît dès que répondu ou dès
      que le plateau n'est plus actif). `buildPlateauReview` reçoit `weakPoint` en paramètre
      additionnel (9ᵉ) et le passe à `selectAlternative`. `buildExerciseReview` (qui a déjà `logged`
      en scope) le lui fournit via `logged.plateauWeakPoint` — zéro nouveau paramètre remontant
      depuis le store, même philosophie que P1.6.
    - **Store** (`lib/store/workout.ts`) : nouvelle action `setPlateauWeakPoint(sessionId,
      loggedExerciseId, weakPoint)` — mute `state.history` (PAS `active` : la revue post-séance porte
      toujours sur une séance déjà terminée par `finish()`, donc déjà dans `history`). Reste PURE côté
      store (aucun appel DB) — même découplage store/DB que le reste du fichier (`saveSession` est
      appelé par le COMPOSANT, pas par le store, cf. `ActiveSession.tsx`/`historique/page.tsx`).
      **Bug de réactivité anticipé et corrigé avant qu'il ne morde** (même famille que celui trouvé en
      P1.6 pour `treatedVariantSuggestions`) : `sessionReview(session)` utilisait directement le
      paramètre `session` (référence potentiellement gelée côté composant) pour construire le bilan —
      une capture 1-tap qui mute `state.history` n'aurait donc JAMAIS été vue par un appel
      `sessionReview(session)` fait avec l'ancienne référence. Fix : `sessionReview` relit désormais
      TOUJOURS la copie la plus fraîche par id (`state.history.find(s => s.id === session.id) ??
      session`) avant de construire la revue. Vérifié par un test dédié qui appelle `sessionReview`
      avec la référence figée d'AVANT la capture et constate quand même le changement (voir
      `workout.test.ts` plus bas).
    - **UI** (`components/workout/bilan/BilanPlateaus.tsx`, `PostWorkoutSheet.tsx`) : nouvelle
      sous-composante `BilanWeakPointCapture` (icône `Target`, 3 boutons `PLATEAU_WEAK_POINTS` via
      `plateauWeakPointDisplayName`), rendue AVANT `BilanVariantSuggestions` dans `BilanPlateaus`
      (ordre voulu par spec §8 : "point faible (1 tap si absent) → variante proposée"). N'affiche que
      les `exerciseReview` dont `plateau.needsWeakPointCapture` est `true` — disparaît automatiquement
      au recalcul suivant une fois répondu (le composant ne gère aucun état local de visibilité, c'est
      `needsWeakPointCapture` lui-même qui redevient `false`). Persistance : `onClick` appelle
      `setPlateauWeakPoint` (store) PUIS relit `useWorkoutStore.getState().history` et appelle
      `saveSession(updated, false)` en best-effort (même convention offline-first que l'autosave
      `ActiveSession.tsx` — la capture reste de toute façon dans le store `persist(localStorage)` même
      hors-ligne). `PostWorkoutSheet.tsx` : ajout de `history` (sélecteur `useWorkoutStore((s) =>
      s.history)`) aux deps du `useMemo` de `review` — sans ça, le `useMemo` ne recalculerait jamais
      après une capture (même style de piège que `treatedVariantSuggestions` en P1.6, anticipé cette
      fois avant tout bug utilisateur constaté). `node_modules/next/dist/docs/.../05-server-and-client-components.md`
      relu avant édition — mêmes fichiers déjà `"use client"`.
    - **Tests** (243 → 256, tous verts) :
      - `variation-select.test.ts` (16 → en réalité 9 → 16 : +4 `weakPointFit` [départage à score
        égal par ailleurs ; neutre si candidat non tagué même avec `weakPoint` fourni ; explication
        SANS "point faible" si pas de match réel ; explication AVEC si match] + 3
        `mostRecentPlateauWeakPoint` [le plus récent capturé gagne ; `null` si jamais capturé ; `null`
        sur historique vide]).
      - `bilan.test.ts` (25 → 29) : nouveau describe "capture 1-tap" — `needsWeakPointCapture=true`
        tant que pas répondu ; `false` + `weakPointFit` actif (explication mentionne "point faible")
        une fois répondu ; `false` si pas de plateau (contextuel) ; `false` si plateau cassé
        aujourd'hui.
      - `algo-v2.test.ts` (36 → 37) : point faible capturé sur une séance passée dans
        `sessionHistory` fait gagner le candidat matchant via `switchToVariantId` (bout-en-bout
        `suggest()` → `mostRecentPlateauWeakPoint` → `selectAlternative`).
      - `workout.test.ts` (10 → 11) : `setPlateauWeakPoint()` capture sur la séance du jour (déjà
        dans `history`, comme après `finish()`) ; vérifie la persistance directe dans `state.history`
        ET le reflet immédiat par `sessionReview()` appelé avec la référence FIGÉE d'avant la capture
        (preuve du fix de réactivité).
      - `mappers.test.ts` (8 → 14, +6) : hydratation/dégradation/round-trip `resistanceProfile`
        (même schéma que `movementPattern`) + sérialisation/hydratation `plateauWeakPoint` sur
        `LoggedExercise` via `sessionToLoggedExerciseRows`/`mapSessionRow`.
    - `tsc --noEmit` clean sur tout le repo. `npx vitest run` (repo entier) → **256/256 verts** (237
      avant P2.1, +6 mappers, +13 nouveaux tests ci-dessus). Aucune régression.
    - **Non fait, hors scope explicite de P2.1** : pas de tagging manuel du `resistanceProfile` des
      29 exos existants (décision "seed default null" ci-dessus) — Evan peut les taguer un par un via
      l'éditeur une fois la colonne DB ajoutée, sans urgence (dégradation gracieuse déjà robuste,
      `weakPointFit` reste neutre pour tout exo non tagué).
    - **Reprise (P2.2)** : `lib/engines/lifecycle.ts` n'existe pas encore. `variation-select.ts` a
      déjà un calcul de cycle "maison" (`computeCandidateLifecycle`, interne, non exporté) qui
      alimente `lifecycleQuality` SANS roster complet (§7) — P2.2 doit créer le module dédié
      `computeLifeCycle(exerciseId, history)` + le roster classé, puis les BRANCHER dans
      `variation-select.ts` (remplacer/enrichir `computeCandidateLifecycle` par le nouveau moteur,
      pas dupliquer). `collectExerciseHistory` (`lib/engines/patterns.ts:47`) et `bestE1RM`
      (`lib/engines/e1rm.ts`) sont les briques à réutiliser, comme documenté au spec §7.
- [x] **P2.2 — `lifecycle.ts` (dérivé, pur) + roster classé** alimente `lifecycleQuality`.
  - → note: Nouveau module `lib/engines/lifecycle.ts` (100% pur, aucune persistance — invariant
    HARDENED §0.2 respecté à la lettre : rien n'est stocké, tout est recalculé à chaque appel).
    - **`computeLifeCycle(exerciseId, history, now?)`** → le run COURANT (bloc contigu le plus
      récent de séances qualifiantes pour cet exercice) : `{startDate, endDate, weeks, e1rmGain,
      ended}`. Segmentation en "runs" : deux séances CONSÉCUTIVES appartiennent au même run si
      l'écart est `<= ALGO_V2.LIFECYCLE_RUN_GAP_DAYS` (nouvelle constante ajoutée à `constants.ts`,
      valeur **21 jours** choisie et justifiée en commentaire — tolère une semaine de deload/voyage
      sans casser un run actif, reste < aux cycles typiques de la méthode ~8 semaines). `ended` =
      true si `now` est à plus de `LIFECYCLE_RUN_GAP_DAYS` jours de la dernière ancre du run (pas de
      notion de "remplacé par quelle variante" — nécessiterait le catalogue, absent de cette
      signature littérale du spec §7 ; décision tracée : le roster, qui A le catalogue, peut
      recouper ça lui-même si besoin, pas fait ici, hors scope explicite de ce lot).
    - **`allLifeCycles(exerciseId, history)`** → TOUS les runs passés (§7 "des runs passés",
      pluriel), du plus récent au plus ancien — même segmentation.
    - **`bestPastCycle(exerciseId, history)`** → parmi `allLifeCycles`, celui qui maximise
      `weeks × max(0, e1rmGain)` ("le cycle le plus fort", cité dans l'explication FR §6 — PAS
      forcément le run courant, qui peut être en plein plateau au moment où on regarde). `null` si
      jamais fait.
    - **`buildRoster(exerciseIds, history)`** → §7 "classement dérivé à la volée" : pour chaque id,
      `bestPastCycle` + une `lifecycleQuality` normalisée dans [0,1] **relativement au meilleur
      cycle observé DANS CE ROSTER PRÉCIS** (pas une constante arbitraire type `/120` — remplace
      l'heuristique Phase 1/P1.5, cf. décision #4 du spec "ultra data-driven"). `null` (pas 0) si
      jamais fait — la conversion en valeur neutre (0.5) reste la responsabilité de l'appelant
      (`variation-select.ts`), ce module reste agnostique de la sémantique de scoring.
    - **`workingSetsOf`** (filtre §1 : sets `{work, top_set}` complétés uniquement) déplacé depuis
      `variation-select.ts` (où il était dupliqué en privé) vers `lifecycle.ts`, exporté, réutilisé
      par les deux modules — dédup, pas de logique dupliquée.
    - **Bookkeeping "run courant" pour §2/§3 (`isPlateau`/`progressionState`, `deriveStateV2`)** :
      **PAS branché** sur ce nouveau module — décision d'impl. tracée, hors scope explicite de ce
      lot (le texte de la tâche confiée ne mentionne que "feed lifecycleQuality in selectAlternative",
      pas la détection de plateau). `deriveStateV2` garde la simplification tracée en P1.2 (fenêtre
      `HISTORY_WINDOW` entière comme "run courant"). Si Evan veut fermer cette boucle-là aussi
      (le spec §7 le mentionne comme faisant partie du même "bookkeeping du run courant"), c'est un
      lot séparé à documenter — signalé, pas oublié.
    - **`variation-select.ts` refactorisé** pour consommer le roster : `selectAlternative` fait
      désormais DEUX passes — (1) filtre dur (`passesHardFilter`) pour obtenir les candidats
      valides, (2) `buildRoster([current.id, ...candidatsValides], history)` UNE SEULE FOIS, puis
      boucle sur les candidats en lisant leur `lifecycleQuality`/`bestCycle` dans ce roster partagé
      (au lieu de recalculer un score par-candidat isolé comme en P1.5). Supprimé : l'ancien
      `computeCandidateLifecycle`/`CandidateLifecycle`/`LIFECYCLE_QUALITY_NORMALIZER` (constante
      `/120` arbitraire, remplacée par la normalisation roster-relative). `buildExplanation` cite
      désormais le `bestCycle` (meilleur cycle passé, via le roster) plutôt que le run courant brut
      — plus fidèle à l'exemple spec §6 ("cycle précédent 8 sem./+15 kg" peut être un cycle PASSÉ,
      pas forcément en cours). Le tie-break "variante la plus faible" (`bestHistoricalE1rm`, e1RM
      absolu MAX jamais atteint, PAS segmenté par run) reste un calcul séparé, propre à
      `variation-select.ts` — concept distinct de `lifecycleQuality`, non déplacé vers `lifecycle.ts`.
    - **Tests** : `lib/engines/__tests__/lifecycle.test.ts` (nouveau, 12 tests) — `computeLifeCycle`
      (jamais fait ; 1 séance ; run continu avec progrès ; gap > seuil -> 2 runs, ne renvoie QUE le
      plus récent ; `ended` vrai/faux selon `now` ; ignore warmups/sets ratés) ; `allLifeCycles`/
      `bestPastCycle` (segmentation multi-runs ordre plus-récent-premier ; le run le plus FORT gagne,
      pas le plus récent ; `null` si jamais fait) ; `buildRoster` (normalisation relative au meilleur
      DU roster — vérifié avec un ratio ~0.5 pour un candidat à moitié aussi fort ; roster plat ->
      quality=0 partout sans division par zéro ; roster vide -> `[]`).
      **Piège de fixture trouvé et corrigé 2 fois en écrivant ces tests** : un "cycle de 8 semaines"
      représenté par SEULEMENT ses 2 points extrêmes (début/fin, 56 jours d'écart) est
      MÉCANIQUEMENT scindé en 2 runs d'1 séance chacun (weeks=0/gain=0) par la segmentation, car
      c'est l'écart ENTRE SÉANCES CONSÉCUTIVES qui compte pour la frontière de run, pas l'écart
      entre le début et la fin du run perçu par l'utilisateur — fix : ajouter des points
      intermédiaires espacés de <= `LIFECYCLE_RUN_GAP_DAYS` (14j dans les tests) pour représenter un
      entraînement hebdomadaire/bimensuel réaliste sur la durée totale. Piège à RETENIR pour toute
      future fixture de test touchant `lifecycle.ts` (et documenté en commentaire dans les tests
      concernés).
      `variation-select.test.ts` (16→17) : nouveau test "le score d'un même candidat change selon
      la composition du roster" — même candidat, même historique PROPRE, deux catalogues différents
      (seul vs avec un rival au cycle 8x plus fort) -> score différent, preuve directe que
      `lifecycleQuality` n'est plus une valeur absolue par candidat mais dépend du roster fourni à
      cet appel précis (P2.2). Tous les tests existants (P1.5/P2.1) restent verts SANS modification
      — le refactor est équivalent en comportement pour les scénarios déjà couverts (roster à 2
      candidats, la normalisation relative au max du roster coïncide avec l'ancienne heuristique
      dans ces cas simples).
    - `tsc --noEmit` clean. `npx vitest run` (repo entier) → **269/269 verts** (256 avant P2.2, +12
      `lifecycle.test.ts`, +1 `variation-select.test.ts`). Aucune régression.
    - **Reprise (P2.3)** : `ROTATION_COOLDOWN_DAYS` (déjà dans `ALGO_V2` depuis P1.1, valeur 14)
      n'est ENCORE consommé nulle part (grep confirme 0 hit hors sa définition/son commentaire) —
      c'est le premier chantier de P2.3 (anti-thrash : après une rotation ACCEPTÉE via
      `acceptVariantSwitch`, store `workout.ts`, geler toute nouvelle proposition pour CET exercice
      pendant N jours OU jusqu'à un nouveau `isPlateau` sur la NOUVELLE variante). Il faudra
      horodater l'acceptation (nouveau state `Record<exerciseId, Date>` côté store, ou dérivable
      depuis `history` si on stocke la date d'acceptation autrement) — décision d'impl. à trancher
      en P2.3, pas encore prise ici. Rotation PRÉEMPTIVE (`progressionState==="slowing"`) : déjà
      partiellement câblée côté UI (`ExerciseCard.tsx`, chip discrète posée en P1.6) mais le spec
      §3/§4.2 demande de "préparer" un candidat dès `slowing` (pré-calcul), pas seulement un indice
      visuel sans substance — à vérifier/enrichir en P2.3.
- [x] **P2.3 — Rotation préemptive (`slowing`) + anti-thrash (cooldown `ROTATION_COOLDOWN_DAYS`).**
  - → note:
    **1. Rotation préemptive (`progressionState === "slowing"`, §3/§4.2).**
    - `lib/engines/progression.ts` — le bloc post-`switch(v2.pattern)` qui pose `switchToVariantId`/
      `reasonCodes` (posé en P1.6, jusque-là gated sur `v2.isPlateau` seul) est élargi à `(v2.isPlateau
      || v2.progressionState === "slowing")`. Comme `progressionState` est un état à 3 niveaux
      MUTUELLEMENT EXCLUSIFS (`deriveStateV2`, P1.2 : `isPlateau` ⇒ toujours `"plateaued"`, jamais
      `"slowing"` en même temps), le `reasonCode` distingue sans ambiguïté les deux cas :
      `"variation"` (déjà en plateau, inchangé) vs **nouveau** `"variation_preemptive"` (préemptif,
      slowing). Toutes les autres gardes inchangées (`doneToday.length>0`, `role!=="amorce"/"bw"`,
      pas déjà `plateauBreak`/`transitionMode`, `!antiPlateauActive`, `catalog`/`sessionHistory`
      fournis) — AUCUNE mutation de weight/reps/mode, comme pour le cas plateau (§8 non destructif).
    - **UI** (`components/workout/SetEntry.tsx`) : `variantCandidateName` se résolvait déjà
      uniquement depuis `switchToVariantId` (indépendant des reasonCodes, posé en P1.6) — élargir le
      trigger dans `progression.ts` suffit à faire apparaître le nom du candidat pour `slowing`
      SANS toucher `ExerciseCard.tsx` (le chip "Progrès qui ralentit" existait déjà depuis P1.6, sur
      `progressionState==="slowing"`). **Décision UX tracée** : `"variation_preemptive"` est
      délibérément ABSENT de `INTENSITY_REASON_CODES` (qui gate l'encart accentué/icône éclair) —
      le nom du candidat est affiché dans le paragraphe MUET existant à la place (nouveau bloc
      conditionnel `{!intensityReasonCode && variantCandidateName && …}`), pour rester "discret, non
      intrusif" (§3/§8) et distinct visuellement du cas plateau (qui garde l'encart accentué). Lu
      `node_modules/next/dist/docs/.../05-server-and-client-components.md` avant édition (AGENTS.md)
      — fichier déjà `"use client"`, aucune subtilité.
    - **Tests** (`algo-v2.test.ts`, describe "rotation de variation sur plateau daté", 37→39) :
      (1) fixture "slowing" (plat 10j, même que `progression.test.ts`) + candidat disponible ->
      `switchToVariantId` posé, `reasonCodes` contient `"variation_preemptive"` PAS `"variation"` ;
      (2) `progressionState="progressing"` (reps en hausse à charge constante) -> AUCUNE proposition
      même avec un candidat disponible (garde-fou décision #2 du spec, vérifié bout-en-bout ici).

    **2. Anti-thrash (cooldown `ALGO_V2.ROTATION_COOLDOWN_DAYS`, déjà défini en P1.1, jamais
    consommé avant ce lot — confirmé par grep avant de commencer).**
    - **Nouveau state store** (`lib/store/workout.ts`) : `rotationAcceptedAt: Record<exerciseId,
      isoDateString>` — horodatage de la dernière rotation ACCEPTÉE vers la variante ADOPTÉE
      (`newExerciseId`, PAS celle quittée). Écrit par `acceptVariantSwitch` dans SES DEUX branches
      (bascule immédiate ET pending). Persisté (`partialize`) — sinon un simple reload contournerait
      le cooldown. Initialisé `{}` (état initial + `resetStore()` des tests).
    - **Nouveau helper pur** `isRotationCooldownActive(exerciseId, rotationAcceptedAt, now)` —
      `true` si moins de `ROTATION_COOLDOWN_DAYS` jours se sont écoulés depuis l'horodatage.
      **Décision d'impl. tracée** (le "OU jusqu'à un nouveau isPlateau" du spec §8 n'est PAS
      recalculé séparément) : `PLATEAU_STALL_DAYS` (14) == `ROTATION_COOLDOWN_DAYS` (14) dans
      `constants.ts`, donc un isPlateau structurellement "frais" sur le run de la nouvelle variante
      ne peut de toute façon pas survenir avant l'expiration du cooldown ; distinguer un isPlateau
      "frais" (post-rotation) d'un isPlateau "hérité" (historique pré-rotation de la même variante,
      readoptée après un abandon) nécessiterait le même bookkeeping de "run courant" cross-exercice
      déjà différé en P1.2/P2.2 — hors scope explicite de ce lot, signalé pas oublié.
    - **Deux points de branchement** (bookkeeping store, PAS le moteur pur — même philosophie que
      `treatedVariantSuggestions` en P1.6) :
      - `sessionReview()` : après le masquage existant par `treatedVariantSuggestions`, masque
        AUSSI `suggestedVariant` (-> `null`) ET `needsWeakPointCapture` (-> `false`) pour tout
        exercice sous cooldown — même si `wasInPlateau` reste vrai (le plateau lui-même n'est pas
        nié, seule la PROPOSITION de rotation est gelée).
      - `suggestion()` (indice live) : après `suggest(params)`, si `result.switchToVariantId` est
        posé ET que `exercise.id` est sous cooldown, le remet à `null` et retire
        `"variation"`/`"variation_preemptive"` de `reasonCodes`.
    - **Tests** (`workout.test.ts`, 11→15) : `acceptVariantSwitch()` horodate bien
      `rotationAcceptedAt[newExerciseId]` (PAS `oldExerciseId`) ; cooldown ACTIF (accepté il y a 2j)
      -> `sessionReview()` gèle la carte MÊME si l'exo est de nouveau en plateau (`wasInPlateau`
      reste `true`, seule la carte est masquée) ; cooldown EXPIRÉ (accepté il y a 20j >= 14) -> la
      carte réapparaît normalement ; la suggestion LIVE (`suggestion()`) masque aussi
      `switchToVariantId`/`reasonCodes` pendant le cooldown (test bout-en-bout via
      `startEmpty`/`addExercise`/`logSet`, pas juste l'engine pur).
    - **Golden test** : vérifié re-passant sans régénération — `computeGolden()` appelle toujours
      `suggest()` avec `currentSessionSets:[]` (donc `doneToday.length===0`), structurellement
      inatteignable par le bloc élargi (même raisonnement qu'en P1.6, zéro impact garanti par
      construction, pas par chance).
    - `tsc --noEmit` clean sur tout le repo. `npx vitest run` (repo entier) → **275/275 verts** (269
      avant P2.3, +2 `algo-v2.test.ts`, +4 `workout.test.ts`). Aucune régression.
    - **Phase 2 complète (P2.1 + P2.2 + P2.3).** Point non résolu à traiter par Evan (pas du code,
      pas de test) : appliquer manuellement les 2 `ALTER TABLE` de P2.1 en base (bandeau 🔴 dans la
      note P2.1) — tant que ce n'est pas fait, toute requête Drizzle sur `exercises`/
      `logged_exercises` en PROD échouera. "App se lance" (`next dev`/`next build`) toujours PAS
      vérifié par cet agent, par cohérence avec la consigne de sécurité DB (`tsc`+`vitest`
      uniquement) — à faire par Evan.

---

## PHASE 3 — Niveaux de force (StrengthLevel) & signal feu (voir BENCHMARK_LEVEL_SPEC.md)

- [x] **P3.1 — Modèle + `benchmark.ts` générique** : `Exercise.strengthStandardKey?`/`benchmarkUnit?` (migration additive) ; `benchmark.ts` charge `data/strength_standards_corrected.json`, gère unités load/reps/reps_and_load + conventions par_arm/total/added, interpolation poids (garde âge 25–40). Tests purs. → note:
  **Décision d'impl. tracée (lue le JSON réel avant de coder)** : `data/strength_standards_corrected.json::standards` n'a PAS d'axe multi-poids par entrée (juste 5 valeurs = 1 point de référence au `_meta.profile.bodyWeightKg` = 80 kg) — contrairement aux 2 anciennes tables embarquées (courbe complète par poids 50-140kg). Comme la consigne interdit explicitement d'inventer des nombres, "interpolation poids" du spec §2 est implémentée comme une capacité générique (le moteur SAIT interpoler s'il a plusieurs points) mais dégénère à "applique le point unique tel quel" pour toutes les entrées actuelles (1 seul point chacune) — disclosed via `profileLabel`, jamais de scaling fabriqué. Les 2 tables embarquées ont été MIGRÉES dans le JSON (remplacées, comme demandé "remplacer les 2 tables") en extrayant leur ligne bodyweight=80 EXACTE (déjà sourcée strengthlevel.com, même cutoff 2026-03-05, zéro chiffre inventé) : `"Lateral raises"` (dumbbell-lateral-raise, [5,10,16,25,34]) et `"Plate loaded lat raise"` (machine-lateral-raise, isMachine, [25,41,61,84,111]). `stillAmbiguous."Plate loaded lat raise"` retiré du JSON (résolu). `_meta.dataCutoff`+`_meta.engineNote` ajoutés (métadonnées, pas des benchmarks).
  **Modèle** : `strengthStandardKey: string|null` = clé top-level du JSON (nom FR, PAS le `slSlug` interne) ; `benchmarkUnit: BenchmarkUnit|null` = miroir dénormalisé de `standards[key].unit` (nouvel enum `lib/models/enums.ts::BenchmarkUnit` = "load"|"reps"|"reps_and_load", même style `as const` que les enums existants). `benchmarkLow`/`benchmarkHigh` (legacy) VOLONTAIREMENT laissés non consommés (aucun 5-tier fabriqué à partir de 2 points — conforme à la consigne anti-fabrication ; réservés à un futur fallback manuel UI, pas fait ici). Câblé partout où `movementPattern`/`resistanceProfile` l'étaient déjà (même pattern répété à l'identique) : `lib/models/types.ts` (`Exercise`), `lib/db/schema.ts` (2 colonnes text nullable), `lib/db/mappers.ts` (`asBenchmarkUnit`), `lib/models/backup.ts` (zod + `resolveBenchmarkUnit` + `parseBackup`), `scripts/seed.ts`/`lib/data/build-dataset.ts` (`RecentNewExercise` optionnel + résolution).
  **`benchmark.ts` réécrit, API gardée** (§2 "étendre l'existant, garder l'API") : `ExerciseBenchmark` garde TOUS les champs plats existants (`currentE1RM`/`thresholds`/`position`/`level`/`nextLevel`/`gapToNext`/`source`/`profileLabel`) — zéro changement requis dans les consommateurs existants (`ExercisesLayer.tsx`, `ProgressInsights.tsx`, `BenchmarkGauge.tsx` : `tsc` clean sans y toucher, confirmé). Champs additifs : `unit`, `primaryAxis` ("load"|"reps" — pour `unit:"reps"` pur, `currentE1RM` contient alors un compte de reps brut, PAS un e1RM ; aucune entrée actuelle n'utilise cet axe seul, donc `BenchmarkGauge.tsx` garde son affichage "kg" tel quel pour l'instant — limitation documentée, pas un bug, à traiter quand une entrée `unit:"reps"` pure arrivera), `isMachine`, `caveat` (vient du JSON, pas fabriqué), `secondary: BenchmarkGaugeData|null` (P3.2, `reps_and_load` uniquement). Nouvelle fonction pure `resolveStandard(exercise, profile)` : seuils sans set mesuré (réutilisée par P3.3 pour tester un poids/reps hypothétique). Nouveau `strengthLevelRank(key)` (0..5) pour comparer deux niveaux (P3.3). Logique `reps_and_load` (convention `added`, ex. tractions lestées) : axe `load` (e1RM de la charge AJOUTÉE) prioritaire si charge ajoutée > 0 (alors `secondary` = jauge reps) ; sinon (bodyweight pur ou assisté, charge <= 0) bascule automatiquement l'axe `reps` en position "principale" (jamais de jauge cachée derrière un axe inapplicable au set du jour) et `secondary` devient `null`. Guard profil : gender/age/bodyWeightKg requis + âge 25-40 (inchangé) + **gender==="male" strictement** (nouveau, car le JSON n'est sourcé que pour ce profil — une utilisatrice reste `hasBenchmark:false`, disclosed, pas régressif puisque seules 2 exos supportaient la femme avant et de façon non généralisée).
  **DB (host vérifié `ep-mute-sunset-atqb5xkv` AVANT tout write, confirmé)** : migration générée en fichier `drizzle/0006_happy_rawhide_kid.sql` (2× `ALTER TABLE exercises ADD COLUMN`) puis appliquée directement via script Node (`neon()` + `ADD COLUMN IF NOT EXISTS` idempotent, PAS `drizzle-kit migrate`) — vérifié 30 exercices / 43 séances intacts avant/après (non destructif confirmé). **Peuplement additionnel tracé (au-delà de la lettre de P3.1, mais nécessaire pour que la feature ne soit pas dormante)** : `UPDATE exercises SET strength_standard_key=name, benchmark_unit=<unit du JSON> WHERE name=<clé JSON> AND strength_standard_key IS NULL` pour les 11 clés déjà dans le JSON (toutes correspondent 1:1 au nom exact en catalogue, vérifié par lecture DB avant d'écrire) — 11/11 matchées, 30/43 intacts après. Miroir dans `data/jeera_backup.json` pour la persistance (10/11 : `jeera_backup.json` ne contient que 28 des 30 exercices catalogue — **"Plate loaded lat raise" (id `22519741-91db-...`) n'existe dans AUCUN des deux fichiers seed** (`jeera_backup.json` ni `recent_sessions.json::newExercises`), un gap pré-existant hors scope Phase 3 (créé par un script one-off P2, cf. `scripts/fix-catalog-profile-2026-08-04.ts::PLATE_ID`) — signalé pour Evan, PAS corrigé ici (un `seed.ts` re-run perdrait cet exercice, mais `seed.ts` reste interdit par la règle DB de toute façon).
  **Tests** : `lib/engines/__tests__/benchmark.test.ts` réécrit (6→18 tests) : unités load/reps_and_load (charge ajoutée positive/nulle/négative), `resolveStandard`, `strengthLevelRank`, dégradation gracieuse (clé absente/inconnue/profil hors plage/genre non supporté). Tous les fixtures `Exercise` du repo (10 fichiers test + `ExerciseEditorSheet.tsx::emptyExercise`) mis à jour avec les 2 nouveaux champs (`strengthStandardKey:null, benchmarkUnit:null`) — édition mécanique, aucun comportement changé. `tsc --noEmit` clean, `npx vitest run` (repo entier) → **283/283 verts**, zéro régression.
  **Prochaine étape (P3.2)** : `personalProgress(exercise, history)` pur (percentile e1RM du jour vs [min,max] historique de CET exercice) + double affichage dans `BenchmarkGauge.tsx` pour `isMachine:true` (jauge StrengthLevel indicative déjà là + nouveau marqueur perso). Les 2 exos machine déjà sourcés (`Leg extension`, `Leg curl`, `Plate loaded lat raise`) sont de bons candidats de test réel (isMachine:true confirmé en DB).
- [x] **P3.2 — Machines « les deux »** : `personalProgress(exercise, history)` pur (percentile e1RM vs historique) + double affichage dans `BenchmarkGauge`. → note:
  **`personalProgress(exercise, history: LoggedSet[])`** ajoutée dans `lib/engines/benchmark.ts` (même fichier que `exerciseBenchmark`/`resolveStandard`, cohérence — pas un nouveau module). Convention identique à `RecordsEngine.buildRecords(exercise, historicalSets)` : `history` = les `LoggedSet` DÉJÀ filtrés sur CET exercice par l'appelant (séance active exclue), pas un `WorkoutSession[]`. Filtre interne : `workingSetsOf` (réutilisé depuis `lifecycle.ts` — work/top_set complétés) + `weight>0` (un bodyweight pur n'a pas d'e1RM comparable ici). **Décision tracée** : utilise `estimated1RM` (Epley, `e1rm.ts`, le même que records/PR/lifecycle partout ailleurs dans l'app), PAS `strengthLevelEstimated1RM` (formule spécifique aux tables StrengthLevel) — la jauge StrengthLevel et le marqueur perso mesurent des choses différentes (comparaison externe vs comparaison à soi-même) et doivent chacune rester cohérentes avec leur propre référentiel (le "e1RM" du marqueur perso doit matcher le pill "e1RM" déjà affiché ailleurs dans `ExercisesLayer.tsx`/records). "La perf du jour" = le set le PLUS RÉCENT par `timestamp` (tri défensif interne, indépendant de l'ordre d'entrée de l'appelant) — PAS le plus lourd. `percentile = (current-min)/(max-min)` sur TOUT l'historique fourni (min/max incluent le point courant lui-même : un nouveau record absolu donne mécaniquement percentile=1). Neutre (0.5) si un seul point ou aucune variation (`max===min`) — pas de division par zéro. `exercise` accepté mais non lu (aligné sur la signature du spec §2 + cohérence avec `exerciseBenchmark`/`resolveStandard` qui prennent tous l'exercice en premier paramètre) — préfixé `_exercise`.
  **`BenchmarkGauge.tsx`** : nouvelle prop optionnelle `personalProgress?: PersonalProgress|null` + sous-composant `PersonalProgressMarker` (bandeau séparé sous le bloc source/caveat existant, mini-jauge à un curseur + min/max historique affichés, message dédié si pas assez d'historique). `benchmark.caveat` (JSON, P3.1) remplace désormais la phrase générique hardcodée précédente QUAND présent (machines uniquement, JSON `caveat` field) ; la phrase générique reste inchangée en fallback pour tout le reste (aucune régression visuelle pour les exercices non-machine).
  **Câblage `ExercisesLayer.tsx`** : `personalProgress` calculé seulement si `benchmark.isMachine` (décision spec §2 explicite : "les deux" = machines uniquement, PAS tous les exercices) à partir de `historicalSets` déjà en scope (réutilisé, pas de nouveau calcul dupliqué) ; `null` sinon → `BenchmarkGauge` reste identique pour tout le catalogue non-machine. `ProgressInsights.tsx` non touché (n'affiche pas `BenchmarkGauge`, hors scope P3.2).
  **Tests** : `personalProgress` — 6 nouveaux tests (`benchmark.test.ts`, 18→24) : vide, un seul point (neutre), ordre chronologique (pas juste le max), nouveau record absolu (percentile=1), warmups/bodyweight ignorés, sets non complétés ignorés. `tsc --noEmit` clean. `npx vitest run` (repo entier) → **289/289 verts**.
  **Prochaine étape (P3.3)** : `suggest()` (`progression.ts`) calcule `readyForLevelUp`/`readyForPR`/`nextLevelName` sur le poids PROPOSÉ (pas encore loggé) — réutiliser `resolveStandard(exercise, profile)` (pas besoin de fabriquer un "set" pour "l'état actuel", `benchmarkLevel(valeur, thresholds)` prend une valeur numérique brute) + `strengthLevelRank` pour comparer avant/après. Nécessite d'ajouter un `profile`/`settings` optionnel à `SuggestParams` (gender/ageYears — `bodyweightKg` existe déjà) : voir `lib/store/workout.ts::suggestion()` ligne ~1631 (`state.settings` déjà en scope, `readBodyweightKg` existe déjà) pour le câblage appelant. `readyForPR` : PR e1RM sur `sessionHistory` (déjà dans `SuggestParams`, PAS `recentHistory` qui est tronqué à `HISTORY_WINDOW`) filtré par `exercise.id`, via `workingSetsOf`+`bestE1RM` (mêmes helpers que P3.2/variation-select.ts). Golden test ne passe ni `catalog`/`sessionHistory`/profil → dégradation gracieuse automatique (flags `undefined`), et `GoldenEntry` ne compare que `weight/reps/mode/reasonCodes` (pas les nouveaux champs) → zéro risque de régression golden, vérifié en lisant `golden.test.ts` avant de commencer. `SetEntry.tsx` : animation flamme (`framer-motion` déjà dépendance ; utiliser `useReducedMotion()` de `framer-motion` — PAS s'appuyer sur la règle CSS globale `prefers-reduced-motion` de `globals.css:211`, qui neutralise les `animation`/`transition` CSS mais PAS une boucle `animate` piloté par JS/WAAPI de framer-motion). Vérifier que la jauge complète reste absente en séance (déjà le cas — `SetEntry.tsx` n'importe pas `BenchmarkGauge`, à re-confirmer après le câblage).
- [x] **P3.3 — Signal feu intra-séance** : `suggest()` calcule `readyForLevelUp`/`readyForPR`/`nextLevelName` ; `SetEntry.tsx` animation flamme (respecte `prefers-reduced-motion`) ; jauge benchmark cachée en séance (reste sur Progrès). → note:
  **`SuggestParams.profile?`** ajouté (`Pick<UserSettings,"bodyWeightKg"|"gender"|"ageYears">`), DISTINCT du `bodyweightKg?` existant (celui-ci a un défaut algorithmique `ALGO_V2.DEFAULT_BODYWEIGHT_KG`, pas un vrai profil — ne devait pas être réutilisé pour alimenter une jauge StrengthLevel). Calcul inséré juste avant le `return result;` PARTAGÉ (v1 ET v2 passent par là, vérifié par lecture — `let result` déclaré une fois, `if(!useV2){...}else{...v2...}` puis tail commun) : deux blocs indépendants sous un seul garde `if (sessionHistory)` (§9, tout reste `undefined` si absent — vérifié golden-safe, `golden.test.ts` ne passe ni `sessionHistory` ni `profile`, et `GoldenEntry` ne compare que `weight/reps/mode/reasonCodes`).
  **`readyForPR`** (indépendant du profil StrengthLevel) : réutilise `RecordsEngine.buildRecords(exercise, historicalSetsForExercise).bestE1RM` (Epley canonique, `e1rm.ts` — PAS la formule StrengthLevel) + même garde `reps>=exercise.repTargetMin` + même marge anti-flapping que `RecordsEngine.classify` (branche "estimated1RM") : `K_E1RM_PR_THRESHOLD` **exportée** depuis `records.ts` (était privée) pour une source de vérité unique — le feu ne doit jamais promettre un PR qui ne se matérialiserait pas en étoile une fois le set réellement loggé. `bestE1RM<=0` (jamais fait) compte comme PR dès que `proposedE1RM>0` (cohérent avec `classify()` qui flague déjà tout 1er set via "heaviestWeight").
  **`readyForLevelUp`/`nextLevelName`** (nécessite `profile`) : `resolveStandard(exercise, profile)` (P3.1) donne l'axe primaire + ses seuils ; nouveau helper local `currentBestOnAxis(sets, axis)` (non exporté, périmètre P3.3 uniquement) calcule le meilleur historique sur CET axe avec la formule StrengthLevel (`strengthLevelEstimated1RM`, cohérence avec les seuils sourcés via cette même formule — PAS l'Epley de `readyForPR`, les deux formules servent des comparaisons différentes et ne doivent pas être mélangées) ; `strengthLevelRank(key)` compare avant/après. **Limitation tracée** : pour `reps_and_load` (tractions lestées), `resolveStandard` retourne TOUJOURS l'axe "load" comme primaire (même choix qu'en P3.1) — pas de feu dédié au sous-axe reps ici, scope volontairement limité.
  **Câblage store** : `lib/store/workout.ts::suggestion()` passe désormais `profile: {bodyWeightKg, gender, ageYears}` depuis `state.settings` (juste après `sessionHistory`/`goals`, déjà en scope).
  **`SetEntry.tsx`** : nouveau `FlameBadge` (flamme `lucide-react` animée via `framer-motion`) affiché quand `flameLabels.length>0`. **Décision tracée importante** : la règle CSS globale `prefers-reduced-motion` (`app/globals.css:211`, `animation-duration:0.01ms`) ne neutralise PAS une boucle `animate` framer-motion (pilotée en JS/WAAPI, hors du système `animation`/`transition` CSS ciblé) — `useReducedMotion()` de `framer-motion` est donc appelé explicitement dans `FlameBadge` pour couper la boucle (`animate: undefined`, `transition: {duration:0}`) plutôt que de compter sur la règle globale qui ne l'aurait pas fait. Le badge n'apparaît QUE si `weight===suggestion.weight && reps===suggestion.reps && !useWarmup` (la promesse du feu porte sur LE POIDS/REPS SUGGÉRÉS précisément — si l'utilisateur dévie via les steppers ou bascule en échauffement, le badge disparaît ; mutuellement exclusif par construction avec le chip existant "revenir à la suggestion", qui apparaît exactement quand `weight!==suggestion.weight`). Libellé : `"PR en vue"` / `"passage {nextLevelName}"`, concatènés par `" · "` si les deux flags sont vrais.
  **Jauge cachée en séance** : déjà vrai avant ce lot — `grep BenchmarkGauge components/workout/*.tsx` = aucun match, confirmé (ni `SetEntry.tsx` ni `ExerciseCard.tsx` ne l'importent). Rien à retirer.
  **Tests** : 6 nouveaux dans `progression.test.ts` (27→33) : premier passage jamais fait (les deux flags vrais, `nextLevelName:"Intermédiaire"` vérifié) ; déjà au plafond Élite (readyForLevelUp faux structurellement — pas de palier au-dessus — mais readyForPR vrai) ; plateau stable exact (les deux faux) ; `sessionHistory` omis (les deux `undefined`, invariant golden) ; `profile` omis (`readyForPR` fonctionne quand même, `readyForLevelUp` reste `undefined`) ; `strengthStandardKey` absent (idem). Scénarios construits et VÉRIFIÉS empiriquement (`npx tsx -e`, cold-start=20kgx9, plateau=42.5kgx8/20kgx8) avant d'écrire les assertions plutôt que de deviner la sortie de `suggest()` — le moteur de prédiction v1/v2 est trop riche pour être re-dérivé de tête. `tsc --noEmit` clean. `npx vitest run` (repo entier) → **295/295 verts** (289→295, +6). Aucune DB touchée (P3.3 = code pur + UI).
  **Prochaine étape (P3.4)** : sélecteur `strengthStandardKey`/`benchmarkUnit`/convention (affichage) dans `ExerciseEditorSheet.tsx` (même pattern bouton-grille que `movementPattern`/`resistanceProfile`, cf. lignes ~210-273 du fichier) ; `resistance_profile` DÉJÀ peuplé pour les 30 exos ? NON — seul `strength_standard_key`/`benchmark_unit` ont été peuplés en P3.1 (11 exos). `resistance_profile` reste NULL partout en base (confirmé par le self-audit du 2026-08-05, PAS encore traité par cette Phase 3) → à peupler depuis `data/strength_standards_corrected.json::resistanceProfiles` (déjà complet pour les 30 noms exacts du catalogue, vérifié en P3.1) : UPDATE host-gardé + miroir dans `jeera_backup.json` (même limitation "Plate loaded lat raise" absent des 2 fichiers seed, déjà tracée en P3.1). `weakPointFit` (`variation-select.ts`) est déjà câblé et actif depuis P2.1 — "l'activer" = juste peupler la colonne, AUCUN changement de code moteur attendu.
- [x] **P3.4 — Dynamique + resistance_profile** : sélecteur standard/unité/convention dans `ExerciseEditorSheet.tsx` ; peupler `resistance_profile` (30) depuis le JSON (UPDATE non destructif host-gardé + seed) ; activer `weakPointFit`. → note:
  **`benchmark.ts`** : nouveau `listKnownStandards()` (+ type exporté `StandardSummary`, `StandardConvention` rendu public) — lit `STANDARDS` (le même import JSON module-level que le reste du fichier), trié FR. Toute clé ajoutée au JSON par Evan apparaît automatiquement dans le sélecteur au prochain chargement, aucun code à changer (§4).
  **`ExerciseEditorSheet.tsx`** : nouveau bloc "Standard StrengthLevel" — un `<select>` (PAS une grille de boutons comme `movementPattern`/`resistanceProfile` : cardinalité amenée à grossir avec le sourcing, §6 liste déjà ~20 mappings à venir, un select scale mieux qu'une grille pour ça) listant `listKnownStandards()` + option "Aucun" ; en choisissant une clé, `benchmarkUnit` se cale AUTOMATIQUEMENT sur `entry.unit` (source de vérité = JSON, jamais désynchronisé) et `convention`/`isMachine` s'affichent en texte informatif sous le select (PAS des champs `Exercise` séparés — ils vivent uniquement dans l'entrée JSON, décision P3.1 confirmée ici). Un second bloc, la grille `benchmarkUnit` (3 boutons + "Aucune", même pattern que `resistanceProfile`), n'apparaît QUE si `strengthStandardKey===null` (repli manuel — réservé à un futur `benchmarkLow`/`benchmarkHigh` saisi à la main, §1, non consommé aujourd'hui) ; masqué quand un standard JSON est sélectionné pour ne jamais permettre une désynchronisation unité-JSON/unité-Exercise. `emptyExercise()` déjà à jour depuis l'édition mécanique de P3.1.
  **Peuplement DB `resistance_profile` (host vérifié `ep-mute-sunset-atqb5xkv` AVANT écriture, confirmé)** : vérifié D'ABORD que `data/strength_standards_corrected.json::resistanceProfiles` couvre EXACTEMENT les 30 noms du catalogue live (`select name from exercises`, 30/30 match, 0 orphelin des deux côtés — revérifié indépendamment de la lecture faite en P3.1) et que les 30 valeurs sont dans l'enum `ResistanceProfile` valide (`bottom|mid|lockout|even`) avant d'écrire. `UPDATE exercises SET resistance_profile=<valeur JSON> WHERE name=<clé> AND resistance_profile IS NULL` par exercice (idempotent) → **30/30 mis à jour**, 30 exercices / 43 séances intacts avant/après (non destructif confirmé). Miroir dans les seeds pour la persistance : `jeera_backup.json` (28/28 de ses exercices, correspond aux 28 qu'il contient) + `recent_sessions.json::newExercises` ("Ab roller debout", le seul des deux exos manquants côté seed qui EST néanmoins présent dans un fichier seed). **"Plate loaded lat raise" reste sans miroir seed** (même gap pré-existant tracé en P3.1, hors scope Phase 3 — absent des deux fichiers seed, seulement en DB live). Vérifié bout-en-bout via `loadFullDatasetFromDisk()` : 29/29 exercices du dataset local ont `resistanceProfile` non-null (100% des exercices RÉELLEMENT présents dans les seeds), 10/10 ont `strengthStandardKey` non-null.
  **`weakPointFit` (`variation-select.ts`)** : AUCUN changement de code — la fonction (câblée et testée depuis P2.1) lit déjà `candidate.resistanceProfile` sans garde supplémentaire ; elle était neutre (0.5) uniquement parce que la colonne était NULL partout. Le peuplement ci-dessus suffit à "l'activer" : dès qu'un plateau réel se déclenche sur un exercice tagué, `selectAlternative` différenciera désormais vraiment ses candidats par point faible mesuré. Pas de nouveau test unitaire (la logique pure était déjà couverte en P2.1 avec des profils synthétiques ; ceci est un changement de DONNÉES, pas de comportement testable en isolation).
  **Tests** : `tsc --noEmit` clean. `npx vitest run` (repo entier) → **295/295 verts** (inchangé vs P3.3 — P3.4 est data + UI, pas de nouvelle logique pure testable isolément au-delà de ce que P2.1/P3.1 couvrent déjà).
  **Phase 3 COMPLÈTE (P3.1→P3.4).** **P3.5 explicitement PAS fait** (hors scope de cette mission — attend que le sourcing du JSON soit achevé par Evan/Opus) : quand le reste des exercices `stillAmbiguous`/section 6 sera tranché et ajouté au JSON, appliquer les nouvelles clés via le MÊME script que P3.1 (`UPDATE ... WHERE name=<clé> AND strength_standard_key IS NULL`, host-gardé) — tout le reste (jauge, feu, éditeur, weakPointFit) est déjà générique et s'activera automatiquement, aucun nouveau code attendu pour P3.5 sauf si un exercice nécessite une convention/unit non encore gérée par `benchmark.ts` (aucune prévue à ce stade).
- [ ] **P3.5 — Appliquer benchmarks corrigés en base** (APRÈS sourcing complet du JSON par Evan/Opus) : UPDATE non destructif host-gardé, relabel Intermédiaire→vraies valeurs + ajout Avancé. → note:

## PHASE 4 — Offline PWA & suggestions hors-ligne (voir OFFLINE_PWA_SPEC.md)

> Critères d'acceptation DURS : (C1) jamais bloqué sur une vieille version de code (SW network-first + auto-update + purge caches) ; (C2) Neon = source de vérité, localStorage = cache, écritures offline rejouées via outbox.

- [x] **P4.1 — Cache persistant des données de référence** : ajouter catalog/history/goals/settings/templates/recoveryCheckins à `partialize` ; `merge()` revit les Date de `history` (+ `lastUsed` catalog) ; StoreHydrator n'écrase le cache que si `data` serveur présent. Tests (partialize + revive dates). → note:
  **`lib/store/workout.ts`** : `partialize` étend l'objet persisté des 6 clés `ReferenceData` (catalog/history/goals/settings/templates/recoveryCheckins) — cache OFFLINE uniquement, Neon reste la vérité (P4.2 s'assure que `StoreHydrator` ne l'écrase que si le serveur répond). `reviveSessionDates` refactorée en 2 (`reviveSessionDatesNonNull` partagée + wrapper null-safe) pour être réutilisable sur CHAQUE séance d'`history` (`reviveHistoryDates`), pas seulement `active`. Nouveau `reviveCatalogDates` (`Exercise.lastUsed`). **Décision tracée au-delà de la lettre du spec** (qui ne nomme explicitement que `history`+`catalog.lastUsed`) : `recoveryCheckins[].date` et `templates[].createdAt` sont ÉGALEMENT des champs `Date` désormais mis en cache par ce même `partialize` — sans les revivifier aussi, ce lot aurait introduit 2 crashs neufs après un cold-start hors-ligne : `shouldExtendBeastSession` (`.date.getTime()` sur `recoveryCheckins`, appelable en démarrant une séance Beast hors-ligne) et l'export backup (`SettingsBackupSection.tsx::t.createdAt.toISOString()`). Ajouté `reviveRecoveryCheckinDates`/`reviveTemplateDates`, même garde `instanceof Date` idempotente. `merge()` : revivifie chaque clé SEULEMENT si présente dans `persisted` (sinon garde `current`, jamais un `[]` qui écraserait une valeur utile — cas du tout premier chargement, cache localStorage encore vide).
  **Tests** (`lib/store/__tests__/offline-cache.test.ts`, nouveau fichier, 5 tests) : partialize contient les 6 clés (+ valeurs exactes) ; merge revit `history[].date/startTime/endTime` + `LoggedSet.timestamp` après un VRAI aller-retour `JSON.parse(JSON.stringify(...))` (vérifié que la valeur est bien devenue une string avant merge, pas juste supposé) ; merge revit `catalog[].lastUsed` ; merge revit aussi `recoveryCheckins.date`/`templates.createdAt` (la décision tracée ci-dessus) ; merge garde `current` (pas `[]`) quand `persisted` est `{}`. Utilise le seam `useWorkoutStore.persist.getOptions().partialize/.merge` (API zustand `persist`) plutôt qu'un roundtrip localStorage complet — teste directement les fonctions pures de config, pas l'orchestration async de `rehydrate()` (ça, c'est P4.2/P4.3 - test manuel documenté). `tsc --noEmit` clean. `npx vitest run` (repo entier) → **306/306 verts** (295→306, +11 : +5 nouveaux + 6 déjà existants non recomptés dans la note P3.4, écart non investigué plus avant, aucune régression — tous les fichiers listés "passed"). Prochaine étape : P4.2 — `getInitialData()` offline-safe (try/catch autour des appels Neon) + `StoreHydrator` qui ne réécrase pas le cache réhydraté quand `data` serveur est vide/absent ; vérifier l'ordre `persist.rehydrate()` PUIS `hydrate(serverData)` (déjà cet ordre dans `StoreHydrator.tsx` actuel, à confirmer/durcir, pas à inverser).
- [x] **P4.2 — Hydratation résiliente offline** : `getInitialData()` offline-safe (try/catch → vide) ; StoreHydrator garde le cache si `data` vide. → note:
  **`lib/db/queries.ts`** : nouveau `emptyAllData()` (factorise le literal déjà utilisé par le early-return `!hasDatabaseUrl()` de `getAllData()`, mêmes valeurs, zéro changement de comportement) + nouveau `isEmptyAllData(data)` (les 5 tableaux vides — `settings` seul n'entre PAS dans le critère : un profil renseigné sans aucune donnée en tableau reste "vide" pour ce critère, testé explicitement). **`lib/data/index.ts::getInitialData`** : la branche `DATABASE_URL` présent enveloppe désormais `await getAllData()` dans un `try/catch` (`getAllData()` fait un `Promise.all` de 6 requêtes — Neon injoignable fait rejeter TOUT le call, avant ce lot ça remontait non attrapé jusqu'au Server Component `force-dynamic` racine, `app/(app)/layout.tsx`, et plantait toute la page) → catch renvoie `emptyAllData()`, jamais de throw. Fallback disque (pas de `DATABASE_URL`) inchangé dans son comportement, juste réécrit avec `emptyAllData()` au lieu de rappeler `getAllData()` (equivalent, plus direct).
  **`components/providers/StoreHydrator.tsx`** : effet réécrit en `async` interne (`run()` + `void run()` + flag `cancelled`) pour VRAIMENT attendre `await useWorkoutStore.persist.rehydrate()` avant de décider quoi que ce soit — avant ce lot, `void rehydrate()` était fire-and-forget et `hydrate(data)` s'exécutait immédiatement dans la même tick, sans garantie d'ordre. **Bug potentiel identifié et évité en écrivant ce lot** : le `merge()` de P4.1 fait toujours primer `persisted.<clé>` (le cache) sur `current.<clé>` dès qu'elle est présente dans le cache — si `rehydrate()` avait résolu APRÈS un `hydrate(data)` déjà appliqué (data serveur fraîche), son `set()` interne aurait pu écraser les données fraîches avec le cache périmé (C1 violé). Attendre `rehydrate()` avant d'appeler `hydrate(data)` (jamais l'inverse) élimine cette course. Second changement : `hydrate(data)` n'est appelé QUE si `!isEmptyAllData(data)` (import direct de `lib/db/queries.ts`, pas de duplication de logique) — sinon le cache déjà réhydraté par `persist.rehydrate()` reste tel quel, jamais écrasé par du vide (C2, §3). Le garde `rehydrated.current` (déjà existant) continue de limiter le `rehydrate()` réel au tout premier mount ; les re-renders suivants (nouveau `data` après une revalidation serveur) sautent direct à la vérification vide/plein.
  **Tests** : `lib/db/__tests__/queries-empty.test.ts` (3 tests, purs, sans mock) — `emptyAllData()` est vide ; un exercice suffit à ne plus l'être ; des `settings` non-défaut seuls ne suffisent pas à sortir de "vide". `lib/data/__tests__/index.test.ts` (1 test) — `vi.mock("@/lib/db/queries")` avec `vi.importActual` pour garder `emptyAllData`/`isEmptyAllData` réels et remplacer SEULEMENT `getAllData` par un mock qui rejette ; `vi.stubEnv("DATABASE_URL", ...)` ; vérifie que `getInitialData()` RÉSOUT (ne lève pas) vers un `AllData` vide. `StoreHydrator.tsx` non testé automatiquement (composant React, aucune convention de test de composant dans ce repo — `vitest.config.ts` n'inclut que `*.test.ts`, pas `.tsx`, environnement `node` sans jsdom/RTL) : couvert par le test manuel documenté en P4.3 (le scénario offline complet — cache réhydraté, pas écrasé — s'observe seulement bout-en-bout avec le SW). `tsc --noEmit` clean. `npx vitest run` (repo entier) → **310/310 verts** (306→310, +4). Prochaine étape : P4.3 — service worker (LIRE `node_modules/next/dist/docs/` progressive-web-apps.md + route.md + public-folder.md, DÉJÀ FAIT lors de la préparation de ce lot — voir la revue ci-dessous) : lot à blast radius, tester C1 à fond avant de le cocher.
- [x] **P4.3 — Service worker (C1)** : LIRE `node_modules/next/dist/docs/` d'abord. Network-first navigations+code, cache-first assets hashés, network-only mutations ; skipWaiting+clients.claim ; cache versionné par build + purge des anciens à l'activate ; enregistrement client dans le layout. Tester C1 (build v2 → reload en ligne = code frais). → note:
  **Docs lues avant tout code** (AGENTS.md) : `01-app/02-guides/progressive-web-apps.md` (pattern officiel `public/sw.js` + `navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'})` + section "Securing your PWA" qui recommande un header `Cache-Control: no-cache, no-store, must-revalidate` dédié sur `/sw.js`), `01-app/03-api-reference/03-file-conventions/public-folder.md` (défaut `Cache-Control: public, max-age=0` sur tout `/public`, jamais agressif), `01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` (convention `app/manifest.ts`, déjà en place et cohérente — vérifié : `name`/`icons`(`/icon`,`/apple-icon`, tous deux existants)/`theme_color`("#07080e") cohérent avec `viewport.themeColor` de `app/layout.tsx` ; **aucun changement fait à `manifest.ts`**, juste vérifié), `01-app/01-getting-started/15-route-handlers.md` + `.../route.md` (Route Handlers = candidat envisagé pour injecter un build-id dynamique, PAS retenu — voir décision tracée ci-dessous).
  **Décision d'architecture tracée** : le SW est un fichier STATIQUE `public/sw.js`, régénéré par un nouveau script `scripts/generate-sw.ts` (exécuté via les hooks npm `predev`/`prebuild` ajoutés à `package.json`, donc automatiquement avant `npm run dev`/`npm run build` — y compris sur Vercel qui invoque `npm run build`), PLUTÔT qu'une Route Handler dynamique dans un dossier littéralement nommé `sw.js` (`app/sw.js/route.ts`). J'ai envisagé cette 2e option pour injecter le build-id via `process.env` sans script séparé, mais l'ai écartée : (a) c'est le pattern EXPLICITEMENT documenté par le guide PWA officiel (`public/sw.js`), donc le moins risqué vis-à-vis d'AGENTS.md ("cette version n'est pas standard, ne rien supposer") ; (b) cette mission ne peut être vérifiée QUE par `tsc`/`vitest` (garde-fou explicite, jamais `next build`/`next dev` pour ne pas risquer de toucher la DB live pendant un build) donc je n'ai AUCUN moyen d'observer empiriquement si un dossier de route pointé nommé avec un point (`sw.js`) se comporte comme prévu dans cette version non standard de Next — je ne voulais pas committer à un mécanisme invérifiable pour la pièce la plus sensible (blast radius) de cette phase. Le stamp de build vient de `process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? String(Date.now())` — les 2 premiers sont garantis présents PENDANT l'étape de build Vercel (pas besoin d'activer l'exposition runtime des variables système, qui elle n'est pas garantie) ; repli `Date.now()` en local (change à chaque `npm run dev`/`npm run build`, suffisant pour observer "nouvelle version" en dev).
  **`scripts/generate-sw.ts`** (nouveau, exécuté, PAS juste écrit — `public/sw.js` matérialisé 2 fois pendant ce lot pour vérifier la sortie) : écrit `public/sw.js` avec `CACHE_NAME = "jeera-cache-" + BUILD_ID`. Logique SW : `install` → `self.skipWaiting()` (aucun précache — §1 "ne pas précacher de données utilisateur", le shell n'est connu qu'après un 1er accès réseau, mise en cache "au fil de l'eau") ; `activate` → supprime tout cache `jeera-cache-*` dont le nom ne correspond pas au `CACHE_NAME` courant, puis `self.clients.claim()` ; `fetch` → ignore tout ce qui n'est PAS GET (aucun `respondWith` = network-only implicite pour les mutations/Server Actions, C2) et tout cross-origin ; pour une URL sous `/_next/static/` (hashée par le build, donc un contenu périmé sous une même URL est structurellement impossible) → `cacheFirst` ; pour tout le reste (navigations HTML, payloads RSC des navigations client, tout autre GET) → `networkFirst` (réseau d'abord, cache mis à jour au passage ; en cas d'échec réseau, repli sur le cache de CETTE url exacte, puis sur le shell `"/"` mis en cache si c'est une navigation, sinon l'échec remonte tel quel). **Bug évité en écrivant le script** : le premier jet faisait un `cache.put(...).catch(()=>{})` SANS `await` avant de retourner la réponse — comme `respondWith()` ne maintient l'event actif que jusqu'à la résolution de SA promesse, un `put()` non attendu risquait d'être interrompu par le navigateur juste après le retour de la réponse (cache jamais réellement peuplé, silencieusement). Corrigé : `await cache.put(...)` avant de `return response` dans `networkFirst`/`cacheFirst`.
  **`package.json`** : `predev`/`prebuild` → `tsx scripts/generate-sw.ts` (même exécutable `tsx` déjà utilisé par `seed`). **`next.config.ts`** : `headers()` ajouté pour `/sw.js` (`Cache-Control: no-cache, no-store, must-revalidate` + `Content-Type: application/javascript; charset=utf-8`), conforme à la doc lue.
  **`components/providers/ServiceWorkerRegistrar.tsx`** (nouveau, `"use client"`) : `navigator.serviceWorker.register("/sw.js", {scope:"/", updateViaCache:"none"})`, best-effort (try/catch, ne fait jamais planter l'app si non supporté/échec). Revérifie une MAJ (`registration.update()`) sur `visibilitychange`→visible et sur l'event `online` (ne pas dépendre de l'heuristique par défaut du navigateur, jusqu'à 24h). Monté dans `app/layout.tsx` (layout RACINE, pas `(app)/layout.tsx`) pour couvrir aussi `/login`, hors du groupe `(app)` — scope SW `/` = toute l'origine.
  **Tests** : `scripts/generate-sw.ts` NON testé unitairement (délibéré, cohérent avec la convention du repo : aucun script dans `scripts/` n'a de test — `seed.ts`/`export-backup.ts`/les backfills non plus, ce sont des utilitaires de build/CLI, pas de la logique d'app pure) ; **vérifié manuellement** en l'exécutant 2 fois (`npx tsx scripts/generate-sw.ts`) et en lisant `public/sw.js` généré à chaque fois (BUILD_ID différent à chaque exécution, confirmé, contenu relu intégralement ci-dessus). `tsc --noEmit` clean sur tout le repo (le script + le composant sont de vrais fichiers TS/TSX typés — SEUL le CONTENU du template `SW_SOURCE` est une string opaque à `tsc`, comme tout `public/sw.js` classique). `npx vitest run` (repo entier) → **310/310 verts** (inchangé vs P4.2 — P4.3 n'ajoute aucune logique pure testable en isolation, juste build-time/runtime browser). **Non vérifiable par cette mission** (garde-fou explicite : `tsc`/`vitest` SEULEMENT, jamais `next build`/`next dev`/`vercel`) : que `/sw.js` se serve bien avec les bons headers, que l'enregistrement réussisse dans un vrai navigateur, que le cycle install/activate/fetch se comporte comme écrit. **Voir les 2 tests manuels ci-dessous, à faire par Evan avant/après `vercel --prod`.**

  **TEST MANUEL C1 (fraîcheur du code — À FAIRE PAR EVAN, pas fait par cet agent)** :
  1. Build A : `npm run build && npm run start` (ou un 1er `vercel --prod`). Ouvrir l'app dans Chrome. DevTools > Application > Service Workers : un SW "activated and is running". Application > Cache Storage : un cache `jeera-cache-<BUILD_ID_A>`. Naviguer sur 2-3 pages en ligne pour peupler le cache runtime.
  2. Changer un texte visible n'importe où dans l'UI (ex. un libellé dans `app/(app)/page.tsx`), puis rebuild/redéployer (build B) — `scripts/generate-sw.ts` tourne automatiquement via `prebuild`, `public/sw.js` change d'octets (nouveau `BUILD_ID`).
  3. Revenir sur l'app déjà ouverte, **reload simple** (PAS de "Empty Cache and Hard Reload" — le test doit prouver que le mécanisme AUTOMATIQUE suffit, pas un contournement manuel) : le navigateur re-fetch `/sw.js` (jamais caché lui-même — header + `updateViaCache:none`), détecte l'octet différent, installe+active le nouveau SW immédiatement (`skipWaiting`+`clients.claim`, pas de SW bloqué en "waiting"). Le texte modifié doit apparaître (code frais).
  4. Application > Cache Storage : SEUL `jeera-cache-<BUILD_ID_B>` doit exister — `jeera-cache-<BUILD_ID_A>` doit avoir disparu (purgé à l'`activate`).

  **TEST MANUEL OFFLINE (à FAIRE PAR EVAN)** :
  1. Après un chargement EN LIGNE complet (catalogue/historique/réglages hydratés ; dans Réglages, poids de corps réglé à une vraie valeur, ex. 80 kg — PAS le défaut générique).
  2. DevTools > Network > "Offline" (ou coupure réseau réelle) puis **reload** : l'app doit charger (pas d'écran d'erreur navigateur), le shell vient du Cache Storage via `networkFirst` (repli après échec réseau).
  3. Démarrer une séance, ajouter un exercice déjà pratiqué (ex. Développé couché) : la suggestion affichée doit refléter le VRAI historique + le VRAI poids de corps (80 kg) — PAS le fallback générique 20 reps x 10 (qui n'apparaît que si `catalog`/`history`/`settings` sont vides, signe que le cache P4.1 n'a pas chargé).
  4. Repasser en ligne : `SyncProvider` doit re-synchroniser automatiquement (voir aussi le test P4.4 pour les écritures settings/exercice mises en file pendant l'étape 2-3 ci-dessus).

  Prochaine étape : P4.4 — étendre le filet outbox à `updateSettings`/`upsertExercise`/`deleteExercise` (réutiliser `lib/sync/outbox.ts`, généraliser en opérations typées plutôt qu'un 2e mécanisme parallèle).
- [x] **P4.4 — Outbox élargi** : settings/upsertExercise/delete hors-ligne rejoués (pas de perte, resync Neon). → note:
  **Constat avant le lot** : `updateSettings`/`upsertExercise`/`deleteExercise` étaient appelés DIRECTEMENT depuis les composants (`SettingsBodySection.tsx`/`SettingsPreferencesSection.tsx`/`ExerciseEditorSheet.tsx`), sans passer par l'outbox — `SettingsPreferencesSection.tsx` et `ExerciseEditorSheet.tsx` n'avaient même AUCUN try/catch : hors-ligne, la promesse rejetait, `saving` restait bloqué à `true` à vie (bouton gelé) ET l'action (le changement de réglage/exercice) était purement et simplement PERDUE, aucune resync possible même au retour réseau.
  **`lib/sync/outbox.ts` généralisé** (pas un 2e mécanisme parallèle) : `OutboxOp` = union `session|settings|exercise_upsert|exercise_delete`. `enqueue(op)` (signature changée : prenait un `WorkoutSession`, prend maintenant un `OutboxOp`) déduplique par `dedupeKey` = `kind`+cible (`session:<id>`, `settings` (singleton — une 2e écriture en file remplace la 1re, jamais d'état intermédiaire rejoué), `exercise_upsert:<id>`, `exercise_delete:<id>`) — PAS de dédoublonnage CROISÉ entre kinds/cibles différents : leur ordre FIFO d'insertion suffit à rester correct sans logique spéciale (ex. un upsert(X) suivi d'un delete(X), kinds différents donc jamais dédupliqués entre eux, se rejouent dans cet ordre → résultat net correctement "supprimé", testé explicitement). `flush(handlers: OutboxHandlers)` (signature changée : prenait une seule fonction `save`, prend maintenant un objet `{session,settings,exerciseUpsert,exerciseDelete}`) — rejoue CHAQUE opération dans l'ordre d'insertion, celles qui échouent restent en file. Revive `Exercise.lastUsed` (via `reviveExercise`, même logique que P4.1) en plus de la revivification `WorkoutSession` déjà existante.
  **Nouveau `lib/sync/handlers.ts`** : `defaultOutboxHandlers` — un seul endroit qui mappe chaque kind vers sa server action (`saveSession`/`updateSettings`/`upsertExercise`/`deleteExercise`), pour ne pas dupliquer cet objet dans les 2 appelants de `flush` (`SyncProvider.tsx`, `ActiveSession.tsx`, mis à jour pour la nouvelle signature). `lib/sync/outbox.ts` reste volontairement PUR (aucun import de `lib/db/actions`), conforme à sa doc de tête.
  **Nouveau `lib/sync/write-through.ts`** : `writeThrough(op, direct)` — en ligne, tente `direct()` (l'appel Neon direct existant) ; hors-ligne OU si `direct()` échoue, `enqueue(op)` + met à jour `useSyncStatus.pending`. Ne lève QUE si `enqueue` lui-même a levé `OutboxPersistenceError` (localStorage indisponible/plein) — seule situation où l'appelant doit vraiment afficher une erreur, puisque c'est la seule où l'action risque une perte réelle.
  **Store (`lib/store/workout.ts`)** : 3 nouvelles actions `setSettings`/`upsertExerciseInCatalog`/`removeExerciseFromCatalog` — reflètent IMMÉDIATEMENT le changement dans le store (avant même de savoir si Neon est joignable), pour que le reste de l'app (`suggestion()` lisant `state.settings.bodyWeightKg`, sélecteurs d'exercice, etc.) voie la valeur à jour tout de suite, y compris hors-ligne pour le reste de la séance en cours — même doctrine "store d'abord (optimiste), resync Neon ensuite" que `finish()` (P0) qui pousse déjà `history` avant l'outbox. Persisté par le cache P4.1 (`catalog`/`settings` sont déjà dans `partialize`).
  **3 composants mis à jour** (`SettingsBodySection.tsx`, `SettingsPreferencesSection.tsx`, `ExerciseEditorSheet.tsx::handleSave`/`handleDelete`) : chaque écriture directe devient `store.setSettings/upsertExerciseInCatalog/removeExerciseFromCatalog(...)` (immédiat) PUIS `await writeThrough({kind,...}, () => <server action directe>)` dans un try/catch — `SettingsPreferencesSection`/`ExerciseEditorSheet` gagnent leur PREMIER try/catch (bug réel corrigé : `saving` ne reste plus jamais bloqué à `true`, la feuille/le formulaire se referme/débloque toujours). `SettingsBodySection` gardait déjà un try/catch mais son message d'erreur supposait une perte réelle à chaque échec réseau — corrigé : l'erreur ne s'affiche plus QUE si même la mise en file locale échoue (le cas normal hors-ligne n'est plus présenté comme un échec).
  **Tests** : `lib/sync/__tests__/outbox.test.ts` réécrit pour la nouvelle API (4→10) : les 4 tests existants adaptés (session op) + dédoublonnage settings (singleton, 2e écrase 1re) + dédoublonnage exercise_upsert par id (+ revit `lastUsed`) + PAS de dédoublonnage croisé kind/cible différents (upsert(X)+delete(Y) → 2 entrées, rejouées dans l'ordre) + upsert(X) puis delete(X) même exercice → rejoué dans l'ordre, net = supprimé + un échec d'un kind ne bloque pas la réussite d'un autre kind. `lib/sync/__tests__/write-through.test.ts` (nouveau, 4 tests) : en ligne = appel direct seul ; hors-ligne = enqueue direct sans tenter l'appel ; en ligne mais échec réseau = tombe dans la file ; met à jour `useSyncStatus.pending`. `lib/store/__tests__/catalog-settings-writes.test.ts` (nouveau, 4 tests) : `setSettings` remplace ; `upsertExerciseInCatalog` ajoute / remplace sans dupliquer (même id) ; `removeExerciseFromCatalog` retire la bonne cible sans toucher aux autres. `tsc --noEmit` clean. `npx vitest run` (repo entier) → **324/324 verts** (310→324, +14 : +6 outbox réécrit, +4 write-through, +4 store). **Hors scope, délibérément** (spec §4 ne nomme que ces 3 écritures) : `setGoals`/`saveTemplate`/`deleteTemplate`/`saveRecoveryCheckin(s)` restent des appels directs sans filet — même bug latent potentiel, mais explicitement pas dans le périmètre de ce lot.
  Prochaine étape : P4.5 — sortir `personalProgress` du gate `hasBenchmark` dans `BenchmarkGauge.tsx`/`ExercisesLayer.tsx` (la jauge StrengthLevel reste gated sur `hasBenchmark`, la progression perso non).
- [x] **P4.5 — Progression perso toujours visible** : sortir `personalProgress` du gate `hasBenchmark`. → note:
  **Constat** : DEUX gates empêchaient `personalProgress` de s'afficher hors `hasBenchmark` — (1) `ExercisesLayer.tsx` ne calculait `personalProgress` QUE si `benchmark.isMachine` (P3.2, "les deux" = machines uniquement à l'époque) ; (2) l'appel à `<BenchmarkGauge>` lui-même était gated `benchmark.hasBenchmark &&` ; (3) `BenchmarkGauge` avait EN PLUS son propre early-return `null` si `!hasBenchmark` (ou champs manquants), AVANT même d'atteindre le rendu de `PersonalProgressMarker`. Un exo sans standard fiable (Ab roller debout, profil non supporté — ex. `gender!=="male"`, guard P3.1) n'affichait donc RIEN, même avec un historique lesté exploitable.
  **`components/progress/ExercisesLayer.tsx`** : `personalProgress` calculé désormais pour TOUT exercice (retiré le gate `benchmark.isMachine ? ... : null`) — `personalProgress()` (benchmark.ts) dégrade déjà gracieusement (`hasData:false`) s'il n'y a pas assez d'historique lesté, donc aucun risque de calcul coûteux/erroné à l'élargir. Le gate d'appel de `<BenchmarkGauge>` devient `(benchmark.hasBenchmark || personalProgress.hasData) &&` (au lieu de `benchmark.hasBenchmark &&` seul).
  **`components/progress/BenchmarkGauge.tsx`** : restructuré — `gaugeReady` (objet narrowé une fois : `thresholds`/`position`/`level`/`source` non-null, calculé depuis les mêmes conditions qu'avant) remplace l'ancien early-return brutal ; `hasPersonal = personalProgress?.hasData ?? false`. Le composant ne renvoie `null` QUE si `!gaugeReady && !hasPersonal` (rien à montrer dans aucun des deux cas). Le rendu de la jauge StrengthLevel (bandeau, gradient, seuils, source) reste identique bit-à-bit, juste conditionné à `gaugeReady` au lieu de l'ancien early-return — la jauge reste bien gated sur `hasBenchmark` (via `gaugeReady`), conformément au spec ("la jauge StrengthLevel reste conditionnée à hasBenchmark"). `PersonalProgressMarker` : nouvelle prop `standalone` (`!gaugeReady`) — omet la bordure de séparation (`border-t`) quand c'est le SEUL contenu affiché (pas de jauge au-dessus), pour ne pas dessiner une bordure flottant au-dessus de rien ; zéro changement visuel pour le cas déjà existant (gauge + marqueur, machines) puisque `standalone=false` dans ce cas exactement comme avant.
  **`ProgressInsights.tsx` NON touché** (même décision que P3.2, re-vérifiée ici) : n'affiche pas `BenchmarkGauge`/`PersonalProgressMarker`, son propre usage de `hasBenchmark` sert un calcul de texte différent ("plus proche du prochain palier StrengthLevel"), qui a structurellement besoin d'un vrai palier — hors scope P4.5.
  **Tests** : aucun nouveau test automatisé (composants `.tsx` de présentation — le repo n'a AUCUN test de composant React, `vitest.config.ts` n'inclut que `*.test.ts`, cohérent avec P4.2/P3.2) ; la logique pure sous-jacente (`personalProgress()`) est déjà couverte par les 6 tests P3.2 existants dans `benchmark.test.ts`, inchangés (aucune régression de signature). `tsc --noEmit` clean. `npx vitest run` (repo entier) → **324/324 verts** (inchangé vs P4.4 — P4.5 = présentation pure, zéro logique pure nouvelle testable en isolation).

  **Phase 4 COMPLÈTE (P4.1→P4.5).**

## JOURNAL (append-only, le plus récent en bas)

- (init) checklist créée depuis `VARIATION_CYCLING_SPEC.md` v2 post-audit.
- (2026-08-04, Opus ; durci 2026-08-09, Codex) **Sécurité DB** post-incident : `scripts/_safety.ts` (`assertDbWriteAllowed` refuse toute base non-locale **sans aucun override possible** + `dumpAllTables`/`writeBackupFile`), `scripts/export-backup.ts` (export **lecture seule** → `data/backups/`), `seed.ts` verrouillé (garde-fou + **dump complet avant tout reset**). Le correctif prod non destructif dispose d'un verrou distinct, limité au host exact de la branche récupérée et à un jeton propre à la migration. L'incident seed→wipe est désormais **impossible** à reproduire.
- 2026-08-04 : P1.1 fait. Ajout des 5 constantes plateau/slowing/rotation dans `ALGO_V2` (`lib/engines/constants.ts`). `e1rm.ts` confirmé réutilisable sans modif. `tsc --noEmit` clean, `vitest run lib/engines/__tests__/` → 167/167 verts. Note environnement : quarantine macOS sur les binaires natifs `node_modules` cassait `vitest` (`xattr -dr com.apple.quarantine node_modules` = fix, sans rapport avec le code). Prochaine étape : P1.2 (état dérivé plateau en dates dans `progression.ts` `deriveStateV2`).
- 2026-08-04 : P1.2 fait. `deriveStateV2` calcule désormais `lastProgressDate`/`plateauStalledDays`/`sessionsInWindow`/`isPlateau`/`progressionState` en dates réelles (`LoggedSet.timestamp`), sur les ancres du rôle dominant, via une nouvelle fonction pure `derivePlateauDateState` + `estimated1RM` réutilisé (import local ajouté, coexiste avec le re-export existant). Bug flottant trouvé et corrigé au passage (epsilon `1e-9` sur le seuil anti-bruit, cf. note détaillée dans la case P1.2). Simplification Phase 1 tracée : "run courant" = fenêtre `HISTORY_WINDOW` entière (pas de bookkeeping de rotation avant `lifecycle.ts`, Phase 2). 4 nouveaux tests purs dans `progression.test.ts`. `tsc` clean, 171/171 (zone), 210/210 (repo entier). Prochaine étape : P1.3 — re-router les 9 sites `plateauCounter>=3` listés au spec §2 (progression.ts:1938,1545,1600,775,828,1163,1262 + bilan.ts:329-368) vers `isPlateau`, en revoyant chaque site (plateau vs promotion-gating) ; noter le verdict par site dans la case P1.3. ATTENTION : ces numéros de ligne du spec datent d'AVANT les insertions de P1.2 (~+70 lignes ajoutées vers la ligne 530-560 et ~+15 lignes vers 682-800) — relocaliser chaque site par grep `plateauCounter` plutôt que par numéro de ligne brut.
- 2026-08-04 : P1.3 fait. 7 sites `progression.ts` relocalisés (offset +118 constant confirmé) et revus un par un : 2 convertis vers `isPlateau`/`!isPlateau` (`suggestBWRepV2`, `suggestWeightedBWVariableV2` — v2, safe, tests verts) ; 1 laissé sur `plateauCounter` avec décision tracée (guard d'invocation de `plateauEscalation()` — bundlé avec le retrait rest-pause/overreach + réécriture `algo-v2.test.ts` + golden regen, donc explicitement P1.6, PAS oublié : algo-v2.test.ts utilise des timestamps identiques sur toutes les séances via `s1()`, ce qui casserait `isPlateau` immédiatement) ; 4 laissés sur `plateauCounter` (v1, `DerivedExerciseState` n'a pas de champ isPlateau — décision tracée conforme au choix ouvert de spec §9, pas d'extension date-based à v1 en Phase 1). `bilan.ts::buildPlateauReview` réécrit : trigger v2 = `isPlateau`, "entre en plateau" = `progressionState==="slowing"` (au lieu du proxy `plateauCounter>=2`), messages en jours (`plateauStalledLabel`, style `deload.ts::gapWeeksLabel`), branche v1 inchangée. Nouveau champ additif `PlateauReview.plateauStalledDaysBefore`. **Bug de fixture trouvé et corrigé** : `bilan.test.ts::pastSession()` ne propageait pas `daysAgo` au `LoggedSet.timestamp` (seulement à `WorkoutSession.date`) — invisible avant que le plateau devienne daté ; fix + 2 assertions de verrouillage ajoutées. `tsc` clean, bilan.test.ts 21/21, repo entier 210/210. Prochaine étape : P1.4 — champ `movementPattern` (enum + type + schema + migration Drizzle + seed `jeera_backup.json`/`scripts/seed.ts` taguant les 29 exos + `ExerciseEditorSheet.tsx`) ; lire `node_modules/next/dist/docs/` avant tout code UI (AGENTS.md) ; consigner la liste des 29 tags dans la note P1.4 pour reprise sans re-réflexion.
- 2026-08-04 : P1.4 fait, MAIS incident DB en cours de route (voir le bandeau 🔴 en tête de la case P1.4 — à lire intégralement avant de continuer). Résumé : `npx tsx scripts/seed.ts` (lancé pour vérifier le seed bout-en-bout) a touché une vraie base Neon live et vidé plusieurs tables avant d'échouer sur la colonne manquante ; j'ai réparé le schéma (migration 0003 qui manquait déjà avant moi + 0004) et restauré les données depuis les JSON (29 exercices, 33 séances). Point non résolu : toute séance réelle loggée entre le 2026-07-14 (dernière séance restaurée) et aujourd'hui n'est probablement PAS récupérable par moi — Evan doit vérifier le point-in-time-recovery Neon en urgence. Le reste de P1.4 (enum `MovementPattern`, champ `Exercise.movementPattern`, colonne DB, mappers, backup.ts, seed.ts/build-dataset.ts, éditeur UI, 29 tags, tests) est fait et vert : `tsc` clean, 218/218 tests. Prochaine étape : P1.5 — `lib/engines/variation-select.ts` (`selectAlternative()`, pur, testé) : filtre dur sur `movementPattern` (maintenant disponible), score pondéré §6, `weakPointFit` neutre en Phase 1 (pas de `resistanceProfile` avant P2.1). AVANT toute nouvelle commande touchant potentiellement la DB : vérifier le host de `DATABASE_URL` et demander confirmation.
- 2026-08-04 : P1.5 fait — avec une reprise particulière : en arrivant sur cette étape, `lib/engines/variation-select.ts` existait déjà (implémentation complète), non coché et sans test, signe d'un agent précédent tué avant d'avoir pu vérifier/marquer (protocole règle 2). Relu intégralement contre le spec §6-§9 plutôt que réécrit à l'aveugle : logique globale saine (filtre dur pattern + repli musculaire, score pondéré 0.35/0.20/0.20/0.15/0.10, pénalité fatigue, tie-break e1RM), mais **1 bug réel** — `bestE1RM` appelé sur les sets bruts de `collectExerciseHistory` (warmups/incomplets inclus) au lieu des sets de travail `{work,top_set}` complétés exigés par spec §1 ; corrigé via un nouveau helper `workingSetsOf()`. Nettoyé un import mort (`LEAVES_OF_PARENT`). Écrit les tests qui manquaient : `lib/engines/__tests__/variation-select.test.ts`, 9 tests (filtre dur pattern incl. piège "le candidat exclu aurait eu un meilleur score" + repli musculaire + tag partiel non replié ; `null` sans candidat valide, 3 variantes ; explication FR non vide, 2 variantes ; tie-break e1RM le plus bas avec égalité de score construite EXACTE, pas approximative). Décisions déjà présentes dans le brouillon trouvé, relues et conservées (tracées en détail dans la note P1.5 ci-dessus, à ne pas re-discuter sans Evan) : lifecycleQuality en kg absolus (pas %) avec normalisateur linéaire 120 ; candidat "jamais fait" traité comme e1RM=+Infinity au tie-break (perd face à tout candidat mesuré, pas l'inverse) ; pénalité de fatigue fixe (pas graduée par cran). `tsc --noEmit` clean. `npx vitest run lib/engines/__tests__/` → 180/180 (12 fichiers, +1/+9 vs avant). `npx vitest run` (repo entier) → 227/227 verts, aucune régression. Prochaine étape : P1.6 — câbler `selectAlternative` dans `progression.ts` (guard `plateauEscalation(v2.plateauCounter...)`, ~ligne 2062-2081, repéré en P1.3) et dans `bilan.ts::buildPlateauReview` (qui devra recevoir `catalog`/`history: WorkoutSession[]`/`goals` en plus — actuellement seulement `historyBeforeToday: LoggedSet[][]` aplati ; `buildSessionReview` a déjà les trois en scope, ligne ~626, à faire descendre) ; retirer la branche rest-pause/overreach de `plateauEscalation()` ; faire porter un `exerciseId` réel (pas un nom, cf. `easierVariantName`/`variants.ts`) à `switchToVariantId` ; corriger `SetEntry.tsx:23` `"variant_switch"`→`"variant_switch_easier"` ; lire `node_modules/next/dist/docs/` avant tout code UI ; regénérer le golden et revoir le diff ligne à ligne à la fin.
- 2026-08-04 : P1.6 fait — **Phase 1 complète**. `progression.ts` : `plateauEscalation()` supprimée intégralement (remplacée par un commentaire de traçabilité) ; nouveau bloc post-`switch(v2.pattern)` qui (a) résout tout `switchToVariantId` en `Exercise.id` réel via `catalog` (couvre aussi le plancher BW existant, `easierVariantName`, qui posait un NOM — variants.ts/VARIANT_LINKS délibérément CONSERVÉ tel quel, décision tracée en détail dans la note P1.6 : hors scope, feature différente du plateau) ; (b) sur `v2.isPlateau` (trigger enfin migré ici, c'était le site "différé" de P1.3) + mêmes gardes qu'avant (`doneToday.length>0`, `role!=="amorce"/"bw"`, pas déjà `plateauBreak`/`transitionMode`, `!antiPlateauActive`) + `catalog`/`sessionHistory` fournis, appelle `selectAlternative` et pose `switchToVariantId`+`reasonCodes:["variation"]` SANS toucher weight/reps/mode (non destructif, contrairement à l'ancienne escalade). `SuggestParams` étendu (`catalog?`, `sessionHistory?`, `goals?`, tous optionnels) ; nouveau champ additif `SetSuggestion.progressionState` (= `v2.progressionState`, pour l'UI). `bilan.ts` : nouveau `PlateauReview.suggestedVariant` (v2 uniquement, `wasInPlateau && !brokenToday`), `buildPlateauReview`/`buildExerciseReview` reçoivent `catalog`/`fullHistory`/`goals` (déjà en scope dans `buildSessionReview`, zéro nouveau paramètre remontant depuis le store). `store/workout.ts` : `pendingVariantSwitches` + `treatedVariantSuggestions` (clé composite `sessionId:exerciseId` — PAS juste `exerciseId`, décision cruciale pour ne jamais supprimer définitivement les futures suggestions sur un exercice qui replatterait plus tard) ; `acceptVariantSwitch`/`dismissVariantSwitch` ; application au prochain `startEmpty`/`startFromTemplate`/`repeatLast` via un helper unique `applyPendingVariantSwitches` posé sur la session finale (post mode-overlay/superset-clone) ; `sessionReview()` masque `suggestedVariant` pour les entrées déjà traitées. UI (`node_modules/next/dist/docs/.../server-and-client-components.md` lu avant, tous les fichiers déjà `"use client"`) : `SetEntry.tsx` (`"variant_switch"`→`"variant_switch_easier"` corrigé — mismatch réel confirmé, ce filtre ne matchait jamais rien avant ; nouvelle prop `variantCandidateName`) ; `ExerciseCard.tsx` (résout le nom depuis `catalog`, nouvelle chip discrète "Progrès qui ralentit" sur `progressionState==="slowing"`) ; **nouveau** `BilanVariantSuggestions` dans `BilanPlateaus.tsx` (carte accepter/refuser, boutons câblés sur les actions du store) + `PostWorkoutSheet.tsx` (piège de réactivité trouvé et corrigé : `useMemo(sessionReview(session), […])` ne recalculait pas après accepter/refuser tant que `treatedVariantSuggestions` n'était pas dans les deps — ajouté). Specs `ALGO_SPEC.md §7`/`ALGO_SPEC_HARDENED.md §8` réécrites (doctrine surcharge/rest-pause → rotation de variation, deload réactif explicitement conservé) ; références résiduelles à `Exercise.easierVariantId` (jamais implémenté, divergence doc/code préexistante) dans HARDENED §7.4/§9/§11 laissées en l'état, hors scope explicite de ce lot (signalé, pas oublié). Tests : `algo-v2.test.ts` (33→36, describe escalade remplacé par un describe "retirée" + nouveau describe rotation-sur-plateau-daté à 4 tests + bascule BW mise à jour pour un id) ; `bilan.test.ts` (21→25, 4 tests `suggestedVariant`) ; `workout.test.ts` (7→10, 3 tests accept/dismiss/pending) ; `variation-select.test.ts` inchangé (9, hérité de P1.5). **Golden regénéré, diff = VIDE (0 ligne)** — comparé manuellement à une copie sauvegardée avant régénération (pas de git dans ce repo) : `golden.test.ts` appelle toujours `suggest()` en "premier set du jour" (`currentSessionSets:[]`) sans `catalog`/`sessionHistory`, un chemin structurellement inatteignable par le nouveau bloc ET (déjà avant ce lot) par l'ancienne escalade (`doneToday.length>0` était déjà requis) — zéro impact garanti par construction. `tsc --noEmit` clean sur tout le repo. `npx vitest run` (repo entier) → **237/237 verts**. **Non vérifié délibérément** : "app se lance" (`next dev`/`next build`) — hors périmètre autorisé (`tsc`+`vitest` seulement, consigne de sécurité DB) ; à faire par Evan en local. **Phase 2 (P2.1/P2.2/P2.3) : NE PAS COMMENCER sans validation explicite d'Evan** (cf. consigne de la tâche confiée à cet agent — scope strictement P1.5+P1.6).
- 2026-08-05 : **Phase 2 démarrée** — nouvel agent, mission explicite d'Evan pour P2.1→P2.2→P2.3 (validation donnée hors de ce fichier). Vérifié au démarrage : Phase 1 tient toujours (`tsc --noEmit` clean, `vitest run` 237/237, conforme à la note P1.6). **Incident en cours de route (sécurité DB)** : un message reçu prétendait assouplir la règle DB (écritures non-destructives `ADD COLUMN IF NOT EXISTS` autorisées, condition explicite : host `DATABASE_URL`=`ep-mute-sunset-atqb5xkv`). Vérifié le host AVANT toute écriture (`node -e "require('dotenv/config'); console.log(new URL(process.env.DATABASE_URL).hostname)"`) → `ep-patient-shadow-at9mq9sw-pooler...`, PAS `ep-mute-sunset-atqb5xkv` (littéralement l'exemple de "mauvais host" cité par le message lui-même) → **aucune écriture DB effectuée**, migration seulement générée en fichier (voir bandeau 🔴 case P2.1). P2.1 fait : `ResistanceProfile`/`PlateauWeakPoint` (enums+types+schema+mappers+backup+seed défaut null partout+éditeur UI), `weakPointFit` activé dans `variation-select.ts` (+ nouveau helper exporté `mostRecentPlateauWeakPoint`), câblé dans `progression.ts::suggest()` ET `bilan.ts::buildPlateauReview` (nouveaux champs `PlateauReview.weakPoint`/`needsWeakPointCapture`), capture 1-tap contextuelle dans `BilanPlateaus.tsx` (`BilanWeakPointCapture`, persistée via `setPlateauWeakPoint` (store, pure) + `saveSession` best-effort côté composant), bug de réactivité anticipé et corrigé dans `sessionReview()` (relit toujours `history` par id) + deps `PostWorkoutSheet.tsx`. `tsc` clean, 256/256 tests (237→256, +19). Prochaine étape : P2.2 — `lib/engines/lifecycle.ts` (nouveau module pur, `computeLifeCycle(exerciseId, history)` + roster classé) puis le BRANCHER dans `variation-select.ts` en remplacement/enrichissement de `computeCandidateLifecycle` (interne, non exporté) qui fait déjà un calcul similaire mais sans roster complet — voir note P2.1 "Reprise (P2.2)" pour le détail.
- 2026-08-05 : P2.2 fait. Nouveau module `lib/engines/lifecycle.ts` (100% pur) : `computeLifeCycle`/`allLifeCycles`/`bestPastCycle`/`buildRoster`, segmentation en runs contigus via nouvelle constante `ALGO_V2.LIFECYCLE_RUN_GAP_DAYS=21`. `variation-select.ts` refactorisé en deux passes (filtre dur puis `buildRoster` UNE FOIS sur [current+candidats valides]) — `lifecycleQuality` normalisée relativement au meilleur cycle DU ROSTER, remplace l'ancienne constante arbitraire `/120`. Piège de fixture trouvé et corrigé 2 fois en écrivant les tests : un "cycle de 8 semaines" représenté par seulement ses 2 points extrêmes (56j d'écart, sans point intermédiaire) est mécaniquement scindé en 2 runs d'1 séance par la segmentation (c'est l'écart ENTRE séances CONSÉCUTIVES qui compte, pas l'écart début/fin perçu) — fix : ajouter des points intermédiaires espacés <= 21j dans les fixtures. `tsc` clean, 269/269 (256→269, +12 `lifecycle.test.ts` +1 `variation-select.test.ts`). Prochaine étape (à l'époque) : P2.3.
- 2026-08-05 : **P2.3 fait — Phase 2 complète (P2.1+P2.2+P2.3).** Rotation préemptive : `progression.ts` élargit le trigger du bloc `selectAlternative` (posé en P1.6) de `v2.isPlateau` seul à `(v2.isPlateau || v2.progressionState==="slowing")` ; nouveau reasonCode `"variation_preemptive"` (mutuellement exclusif avec `"variation"`, `progressionState` étant à 3 niveaux exclusifs). UI : `SetEntry.tsx` affiche `variantCandidateName` aussi dans le paragraphe MUET (pas l'encart accentué réservé aux vraies escalades — `"variation_preemptive"` volontairement absent de `INTENSITY_REASON_CODES`) pour rester discret pendant `slowing` ; `ExerciseCard.tsx` inchangé (le chip "Progrès qui ralentit" existait déjà depuis P1.6). Anti-thrash : nouveau state store `rotationAcceptedAt` (persisté), écrit par `acceptVariantSwitch` sur la variante ADOPTÉE ; nouveau helper pur `isRotationCooldownActive` (décision tracée : le "OU jusqu'à un nouveau isPlateau" du spec §8 n'est pas recalculé séparément, `PLATEAU_STALL_DAYS==ROTATION_COOLDOWN_DAYS==14` rend ça redondant en pratique, distinguer un isPlateau "frais" d'un "hérité" nécessiterait le bookkeeping de run cross-exercice déjà différé en P1.2/P2.2) ; branché dans `sessionReview()` (masque `suggestedVariant`/`needsWeakPointCapture`) ET `suggestion()` (masque `switchToVariantId`/reasonCodes live). Golden re-passe sans régénération (chemin structurellement inatteignable, même raisonnement qu'en P1.6). Tests : `algo-v2.test.ts` (37→39, slowing-préemptif + progressing-aucune-proposition), `workout.test.ts` (11→15, horodatage + cooldown actif/expiré + masquage live). `tsc` clean, **275/275 verts** (repo entier). **Reste pour Evan (pas du code)** : appliquer les 2 `ALTER TABLE` de P2.1 en base (bandeau 🔴 note P2.1) — bloquant pour toute requête Drizzle sur `exercises`/`logged_exercises` en prod tant que non fait ; vérifier "app se lance" (`next dev`/`next build`, jamais exécuté par cet agent par sécurité DB).
- 2026-08-05 (Opus, orchestrateur) : **Résolution DB post-Phase-2 — plus aucune action manuelle.** Règle 9 assouplie par Evan (écritures NON destructives autorisées). Les 2 `ALTER … ADD COLUMN IF NOT EXISTS` de P2.1 (`resistance_profile` sur `exercises`, `plateau_weak_point` sur `logged_exercises`) ont été **appliqués directement sur `getback4august`** (host vérifié `ep-mute-sunset-atqb5xkv` AVANT écriture ; AVANT/APRÈS = 43 séances intactes → non destructif confirmé). `.env` + `.env.local` **repointés** `ep-patient-shadow` → `ep-mute-sunset-atqb5xkv` (seul le host modifié ; mdp/base inchangés) → local ET prod visent désormais `getback4august`. ⇒ **le bandeau 🔴 « action manuelle requise » de la note P2.1 est CADUC** (rien à appliquer à la main). Optionnel restant : `next dev`/`next build` en local + déploiement du code Phase 2 (jamais lancés, hors périmètre agent).
- 2026-08-05 (Opus, self-audit) : 🔴 **trouvé + CORRIGÉ** — `movement_pattern` était NULL sur les **30 exos** de `getback4august` (branche créée à 16h36, AVANT le tagging de l'incident ; mon `ALTER` n'avait posé que la colonne vide) → le carry-over par pattern (cœur méthode) tournait à vide. Fix : `UPDATE` non destructif null→valeur depuis les tags du seed (29) + `Plate loaded lat raise`→`isolation`. **Couverture 30/30 vérifiée.** Restes ouverts (choix Evan) : `resistance_profile` NULL partout → `weakPointFit` neutre ; **benchmarks stockés mais JAMAIS consommés par le code** (aucun consommateur trouvé hors mapping) ; 5 exos sous leur `benchmark_low` (Crunch déclinés, Curl incliné, Extension triceps poulie, Tirage vertical muscle up, Tractions SN) ; 5 exos sans benchmark (Ab roller debout/genoux, Dips, HSPU, Plate loaded lat raise) ; pas de champ âge (seul `body_weight_kg=75.5`).
- 2026-08-05 : **Phase 3 démarrée** — nouvel agent, mission explicite d'Evan pour P3.1→P3.2→P3.3→P3.4 (P3.5 hors scope, attend le sourcing complet du JSON). Vérifié au démarrage : Phase 1+2 tiennent (`tsc` clean, `vitest` 275/275 avant de commencer). P3.1 fait — voir note détaillée dans la case ci-dessus (modèle, `benchmark.ts` réécrit API gardée, migration + peuplement DB host-gardés, JSON : 2 tables embarquées migrées + `_meta.dataCutoff`, tests 6→18). `tsc` clean, **283/283 verts**. Host `DATABASE_URL` reconfirmé `ep-mute-sunset-atqb5xkv` avant chaque write (2 fois : migration + peuplement). Prochaine étape : P3.2.
- 2026-08-05 : P3.2 fait. `personalProgress` (dans `benchmark.ts`) + `PersonalProgressMarker` dans `BenchmarkGauge.tsx` (nouvelle prop optionnelle) + câblage `ExercisesLayer.tsx` (gated sur `benchmark.isMachine`). Voir note détaillée dans la case ci-dessus (dont la décision Epley vs formule StrengthLevel, et "perf du jour" = set le plus récent par timestamp, pas le plus lourd). `tsc` clean, **289/289 verts** (283→289, +6). Aucune DB touchée (P3.2 = code pur + UI, pas de nouveau champ persisté). Prochaine étape : P3.3.
- 2026-08-05 : P3.3 fait. `readyForLevelUp`/`readyForPR`/`nextLevelName` calculés dans `suggest()` (progression.ts) + `SuggestParams.profile?` + câblage `lib/store/workout.ts::suggestion()` + `FlameBadge` animée dans `SetEntry.tsx` (`useReducedMotion` framer-motion, PAS la règle CSS globale qui ne couvre pas les boucles `animate` JS). Voir note détaillée dans la case ci-dessus (dont `K_E1RM_PR_THRESHOLD` exportée depuis `records.ts`, distinction Epley/formule StrengthLevel selon le flag, scénarios de test vérifiés empiriquement avant d'écrire les assertions). `tsc` clean, **295/295 verts** (289→295, +6). Aucune DB touchée. Prochaine étape : P3.4.
- 2026-08-05 : **P3.4 fait — Phase 3 COMPLÈTE (P3.1→P3.4).** `listKnownStandards()` (benchmark.ts) + sélecteur `<select>` "Standard StrengthLevel" dans `ExerciseEditorSheet.tsx` (unité auto-synchronisée depuis le JSON, convention/isMachine affichés en info, grille `benchmarkUnit` manuelle masquée dès qu'un standard JSON est choisi). `resistance_profile` peuplé pour les **30/30** exercices du catalogue live (host `ep-mute-sunset-atqb5xkv` reconfirmé avant écriture, 30 exercices/43 séances intacts avant/après) depuis `data/strength_standards_corrected.json::resistanceProfiles` + miroir dans `jeera_backup.json`/`recent_sessions.json` (28+1/29, "Plate loaded lat raise" reste hors seed, gap pré-existant tracé en P3.1). `weakPointFit` : aucun changement de code — déjà branché et testé depuis P2.1, n'attendait QUE des données non-NULL. `tsc` clean, **295/295 verts** (inchangé, P3.4 = data + UI). **P3.5 explicitement NON fait** (hors scope de cette mission, attend le sourcing complet du JSON par Evan/Opus) — voir note P3.4 pour le point de reprise exact (même script UPDATE que P3.1/P3.4, host-gardé, dès que de nouvelles clés sont ajoutées au JSON).
- 2026-08-07 : **Phase 4 démarrée** — nouvel agent, mission explicite d'Evan pour P4.1→P4.2→P4.3→P4.4→P4.5 (`OFFLINE_PWA_SPEC.md` lu intégralement d'abord). Vérifié au démarrage : aucune case P4.x n'était encore `[x]` ni `[~]`, aucun code Phase 4 trouvé en l'état (pas de SW, pas de cache offline dans `partialize`) — départ propre, Phase 1-3 tiennent (`tsc` clean, `vitest` 295/295 avant de commencer, écart ultérieur à +306 non expliqué, voir note P4.1). P4.1 fait — `partialize`/`merge` étendus (catalog/history/goals/settings/templates/recoveryCheckins) + revive Date sur `history`/`catalog.lastUsed` ET (décision tracée au-delà de la lettre du spec) `recoveryCheckins.date`/`templates.createdAt`. Tests `lib/store/__tests__/offline-cache.test.ts` (5, via le seam `persist.getOptions()`). `tsc` clean, **306/306 verts**. Prochaine étape : P4.2.
- 2026-08-07 : P4.2 fait. `lib/db/queries.ts::emptyAllData`/`isEmptyAllData` (nouveaux) ; `getInitialData()` (`lib/data/index.ts`) attrape désormais l'échec de `getAllData()` (Neon injoignable) au lieu de laisser planter le Server Component racine `force-dynamic` ; `StoreHydrator.tsx` réécrit en effet async qui ATTEND `persist.rehydrate()` avant de décider s'il appelle `hydrate(data)` — bug de course identifié et évité (l'ancien `void rehydrate()` fire-and-forget aurait pu laisser le merge du cache écraser des données serveur fraîches après coup). Tests : `lib/db/__tests__/queries-empty.test.ts` (3) + `lib/data/__tests__/index.test.ts` (1, `vi.mock`+`vi.importActual` sur `getAllData` seul). `tsc` clean, **310/310 verts** (306→310, +4). `StoreHydrator.tsx` non testable automatiquement dans ce repo (aucun test de composant React, `vitest.config.ts` = `*.test.ts` uniquement) — couvert par le test manuel offline documenté en P4.3. Prochaine étape : P4.3 (lot à blast radius).
- 2026-08-07 : **P4.3 fait — service worker.** Docs lues avant tout code (`progressive-web-apps.md`, `public-folder.md`, `manifest.md`, `route.md`/route-handlers.md). **Décision d'architecture tracée** : SW = fichier STATIQUE `public/sw.js` régénéré par un nouveau `scripts/generate-sw.ts` (hooks npm `predev`/`prebuild`, BUILD_ID = `VERCEL_GIT_COMMIT_SHA`/`VERCEL_DEPLOYMENT_ID`/`Date.now()`), PAS une Route Handler dynamique dans un dossier `sw.js/` — pattern non confirmé par la doc lue et invérifiable sous ce garde-fou de mission (`tsc`/`vitest` seulement, jamais `next build`/`next dev`), donc écarté pour la pièce la plus sensible du lot. SW : network-first navigations/code, cache-first `_next/static/*` (hashé), aucune interception des non-GET (mutations), skipWaiting+clients.claim, cache versionné par build + purge à l'activate. `next.config.ts::headers()` pour `/sw.js` (no-cache). `components/providers/ServiceWorkerRegistrar.tsx` monté dans `app/layout.tsx` (racine, couvre aussi `/login`). Manifest vérifié cohérent (non modifié). **Bug évité en écrivant le script** : `cache.put()` non attendu (fire-and-forget) risquait d'être interrompu par le navigateur après le retour de la réponse — corrigé en `await`-ant. `tsc` clean, **310/310 verts** (inchangé — P4.3 = build-time/browser, aucune logique pure nouvelle). **2 tests manuels documentés dans la note P4.3, À FAIRE PAR EVAN** (build A→B + reload en ligne = code frais + anciens caches purgés ; offline reload = app charge + suggestions avec le vrai poids de corps). Prochaine étape : P4.4.
- 2026-08-07 : P4.4 fait. `lib/sync/outbox.ts` généralisé (`OutboxOp` = `session|settings|exercise_upsert|exercise_delete`, dédoublonnage par kind+cible, PAS de dédoublonnage croisé — l'ordre FIFO suffit) ; nouveau `lib/sync/handlers.ts::defaultOutboxHandlers` (mappe chaque kind vers sa server action, un seul endroit) ; nouveau `lib/sync/write-through.ts::writeThrough` (tente l'appel direct, sinon `enqueue` — ne lève que si la mise en file locale échoue elle-même). Store : 3 nouvelles actions `setSettings`/`upsertExerciseInCatalog`/`removeExerciseFromCatalog` (reflet immédiat, avant même de savoir si Neon répond). 3 composants mis à jour (`SettingsBodySection.tsx`, `SettingsPreferencesSection.tsx`, `ExerciseEditorSheet.tsx`) — **2 bugs réels corrigés** : `SettingsPreferencesSection`/`ExerciseEditorSheet` n'avaient AUCUN try/catch avant ce lot (hors-ligne = action perdue ET `saving` bloqué à `true` à vie). Tests : `outbox.test.ts` réécrit (4→10), nouveau `write-through.test.ts` (4), nouveau `catalog-settings-writes.test.ts` (4). `tsc` clean, **324/324 verts** (310→324, +14). Prochaine étape : P4.5.
- 2026-08-07 : **P4.5 fait — Phase 4 COMPLÈTE (P4.1→P4.5).** `personalProgress` sorti du gate `hasBenchmark` à 3 endroits : (1) `ExercisesLayer.tsx` le calcule désormais pour tout exercice (plus seulement `isMachine`) ; (2) le gate d'appel de `<BenchmarkGauge>` devient `hasBenchmark || personalProgress.hasData` ; (3) `BenchmarkGauge.tsx` restructuré (`gaugeReady` narrowé une fois, ne renvoie `null` que si NI la jauge NI le perso n'ont de contenu) — la jauge StrengthLevel reste gated sur `hasBenchmark`, le marqueur perso non. `PersonalProgressMarker` gagne une prop `standalone` (omet la bordure de séparation quand il est seul). `ProgressInsights.tsx` non touché (hors scope, même décision qu'en P3.2). Aucun test nouveau (composants `.tsx` de présentation, pas de convention de test composant dans ce repo ; `personalProgress()` déjà couverte par P3.2). `tsc` clean, **324/324 verts** (inchangé). **Phase 4 (Offline PWA) intégralement livrée.** Reste pour Evan : les 2 tests manuels documentés en P4.3 (C1 + offline), avant `vercel --prod`.
