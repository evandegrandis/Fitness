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
            return suggestSlotBased(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        case .bodyweight:
            return suggestBodyweight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex)
        case .weightedBodyweight:
            return suggestSlotBased(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        case .assistedBodyweight:
            return suggestAssistedBodyweight(exercise: exercise, previousSets: previousSets, currentSetIndex: currentSetIndex, increment: increment)
        }
    }

    // MARK: - Slot-Based (default for ramping, weightedBodyweight, and most exercises)
    // Compares set N of current session with set N of previous session independently

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
                explanation: "No previous data. Start with a comfortable weight."
            )
        }

        // If we have data for this exact slot
        if currentSetIndex < workSets.count {
            let prevSlot = workSets[currentSetIndex]
            let prevWeight = prevSlot.weight
            let prevReps = prevSlot.reps

            if prevReps >= exercise.repTargetMax {
                // Hit target → suggest weight increase
                let newWeight = prevWeight + increment
                return SetSuggestion(
                    weight: newWeight,
                    reps: exercise.repTargetMin,
                    setType: .work,
                    explanation: "Set \(currentSetIndex + 1): +\(increment.cleanWeight)kg (last \(prevWeight.cleanWeight)x\(prevReps), hit target)."
                )
            } else if prevReps >= exercise.repTargetMin {
                // In range → same weight, push reps
                return SetSuggestion(
                    weight: prevWeight,
                    reps: min(prevReps + 1, exercise.repTargetMax),
                    setType: .work,
                    explanation: "Set \(currentSetIndex + 1): keep \(prevWeight.cleanWeight)kg, push reps (last \(prevReps))."
                )
            } else {
                // Below range → same weight, target min
                return SetSuggestion(
                    weight: prevWeight,
                    reps: exercise.repTargetMin,
                    setType: .work,
                    explanation: "Set \(currentSetIndex + 1): keep \(prevWeight.cleanWeight)kg (last \(prevReps), below target)."
                )
            }
        }

        // Beyond previous set count → suggest based on last set of previous session
        if let last = workSets.last {
            return SetSuggestion(
                weight: last.weight,
                reps: last.reps,
                setType: .work,
                explanation: "Extra set. Match previous last: \(last.weight.cleanWeight)x\(last.reps)."
            )
        }

        return SetSuggestion(weight: 20, reps: exercise.repTargetMax, setType: .work, explanation: "No previous data.")
    }

    // MARK: - Straight Sets (same weight all sets)

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
                explanation: "+\(increment.cleanWeight)kg → \(newWeight.cleanWeight)kg (last \(repsStr), all at target)."
            )
        } else if someBelow {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Keep \(lastWeight.cleanWeight)kg (last \(repsStr), some below \(exercise.repTargetMin))."
            )
        } else {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Keep \(lastWeight.cleanWeight)kg, push for \(exercise.repTargetMax) (last \(repsStr))."
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
                explanation: "No previous data."
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
                        explanation: "Top set +\(increment.cleanWeight)kg (last \(lastTop.weight.cleanWeight)x\(lastTop.reps))."
                    )
                } else {
                    return SetSuggestion(
                        weight: lastTop.weight,
                        reps: exercise.repTargetMax,
                        setType: .topSet,
                        explanation: "Top set: keep \(lastTop.weight.cleanWeight)kg (last x\(lastTop.reps))."
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
                let lastBackoff = backoffs[backoffIndex]
                if lastBackoff.reps >= exercise.repTargetMax {
                    let newWeight = lastBackoff.weight + increment
                    return SetSuggestion(
                        weight: newWeight,
                        reps: exercise.repTargetMin,
                        setType: .backoff,
                        explanation: "Backoff \(currentSetIndex) +\(increment.cleanWeight)kg (last \(lastBackoff.weight.cleanWeight)x\(lastBackoff.reps))."
                    )
                } else {
                    return SetSuggestion(
                        weight: lastBackoff.weight,
                        reps: exercise.repTargetMax,
                        setType: .backoff,
                        explanation: "Backoff: keep \(lastBackoff.weight.cleanWeight)kg (last x\(lastBackoff.reps))."
                    )
                }
            } else if let lastBackoff = backoffs.last {
                return SetSuggestion(
                    weight: lastBackoff.weight,
                    reps: exercise.repTargetMin,
                    setType: .backoff,
                    explanation: "Additional backoff at \(lastBackoff.weight.cleanWeight)kg."
                )
            }
        }

        return SetSuggestion(weight: 20, reps: exercise.repTargetMin, setType: currentSetIndex == 0 ? .topSet : .backoff, explanation: "No matching previous data.")
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
            if prevSlot.reps >= exercise.repTargetMax {
                return SetSuggestion(
                    weight: 0,
                    reps: exercise.repTargetMax,
                    setType: .work,
                    explanation: "At max reps (\(exercise.repTargetMax)). Consider adding weight."
                )
            }
            let targetReps = min(prevSlot.reps + 1, exercise.repTargetMax)
            return SetSuggestion(
                weight: 0,
                reps: targetReps,
                setType: .work,
                explanation: "Target \(targetReps) reps (last BWx\(prevSlot.reps))."
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
                explanation: "Reduce assistance −\(increment.cleanWeight)kg (last \(repsStr), all at target)."
            )
        } else {
            return SetSuggestion(
                weight: lastWeight,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "Keep assistance at \(lastWeight.cleanWeight)kg (last \(repsStr))."
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
