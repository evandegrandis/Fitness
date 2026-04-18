import Foundation

struct SetSuggestion {
    let weight: Double
    let reps: Int
    let setType: SetType
    let explanation: String
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

        // If any working set has been completed in the current session, the next
        // suggestion must flow from what was *just done*, never from last session.
        let doneToday = currentSessionSets.filter { $0.completed }
        if !doneToday.isEmpty, let lastToday = doneToday.last {
            return suggestSubsequent(
                exercise: exercise,
                lastSet: lastToday,
                completedCount: doneToday.count,
                increment: increment
            )
        }

        // First working set of the session: use the anchor-load / promotion logic
        // against comparable recent history.
        return suggestFirstSet(
            exercise: exercise,
            previousSets: previousSets,
            recentHistory: recentHistory,
            increment: increment
        )
    }

    // MARK: - First Working Set (anchor + promotion)

    /// Anchor load = heaviest load across recent history that hit at least rep_min
    /// on the first working set. We look up to maxSessionsConsidered sessions back
    /// (primary + recentHistory).
    private static func suggestFirstSet(
        exercise: Exercise,
        previousSets: [LoggedSet],
        recentHistory: [[LoggedSet]],
        increment: Double
    ) -> SetSuggestion {
        // Assemble comparable sessions, most recent first.
        var sessions: [[LoggedSet]] = []
        if !previousSets.isEmpty { sessions.append(previousSets) }
        sessions.append(contentsOf: recentHistory)

        // Extract the first completed working set of each comparable session.
        let firstSets = sessions.compactMap { sess in
            sess.first(where: { $0.completed && ($0.setType == .work || $0.setType == .topSet || $0.setType == .backoff) })
        }

        // Handle pure bodyweight & no history separately.
        if firstSets.isEmpty {
            return firstTimeFallback(exercise: exercise)
        }

        switch exercise.setPatternMode {
        case .bodyweight:
            return firstSetBodyweight(exercise: exercise, firstSets: firstSets)
        case .assistedBodyweight:
            return firstSetAssisted(exercise: exercise, firstSets: firstSets, increment: increment)
        default:
            return firstSetWeighted(exercise: exercise, firstSets: firstSets, sessions: sessions, increment: increment)
        }
    }

    private static func firstTimeFallback(exercise: Exercise) -> SetSuggestion {
        switch exercise.setPatternMode {
        case .bodyweight:
            return SetSuggestion(weight: 0, reps: exercise.repTargetMin, setType: .work,
                                 explanation: "Première fois. Cible : \(exercise.repTargetMin) reps BW.")
        case .assistedBodyweight:
            return SetSuggestion(weight: 20, reps: exercise.repTargetMin, setType: .work,
                                 explanation: "Première fois. Assistance modérée pour atteindre \(exercise.repTargetMin) reps.")
        default:
            return SetSuggestion(weight: 20, reps: exercise.repTargetMax, setType: .work,
                                 explanation: "Première fois. Commence avec un poids confortable.")
        }
    }

    /// External-load / weighted-BW path. Uses anchor_load + promotion rule.
    private static func firstSetWeighted(
        exercise: Exercise,
        firstSets: [LoggedSet],
        sessions: [[LoggedSet]],
        increment: Double
    ) -> SetSuggestion {
        // anchor_load = heaviest first-set weight that hit >= rep_min.
        let validated = firstSets.filter { $0.reps >= exercise.repTargetMin }
        let anchor: Double = validated.map(\.weight).max()
            ?? firstSets.map(\.weight).max()
            ?? 0

        // median of first-set reps at anchor_load (exact weight match).
        let repsAtAnchor = firstSets.filter { $0.weight == anchor }.map(\.reps).sorted()
        let medianReps = repsAtAnchor.isEmpty
            ? (firstSets.first?.reps ?? exercise.repTargetMin)
            : repsAtAnchor[repsAtAnchor.count / 2]

        // Promotion eligibility against the anchor load across sessions.
        let promote = isPromotionEligible(
            exercise: exercise,
            anchor: anchor,
            sessions: sessions
        )

        if promote {
            let newWeight = anchor + increment
            let buffer = exercise.fatigueClass == .heavy ? 1 : 2
            let target = min(exercise.repTargetMax, exercise.repTargetMin + buffer)
            return SetSuggestion(
                weight: newWeight,
                reps: target,
                setType: .work,
                explanation: "Promo : \(anchor.cleanWeight)kg validé → +\(increment.cleanWeight) → \(newWeight.cleanWeight)kg x\(target)."
            )
        } else {
            let target = min(exercise.repTargetMax, medianReps + 1)
            let clampedTarget = max(target, exercise.repTargetMin)
            return SetSuggestion(
                weight: anchor,
                reps: clampedTarget,
                setType: .work,
                explanation: "Ancre : \(anchor.cleanWeight)kg. +1 rep utile → x\(clampedTarget)."
            )
        }
    }

    /// Bodyweight (no load) path. Simple rep progression: last reps + 1, capped.
    private static func firstSetBodyweight(exercise: Exercise, firstSets: [LoggedSet]) -> SetSuggestion {
        // Use the best first-set reps across recent sessions as the anchor.
        let bestFirstReps = firstSets.map(\.reps).max() ?? exercise.repTargetMin
        if bestFirstReps >= exercise.repTargetMax {
            return SetSuggestion(
                weight: 0,
                reps: exercise.repTargetMax,
                setType: .work,
                explanation: "BW x\(bestFirstReps) au plafond — pense à lester."
            )
        }
        let target = min(exercise.repTargetMax, bestFirstReps + 1)
        return SetSuggestion(
            weight: 0,
            reps: target,
            setType: .work,
            explanation: "BW x\(bestFirstReps) → cible x\(target)."
        )
    }

    /// Assistance path. Progress = REDUCE assistance (lower weight counter), so
    /// the promotion direction flips vs external load.
    private static func firstSetAssisted(
        exercise: Exercise,
        firstSets: [LoggedSet],
        increment: Double
    ) -> SetSuggestion {
        let lastAssistance = firstSets.first?.weight ?? 20
        let allHitTarget = firstSets.prefix(2).allSatisfy { $0.reps >= exercise.repTargetMax }
        if allHitTarget {
            let newAssist = max(0, lastAssistance - increment)
            return SetSuggestion(
                weight: newAssist,
                reps: exercise.repTargetMin,
                setType: .work,
                explanation: "Assistance \(lastAssistance.cleanWeight)kg saturée → réduire à \(newAssist.cleanWeight)kg."
            )
        }
        let bestReps = firstSets.map(\.reps).max() ?? exercise.repTargetMin
        let target = min(exercise.repTargetMax, bestReps + 1)
        return SetSuggestion(
            weight: lastAssistance,
            reps: target,
            setType: .work,
            explanation: "Assistance \(lastAssistance.cleanWeight)kg — push à x\(target)."
        )
    }

    /// Promotion eligibility per algo §6.3.
    /// H (strict): in 2 of last 3 comparable sessions, first_set_reps >= rep_max
    ///   AND average working reps at anchor >= rep_min + 1
    ///   AND no working set at anchor < rep_min - 1.
    /// M/L (normal): in 1 of last 2 comparable sessions, first_set_reps >= rep_max
    ///   AND average working reps at anchor >= rep_min + 1.
    private static func isPromotionEligible(
        exercise: Exercise,
        anchor: Double,
        sessions: [[LoggedSet]]
    ) -> Bool {
        let strict = exercise.fatigueClass.usesStrictPromotion
        let windowSize = strict ? 3 : 2
        let needed = strict ? 2 : 1
        let window = sessions.prefix(windowSize)
        guard window.count >= needed else { return false }

        var qualifying = 0
        for sess in window {
            let workSets = sess.filter {
                $0.completed && ($0.setType == .work || $0.setType == .topSet || $0.setType == .backoff)
            }
            let atAnchor = workSets.filter { $0.weight == anchor }
            guard let firstAtAnchor = atAnchor.first else { continue }
            guard firstAtAnchor.reps >= exercise.repTargetMax else { continue }

            let avg = Double(atAnchor.map(\.reps).reduce(0, +)) / Double(max(atAnchor.count, 1))
            guard avg >= Double(exercise.repTargetMin + 1) else { continue }

            if strict {
                let minAllowed = exercise.repTargetMin - 1
                guard atAnchor.allSatisfy({ $0.reps >= minAllowed }) else { continue }
            }
            qualifying += 1
        }
        return qualifying >= needed
    }

    // MARK: - Subsequent Sets (predicted from what was just done)

    private static func suggestSubsequent(
        exercise: Exercise,
        lastSet: LoggedSet,
        completedCount: Int,
        increment: Double
    ) -> SetSuggestion {
        let base = exercise.fatigueClass.baseRepDrop
        // Set penalty kicks in from the 3rd working set (indexing: lastSet is set N,
        // the suggestion is for set N+1). completedCount = N.
        let penalty = setPenalty(upcomingSetIndex: completedCount + 1)
        let predicted = Double(lastSet.reps) - base - penalty

        // Bodyweight (weight == 0, mode == bodyweight): just drop reps.
        if exercise.setPatternMode == .bodyweight {
            let target = max(1, min(exercise.repTargetMax, Int(predicted.rounded())))
            return SetSuggestion(
                weight: 0,
                reps: target,
                setType: .work,
                explanation: "Set \(completedCount + 1) : prédit BWx\(target) après BWx\(lastSet.reps)."
            )
        }

        // Assistance: direction flips. More fatigue → keep assistance (load stays
        // the same kg counter) but reps drop; if predicted falls below rep_min,
        // increase assistance by one increment to rescue the set.
        if exercise.setPatternMode == .assistedBodyweight {
            if predicted >= Double(exercise.repTargetMin) {
                let reps = clamp(Int(predicted.rounded()), min: exercise.repTargetMin, max: exercise.repTargetMax)
                return SetSuggestion(
                    weight: lastSet.weight,
                    reps: reps,
                    setType: .work,
                    explanation: "Set \(completedCount + 1) : même assistance, cible x\(reps) (chute prévue)."
                )
            }
            let newAssist = lastSet.weight + increment
            let mid = (exercise.repTargetMin + exercise.repTargetMax + 1) / 2
            return SetSuggestion(
                weight: newAssist,
                reps: mid,
                setType: .work,
                explanation: "Set \(completedCount + 1) : +assistance \(newAssist.cleanWeight)kg pour tenir x\(mid)."
            )
        }

        // External load / weighted-BW: same kg if predicted clears floor,
        // otherwise back off one increment and target upper-mid band.
        if predicted >= Double(exercise.repTargetMin) {
            let reps = clamp(Int(predicted.rounded()), min: exercise.repTargetMin, max: exercise.repTargetMax)
            return SetSuggestion(
                weight: lastSet.weight,
                reps: reps,
                setType: .work,
                explanation: "Set \(completedCount + 1) : même \(lastSet.weight.cleanWeight)kg, cible x\(reps) (chute prévue)."
            )
        }
        let newWeight = max(0, lastSet.weight - increment)
        let mid = Int((Double(exercise.repTargetMin + exercise.repTargetMax) / 2.0).rounded(.up))
        return SetSuggestion(
            weight: newWeight,
            reps: mid,
            setType: .work,
            explanation: "Set \(completedCount + 1) : back-off \(newWeight.cleanWeight)kg x\(mid) (plancher reps atteint)."
        )
    }

    /// Penalty added to the predicted rep drop based on which set we're about to do.
    /// Matches algo §3.4: from the 3rd working set onward, each extra set costs
    /// 0.5 additional reps.
    private static func setPenalty(upcomingSetIndex: Int) -> Double {
        switch upcomingSetIndex {
        case ...2: return 0
        case 3: return 0.5
        case 4: return 1.0
        default: return 1.5
        }
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
