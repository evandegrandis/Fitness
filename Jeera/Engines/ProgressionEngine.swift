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
        smallestIncrement: Double? = nil
    ) -> SetSuggestion {
        let increment = smallestIncrement ?? exercise.smallestIncrement

        switch exercise.setPatternMode {
        case .straight:
            return suggestStraight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        case .topSetBackoff:
            return suggestTopSetBackoff(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        case .ramping:
            return suggestRamping(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        case .bodyweight:
            return suggestBodyweight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex)
        case .weightedBodyweight:
            return suggestWeightedBodyweight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        case .assistedBodyweight:
            return suggestAssistedBodyweight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        }
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
                explanation: "No previous data. Start with a comfortable weight."
            )
        }

        let allHitTarget = workSets.allSatisfy { $0.reps >= exercise.repTargetMax }
        let someBelow = workSets.contains { $0.reps < exercise.repTargetMin }
        let lastWeight = workSets.first?.weight ?? 20
        let repsStr = workSets.map { "\($0.reps)" }.joined(separator: " / ")

        if allHitTarget {
            let newWeight = lastWeight + increment
            return SetSuggestion(
                weight: newWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Progress +\(increment.cleanWeight) kg because last session you hit \(repsStr) (all at target)."
            )
        } else if someBelow {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Keep \(lastWeight.cleanWeight) kg. Last session: \(repsStr) — some sets below \(exercise.repTargetMin) minimum."
            )
        } else {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Keep \(lastWeight.cleanWeight) kg. Push for \(exercise.repTargetMax) reps. Last: \(repsStr)."
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
                explanation: "No previous data. Start with a comfortable weight."
            )
        }

        let topSets = workSets.filter { $0.setType == .topSet }
        let backoffs = workSets.filter { $0.setType == .backoff || $0.setType == .work }

        if currentSetIndex == 0 {
            // Top set suggestion
            if let lastTop = topSets.first {
                if lastTop.reps >= exercise.repTargetMax {
                    let newWeight = lastTop.weight + increment
                    return SetSuggestion(
                        weight: newWeight,
                        reps: exercise.repTargetMin,
                        setType: .topSet,
                        explanation: "Progress top set +\(increment.cleanWeight) kg. Last top set: \(lastTop.weight.cleanWeight)x\(lastTop.reps)."
                    )
                } else {
                    return SetSuggestion(
                        weight: lastTop.weight,
                        reps: exercise.repTargetMax,
                        setType: .topSet,
                        explanation: "Keep top set at \(lastTop.weight.cleanWeight) kg. Last: \(lastTop.weight.cleanWeight)x\(lastTop.reps)."
                    )
                }
            } else if let firstWork = workSets.first {
                return SetSuggestion(
                    weight: firstWork.weight,
                    reps: exercise.repTargetMin,
                    setType: .topSet,
                    explanation: "Based on previous work: \(firstWork.weight.cleanWeight)x\(firstWork.reps)."
                )
            }
        } else {
            // Backoff suggestion
            let backoffIndex = currentSetIndex - 1
            if backoffIndex < backoffs.count {
                let lastBackoff = backoffs[backoffIndex]
                if lastBackoff.reps >= exercise.repTargetMax {
                    let newWeight = lastBackoff.weight + increment
                    return SetSuggestion(
                        weight: newWeight,
                        reps: exercise.repTargetMin,
                        setType: .backoff,
                        explanation: "Progress backoff \(currentSetIndex) +\(increment.cleanWeight) kg. Last: \(lastBackoff.weight.cleanWeight)x\(lastBackoff.reps)."
                    )
                } else {
                    return SetSuggestion(
                        weight: lastBackoff.weight,
                        reps: exercise.repTargetMax,
                        setType: .backoff,
                        explanation: "Keep backoff at \(lastBackoff.weight.cleanWeight) kg. Last: \(lastBackoff.weight.cleanWeight)x\(lastBackoff.reps)."
                    )
                }
            } else if let lastBackoff = backoffs.last {
                return SetSuggestion(
                    weight: lastBackoff.weight,
                    reps: exercise.repTargetMin,
                    setType: .backoff,
                    explanation: "Additional backoff at \(lastBackoff.weight.cleanWeight) kg."
                )
            }
        }

        return SetSuggestion(weight: 20, reps: exercise.repTargetMin, setType: currentSetIndex == 0 ? .topSet : .backoff, explanation: "No matching previous data.")
    }

    // MARK: - Ramping

    static func suggestRamping(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        increment: Double
    ) -> SetSuggestion {
        let workSets = previousSets.filter { $0.setType == .work && $0.completed }
            .sorted { $0.setSlotIndex < $1.setSlotIndex }

        guard currentSetIndex < workSets.count else {
            if let last = workSets.last {
                let newWeight = last.weight + increment
                return SetSuggestion(
                    weight: newWeight,
                    reps: exercise.repTargetMin,
                    setType: .work,
                    explanation: "Additional ramp set above last: \(last.weight.cleanWeight)x\(last.reps)."
                )
            }
            return SetSuggestion(weight: 20, reps: exercise.repTargetMax, setType: .work, explanation: "No previous data for ramping.")
        }

        let prevSlot = workSets[currentSetIndex]

        if prevSlot.reps >= exercise.repTargetMax {
            let newWeight = prevSlot.weight + increment
            return SetSuggestion(
                weight: newWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Progress set \(currentSetIndex + 1) +\(increment.cleanWeight) kg. Last: \(prevSlot.weight.cleanWeight)x\(prevSlot.reps)."
            )
        } else if prevSlot.reps >= exercise.repTargetMin {
            return SetSuggestion(
                weight: prevSlot.weight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Keep set \(currentSetIndex + 1) at \(prevSlot.weight.cleanWeight) kg. Push for more reps. Last: \(prevSlot.reps)."
            )
        } else {
            return SetSuggestion(
                weight: prevSlot.weight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Keep set \(currentSetIndex + 1) at \(prevSlot.weight.cleanWeight) kg. Last: \(prevSlot.reps) — below target."
            )
        }
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
                explanation: "No previous data. Start with \(exercise.repTargetMin) reps."
            )
        }

        if currentSetIndex < workSets.count {
            let prevSlot = workSets[currentSetIndex]
            let targetReps = min(prevSlot.reps + 1, exercise.repTargetMax)
            if prevSlot.reps >= exercise.repTargetMax {
                return SetSuggestion(
                    weight: 0,
                    reps: exercise.repTargetMax,
                    setType: .work,
                    explanation: "At max reps (\(exercise.repTargetMax)). Consider adding weight. Last: BWx\(prevSlot.reps)."
                )
            }
            return SetSuggestion(
                weight: 0,
                reps: targetReps,
                setType: .work,
                explanation: "Target \(targetReps) reps. Last: BWx\(prevSlot.reps)."
            )
        }

        let lastReps = workSets.last?.reps ?? exercise.repTargetMin
        return SetSuggestion(
            weight: 0,
            reps: lastReps,
            setType: .work,
            explanation: "Additional set. Match last performance: BWx\(lastReps)."
        )
    }

    // MARK: - Weighted Bodyweight

    static func suggestWeightedBodyweight(
        exercise: Exercise,
        previousSets: [LoggedSet],
        currentSetIndex: Int,
        increment: Double
    ) -> SetSuggestion {
        // Treat like straight sets with weight
        return suggestStraight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
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
                explanation: "No previous data. Start with moderate assistance."
            )
        }

        let allHitTarget = workSets.allSatisfy { $0.reps >= exercise.repTargetMax }
        let lastWeight = workSets.first?.weight ?? 20
        let repsStr = workSets.map { "\($0.reps)" }.joined(separator: " / ")

        if allHitTarget {
            let newWeight = max(0, lastWeight - increment)
            return SetSuggestion(
                weight: newWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Reduce assistance by \(increment.cleanWeight) kg. Last: \(repsStr) (all at target)."
            )
        } else {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Keep assistance at \(lastWeight.cleanWeight) kg. Last: \(repsStr)."
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
}
