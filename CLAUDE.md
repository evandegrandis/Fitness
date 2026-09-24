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
| Session-share ticks on the weekly bars | In "Quoi faire maintenant", what remained at the START of the session is split by the sessions left this week (habit = median of the last 4 practiced weeks, including today); the bright tick is today's share, and each row shows today's done / share | 2026-09 |
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
