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

    init(
        weight: Double,
        reps: Int,
        setType: SetType,
        explanation: String,
        confidence: Double = 0.8,
        reasonCodes: [String] = [],
        mode: SuggestionMode = .recordAttempt
    ) {
        self.weight = weight
        self.reps = reps
        self.setType = setType
        self.explanation = explanation
        self.confidence = confidence
        self.reasonCodes = reasonCodes
        self.mode = mode
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
    }

    // MARK: - Main Entry Point

    static func suggest(
        for exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        recentHistory: [[LoggedSet]] = [],
        currentSessionSets: [LoggedSet] = [],
        smallestIncrement: Double? = nil
    ) -> SetSuggestion {
        let increment = smallestIncrement ?? exercise.smallestIncrement

        let doneToday = currentSessionSets.filter(\.completed)
        let history = ([previousSets] + recentHistory).filter { !$0.isEmpty }
        let derived = deriveState(exercise: exercise, history: history, increment: increment)
        let fatigueConfirmed = autoFatigueFlag(exercise: exercise, currentSessionSets: doneToday)

        if exercise.setPatternMode == .weightedBodyweight {
            return suggestWeightedBodyweight(
                exercise: exercise,
                doneToday: doneToday,
                derived: derived,
                fatigueConfirmed: fatigueConfirmed
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

        return suggestGeneric(
            exercise: exercise,
            doneToday: doneToday,
            derived: derived,
            increment: increment,
            fatigueConfirmed: fatigueConfirmed
        )
    }

    private static func suggestWeightedBodyweight(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        fatigueConfirmed: Bool
    ) -> SetSuggestion {
        if doneToday.isEmpty {
            let primer = Candidate(load: 0, reps: 10, mode: .recordAttempt, reasonCodes: ["primer_before_weighted_attempt"])
            return render(primer, confidence: 0.95)
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

    private static func suggestGeneric(
        exercise: Exercise,
        doneToday: [LoggedSet],
        derived: DerivedExerciseState,
        increment: Double,
        fatigueConfirmed: Bool
    ) -> SetSuggestion {
        let candidates = buildCandidates(
            exercise: exercise,
            doneToday: doneToday,
            derived: derived,
            increment: increment
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
        increment: Double
    ) -> [Candidate] {
        if doneToday.isEmpty {
            if exercise.setPatternMode == .bodyweight {
                return [Candidate(load: 0, reps: exercise.repTargetMin, mode: .recordAttempt, reasonCodes: ["generic_first_anchor"])]
            }
            return [Candidate(load: derived.targetLoad, reps: exercise.repTargetMin, mode: .recordAttempt, reasonCodes: ["generic_first_anchor"])]
        }

        guard let last = doneToday.last else { return [] }
        let baseDrop = exercise.fatigueClass.baseRepDrop
        let predicted = Int((Double(last.reps) - baseDrop).rounded())
        let holdReps = clamp(predicted, min: max(1, exercise.repTargetMin - 1), max: exercise.repTargetMax)
        let backoffReps = Int((Double(exercise.repTargetMin + exercise.repTargetMax) / 2).rounded(.up))
        let harderLoad = stepLoad(last.weight, by: increment, for: exercise.setPatternMode, towardHarder: true)
        let easierLoad = stepLoad(last.weight, by: increment, for: exercise.setPatternMode, towardHarder: false)

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

        if derived.plateauCounter >= 3 {
            result.append(
                Candidate(load: harderLoad, reps: max(5, exercise.repTargetMin - 1), mode: .plateauBreak, reasonCodes: ["plateau_policy_test_heavier"])
            )
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

        let targetLoad = anchors.first(where: { $0.reps >= exercise.repTargetMin })?.weight
        ?? anchors.first?.weight
        ?? defaultStartLoad(for: exercise)

        let repsAtTarget = anchors.filter { abs($0.weight - targetLoad) < 0.01 }.map(\.reps)
        let bestRep = repsAtTarget.max() ?? exercise.repTargetMin

        let plateauCounter = consecutiveAt(load: targetLoad, reps: bestRep, anchors: anchors)
        let progressVelocity = progressVelocityScore(exercise: exercise, history: Array(history.prefix(10)))
        return DerivedExerciseState(targetLoad: targetLoad, bestRepAtTarget: bestRep, plateauCounter: plateauCounter, progressVelocity: progressVelocity)
    }

    private static func classifyAnchor(in session: [LoggedSet], exercise: Exercise) -> LoggedSet? {
        let completed = session.filter(\.completed)
        guard !completed.isEmpty else { return nil }
        let sorted = completed.sorted { $0.setSlotIndex < $1.setSlotIndex }

        let heavyCandidate = sorted.max(by: { $0.weight < $1.weight })
        guard let heavyCandidate else { return sorted.last }

        if heavyCandidate.reps < max(1, exercise.repTargetMin - 1), sorted.count > 1 {
            return sorted.dropLast().last
        }
        return heavyCandidate
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
        guard justLogged.weight > 0, justLogged.completed else { return nil }

        let prevBestE1RM = bestE1RM(from: previousBestSets)

        if justLogged.reps >= exercise.repTargetMin {
            let prevValidated = previousBestSets
                .filter { $0.completed && $0.reps >= exercise.repTargetMin && $0.weight > 0 }
                .max(by: { $0.weight < $1.weight })

            if let prev = prevValidated, justLogged.weight > prev.weight {
                return Achievement(
                    title: "Nouveau record",
                    detail: "\(justLogged.weight.cleanWeight)kg x\(justLogged.reps) validé"
                )
            }
        }

        if let newE1RM = estimated1RM(weight: justLogged.weight, reps: justLogged.reps),
           let oldBest = prevBestE1RM,
           newE1RM > oldBest.e1rm * 1.02 {
            return Achievement(
                title: "Nouveau 1RM estimé",
                detail: "\(Int(newE1RM))kg (via \(justLogged.weight.cleanWeight)x\(justLogged.reps))"
            )
        }

        let sameWeightSets = previousBestSets.filter { $0.weight == justLogged.weight && $0.completed }
        if let bestReps = sameWeightSets.map(\.reps).max(),
           justLogged.reps > bestReps,
           justLogged.reps >= exercise.repTargetMin {
            return Achievement(
                title: "Record de reps",
                detail: "\(justLogged.weight.cleanWeight)kg x\(justLogged.reps) (avant: x\(bestReps))"
            )
        }

        return nil
    }
}
