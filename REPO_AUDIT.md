# Jeera Audit + Execution Plan (updated with your latest directives) — April 22, 2026

This plan is now strictly aligned with your exact requests.
No generic product fluff. No algorithm replacement.

---

## 0) Non-negotiables (kept)

1. Your progression algorithm remains the core brain.
2. Workout-time UX must minimize interaction cost.
3. Charts must be interactive, modern, beautiful.
4. Summary screen becomes richer but very fast to fill.

---

## 1) Progress curve behavior (detailed implementation plan)

## Target rule (updated)
Use this metric for weighted progression curve:
- **best-ever performance for 7+ reps in the last 4 sessions for that exercise**.

Interpretation:
- each x-point = one session where exercise was performed,
- y-point = `max(bestWeightAt7Plus among last 4 exposure sessions)`,
- expected behavior = mostly flat/up with rare down steps when a very old high point leaves the 4-session window.

## Why this is better for your use case
- removes noisy “false regression” dips,
- still shows real loss if performance declines over multiple exposures,
- remains faithful to your 7+ reps benchmark logic.

## Concrete implementation steps
1. Replace rolling window size from 3 -> 4 for weighted curves.
2. Keep session ordering by actual exercise exposures only.
3. Apply same 4-session smoothing to trend badge so badge matches curve semantics.
4. Add user-facing tooltip in chart legend:
   - “Courbe = meilleur perf 7+ reps sur les 4 dernières séances de cet exo”.

## Acceptance criteria
- curve can be flat/up often,
- rare decreases only when justified by rolling-window aging,
- trend badge never contradicts plotted line.

---

## 2) Rep benchmarks to embed (specific exercises)

Add/confirm benchmark bands for rep-performance charts:
- **Tractions SN:** 14 → 33 reps
- **Crunch décliné:** 29 → 76 reps
- **Relevé jambe chaise roumaine:** 18 → 46 reps

## Implementation notes
- keep current weight benchmark graph,
- add dedicated rep benchmark overlay (low/high band) on rep graph,
- show the rep benchmark as a green zone **inside the rep graph itself**
  (same principle as weight benchmark zone):
  - zone start = benchmark low rep,
  - zone end = benchmark high rep.

## Acceptance criteria
- both weight and rep graph visible for these exercises,
- benchmark band visually distinct but subtle,
- no clutter at small sizes,
- benchmark readability should come from in-graph green zone (not title chips).

---

## 3) Widget actions (2 principal actions only)

## Required actions
1. **Validate current set**
2. **Go to next exercise** (must account for supersets)

## Action 1 details (validate current set)
Within the widget interaction flow, user must be able to:
- + / - weight,
- + / - reps,
- then validate.

(Your message said “add/reduce sets”; interpreted as quick +/− adjustment on logged values before validation.)

## Superset-aware action 2 behavior
If current exercise is in superset:
- “Next exercise” jumps to paired exercise,
- after final exercise in round, jump to next round context,
- rest timer logic triggered only at end-of-round rule you already use.

## Concrete implementation steps
1. Add compact widget controls for value nudges and validate.
2. Introduce deterministic `nextExerciseInSessionContext()` resolver:
   - standard sequence,
   - superset pair/round aware,
   - safe fallback if state mismatch.
3. Keep widget to 2 core CTAs to avoid overload.
4. Prioritize swipe interactions over taps when both are possible (less painful interaction rule).

## Acceptance criteria
- no deep navigation required from widget for normal flow,
- supersets do not break order,
- one-handed quick logging possible.

---

## 4) Beast Mode (redefined per your request)

## Core rule
Beast Mode should make sessions harder on **weight**, not reps.

## Intended behavior
- push attempts to beat all-time PRs, especially around second working set exposure,
- exercise list should be based on the same usual workouts as normal mode,
- optional exercise-count increase can be applied as extension on that same usual-workout base.

## Suggested algorithm overlay (on top of your existing algo)
When Beast Mode is ON:
1. On set 2 candidate logic, bias suggestion toward PR-chasing load step.
2. Keep rep targets normal; do not force higher rep prescription.
3. Add optional session extension block (1–2 extra exercises) only if recovery/readiness flags are acceptable.

## UX/theming
- temporary “brutal” theme for active Beast Mode workout only,
- auto-revert at workout end,
- clear toggle at workout start.

## Acceptance criteria
- Beast Mode feels weight-aggressive, not rep-aggressive,
- no permanent style pollution outside Beast session,
- easy opt-in/opt-out,
- exercise selection stays familiar because it starts from usual-workout structure.

---

## 4B) Monk Mode (new mode)

## Core principle
Peaceful workout mode that builds the exercise list from remaining weekly muscle needs.

## Session generation rule
1. Compute remaining sets per muscle group over last 7 days.
2. Start from your normal workout structure/habits.
3. Add extra exercises where deficits are highest.
4. Order logic is hybrid:
   - partly habit-based (usual sequence feel),
   - partly fatigue-aware from recent in-session work.

## Fatigue-aware ordering rule
- look at muscles worked in the last 2 performed exercises,
- deprioritize those muscles for the next selection to reduce local fatigue collisions.

## UX/theming
- peaceful Monk theme during workout only,
- auto-return to default theme after finishing workout.

## Acceptance criteria
- session feels familiar, not random,
- helps close 7-day muscle deficits,
- avoids chaining same-fatigue muscles too aggressively.

---

## 5) Workout summary screen (new center of post-workout flow)

You asked this to be beautiful + extremely easy to fill.

## Required UX characteristics
- premium visual finish screen,
- pre-filled fields,
- minimal gestures (short sliders/toggles only),
- completion under ~15 seconds.

## Fields to log (prefilled)
- Creatine D-1 (toggle, default = last known value)
- Creatine D-2 (toggle, default = inferred/last pattern)
- Protein target met D-1 (toggle)
- Protein target met D-2 (toggle)
- Sleep hours D-1 (slider with last value prefilled)
- Sleep hours D-2 (slider with last value prefilled)

## Concrete UI structure
1. Hero stats row (duration, sets, PR count, estimated progression signal).
2. Recovery/supplement card with two horizontal mini-rows:
   - D-1 row, D-2 row.
3. “Save & close” sticky button.
4. Optional skip with smart defaults.

## Acceptance criteria
- can submit with almost no typing,
- defaults make completion near-instant,
- visual style matches premium “bilan” expectation.

---

## 6) Global graph for performance + adherence (weekly axis)

## Required chart
A global interactive graph with:
- **x-axis unit = 1 week**,
- overlays for performance and adherence context.

## Proposed series (weekly aggregated)
1. Performance index (from your existing progression/records outputs).
2. Creatine adherence score (% over week).
3. Protein adherence score (% over week).
4. Sleep quality proxy (avg hours + consistency penalty).

## Interactivity requirements
- pinch/zoom,
- drag scrub with weekly tooltip,
- toggle series on/off,
- highlight correlation windows.

## Visual requirements
- modern styling,
- smooth transitions,
- clear hierarchy (primary performance line, secondary adherence lines).

## Acceptance criteria
- instantly readable at a glance,
- deeper inspection available via interactions,
- no chart clutter overload.

---

## 7) Widget + summary + charts delivery roadmap

### Phase 1 (fast wins)
1. Curve rule update to 4-session best-ever(7+).
2. Exercise rep benchmark bands for 3 named exercises.
3. Summary screen v1 with prefilled recovery/supplement sliders/toggles.

### Phase 2 (workflow acceleration)
1. Widget 2-action flow with superset-aware next action.
2. Quick +/− adjustments in widget validate action.
3. Swipe-first interaction pass (minimize click/tap count).
4. PR animation upgrade.

### Phase 3 (analysis layer)
1. Weekly global perf+adherence graph.
2. Interactive correlation overlays.
3. Visual polish pass across all charts (modern + beautiful mandate).
4. Monk Mode generator + peaceful workout theme.

---

## 8) Final priority order (from your current feedback)

1. Progress curve semantics (4-session window) + dual metric exercise graphs.
2. Beautiful + frictionless workout summary with prefilled recovery/supplement logging.
3. Widget 2-action superset-aware flow.
4. Beast Mode weight-focused overlay on usual-workout base.
5. Monk Mode adaptive peaceful session mode.
6. Global weekly interactive perf/adherence graph.
