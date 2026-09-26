# Jeera — Fitness Tracking App (iOS SwiftUI)

## What this is
Personal gym workout logger. Core value: smart weight/rep suggestions that learn from history and adapt to fatigue. Built by Claude, extended by Codex, maintained in turns. **When you start a new session, read the HANDOFF section first.**

---

## Stack
- iOS 17+ · SwiftUI + SwiftData + ActivityKit
- Architecture: MVVM — Models / Engines (pure functions) / WorkoutViewModel (orchestration) / Views
- Charts: Apple Charts framework
- Tests: Swift Testing (`@Test`)
- Branches: `claude/gym-workout-logger-app-RvaJP` (main), feature branches per agent

---

## Non-Negotiables (never change these)
1. **Progression algorithm stays** — do not replace ProgressionEngine with a generic approach.
2. **Workout-time UX = minimum taps** — every new interaction must justify itself.
3. **Charts = interactive, modern, beautiful** — no static charts without interaction.
4. **UI language = French** — all labels, badges, messages in French.
5. **No external dependencies** — no third-party packages, Apple frameworks only.

---

## Architecture Map (key files)

| File | Lines | Role |
|------|-------|------|
| `Jeera/ViewModels/WorkoutViewModel.swift` | ~1656 | Session lifecycle, set logging, superset, rest timer, Live Activity |
| `Jeera/Engines/ProgressionEngine.swift` | ~752 | Weight+reps suggestion, promotion, plateau detection |
| `Jeera/Engines/EffectiveSetsEngine.swift` | ~339 | Muscle coverage (leaf+parent), 7-day rolling window |
| `Jeera/Engines/RecordsEngine.swift` | ~237 | PR classification (4 types), display filtering |
| `Jeera/Engines/AchievementsEngine.swift` | ~112 | Recent PRs, deduplication, ranking |
| `Jeera/Models/` | — | SwiftData models: WorkoutSession, LoggedExercise, LoggedSet, Exercise, SupersetGroup |
| `Jeera/Views/Workout/ExerciseCard.swift` | ~300 | Active exercise UI, set logging, suggestion display, swipe actions |
| `Jeera/Views/Workout/ActiveWorkoutView.swift` | ~200 | Workout canvas, reorder, finish |
| `Jeera/Views/Progress/` | — | 3-layer progress: Muscles / Exercise charts / Global |
| `Jeera/Views/History/` | — | Session history, weekly groups |
| `JeeraWidgets/` | — | Lock-screen Live Activity (ActivityKit) |

---

## Data Model (brief)

```
WorkoutSession → [LoggedExercise] → [LoggedSet]
                → [SupersetGroup] → [LoggedExercise] (members)

Exercise:
  setPatternMode: straight | topSetBackoff | ramping | bodyweight | weightedBodyweight | assistedBodyweight
  fatigueClass: Heavy(drop 2 reps/set) | Medium(1.5) | Light(1)
  repTargetMin/Max, smallestIncrement
  muscleMappings[]: (MuscleGroup, coefficient)  — MECE mapping
  benchmarkLow/High?: Double  — optional benchmark bands

MuscleParent (12 groups) aggregates via max(leaf coefficients) — no double-counting
Calendar week (Monday to today) for guidance AND history display
```

---

## Algorithms (essential rules)

### ProgressionEngine.suggest()
1. Extract anchors from last 5 sessions → derive `targetLoad` (best weight where reps ≥ repMin)
2. Set 1 = anchor load; promote if: Heavy needs 2/3 last sessions ≥ repMax, others 1/2
3. Set N = predict `last_reps − fatigueClass.baseRepDrop`; if < repMin → backoff (−1 increment, mid-range reps)
4. **Critical rule**: always predict from the set logged TODAY, never replay last session
5. Plateau (3+ sessions same load/reps) → offer overreach at +1 increment, 5 reps
6. Score candidates (recordAttempt+35, transitionMode+30, fallbackHypertrophy+22, plateauBreak+18)

### EffectiveSetsEngine
- Leaf sets = completedWorkSets × coefficient
- Parent aggregation = max(leaf coefficients for same parent) × completedSets — prevents double-count
- Coverage badges: ≥100% COVERED · ≥70% ON_TRACK · ≥40% TO_STRENGTHEN · <40% PRIORITY

### RecordsEngine (4 types, priority order)
1. heaviestWeight — beats absolute max (no rep gate)
2. estimated1RM — Epley formula, 2% margin to avoid flapping
3. repsAtWeight — more reps at exact same weight (requires reps ≥ repMin)
4. bodyweightReps — most reps at weight=0

### Beast Mode
- Weight bias: +1 increment, −1 rep on set 2+
- Optional session extension (sleep ≥ 7h + creatine/protein met)
- Orange theme during session, auto-reset on finish

### Monk Mode
- Seed from usual-workout base + append exercises for top deficit muscles
- After each set, reorder: deprioritize muscles worked in last 2 exercises
- Green peaceful theme, auto-reset

---

## Superset System
- First-class `SupersetGroup` entity (orderIndex + memberOrder[UUID]) — prevents old "smear" bug with isLinkedToNext
- Manual linking: swipe action → arm → arm second → group created
- Auto-detection: pattern A→B→(C→)A→B on last 24 sets, gaps < 240s, ≥2 full rounds
- Rest timer: skip between members, `supersetRestSeconds` after last member of round

---

## What is DONE ✅ (verified in code, 2026-04-26)
- Full session lifecycle (start / live timer / finish / discard / undo)
- Multi-mode exercises (straight, ramping, topSet+backoff, BW, weightedBW, assistedBW)
- Superset system (manual + auto-detect, round tracking, rest-aware)
- Live Activity: 7 intents (Validate, Skip, Next, +Kg, -Kg, +Rep, -Rep) — `WorkoutLiveActivityIntents.swift`
- Records (4 types, caching, set-level star badges, achievement overlay)
- Effective sets + calendar-week muscle coverage (priority chips during workout)
- Beast Mode: weight bias +1 increment on set 2+, conditional session extension — `WorkoutViewModel.swift:1165-1321`
- Monk Mode: deficit-aware seeding, fatigue-aware reordering after each set — `WorkoutViewModel.swift:1228-1264`
- Exercise progress charts (weight + reps, drag-to-scrub interaction)
- Rep benchmark bands hardcoded for 3 exercises (Tractions SN 14→33, Crunch décliné 29→76, Relevé jambe chaise roumaine 18→46) — `ExerciseProgressView.swift:164-175`
- Global weekly chart: sets/week + creatine% + protein% + sleep score + correlation board — `ProgressTabView.swift:85-492`
- Post-workout full-screen summary sheet (hero stats + muscles + PRs) — `WorkoutTabView.swift:71-436`
- Recovery checkin UI in post-workout sheet (D-1/D-2 toggles + sleep slider, prefilled) — `WorkoutTabView.swift`
- History view (weekly groups, session detail)
- Data export/import (JSON), backup/restore

## What is PENDING ⚠️ (based on actual code gaps, 2026-04-26)
1. **Rolling window inconsistency** — chart uses 4 sessions (`ExerciseProgressView.swift:72`), ProgressionEngine state uses 5 (`ProgressionEngine.swift:508`), velocity uses 10. Needs alignment on what 4-session rule should apply where.
2. **Rep benchmark bands are hardcoded** — switch statement for 3 named exercises in `ExerciseProgressView.swift:164`. Not generalized to `Exercise.benchmarkLow/High` fields that exist on the model.
3. **Pinch-zoom on charts absent** — drag scrub exists, but no MagnificationGesture for range zoom.
4. **Exercise picker not deficit-aware** — `ExercisePickerView.swift` sorts by favourites/recency only; deficit ordering only used inside Monk Mode seed, not exposed in picker UI.
5. **No warmup auto-generation** — no automatic warmup set suggestions (e.g. 40%→60%→80% of targetLoad) before working sets.

---

## Key Decisions Log (WHY matters for future changes)

| Decision | Why | Date |
|----------|-----|------|
| SupersetGroup as first-class entity | Old `isLinkedToNext` bit on LoggedExercise caused "smear" bugs on reorder | 2026-04 |
| Records cache with explicit invalidation | Lazy rebuild was causing stale PRs to flash during same-session multi-set | 2026-04 |
| Effective sets use max(leaf coeff) for parent | Sum would double-count synergists (e.g. triceps counted for both chest and triceps) | 2026-04 |
| Rolling 7-day (not calendar week) for decisions | Calendar week resets Monday — creates artificial urgency; rolling is smoother | 2026-04 |
| REVERSED: calendar week for decisions | Rolling window always dragged the previous days' deficit, so a goal was never "reached", only less missed. Evan found it discouraging: he wants the week to be BUILT, resetting Monday | 2026-08 |
| Cardio volume on the calendar week, gap on the full history | The 150 min counter resets Monday like the muscle goals, but the days-since-last-cardio gap is measured across the whole history: the insulin-sensitivity benefit fades in days, it does not know about Mondays. Otherwise a Monday morning would erase Sunday's ride | 2026-09 |
| Record calibration: the first session of an exercise never yields a record | Evan: a machine he discovers has no score to beat yet, and its loads compare to nothing else. The whole first session is the baseline; if it has fewer than 3 sets, the baseline extends to 4 sets and a record is possible from the 5th. Enforced in `records.ts` (`isCalibrating`), so live toasts, history stars, bilan, achievements, the fire signal and the level-up animation all agree. Sessions are told apart by set timestamps (4 h gap), checked against prod: all 1098 sets sit within 4 h of their session start, sessions are 24 h+ apart | 2026-09 |
| Brand-suffixed machines stay distinct exercises, linked by equivalence | Evan names machines by brand ("Low Row Technogym") because loads are calibrated differently per brand: each machine keeps its own history and records. `lib/engines/equivalence.ts` links machines of the same movement (brand stripped + explicit groups, only machines that REPLACED each other, e.g. the September 2026 gym change). A conversion factor is measured at each machine switch on RECENT capacity (last sessions before vs first after, within 8 weeks), fatigue-corrected (e1RM on reps + reported RIR + the app's absolute fatigue penalty). The converted history feeds suggestions, the deload gap and the progress curve (hollow points); records, fire signal and variations never read it. The last machine used becomes the default at session start. No factor before the first session on a new machine: that session is the calibration | 2026-09 |
| An exercise without muscles is surfaced, never guessed | Exercises created in the gym under an unknown name had no muscles and nothing said so: 17 sets counted toward no goal in 3 days (Sept 2026). No profile is inferred from the name (a guess would skew coverage); instead `MissingMusclesNotice` stays on the exercise card (and the Progress card) until fixed, offering to COPY the profile of the most similar exercises in one tap (`lib/data/muscle-profile-donors.ts`: equivalent machine first, then name words weighted by rarity, then recency). Past sets count as soon as the profile exists, since coverage is derived from history | 2026-09 |
| Suggestions follow the reported RIR and the exercise's own rep range | Evan's screenshots (Sept 2026) showed suggestions always too low. RIR now counts both ways (RIR 2 = one more rep, RIR 0 = one fewer, target RIR 1); a set above the range at target RIR raises the load, sized from the e1RM it reveals, and the engine never drops the load while the same load still fits the range. The global 10-rep cap (April rule "viser 10 max") is ABROGATED: Evan set 8-12 ranges and goes past them when not yet at RIR 0-2. Pure bodyweight first sets follow demonstrated reps. `Exercise.maxLoad` (machine stack max, user input, column `max_load`) caps loads; at max, progression is by reps | 2026-09 |
| "Tentative de record" only when the proposed set would really be a record | The label came from the default scoring mode and appeared on sets that could not beat anything. The fire signal now runs the proposed set through `classify`, the exact function that awards the star (bodyweight included); otherwise the label is "Cible" | 2026-09 |
| "Dernière séance" = best set of the last real work session | It showed the LAST set of the previous session (the most fatigued: 85x8 for a session opened at 85x17) and skipped finisher-only sessions silently. Now the best set by demonstrated capacity, with its age when older than a week; the repeat chip uses the set of the same rank. Finisher-only sessions no longer occupy the suggestion history window either | 2026-09 |
| Deltoids split into three muscle groups (anterior, lateral, posterior) | Evan sets shoulder goals per head (lateral 16, posterior 10 sets/week; anterior tracked without a goal since every press hits it). Making each head a MuscleParent kept the whole goal machinery (coverage, priorities, suggestions, radar) unchanged instead of adding leaf-level goals everywhere. Old `deltoides` goal rows are filtered as unknown | 2026-09 |
| New machines are mapped by Barbis, never guessed from their name in Jeera | The September 2026 gym change (On Air to Fitness Park) brings dozens of new machines. When an exercise created in the gym reaches Neon (`upsertExercise` or `syncSession`), Jeera signals Barbis (`after()`, `BARBIS_JEERA_WEBHOOK_URL`); its cloud brain researches the machine (Opus on the subscription CLI, web search) and writes muscles, pattern and the equivalent old-gym machine through `POST /api/barbis/exercise-profile` (token `JEERA_BARBIS_TOKEN`), with a 30-min sweep as fallback. `profile_source` ranks provenance (legacy < known_profile < donor < barbis < user): nothing downgrades a profile and a hand-set one is never overwritten. The phone polls only while a recent exercise awaits (45 s) and adopts the result mid-session without interrupting it. Equivalence only on a high-confidence identification; low confidence writes nothing and leaves the notice to Evan | 2026-09 |
| Progrès = Semaine / Exercices / Corps, every number from one tested engine | Audit of 24/09/2026 found the old tabs wrong: "+50 % ce mois" on a machine idle for 19 weeks (window anchored on the last session, not today), "Plateau" on a maxed machine gaining reps, "Best il y a 4 sem" for a record from two days before, "Dos haut 0 % Couvert" for a goal-less group, a weekly average dragged down by the current week, radar and correlations duplicating or saying nothing. `lib/engines/progress-stats.ts` now computes them: capacity = best set of the session read fresh (e1RM on reps + reported RIR + the reps the session's fatigue cost, `fatigueRepsBefore`), trend = best of the last 3 sessions vs the 3 before (+1.5 % progress, -3 % decline), dormant after 28 days, a machine's first session is calibration, records = History's stars set for set (82 = 82 on prod). Gamified with the week score ring, a rhythm marker (sessions done / habitual), a streak of weeks at 3+ sessions, record stars per week, best week in gold, machines maxed | 2026-09 |
| Tailwind v4: CSS-variable classes are written `text-(--color-fg-muted)` | The `text-[--color-fg-muted]` form compiles to an EMPTY rule in Tailwind v4: all muted/faint text in the app was rendered full cream (flat hierarchy) until 24/09/2026, 355 occurrences fixed. Never write `[--var]` in a class; use `(--var)` or an inline style | 2026-09 |
| Post-session review: a machine's first session is calibration | Evan's gym change (On Air to Fitness Park): a new machine's suggestion is only a starting point, so its first session is neither above nor below it. It leaves the performance signal (`calibrating` in `bilan.ts`); a session made only of new machines is a "Séance d'étalonnage", never "Difficile" | 2026-09 |
| Session-share ticks on the weekly bars | In "Quoi faire maintenant", what remained at the START of the session is split by the sessions left this week (habit = median of the last 4 practiced weeks, including today); the bright tick is today's share, and each row shows today's done / share | 2026-09 |
| Session calories = hybrid estimate, computed on read, shown as a range | Evan wants the calories of each session (post-session and History), accounting for exercise, muscles, load, reps, RIR, duration and body weight. `lib/engines/calories.ts`: background 1.8 MET off-set + per-set MET driven by the muscle mass of the profile (+15 % compound bracing) + mechanical work of the load, × RIR (×1.3 at failure), + immediate recovery growing with proximity to failure (+100 % at RIR 0, +50 % far from it); cardio via watts/distance/Compendium. Body weight = last weigh-in at the session date. Recalibrated 26/09 on Evan's real sessions: 1 h of upper body ≈ 290–300 kcal, the 2 h 34 « Upper » of 25/09 (23 sets to failure) ≈ 615 (510–720), within the Compendium (3.5 to 6 MET). A watch (heart rate) showed 1 418 for the same session: heart-rate estimates overshoot strength training. Nothing stored: every past session benefits. Barbis reads `GET /api/barbis/session-calories` and must add `activeKcal`, not `kcal`, to a daily expenditure. Method: `web/CALORIES.md` | 2026-09 |
| No PR can erase data; data is copied twice | 26/09/2026: a Safari left on its 16/09 storage replayed August writes over production (identical by luck; the next ones would have reverted goals, weight, rep ranges). The database now guards itself whatever code is deployed: `updated_at` kept by trigger, every overwritten or deleted row kept 30 days in `row_history` (deferred trigger, identical rewrites leave nothing), TRUNCATE refused. A replayed write older than the server version becomes a `stale_write` dead letter instead of overwriting (`lib/db/stale-writes.ts`). Barbis copies every table hourly to Cloudflare R2 through a read-only Neon role. `data-safety.test.ts` fails any later migration that drops/deletes/updates without `-- destructive-ok:` (Evan's decision only). See `web/DATA_SAFETY.md` | 2026-09 |
| The week is won in tiers, counted in sets | 26/09/2026: goals sum to ~150 sets/week for ~70 done in 4 sessions, so the week score never exceeded 59 % and the app said "En retard" every session. Tiers (`WEEK_TIERS` in `progress-stats.ts`): bronze 40 %, argent 55 %, or 70 %, shown on the ring (color + notches), the title ("Semaine argent · Or à 70 % · encore N séries") and each weekly bar. Evan: "what counts is sets per week, not sessions" (he never does more than 4): the streak (`weekStreak`) counts consecutive weeks at bronze or better, the hero shows sets, not sessions. Beast/Monk stay hidden (Evan: useless) | 2026-09 |
| Strength levels scaled to body weight; one question for the stack max | The level standards are sourced at 80 kg and the engine only lit them at exactly 80 kg, so levels, the "passage de niveau" flame and the level-up overlay never fired for Evan (~73 kg). Load thresholds are now scaled by (bw/80)^2/3 within 60–100 kg (`loadScaleFor`, label "ajustée à X kg"). A level-up replaces the record overlay of the same set instead of stacking on it. `Exercise.maxLoad` has three states: null = never answered (the exercise card asks "Charge max ?" after the first loaded set, `MaxLoadPrompt`), 0 = "pas de max" (answer kept), > 0 = stack max; never asked for bodyweight patterns | 2026-09 |
| The in-session game reads the engine, never steers it | 26/09/2026 (lot 2): Evan rates the load/rep suggestion as good and it must stay untouched. `lib/engines/session-game.ts` only reads what was suggested (`suggestedWeight`/`suggestedReps` stored on each set) and what was done. Beaten suggestions use `setVersusSuggestion` (`bilan.ts`, same rule as the review); the combo survives a held set and breaks on a set below; only work/top/backoff sets of already-known exercises count (a new machine is calibration). Boss du jour = the exercise whose first suggested set the engine itself flags `readyForLevelUp` (first) or `readyForPR`, the most ambitious by e1RM gain; picked once before the first set and frozen in the store (a started session on a new device gets no boss rather than a different one); none after < 6 h of sleep or alcohol within 36 h. Defeated when a set of that exercise earns a record star. Ghost = best set of the same exercise in the session closest to 28 days back (21–35), shown only once today's first set exists; none for assisted exercises | 2026-09 |
| Session rank, milestones and hidden achievements are recomputed from the whole past | 26/09/2026 (lot 3a). `session-rank.ts` scores every finished session from its review, rebuilt with only the sessions before it: execution 55 (exercises above the engine's reference; a held load counts half, fully during a cut, declared or measured as a loss of at least 0.4 %/week over the previous 28 days of weigh-ins), records 25 (starred exercises, full at 3), volume 20 (effective sets vs the median of the previous 8). Under 60 % of the usual volume the rank caps at B. Thresholds S 85, A 70, B 55, calibrated on Evan's 66 ranked sessions (S ≈ 14 %). `career.ts` walks the history once (≈ 0.3 s, cached per store state) for ranks, milestones (sessions, sets, records, week streak, strength level from reliable standards only, since machine standards are indicative, weight loss) and hidden achievements (`career-secrets.ts`). NEVER describe the hidden achievements to Evan, anywhere (his rule). The Rear delt fly standard (dumbbell, per arm) is flagged machine: Evan does it on a machine up to 60 kg. Max 2 bosses per calendar week (`bossAvailable`). `game-master.test.ts` proves the suggestions are identical with or without the game | 2026-09 |
| Forearms and obliques tracked without a goal | Volume shown, no target: they work as secondaries, and a quota would push toward dedicated work he does not want | 2026-08 |
| Suggest from today's sets, not last session replay | Old behavior caused inflated set 2 suggestions after a good previous session | 2026-04 |
| Beast Mode = weight bias NOT extra reps | User explicitly: "harder on weight, not reps" | 2026-04 |
| Monk Mode starts from usual-workout base | User: "familiar feel, not random session" | 2026-04 |
| 2% margin on e1RM record | Without margin, trivial load changes (e.g. 80×9 vs 80×10) falsely triggered record overlay | 2026-04 |
| FatigueClass governs rep drop (H:2 M:1.5 L:1) | Empirical: heavy compound lifts drop faster than isolation; fixed values avoid over-engineering | 2026-04 |

---

## Handoff Protocol
**After each significant work session, update the HANDOFF section below.**
Format: `[date] [agent: Claude|Codex] — what was done / what's next / any gotchas`

---

## HANDOFF

### 2026-09-26 · Claude — Gamification, lot 3a (rang, parcours, jalons, secrets)

- Bilan : médaille S/A/B/C en tête (anneau rempli du score, éclats pour S et A), raison du rang, puis jalons et secrets débloqués par la séance. Calcul lancé 380 ms après l'ouverture de la feuille pour ne pas saccader l'animation.
- Historique : lettre du rang à droite de chaque séance, passé compris. Progrès, calque Semaine : cartes Jalons (six familles, palier suivant) et Secrets (seulement ceux trouvés).
- Promesses tenues au passage : deux boss au plus par semaine, test prouvant que les suggestions ne bougent pas.
- Statue (15 + 25) : candidat retenu, le Doryphore du SMK (KAS11, domaine public, GLB de 4,95 Mo) ; téléchargement à faire valider par Evan avant le prototype.
- Reste : quête hebdo (21), jokers (27), saisons (22), fiche de personnage (14), statue (15 + 25).

### 2026-09-26 · Claude — Gamification, lot 2 (le jeu de la séance)

- En-tête de séance en trois rangées : chrono, Focus, Terminer ; « N séries faites · X battues », combo ×N doré dès 2, badge de synchro ; rangée Boss (un tap ouvre l'exercice), « à battre » puis « vaincu » en doré.
- Fantôme sous les séries de chaque exercice (« Fantôme · 28 août : 18 kg × 10 ») avec l'écart en direct, vert quand Evan est devant.
- Validés par Evan après explication : 22 (quatre saisons réalistes : automne = fin de sèche vers 72 kg à charges tenues, +3 à 6 % ; hiver +8 à 10 % ; printemps = premier Avancé aux élévations latérales, ~23 kg de 1RM estimé ; été = « Un an », ~260 séances et 4 500 séries), 25 (statue grecque 3D qui tourne, fusionnée avec la carte du corps, prototype d'abord), 26 (maître du jeu = règles fixes, ne touche jamais la suggestion), 27 (jokers gagnés sur une semaine or, dépensés automatiquement sur une semaine sous bronze pour protéger la série ; Evan ne déclare rien).
- Reste (lot 3) : rang de fin de séance S/A/B/C (11), recalcul du passé (20), jalons (16), succès cachés (17, ne jamais les lui dévoiler), fiche de personnage (14), carte du corps en statue (15 + 25), quête hebdo (21), saisons (22), jokers (27).

### 2026-09-26 · Claude — Gamification, lot 1 (paliers, niveaux à son poids, charge max)

- Evan a validé dans l'ordre : 1 (semaine en paliers), 2 (niveaux de force à son poids), 3 (charge max demandée, sauf poids du corps), 5-8 et 11 (compteur, combo, fantôme discret, boss du jour, rang de fin de séance), 14-17 (fiche de personnage, carte du corps, jalons, succès cachés à ne jamais lui dévoiler), 20 (recalcul du passé), 21 (quête hebdo). Refusé : Beast/Monk, feu, sons, donjon, XP globale, déblocage de techniques, carnet de machines, campagne, prestige, nutrition, argent, guilde. En discussion : saisons, statue 3D, maître du jeu (ne doit JAMAIS toucher l'algorithme de suggestion), jokers.
- Règles d'Evan : tout se compte en séries par semaine (jamais plus de 4 séances) ; minimaliste, belles animations, écarts vérifiés.
- Vérification visuelle : `next dev` du worktree sur une branche Neon jetable (`.env.local`), captures iPhone par le protocole de débogage de Chrome (le panneau navigateur masqué fige les animations framer-motion ; Chrome sans interface impose 500 px de large).

### 2026-09-26 · Claude — Garde-fous de données (voir `web/DATA_SAFETY.md`)

- Incident : un Safari resté sur le stockage du 16/09 a rejoué 39 écritures d'août (contenu identique, vérifié ligne à ligne contre une branche Neon figée juste avant) ; 62 autres attendaient.
- Migration 0016 (appliquée AVANT le déploiement) : `updated_at` + trigger sur 7 tables, `row_history` + trigger différé sur 14 tables, TRUNCATE refusé. Garde-fou `stale_write` dans `lib/db/sync-actions.ts`, heure de décision `intentAt` dans l'outbox.
- Barbis : copie horaire de toutes les tables sur R2 (`src/jeera-backup.ts`, rôle Neon `barbis_backup` en lecture seule).
- `lib/db/__tests__/data-safety.test.ts` + CI `.github/workflows/web-checks.yml`. Ne jamais ajouter `-- destructive-ok:` sans l'accord d'Evan.

### 2026-09-25 · Claude — Menu d'exercice en séance refait

- Bouton ⋯ sur chaque carte (et appui long sur le nom) → `components/workout/ExerciseActionsSheet.tsx` : Remplacer / Dupliquer / Démo en un tap, réglages utiles à la prochaine série (réglage machine, reps min/max, plus petit saut, charge max, repos), « Tous les réglages » vers l'éditeur complet, « Retirer de la séance » (confirmation si des séries existent). L'appui long ouvrait avant le formulaire complet du catalogue.
- Réglages rapides fusionnés sur la version À JOUR du catalogue (`exercise-quick-settings.ts`) : un profil posé par Barbis pendant que la feuille est ouverte n'est plus écrasé.
- `replaceExercise` pousse un « Annuler » quand l'exercice remplacé portait des séries (elles étaient perdues sans filet).
- 26/09 (revue à l'écran avec Evan) : plus aucun bouton +/- dans l'app. Les valeurs se règlent en glissant le chiffre vers le haut ou le bas, ou d'un tap sur le chevron du dessus ou du dessous (`components/ui/Stepper.tsx`, `components/ui/SettingRow.tsx`). « Tous les réglages » (`ExerciseEditorSheet`) : un réglage par ligne (les 4 compteurs en `grid-cols-3` se chevauchaient et sortaient de l'écran), enregistrement des seuls champs modifiés sur la version à jour du catalogue (`exercise-edits.ts`), bouton Enregistrer toujours visible. Les feuilles sont opaques (`surface-solid`) : en verre, la séance transparaissait derrière les formulaires.

### 2026-09-17 · Claude — Synchro web réparée structurellement (voir `web/SYNC.md`)

- Incident : outbox bloquée depuis le 20/08 (séance → exercice absent de Neon, FK), un mois de données sur le téléphone seulement. Récupéré via export JSON (`web/scripts/recover-from-backup-2026-09-17.ts`) : +16 séances, +9 exercices, +29 check-ins, +1 pesée.
- Garanties : séance auto-suffisante (`syncSession` emporte ses exercices), résultat typé transitoire/permanent (`lib/sync/outcome.ts`, `lib/db/sync-actions.ts`), dead letters visibles + bannière globale + Réglages → Synchronisation (`lib/sync/outbox.ts`, `components/sync/SyncAlertBanner.tsx`, `components/settings/SettingsSyncSection.tsx`).
- Nouveaux profils musculaires (machines LifeFitness, Upper back, Calf Extension, Isolateral incline press) + `scripts/apply-known-muscle-profiles.ts` (pérenne).
- `POST /api/body-weight` (jeton `BODY_WEIGHT_INGEST_TOKEN`) : pesée depuis Barbis ou un Raccourci iOS (VitaFit → Santé).
- Déployé sur Vercel le 17/09 (`npx vercel --prod --yes` depuis `web/`).


### 2026-04-26 · Claude — Warmup auto-génération + éditeur mappings muscles

**Done (session 2):**
- **Warmup auto** : `WorkoutViewModel.suggestion()` propose maintenant un set d'échauffement (W) avant le premier set de travail pour les exercices `.straight` / `.topSetBackoff` avec un poids cible ≥ 40kg. Poids = 60% du set de travail arrondi à l'incrément (min 20kg), reps = 10. Condition : aucun warmup complété ET aucun work set complété. L'ExerciseCard affiche un badge "W" jaune dans le chip suggestion.
- **Muscle mappings éditeur** : `ExerciseDetailView` — chaque mapping a un Picker (MuscleGroup) + Stepper (coefficient 0.1–1.0) + swipe-to-delete. "Ajouter un muscle" choisit automatiquement le premier groupe non encore mappé.

**Done (session 1, 2026-04-26) :**
- Audit complet de tous les fichiers Swift (A–Z, rien sauté)
- **ProgressionEngine** : implémenté la logique de promotion manquante (dead code `currentSetIndex` ignoré — `doneToday.isEmpty` est le vrai signal). `checkPromotionGate` + `firstWorkSetReps` ajoutés. DerivedExerciseState enrichi avec `promotionGatePassed` + `anchorFirstSetReps`. Bodyweight-at-max génère un message "lester". Tous les tests ProgressionEngine passent maintenant.
- **Benchmark chart** : `ExerciseProgressView.repBenchmarkRange` utilise maintenant `exercise.benchmarkLow/High` au lieu du switch hardcodé par nom.
- **WeeklyPrioritySection** : utilise `rollingPriorities` (filtre remaining ≥ 0.5) au lieu de `rolling7DayProgress` → plus de muscles à 0 parasites. Ajout header "Objectifs 7 jours" + message "Tous couverts ✓" quand vide.
- **Goals** : éditables via stepper dans SettingsView. `syncCanonicalGoals` n'écrase plus les valeurs existantes (insert-only).
- **Body weight** : `BodyWeightRow` ajouté dans SettingsView (AppStorage "user_body_weight_kg").
- **FatigueClass** : Picker éditable dans ExerciseDetailView.
- **Strings FR** : "Save & close", "Undo", "Last session:", 4× messages d'erreur anglais, "Unknown" → français.
- **Sleep doublon** : supprimé l'affichage redondant dans `dayCard()`.

**Current branch:** `codex/refactor-algorithm-for-weight-and-set-suggestions-3rj1rt`
**Base branch:** `claude/gym-workout-logger-app-RvaJP`

**Gotchas for next agent:**
- `WorkoutViewModel` est ~1660 lignes — chercher la méthode spécifique, ne pas lire tout le fichier
- Tests ProgressionEngine passent mais nécessitent une équipe de dev pour signer — vérifier via Xcode directement
- `currentSetIndex` dans `ProgressionEngine.suggest()` est toujours **dead code** — utilisé par le VM mais ignoré dans l'engine (le branchement se fait sur `doneToday.isEmpty`). Ne pas l'utiliser pour la logique.
- Live Activity: les attribute types sont dans `JeeraShared/`, le rendering dans `JeeraWidgets/` — tout changement de shape nécessite les deux targets
- Global progress tab : Evan a dit "c'est le pire onglet" — redesign demandé mais non traité
- Long press bug dans ActiveWorkoutView : "reste appuyé, ça bug un petit peu" — non investigué
