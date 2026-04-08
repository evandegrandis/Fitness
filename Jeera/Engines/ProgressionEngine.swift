import Foundation

struct SetSuggestion {
    let weight: Double
    let reps: Int
    let setType: SetType
    let explanation: String
}

struct ProgressionEngine {

    // MARK: - Main Entry Point

    static func suggest(
        for exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        recentHistory: [[LoggedSet]] = [],
        smallestIncrement: Double? = nil
    ) -> SetSuggestion {
        let increment = smallestIncrement ?? exercise.smallestIncrement

        // Use best of recent sessions if available (guards against one bad session)
        let bestSets = bestRecentSets(primary: previousSets, history: recentHistory, exercise: exercise)

        switch exercise.setPatternMode {
        case .straight:
            return suggestStraight(exercise: exercise, previousSets: bestSets, currentSetIndex: currentSetIndex, increment: increment)
        case .topSetBackoff:
            return suggestTopSetBackoff(exercise: exercise, previousSets: bestSets, currentSetIndex: currentSetIndex, increment: increment)
        case .ramping:
            return suggestSlotBased(exercise: exercise, previousSets: bestSets, currentSetIndex: currentSetIndex, increment: increment)
        case .bodyweight:
            return suggestBodyweight(exercise: exercise, previousSets: bestSets, currentSetIndex: currentSetIndex)
        case .weightedBodyweight:
            return suggestSlotBased(exercise: exercise, previousSets: bestSets, currentSetIndex: currentSetIndex, increment: increment)
        case .assistedBodyweight:
            return suggestAssistedBodyweight(exercise: exercise, previousSets: bestSets, currentSetIndex: currentSetIndex, increment: increment)
        }
    }

    // MARK: - Best Recent Sets

    /// Compare primary (last session) with recent history. If the last session was significantly
    /// worse than a recent session, use the better one to avoid regressing from a bad day.
    static func bestRecentSets(primary: [LoggedSet], history: [[LoggedSet]], exercise: Exercise) -> [LoggedSet] {
        guard !history.isEmpty else { return primary }

        let primaryScore = sessionScore(primary, exercise: exercise)

        for past in history {
            let pastScore = sessionScore(past, exercise: exercise)
            if pastScore > primaryScore * 1.15 {
                // Past session was significantly better — use it instead
                return past
            }
        }

        return primary
    }

    /// Score a session's sets for comparison (higher = better)
    private static func sessionScore(_ sets: [LoggedSet], exercise: Exercise) -> Double {
        let workSets = sets.filter { $0.completed && ($0.setType == .work || $0.setType == .topSet || $0.setType == .backoff) }
        return workSets.reduce(0.0) { $0 + $1.weight * Double($1.reps) }
    }

    // MARK: - Slot-Based (ramping, weightedBodyweight)

    static func suggestSlotBased(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        increment: Double
    ) -> SetSuggestion {
        let workSets = previousSets.filter { $0.setType == .work && $0.completed }
            .sorted { $0.setSlotIndex < $1.setSlotIndex }

        guard !workSets.isEmpty else {
            return SetSuggestion(
                weight: 20,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "First time. Start with a comfortable weight."
            )
        }

        if currentSetIndex < workSets.count {
            let prev = workSets[currentSetIndex]
            let prevW = prev.weight
            let prevR = prev.reps

            if prevR >= exercise.repTargetMax {
                let newWeight = prevW + increment
                return SetSuggestion(
                    weight: newWeight,
                    reps: exercise.repTargetMin,
                    setType: .work,
                    explanation: "Set \(currentSetIndex + 1): last \(prevW.cleanWeight)x\(prevR) hit \(exercise.repTargetMax) \u{2192} try \(newWeight.cleanWeight)kg."
                )
            } else if prevR >= exercise.repTargetMin {
                let target = min(prevR + 1, exercise.repTargetMax)
                return SetSuggestion(
                    weight: prevW,
                    reps: target,
                    setType: .work,
                    explanation: "Set \(currentSetIndex + 1): last \(prevW.cleanWeight)x\(prevR), push to x\(target). +weight at \(exercise.repTargetMax)r."
                )
            } else {
                return SetSuggestion(
                    weight: prevW,
                    reps: exercise.repTargetMin,
                    setType: .work,
                    explanation: "Set \(currentSetIndex + 1): last \(prevW.cleanWeight)x\(prevR) (below \(exercise.repTargetMin)). Stay and build reps."
                )
            }
        }

        if let last = workSets.last {
            return SetSuggestion(
                weight: last.weight,
                reps: last.reps,
                setType: .work,
                explanation: "Extra set. Match last: \(last.weight.cleanWeight)x\(last.reps)."
            )
        }

        return SetSuggestion(weight: 20, reps: exercise.repTargetMax, setType: .work, explanation: "No data.")
    }

    // MARK: - Straight Sets

    static func suggestStraight(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        increment: Double
    ) -> SetSuggestion {
        let workSets = previousSets.filter { $0.setType == .work && $0.completed }

        guard !workSets.isEmpty else {
            return SetSuggestion(
                weight: 20,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "First time. Start with a comfortable weight."
            )
        }

        let allHitTarget = workSets.allSatisfy { $0.reps >= exercise.repTargetMax }
        let someBelow = workSets.contains { $0.reps < exercise.repTargetMin }
        let lastWeight = workSets.first?.weight ?? 20
        let repsStr = workSets.map { "\($0.reps)" }.joined(separator: "/")

        if allHitTarget {
            let newWeight = lastWeight + increment
            return SetSuggestion(
                weight: newWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Last: \(lastWeight.cleanWeight)x\(repsStr) all at \(exercise.repTargetMax) \u{2192} +\(increment.cleanWeight)kg to \(newWeight.cleanWeight)."
            )
        } else if someBelow {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Last: \(lastWeight.cleanWeight)x\(repsStr). Some below \(exercise.repTargetMin) \u{2192} stay and build."
            )
        } else {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Last: \(lastWeight.cleanWeight)x\(repsStr). Push for \(exercise.repTargetMax) all sets \u{2192} then +weight."
            )
        }
    }

    // MARK: - Top Set + Backoffs

    static func suggestTopSetBackoff(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        increment: Double
    ) -> SetSuggestion {
        let workSets = previousSets.filter { ($0.setType == .topSet || $0.setType == .backoff || $0.setType == .work) && $0.completed }

        guard !workSets.isEmpty else {
            let setType: SetType = currentSetIndex == 0 ? .topSet : .backoff
            return SetSuggestion(
                weight: 20,
                reps: exercise.repTargetMin,
                setType: setType,
                explanation: "First time. Start with a comfortable weight."
            )
        }

        let topSets = workSets.filter { $0.setType == .topSet }
        let backoffs = workSets.filter { $0.setType == .backoff || $0.setType == .work }

        if currentSetIndex == 0 {
            if let lastTop = topSets.first {
                if lastTop.reps >= exercise.repTargetMax {
                    let newWeight = lastTop.weight + increment
                    return SetSuggestion(
                        weight: newWeight,
                        reps: exercise.repTargetMin,
                        setType: .topSet,
                        explanation: "Top set: last \(lastTop.weight.cleanWeight)x\(lastTop.reps) hit \(exercise.repTargetMax) \u{2192} +\(increment.cleanWeight)kg."
                    )
                } else {
                    return SetSuggestion(
                        weight: lastTop.weight,
                        reps: exercise.repTargetMax,
                        setType: .topSet,
                        explanation: "Top set: last \(lastTop.weight.cleanWeight)x\(lastTop.reps). Push to \(exercise.repTargetMax) \u{2192} then +weight."
                    )
                }
            } else if let firstWork = workSets.first {
                return SetSuggestion(
                    weight: firstWork.weight,
                    reps: exercise.repTargetMin,
                    setType: .topSet,
                    explanation: "Based on previous: \(firstWork.weight.cleanWeight)x\(firstWork.reps)."
                )
            }
        } else {
            let backoffIndex = currentSetIndex - 1
            if backoffIndex < backoffs.count {
                let prev = backoffs[backoffIndex]
                if prev.reps >= exercise.repTargetMax {
                    let newWeight = prev.weight + increment
                    return SetSuggestion(
                        weight: newWeight,
                        reps: exercise.repTargetMin,
                        setType: .backoff,
                        explanation: "Backoff \(currentSetIndex): last \(prev.weight.cleanWeight)x\(prev.reps) hit target \u{2192} +\(increment.cleanWeight)kg."
                    )
                } else {
                    return SetSuggestion(
                        weight: prev.weight,
                        reps: exercise.repTargetMax,
                        setType: .backoff,
                        explanation: "Backoff \(currentSetIndex): last \(prev.weight.cleanWeight)x\(prev.reps). Push reps."
                    )
                }
            } else if let lastBackoff = backoffs.last {
                return SetSuggestion(
                    weight: lastBackoff.weight,
                    reps: exercise.repTargetMin,
                    setType: .backoff,
                    explanation: "Extra backoff at \(lastBackoff.weight.cleanWeight)kg."
                )
            }
        }

        return SetSuggestion(weight: 20, reps: exercise.repTargetMin, setType: currentSetIndex == 0 ? .topSet : .backoff, explanation: "No matching data.")
    }

    // MARK: - Bodyweight

    static func suggestBodyweight(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int
    ) -> SetSuggestion {
        let workSets = previousSets.filter { $0.setType == .work && $0.completed }

        guard !workSets.isEmpty else {
            return SetSuggestion(
                weight: 0,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "First time. Start with \(exercise.repTargetMin) reps."
            )
        }

        if currentSetIndex < workSets.count {
            let prev = workSets[currentSetIndex]
            if prev.reps >= exercise.repTargetMax {
                return SetSuggestion(
                    weight: 0,
                    reps: exercise.repTargetMax,
                    setType: .work,
                    explanation: "Last BWx\(prev.reps) at max. Consider adding weight."
                )
            }
            let target = min(prev.reps + 1, exercise.repTargetMax)
            return SetSuggestion(
                weight: 0,
                reps: target,
                setType: .work,
                explanation: "Last BWx\(prev.reps) \u{2192} target x\(target)."
            )
        }

        let lastReps = workSets.last?.reps ?? exercise.repTargetMin
        return SetSuggestion(
            weight: 0,
            reps: lastReps,
            setType: .work,
            explanation: "Extra set. Match last: BWx\(lastReps)."
        )
    }

    // MARK: - Assisted Bodyweight

    static func suggestAssistedBodyweight(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        increment: Double
    ) -> SetSuggestion {
        let workSets = previousSets.filter { $0.setType == .work && $0.completed }

        guard !workSets.isEmpty else {
            return SetSuggestion(
                weight: 20,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "First time. Start with moderate assistance."
            )
        }

        let allHitTarget = workSets.allSatisfy { $0.reps >= exercise.repTargetMax }
        let lastWeight = workSets.first?.weight ?? 20
        let repsStr = workSets.map { "\($0.reps)" }.joined(separator: "/")

        if allHitTarget {
            let newWeight = max(0, lastWeight - increment)
            return SetSuggestion(
                weight: newWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Last \(lastWeight.cleanWeight)kgx\(repsStr) all at target \u{2192} reduce to \(newWeight.cleanWeight)kg assistance."
            )
        } else {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Last \(lastWeight.cleanWeight)kgx\(repsStr). Keep assistance, push reps."
            )
        }
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

    /// Best estimated 1RM from a set of completed work sets
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

    /// Detect if the just-logged set represents a meaningful milestone
    static func detectAchievement(
        exercise: Exercise,
        justLogged: LoggedSet,
        previousBestSets: [LoggedSet]
    ) -> Achievement? {
        guard justLogged.weight > 0, justLogged.completed else { return nil }

        let prevBestE1RM = bestE1RM(from: previousBestSets)

        // Check new validated best weight (at or above rep minimum)
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

            // First time at this weight with valid reps
            if prevValidated == nil && justLogged.weight > 0 {
                // Not a meaningful achievement if no history
            }
        }

        // Check new e1RM PR
        if let newE1RM = estimated1RM(weight: justLogged.weight, reps: justLogged.reps),
           let oldBest = prevBestE1RM,
           newE1RM > oldBest.e1rm * 1.02 { // >2% improvement
            return Achievement(
                title: "Nouveau 1RM estimé",
                detail: "\(Int(newE1RM))kg (via \(justLogged.weight.cleanWeight)x\(justLogged.reps))"
            )
        }

        // Check rep PR at same weight
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
