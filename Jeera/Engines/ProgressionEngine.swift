import Foundation

enum SuggestionMode: String {
    case recordAttempt = "record_attempt"
    case fallbackHypertrophy = "fallback_hypertrophy"
    case plateauBreak = "plateau_break"
    case transitionMode = "transition_mode"
}

struct SetSuggestion {
    let weight: Double
    let reps: Int
    let setType: SetType
    let explanation: String
    let confidence: Double
    let reasonCodes: [String]
    let mode: SuggestionMode
    /// Non-nil when session-wide fatigue was detected before this exercise.
    /// Used by ExerciseCard to show a contextual fatigue note.
    let sessionFatigueWarning: String?

    init(
        weight: Double,
        reps: Int,
        setType: SetType,
        explanation: String,
        confidence: Double = 0.8,
        reasonCodes: [String] = [],
        mode: SuggestionMode = .recordAttempt,
        sessionFatigueWarning: String? = nil
    ) {
        self.weight = weight
        self.reps = reps
        self.setType = setType
        self.explanation = explanation
        self.confidence = confidence
        self.reasonCodes = reasonCodes
        self.mode = mode
        self.sessionFatigueWarning = sessionFatigueWarning
    }
}

/// Progression engine implementing the double-progression algorithm spec:
///   - First working set: anchor load + promotion gate (strict for H, normal for M/L).
///   - Subsequent sets: predicted from the set JUST DONE today, not replayed
///     verbatim from last session. predicted = prev.reps − base_drop − set_penalty.
///     If predicted >= rep_min we keep the load; otherwise we back off one increment
///     and aim for the upper-mid band. This is the core fix for the "BW→+15x8 last
///     time, today set1 is +15x8, app still says +15x8 for set 2" bug.
///   - Load modes (external / bodyweight+external / assistance) are inferred from
///     SetPatternMode so the display direction and promotion direction are right.
struct ProgressionEngine {

    private enum SetRoleDerived {
        case anchorSet
        case primerPerformanceSet
        case rampWorkSet
        case backoffHypertrophySet
        case overreachSet
        case unknown
    }

    private struct Candidate {
        let load: Double
        let reps: Int
        let mode: SuggestionMode
        let reasonCodes: [String]
    }

    private struct DerivedExerciseState {
        let targetLoad: Double
        let bestRepAtTarget: Int
        let plateauCounter: Int
        let progressVelocity: Double
        let promotionGatePassed: Bool
        /// Reps achieved on the anchor set (at targetLoad) in the most recent valid session.
        /// Uses the classified anchor, not the first set — so primers don't contaminate this.
        let recentBestAnchorReps: Int
        /// Minimum valid anchor weight across recent sessions.
        /// Anchor-level candidates (recordAttempt, transitionMode) must not go below this.
        let recentWorkingFloor: Double
        /// Minimum weight of legitimate fallback/backoff sets in recent sessions.
        /// Separate from recentWorkingFloor so fallback candidates have their own, lower floor.
        let recentFallbackFloor: Double
    }

    // MARK: - Main Entry Point

    static func suggest(
        for exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        recentHistory: [[LoggedSet]] = [],
        currentSessionSets: [LoggedSet] = [],
        smallestIncrement: Double? = nil,
        sessionFatigue: SessionFatigueContext = .empty
    ) -> SetSuggestion {
        let increment = smallestIncrement ?? exercise.smallestIncrement

        // Separate primers/warmups from actual work sets.
        // doneToday only contains sets the engine should reason about for load/rep prediction.
        // hasPrimerToday tells branches that a primer was already performed this session.
        let hasPrimerToday = currentSessionSets.contains { set in
            set.completed && (
                set.setType == .warmup ||
                (set.weight == 0 && exercise.setPatternMode == .weightedBodyweight)
            )
        }
        let doneToday = currentSessionSets.filter { set in
            set.completed &&
            set.setType != .warmup &&
            !(set.weight == 0 && exercise.setPatternMode == .weightedBodyweight)
        }

        let history = ([previousSets] + recentHistory).filter { !$0.isEmpty }
        let derived = deriveState(exercise: exercise, history: history, increment: increment)
        // Fatigue confirmed if: intra-exercise drop detected OR session context is significant
        let fatigueConfirmed = autoFatigueFlag(exercise: exercise, currentSessionSets: doneToday)
            || sessionFatigue.isSignificant(for: exercise.primaryParent)

        if exercise.setPatternMode == .weightedBodyweight {
            let bwSetsToday = currentSessionSets.filter {
                $0.completed && $0.setType != .warmup && $0.weight == 0
            }
            return suggestWeightedBodyweight(
                exercise: exercise,
                doneToday: doneToday,
                derived: derived,
                fatigueConfirmed: fatigueConfirmed,
                hasPrimerToday: hasPrimerToday,
                bwSetsToday: bwSetsToday
            )
        }

        if exercise.setPatternMode == .topSetBackoff {
            return suggestTopSetBackoff(
                exercise: exercise,
                doneToday: doneToday,
                derived: derived,
                increment: increment,
                fatigueConfirmed: fatigueConfirmed
            )
        }

        if exercise.setPatternMode == .ramping {
            return suggestRamping(
                exercise: exercise,
                doneToday: doneToday,
                derived: derived,
                increment: increment,
                fatigueConfirmed: fatigueConfirmed
            )
        }

        var result = suggestGeneric(
            exercise: exercise,
            doneToday: doneToday,
            derived: derived,
            increment: increment,
            fatigueConfirmed: fatigueConfirmed
        )

        // Attach session fatigue warning if relevant (does not change the suggestion itself)
        if let note = sessionFatigue.fatigueNote(for: exercise.primaryParent) {
            result = SetSuggestion(
                weight: result.weight,
                reps: result.reps,
                setType: result.setType,
                explanation: result.explanation,
                confidence: result.confidence,
                reasonCodes: result.reasonCodes,
                mode: result.mode,
                sessionFatigueWarning: note
            )
        }

        return result
    }

    private static func suggestWeightedBodyweight(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        fatigueConfirmed: Bool,
        hasPrimerToday: Bool,
        bwSetsToday: [LoggedSet] = []
    ) -> SetSuggestion {
        // BW-only mode: targetLoad==0 means no weighted history exists.
        // Treat every BW set as a working set with proper rep progression,
        // ignoring the primer/weighted-set split entirely.
        if derived.targetLoad == 0 {
            if bwSetsToday.isEmpty {
                let base = fatigueConfirmed ? derived.recentBestAnchorReps : derived.recentBestAnchorReps + 1
                let cap = max(exercise.repTargetMax, derived.recentBestAnchorReps)
                let suggestedReps = clamp(base, min: exercise.repTargetMin, max: cap)
                let mode: SuggestionMode = fatigueConfirmed ? .fallbackHypertrophy : .recordAttempt
                return render(Candidate(load: 0, reps: suggestedReps, mode: mode, reasonCodes: ["bw_only_wbw_first_set"]), confidence: 0.9)
            } else if let lastBW = bwSetsToday.last {
                let drop = min(exercise.fatigueClass.baseRepDrop, 2.0)
                let predicted = Int((Double(lastBW.reps) - drop).rounded())
                let cap = max(exercise.repTargetMax, lastBW.reps)
                let bwReps = clamp(predicted, min: max(1, exercise.repTargetMin), max: cap)
                return render(Candidate(load: 0, reps: bwReps, mode: .recordAttempt, reasonCodes: ["bw_only_wbw_predicted_drop"]), confidence: 0.85)
            }
        }

        if doneToday.isEmpty {
            if hasPrimerToday {
                // Primer done — now suggest the first working set
                if derived.plateauCounter >= 3 && !fatigueConfirmed {
                    let plateau = Candidate(load: derived.targetLoad + 5, reps: 5, mode: .plateauBreak, reasonCodes: ["plateau_break_overreach_jump"])
                    return render(plateau, confidence: 0.82)
                }
                let target = Candidate(load: derived.targetLoad, reps: exercise.repTargetMin, mode: .recordAttempt, reasonCodes: ["post_primer_main_target"])
                return render(target, confidence: fatigueConfirmed ? 0.7 : 0.92)
            } else {
                // No primer yet — suggest the BW primer set
                let primer = Candidate(load: 0, reps: 10, mode: .recordAttempt, reasonCodes: ["primer_before_weighted_attempt"])
                return render(primer, confidence: 0.95)
            }
        }

        if doneToday.count == 1 {
            if let first = doneToday.first, first.weight > 0 {
                let drop = exercise.fatigueClass.baseRepDrop
                let predictedReps = Int((Double(first.reps) - drop).rounded())
                let holdReps = clamp(predictedReps, min: max(4, exercise.repTargetMin - 1), max: exercise.repTargetMax)

                if first.reps >= exercise.repTargetMin {
                    let sameLoad = Candidate(
                        load: first.weight,
                        reps: holdReps,
                        mode: .recordAttempt,
                        reasonCodes: ["adapt_from_first_weighted_set"]
                    )
                    return render(sameLoad, confidence: fatigueConfirmed ? 0.74 : 0.9)
                }

                let lighter = Candidate(
                    load: max(0, first.weight - max(1.25, exercise.smallestIncrement)),
                    reps: max(exercise.repTargetMin, holdReps + 1),
                    mode: .fallbackHypertrophy,
                    reasonCodes: ["first_weighted_set_under_target", "lighter_followup"]
                )
                return render(lighter, confidence: 0.84)
            }

            if derived.plateauCounter >= 3 && !fatigueConfirmed {
                let plateau = Candidate(load: derived.targetLoad + 5, reps: 5, mode: .plateauBreak, reasonCodes: ["plateau_break_overreach_jump"])
                return render(plateau, confidence: 0.82)
            }
            let target = Candidate(load: derived.targetLoad, reps: exercise.repTargetMin, mode: .recordAttempt, reasonCodes: ["main_target_attempt"])
            return render(target, confidence: fatigueConfirmed ? 0.7 : 0.92)
        }

        let last = doneToday.last
        if let last, last.reps <= max(1, exercise.repTargetMin - 2) {
            return render(
                Candidate(load: 0, reps: 10, mode: .fallbackHypertrophy, reasonCodes: ["hard_fail_threshold_reached", "fallback_to_bodyweight"]),
                confidence: 0.9
            )
        }

        if let last, last.weight > 0 {
            let drop = exercise.fatigueClass.baseRepDrop
            let predictedReps = Int((Double(last.reps) - drop).rounded())
            let holdReps = clamp(predictedReps, min: max(4, exercise.repTargetMin - 2), max: exercise.repTargetMax)
            return render(
                Candidate(load: last.weight, reps: holdReps, mode: .fallbackHypertrophy, reasonCodes: ["weighted_followup_from_last_set"]),
                confidence: 0.82
            )
        }

        return render(
            Candidate(load: max(0, derived.targetLoad - 5), reps: exercise.repTargetMin, mode: .fallbackHypertrophy, reasonCodes: ["intermediate_fallback"]),
            confidence: 0.86
        )
    }

    private static func suggestTopSetBackoff(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        increment: Double,
        fatigueConfirmed: Bool
    ) -> SetSuggestion {
        if doneToday.isEmpty {
            let topSet = Candidate(
                load: derived.targetLoad,
                reps: exercise.repTargetMin,
                mode: .recordAttempt,
                reasonCodes: ["top_set_anchor"]
            )
            return render(topSet, confidence: fatigueConfirmed ? 0.72 : 0.92, setTypeOverride: .topSet)
        }

        guard let last = doneToday.last else {
            return render(
                Candidate(load: derived.targetLoad, reps: exercise.repTargetMin, mode: .recordAttempt, reasonCodes: ["top_set_fallback"]),
                confidence: 0.7,
                setTypeOverride: .topSet
            )
        }

        let isFirstFollowup = doneToday.count == 1
        let dropSteps = last.reps <= max(1, exercise.repTargetMin - 2) ? 2.0 : 1.0
        let baseBackoffLoad = max(0, last.weight - increment * dropSteps)
        let baseBackoffReps = clamp(
            max(last.reps + 1, Int((Double(exercise.repTargetMin + exercise.repTargetMax) / 2.0).rounded(.up))),
            min: exercise.repTargetMin,
            max: exercise.repTargetMax
        )

        if isFirstFollowup {
            let firstBackoff = Candidate(
                load: baseBackoffLoad,
                reps: baseBackoffReps,
                mode: .fallbackHypertrophy,
                reasonCodes: ["top_set_to_backoff_transition"]
            )
            return render(firstBackoff, confidence: 0.9, setTypeOverride: .backoff)
        }

        let baseDrop = exercise.fatigueClass.baseRepDrop
        let predictedReps = clamp(
            Int((Double(last.reps) - max(1.0, baseDrop - 0.5)).rounded()),
            min: exercise.repTargetMin,
            max: exercise.repTargetMax
        )

        let keepBackoff = Candidate(
            load: last.weight,
            reps: predictedReps,
            mode: .fallbackHypertrophy,
            reasonCodes: ["backoff_same_load_prediction"]
        )

        if last.reps >= exercise.repTargetMax + 2 {
            let heavierBackoff = Candidate(
                load: stepLoad(last.weight, by: increment, for: exercise.setPatternMode, towardHarder: true),
                reps: clamp(predictedReps - 1, min: exercise.repTargetMin, max: exercise.repTargetMax),
                mode: .transitionMode,
                reasonCodes: ["backoff_overshot_raise_load"]
            )
            return render(heavierBackoff, confidence: 0.84, setTypeOverride: .backoff)
        }

        if last.reps <= max(1, exercise.repTargetMin - 2) {
            let lighterBackoff = Candidate(
                load: stepLoad(last.weight, by: increment, for: exercise.setPatternMode, towardHarder: false),
                reps: clamp(last.reps + 2, min: exercise.repTargetMin, max: exercise.repTargetMax),
                mode: .fallbackHypertrophy,
                reasonCodes: ["backoff_under_target_drop_load"]
            )
            return render(lighterBackoff, confidence: 0.88, setTypeOverride: .backoff)
        }

        return render(keepBackoff, confidence: 0.82, setTypeOverride: .backoff)
    }

    private static func suggestRamping(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        increment: Double,
        fatigueConfirmed: Bool
    ) -> SetSuggestion {
        let targetLoad = derived.targetLoad
        let firstRampLoad = rampStartLoad(targetLoad: targetLoad, increment: increment, for: exercise)

        if doneToday.isEmpty {
            let opener = Candidate(
                load: firstRampLoad,
                reps: exercise.repTargetMax,
                mode: .recordAttempt,
                reasonCodes: ["ramp_opener"]
            )
            return render(opener, confidence: fatigueConfirmed ? 0.74 : 0.9)
        }

        guard let last = doneToday.last else {
            return render(
                Candidate(load: firstRampLoad, reps: exercise.repTargetMax, mode: .recordAttempt, reasonCodes: ["ramp_fallback"]),
                confidence: 0.65
            )
        }

        let currentEffort = effectiveLoad(last.weight, for: exercise.setPatternMode)
        let targetEffort = effectiveLoad(targetLoad, for: exercise.setPatternMode)
        let belowTarget = currentEffort + 0.01 < targetEffort

        if belowTarget {
            let nextRampLoad = minHarderStepTowardTarget(
                from: last.weight,
                target: targetLoad,
                increment: increment,
                mode: exercise.setPatternMode
            )

            if last.reps >= exercise.repTargetMax {
                let rampUp = Candidate(
                    load: nextRampLoad,
                    reps: max(exercise.repTargetMin, exercise.repTargetMax - 1),
                    mode: .transitionMode,
                    reasonCodes: ["ramp_up_after_easy_set"]
                )
                return render(rampUp, confidence: 0.88)
            }

            if last.reps >= exercise.repTargetMin + 1 {
                let gentleRamp = Candidate(
                    load: nextRampLoad,
                    reps: clamp(last.reps - 1, min: exercise.repTargetMin, max: exercise.repTargetMax),
                    mode: .transitionMode,
                    reasonCodes: ["ramp_up_after_solid_set"]
                )
                return render(gentleRamp, confidence: 0.83)
            }

            let holdRamp = Candidate(
                load: last.weight,
                reps: clamp(last.reps, min: exercise.repTargetMin, max: exercise.repTargetMax),
                mode: .fallbackHypertrophy,
                reasonCodes: ["hold_ramp_until_target_ready"]
            )
            return render(holdRamp, confidence: 0.78)
        }

        return suggestGeneric(
            exercise: exercise,
            doneToday: doneToday,
            derived: derived,
            increment: increment,
            fatigueConfirmed: fatigueConfirmed
        )
    }

    private static func suggestGeneric(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        increment: Double,
        fatigueConfirmed: Bool
    ) -> SetSuggestion {
        // Bodyweight at repMax: suggest the user considers adding weight
        if exercise.setPatternMode == .bodyweight, doneToday.isEmpty,
           derived.recentBestAnchorReps >= exercise.repTargetMax {
            return SetSuggestion(
                weight: 0,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Maximum atteint — pensez à vous lester.",
                confidence: 0.95,
                reasonCodes: ["bw_at_max_suggest_weight"],
                mode: .transitionMode
            )
        }

        let candidates = buildCandidates(
            exercise: exercise,
            doneToday: doneToday,
            derived: derived,
            increment: increment,
            fatigueConfirmed: fatigueConfirmed
        )

        guard let best = candidates.max(by: {
            scoreCandidate($0, exercise: exercise, doneToday: doneToday, derived: derived, fatigueConfirmed: fatigueConfirmed)
            < scoreCandidate($1, exercise: exercise, doneToday: doneToday, derived: derived, fatigueConfirmed: fatigueConfirmed)
        }) else {
            return SetSuggestion(weight: 20, reps: exercise.repTargetMin, setType: .work, explanation: "Fallback.", confidence: 0.4, reasonCodes: ["fallback"], mode: .fallbackHypertrophy)
        }

        let confidence = min(0.98, max(0.5, Double(candidates.count) / 5.0 + (fatigueConfirmed ? -0.1 : 0.15)))
        return render(best, confidence: confidence)
    }

    private static func buildCandidates(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        increment: Double,
        fatigueConfirmed: Bool = false
    ) -> [Candidate] {
        if doneToday.isEmpty {
            if exercise.setPatternMode == .bodyweight {
                // Fatigue: hold at recent best instead of pushing for +1 rep
                let base = fatigueConfirmed ? derived.recentBestAnchorReps : derived.recentBestAnchorReps + 1
                // Use observed anchor as upper bound, not configured max — if user consistently
                // does 10 reps but repTargetMax=5, we must not cap the suggestion at 5.
                let bwCap = max(exercise.repTargetMax, derived.recentBestAnchorReps)
                let suggestedReps = clamp(base, min: exercise.repTargetMin, max: bwCap)
                let mode: SuggestionMode = fatigueConfirmed ? .fallbackHypertrophy : .recordAttempt
                return [Candidate(load: 0, reps: suggestedReps, mode: mode, reasonCodes: ["bw_anchor_reps_plus_one"])]
            }
            // No promotion on a fatigued day — don't chase a new load when the body is already taxed
            if derived.promotionGatePassed && !fatigueConfirmed {
                let promotedReps = min(exercise.repTargetMax, exercise.repTargetMin + 2)
                return [Candidate(
                    load: stepLoad(derived.targetLoad, by: increment, for: exercise.setPatternMode, towardHarder: true),
                    reps: promotedReps,
                    mode: .transitionMode,
                    reasonCodes: ["promotion_gate_passed"]
                )]
            }
            // Fatigue: slightly lower rep target and load (stay at floor, not peak)
            let base = fatigueConfirmed
                ? max(exercise.repTargetMin, derived.recentBestAnchorReps - 1)
                : min(exercise.repTargetMax, derived.recentBestAnchorReps + 1)
            var suggestedReps = clamp(base, min: exercise.repTargetMin, max: exercise.repTargetMax)
            if (exercise.progressionPolicy ?? .generic) == .voluntaryCap, exercise.voluntaryRepCap > 0 {
                suggestedReps = min(suggestedReps, exercise.voluntaryRepCap)
            }
            let mode: SuggestionMode = fatigueConfirmed ? .fallbackHypertrophy : .recordAttempt
            let load = fatigueConfirmed
                ? max(derived.recentWorkingFloor, derived.targetLoad - increment)
                : derived.targetLoad
            return [Candidate(load: load, reps: suggestedReps, mode: mode, reasonCodes: fatigueConfirmed ? ["first_set_session_fatigue"] : ["generic_first_anchor"])]
        }

        guard let last = doneToday.last else { return [] }
        let baseDrop = exercise.fatigueClass.baseRepDrop
        // Bodyweight exercises cap rep drop at 2: accumulated fatigue is the only variable
        // and a brutal drop (e.g. 10 → 5) is almost always a scoring artifact, not real fatigue.
        let effectiveDrop = exercise.setPatternMode == .bodyweight ? min(baseDrop, 2.0) : baseDrop
        let predicted = Int((Double(last.reps) - effectiveDrop).rounded())
        let holdReps = clamp(predicted, min: max(1, exercise.repTargetMin - 1), max: exercise.repTargetMax)
        let backoffReps = Int((Double(exercise.repTargetMin + exercise.repTargetMax) / 2).rounded(.up))
        let harderLoad = stepLoad(last.weight, by: increment, for: exercise.setPatternMode, towardHarder: true)
        let easierLoad = stepLoad(last.weight, by: increment, for: exercise.setPatternMode, towardHarder: false)

        // Bodyweight: load is fixed at 0, only reps vary.
        // Return a single candidate to avoid scoring artifacts (plateauBreak score 18
        // would never beat recordAttempt score 35 in the generic scorer).
        if exercise.setPatternMode == .bodyweight {
            if derived.plateauCounter >= 3 {
                let bwPlatuCap = max(exercise.repTargetMax, last.reps) + 2
                let targetReps = clamp(last.reps + 1, min: exercise.repTargetMin, max: bwPlatuCap)
                return [Candidate(load: 0, reps: targetReps, mode: .plateauBreak, reasonCodes: ["bw_plateau_rep_target"])]
            }
            // Cap is the larger of configured max and last actual reps to avoid clamping
            // real performance (e.g. repTargetMax=5 but user did 10 → cap must be ≥ 10).
            let bwDropCap = max(exercise.repTargetMax, last.reps)
            let bwDrop = clamp(predicted, min: max(1, exercise.repTargetMin), max: bwDropCap)
            return [Candidate(load: 0, reps: bwDrop, mode: .recordAttempt, reasonCodes: ["bw_predicted_drop"])]
        }

        // Post-overreach recovery: the user attempted a load above the established anchor
        // but missed the minimum reps. Creeping down one increment at a time (easierLoad)
        // wastes sets; jump straight back to the anchor so the session stays productive.
        if last.weight > derived.targetLoad + increment * 0.5,
           last.reps < exercise.repTargetMin,
           exercise.setPatternMode != .bodyweight,
           exercise.setPatternMode != .assistedBodyweight {
            let recoveryReps = clamp(backoffReps, min: exercise.repTargetMin, max: exercise.repTargetMax)
            return [Candidate(
                load: derived.targetLoad,
                reps: recoveryReps,
                mode: .fallbackHypertrophy,
                reasonCodes: ["post_overreach_return_to_anchor"]
            )]
        }

        if doneToday.count == 1 {
            if last.reps >= exercise.repTargetMax + 4,
               shouldStepLoad(exercise.setPatternMode, from: last.weight, towardHarder: true) {
                let aggressiveRaise = Candidate(
                    load: harderLoad,
                    reps: clamp(last.reps - Int(max(2.0, baseDrop)), min: exercise.repTargetMin, max: exercise.repTargetMax),
                    mode: .transitionMode,
                    reasonCodes: ["first_set_far_overshoot_raise_now"]
                )
                return [aggressiveRaise]
            }

            if last.reps <= max(1, exercise.repTargetMin - 3),
               shouldStepLoad(exercise.setPatternMode, from: last.weight, towardHarder: false) {
                let aggressiveDrop = Candidate(
                    load: easierLoad,
                    reps: clamp(last.reps + 2, min: exercise.repTargetMin, max: exercise.repTargetMax),
                    mode: .fallbackHypertrophy,
                    reasonCodes: ["first_set_far_undershoot_drop_now"]
                )
                return [aggressiveDrop]
            }
        }

        var result: [Candidate] = [
            Candidate(load: last.weight, reps: holdReps, mode: .recordAttempt, reasonCodes: ["predicted_drop_same_load"]),
            Candidate(load: easierLoad, reps: backoffReps, mode: .fallbackHypertrophy, reasonCodes: ["fallback_down_one_step"])
        ]

        if shouldStepLoad(exercise.setPatternMode, from: last.weight, towardHarder: true),
           last.reps >= exercise.repTargetMax + 2 {
            let raisedReps = clamp(
                Int((Double(last.reps) - max(1, baseDrop)).rounded()),
                min: exercise.repTargetMin,
                max: exercise.repTargetMax
            )
            result.append(
                Candidate(
                    load: harderLoad,
                    reps: raisedReps,
                    mode: .transitionMode,
                    reasonCodes: ["overshot_target_raise_load_next_set"]
                )
            )
        }

        if shouldStepLoad(exercise.setPatternMode, from: last.weight, towardHarder: false),
           last.reps <= max(1, exercise.repTargetMin - 2) {
            result.append(
                Candidate(
                    load: easierLoad,
                    reps: max(exercise.repTargetMin, last.reps + 1),
                    mode: .fallbackHypertrophy,
                    reasonCodes: ["undershot_target_drop_load_next_set"]
                )
            )
        }

        // Policy: testThenPromote — on set 2, replace standard candidates with a heavier test.
        // If the test passes (reps ≥ repMin), checkPromotionGate will promote next session.
        if (exercise.progressionPolicy ?? .generic) == .testThenPromote, doneToday.count == 1,
           shouldStepLoad(exercise.setPatternMode, from: last.weight, towardHarder: true) {
            let testLoad = stepLoad(derived.targetLoad, by: increment, for: exercise.setPatternMode, towardHarder: true)
            return [Candidate(
                load: testLoad,
                reps: exercise.repTargetMin,
                mode: .transitionMode,
                reasonCodes: ["test_then_promote_set2_test"]
            )]
        }

        // Plateau handling: overreachJump ignores scoring and returns a single heavy candidate.
        // Generic falls through to the standard plateau candidate.
        if derived.plateauCounter >= 3 {
            if (exercise.progressionPolicy ?? .generic) == .overreachJump {
                return [Candidate(
                    load: harderLoad,
                    reps: max(5, exercise.repTargetMin - 1),
                    mode: .plateauBreak,
                    reasonCodes: ["overreach_jump_policy"]
                )]
            }
            result.append(
                Candidate(load: harderLoad, reps: max(5, exercise.repTargetMin - 1), mode: .plateauBreak, reasonCodes: ["plateau_policy_test_heavier"])
            )
        }

        // Policy: voluntaryCap — cap reps on all candidates.
        if (exercise.progressionPolicy ?? .generic) == .voluntaryCap, exercise.voluntaryRepCap > 0 {
            result = result.map { c in
                Candidate(load: c.load, reps: min(c.reps, exercise.voluntaryRepCap), mode: c.mode, reasonCodes: c.reasonCodes + ["voluntary_cap"])
            }
        }

        // Separate floors: anchor candidates use the anchor floor, fallback candidates use the
        // fallback floor (lower). This prevents blocking legitimate recovery sets while still
        // guarding against absurd anchor suggestions.
        result = result.filter { candidate in
            let floor: Double
            switch candidate.mode {
            case .fallbackHypertrophy:
                floor = derived.recentFallbackFloor - increment
            default:
                floor = derived.recentWorkingFloor - increment
            }
            return candidate.load >= floor
        }

        return result
    }

    private static func scoreCandidate(
        _ candidate: Candidate,
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        fatigueConfirmed: Bool
    ) -> Double {
        var score = 0.0
        switch candidate.mode {
        case .recordAttempt: score += 35
        case .fallbackHypertrophy: score += 22
        case .plateauBreak: score += 18
        case .transitionMode: score += 30
        }

        let candidateEffort = effectiveLoad(candidate.load, for: exercise.setPatternMode)
        let targetEffort = effectiveLoad(derived.targetLoad, for: exercise.setPatternMode)

        if abs(candidateEffort - targetEffort) < 0.01 { score += 15 }
        if candidateEffort > targetEffort { score += 8 }
        if candidateEffort < targetEffort { score -= 5 }

        if fatigueConfirmed && candidate.mode == .recordAttempt { score -= 18 }
        if fatigueConfirmed && candidate.mode == .fallbackHypertrophy { score += 12 }

        if derived.progressVelocity > 0.75 && candidateEffort > targetEffort { score += 5 }
        if derived.progressVelocity < 0.25 && candidateEffort > targetEffort { score -= 6 }

        if let last = doneToday.last {
            if last.reps <= max(1, exercise.repTargetMin - 2) && candidate.mode == .recordAttempt { score -= 20 }
            if last.reps >= max(exercise.repTargetMin, 7) && candidate.mode == .fallbackHypertrophy { score += 6 }
        }

        if candidate.reps < 5 { score -= 10 }
        if candidate.reps > 10 && candidate.mode != .fallbackHypertrophy { score -= 10 }
        return score
    }

    private static func deriveState(
        exercise: Exercise,
        history: [[LoggedSet]],
        increment: Double
    ) -> DerivedExerciseState {
        let comparable = history.prefix(5)
        let anchors: [LoggedSet] = comparable.compactMap { session in
            classifyAnchor(in: session, exercise: exercise)
        }

        let validAnchors = anchors.filter { $0.reps >= exercise.repTargetMin }
        let targetLoad = validAnchors.map(\.weight).max()
            ?? anchors.map(\.weight).max()
            ?? defaultStartLoad(for: exercise)

        // Anchor floor = lowest valid anchor weight seen recently.
        let recentWorkingFloor = validAnchors.map(\.weight).min() ?? defaultStartLoad(for: exercise)

        // Fallback floor = lowest weight of a legitimate backoff/fallback set in recent sessions.
        // Separate from anchor floor so fallback candidates aren't blocked by anchor-level standards.
        let fallbackWeights: [Double] = comparable.compactMap { session -> Double? in
            guard let anchor = classifyAnchor(in: session, exercise: exercise) else { return nil }
            let anchorEffort = effectiveLoad(anchor.weight, for: exercise.setPatternMode)
            let fallbacks = session.filter { set in
                set.completed &&
                set.setType != .warmup &&
                !(set.weight == 0 && exercise.setPatternMode == .weightedBodyweight) &&
                effectiveLoad(set.weight, for: exercise.setPatternMode) < anchorEffort - 0.01 &&
                set.reps >= max(1, exercise.repTargetMin - 1)
            }
            return fallbacks.map(\.weight).max()  // best (heaviest) fallback in session
        }
        let recentFallbackFloor = fallbackWeights.min()
            ?? max(0, recentWorkingFloor - increment * 2)

        let repsAtTarget = anchors.filter { abs($0.weight - targetLoad) < 0.01 }.map(\.reps)
        let bestRep = repsAtTarget.max() ?? exercise.repTargetMin

        let plateauCounter = consecutiveAt(load: targetLoad, reps: bestRep, anchors: anchors)
        let progressVelocity = progressVelocityScore(exercise: exercise, history: Array(history.prefix(10)))
        let promotionGatePassed = checkPromotionGate(exercise: exercise, history: Array(comparable))

        // Reps from the anchor set (not first set) at targetLoad in the most recent valid session.
        // This prevents primer sets (e.g. BW×10 before weighted pull-ups) from setting the bar.
        let recentBestAnchorReps = comparable
            .compactMap { session -> Int? in
                guard let anchor = classifyAnchor(in: session, exercise: exercise) else { return nil }
                guard abs(anchor.weight - targetLoad) < 0.01 else { return nil }
                return anchor.reps
            }
            .filter { $0 >= exercise.repTargetMin }
            .first ?? exercise.repTargetMin

        return DerivedExerciseState(
            targetLoad: targetLoad,
            bestRepAtTarget: bestRep,
            plateauCounter: plateauCounter,
            progressVelocity: progressVelocity,
            promotionGatePassed: promotionGatePassed,
            recentBestAnchorReps: recentBestAnchorReps,
            recentWorkingFloor: recentWorkingFloor,
            recentFallbackFloor: recentFallbackFloor
        )
    }

    private static func firstWorkSetReps(in session: [LoggedSet]) -> Int? {
        session.filter(\.completed)
               .sorted { $0.setSlotIndex < $1.setSlotIndex }
               .first?.reps
    }

    /// Promotion gate: returns true when the anchor set (not the first set) justifies
    /// bumping targetLoad by one increment next session. Using the anchor avoids false
    /// promotions triggered by a light primer or warmup being the "first set".
    /// Heavy: 2 of last 3 sessions anchor ≥ repMax.
    /// Medium/Light: 1 of last 2 sessions anchor ≥ repMax.
    /// Guard: most recent anchor must be strictly above repMin (no promotion after a bad session).
    private static func checkPromotionGate(exercise: Exercise, history: [[LoggedSet]]) -> Bool {
        guard !history.isEmpty else { return false }
        let mostRecentAnchorReps = classifyAnchor(in: history[0], exercise: exercise)?.reps ?? 0
        guard mostRecentAnchorReps > exercise.repTargetMin else { return false }
        let (windowSize, required): (Int, Int) = exercise.fatigueClass.usesStrictPromotion ? (3, 2) : (2, 1)
        let qualifiers = history.prefix(windowSize).filter { session in
            (classifyAnchor(in: session, exercise: exercise)?.reps ?? 0) >= exercise.repTargetMax
        }.count
        return qualifiers >= required
    }

    /// Returns the representative anchor set for a session: the heaviest set that wasn't a
    /// hard failure. Primers (BW sets on weightedBodyweight exercises, explicit warmup sets)
    /// are excluded before classification so they don't inflate or deflate targetLoad.
    private static func classifyAnchor(in session: [LoggedSet], exercise: Exercise) -> LoggedSet? {
        let completed = session.filter(\.completed)
        guard !completed.isEmpty else { return nil }

        // Strip primers from consideration
        let workSets = completed.filter { set in
            set.setType != .warmup &&
            !(set.weight == 0 && exercise.setPatternMode == .weightedBodyweight)
        }

        guard !workSets.isEmpty else {
            // All-BW session (e.g. HSPU before adding weight): return the set with
            // the most reps as the anchor, not the most-fatigued last slot.
            return completed
                .filter { $0.setType != .warmup }
                .max(by: { $0.reps < $1.reps })
        }

        // Anchor = heaviest set that wasn't a hard failure (reps ≥ repMin − 1)
        let validCandidates = workSets.filter { $0.reps >= max(1, exercise.repTargetMin - 1) }
        if let anchor = validCandidates.max(by: { $0.weight < $1.weight }) {
            return anchor
        }

        // All work sets were failures (overreach session) → heaviest as reference
        return workSets.max(by: { $0.weight < $1.weight })
    }

    private static func progressVelocityScore(exercise: Exercise, history: [[LoggedSet]]) -> Double {
        let anchors = history.compactMap { classifyAnchor(in: $0, exercise: exercise) }
        guard anchors.count >= 2 else { return 0 }
        var velocity = 0.0
        var alpha = 1.0
        for idx in stride(from: anchors.count - 1, through: 1, by: -1) {
            let cur = anchors[idx]
            let prev = anchors[idx - 1]
            var event = 0.0
            if cur.weight > prev.weight && cur.reps >= prev.reps { event = 1.5 }
            else if abs(cur.weight - prev.weight) < 0.01 && cur.reps > prev.reps { event = 1.0 }
            else if cur.reps == prev.reps && abs(cur.weight - prev.weight) < 0.01 { event = 0.0 }
            else if cur.reps + 1 < prev.reps { event = -0.5 }
            velocity += event * alpha
            alpha *= 0.84
        }
        return velocity / Double(max(1, anchors.count - 1))
    }

    private static func consecutiveAt(load: Double, reps: Int, anchors: [LoggedSet]) -> Int {
        var count = 0
        for anchor in anchors {
            if abs(anchor.weight - load) < 0.01 && anchor.reps <= reps {
                count += 1
            } else {
                break
            }
        }
        return count
    }

    private static func autoFatigueFlag(exercise: Exercise, currentSessionSets: [LoggedSet]) -> Bool {
        guard currentSessionSets.count >= 2 else { return false }
        let avgReps = Double(currentSessionSets.map(\.reps).reduce(0, +)) / Double(currentSessionSets.count)
        let underPerformance = avgReps < Double(exercise.repTargetMin)
        let repeatedLow = currentSessionSets.suffix(2).allSatisfy { $0.reps <= max(1, exercise.repTargetMin - 1) }
        return underPerformance && repeatedLow
    }

    private static func defaultStartLoad(for exercise: Exercise) -> Double {
        switch exercise.setPatternMode {
        case .bodyweight:
            return 0
        case .assistedBodyweight:
            return 20
        default:
            return 20
        }
    }

    private static func effectiveLoad(_ load: Double, for mode: SetPatternMode) -> Double {
        switch mode {
        case .assistedBodyweight:
            return -load
        default:
            return load
        }
    }

    private static func rampStartLoad(
        targetLoad: Double,
        increment: Double,
        for exercise: Exercise
    ) -> Double {
        let steps: Double = exercise.fatigueClass == .heavy ? 2.0 : 1.0
        let start = stepLoad(targetLoad, by: increment * steps, for: exercise.setPatternMode, towardHarder: false)
        return max(0, start)
    }

    private static func minHarderStepTowardTarget(
        from currentLoad: Double,
        target: Double,
        increment: Double,
        mode: SetPatternMode
    ) -> Double {
        let stepped = stepLoad(currentLoad, by: increment, for: mode, towardHarder: true)
        let steppedEffort = effectiveLoad(stepped, for: mode)
        let targetEffort = effectiveLoad(target, for: mode)
        if steppedEffort > targetEffort {
            return target
        }
        return stepped
    }

    private static func stepLoad(
        _ load: Double,
        by increment: Double,
        for mode: SetPatternMode,
        towardHarder: Bool
    ) -> Double {
        switch mode {
        case .assistedBodyweight:
            return towardHarder ? max(0, load - increment) : load + increment
        default:
            return towardHarder ? load + increment : max(0, load - increment)
        }
    }

    private static func shouldStepLoad(
        _ mode: SetPatternMode,
        from load: Double,
        towardHarder: Bool
    ) -> Bool {
        switch mode {
        case .assistedBodyweight:
            return towardHarder ? load > 0 : true
        case .bodyweight:
            return false
        default:
            return towardHarder ? load > 0 : true
        }
    }

    private static func render(
        _ candidate: Candidate,
        confidence: Double,
        setTypeOverride: SetType? = nil
    ) -> SetSuggestion {
        let modeLabel = candidate.mode.rawValue.replacingOccurrences(of: "_", with: " ")
        return SetSuggestion(
            weight: candidate.load,
            reps: candidate.reps,
            setType: setTypeOverride ?? (candidate.mode == .fallbackHypertrophy ? .backoff : .work),
            explanation: "\(modeLabel): \(candidate.load.cleanWeight)x\(candidate.reps).",
            confidence: min(1, max(0, confidence)),
            reasonCodes: candidate.reasonCodes,
            mode: candidate.mode
        )
    }

    private static func clamp(_ value: Int, min lo: Int, max hi: Int) -> Int {
        Swift.max(lo, Swift.min(hi, value))
    }

    // MARK: - Repeat Last Set

    static func repeatLastSet(from sets: [LoggedSet]) -> SetSuggestion? {
        guard let last = sets.filter({ $0.completed }).last else { return nil }
        return SetSuggestion(
            weight: last.weight,
            reps: last.reps,
            setType: last.setType,
            explanation: "Repeat: \(last.weight.cleanWeight)x\(last.reps)"
        )
    }

    // MARK: - Estimated 1RM (Epley formula)

    /// Returns estimated 1RM from weight and reps. Only meaningful for reps <= 15.
    static func estimated1RM(weight: Double, reps: Int) -> Double? {
        guard weight > 0, reps > 0, reps <= 15 else { return nil }
        if reps == 1 { return weight }
        return weight * (1.0 + Double(reps) / 30.0)
    }

    /// Best estimated 1RM from a set of completed work sets.
    static func bestE1RM(from sets: [LoggedSet]) -> (e1rm: Double, weight: Double, reps: Int)? {
        let candidates = sets.filter { $0.completed && $0.weight > 0 && $0.reps > 0 && $0.reps <= 15 }
        var best: (e1rm: Double, weight: Double, reps: Int)?
        for set in candidates {
            if let e1rm = estimated1RM(weight: set.weight, reps: set.reps) {
                if best == nil || e1rm > best!.e1rm {
                    best = (e1rm, set.weight, set.reps)
                }
            }
        }
        return best
    }

    // MARK: - Achievement Detection

    struct Achievement {
        let title: String
        let detail: String
    }

    /// Detect if the just-logged set represents a meaningful milestone.
    static func detectAchievement(
        exercise: Exercise,
        justLogged: LoggedSet,
        previousBestSets: [LoggedSet]
    ) -> Achievement? {
        guard justLogged.completed else { return nil }

        let priorRecords = RecordsEngine.buildRecords(for: exercise, historicalSets: previousBestSets)
        guard let kind = RecordsEngine.classify(set: justLogged, exercise: exercise, priorRecords: priorRecords) else {
            return nil
        }

        switch kind {
        case .heaviestWeight:
            return Achievement(
                title: "Nouveau record",
                detail: "\(justLogged.weight.cleanWeight)kg x\(justLogged.reps)"
            )
        case .estimated1RM:
            let newE1RM = estimated1RM(weight: justLogged.weight, reps: justLogged.reps) ?? 0
            return Achievement(
                title: "Nouveau 1RM estimé",
                detail: "\(Int(newE1RM))kg (via \(justLogged.weight.cleanWeight)x\(justLogged.reps))"
            )
        case .repsAtWeight:
            return Achievement(
                title: "Record de reps",
                detail: "\(justLogged.weight.cleanWeight)kg x\(justLogged.reps)"
            )
        case .bodyweightReps:
            return Achievement(
                title: "Record de reps",
                detail: "BW x\(justLogged.reps)"
            )
        }
    }
}
