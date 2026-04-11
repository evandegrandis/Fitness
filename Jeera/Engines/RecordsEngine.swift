import Foundation

/// Computes meaningful lifting records for a single exercise from its historical sets.
///
/// Records are computed from FINISHED sessions only (never from the currently active
/// session — otherwise every first set of every workout would look like a "record").
/// We only consider sets that pass validation: reps >= exercise.repTargetMin.
///
/// Two distinct records are tracked:
///   - heaviestValidated: the largest `weight` ever completed at or above the rep minimum.
///   - bestRepsAtWeight: the highest `reps` ever completed for each exact `weight` value.
///
/// e1RM (Epley) is optionally exposed via ProgressionEngine.bestE1RM for the progress view.
struct ExerciseRecords {
    /// Heaviest weight that was lifted for reps >= repTargetMin.
    let heaviestValidated: Double
    /// Reps at that heaviest weight (used to display "85 kg x 6").
    let repsAtHeaviestValidated: Int
    /// For each weight value, the best reps achieved (validated sets only).
    let bestRepsByWeight: [Double: Int]
    /// True when there is no prior history at all.
    let isEmpty: Bool

    static let empty = ExerciseRecords(
        heaviestValidated: 0,
        repsAtHeaviestValidated: 0,
        bestRepsByWeight: [:],
        isEmpty: true
    )
}

enum RecordKind {
    case heaviestWeight   // New PR weight
    case repsAtWeight     // New rep PR at a weight already lifted
}

struct RecordsEngine {

    /// Build a compact record summary for an exercise from its historical work sets.
    /// `historicalSets` must NOT include sets from the currently active session.
    static func buildRecords(for exercise: Exercise, historicalSets: [LoggedSet]) -> ExerciseRecords {
        let validated = historicalSets.filter { set in
            set.completed
            && set.weight > 0
            && set.reps >= exercise.repTargetMin
            && (set.setType == .work || set.setType == .topSet || set.setType == .backoff)
        }

        guard !validated.isEmpty else { return .empty }

        var bestRepsByWeight: [Double: Int] = [:]
        for set in validated {
            let current = bestRepsByWeight[set.weight] ?? 0
            if set.reps > current {
                bestRepsByWeight[set.weight] = set.reps
            }
        }

        let heaviest = validated.max(by: { $0.weight < $1.weight })!

        return ExerciseRecords(
            heaviestValidated: heaviest.weight,
            repsAtHeaviestValidated: heaviest.reps,
            bestRepsByWeight: bestRepsByWeight,
            isEmpty: false
        )
    }

    /// Classify whether a just-logged set beats any existing record.
    /// Returns nil if the set is not a record.
    static func classify(
        set: LoggedSet,
        exercise: Exercise,
        priorRecords: ExerciseRecords
    ) -> RecordKind? {
        guard set.completed, set.weight > 0, set.reps >= exercise.repTargetMin else { return nil }

        // New PR weight: strictly heavier than the previous best validated weight.
        if set.weight > priorRecords.heaviestValidated {
            return .heaviestWeight
        }

        // Rep PR at a weight we've already lifted at or above.
        if let prior = priorRecords.bestRepsByWeight[set.weight], set.reps > prior {
            return .repsAtWeight
        }

        return nil
    }

    /// Determine if a finished set sitting in history should be shown with a record star.
    /// Call this with the FULL historical set list (including the set itself). A set earns a
    /// star if removing it from the history would change the best-at-that-weight record.
    static func isRecordSet(_ set: LoggedSet, among allSets: [LoggedSet], exercise: Exercise) -> Bool {
        guard set.completed, set.weight > 0, set.reps >= exercise.repTargetMin else { return false }

        let others = allSets.filter { $0.id != set.id }
        let priorAtWeight = others
            .filter { $0.completed && $0.weight == set.weight && $0.reps >= exercise.repTargetMin }
            .map(\.reps)
            .max() ?? 0

        if set.reps > priorAtWeight {
            return true
        }

        // Also star the absolute heaviest validated weight even if reps match.
        let heaviestElsewhere = others
            .filter { $0.completed && $0.reps >= exercise.repTargetMin }
            .map(\.weight)
            .max() ?? 0
        if set.weight > heaviestElsewhere {
            return true
        }

        return false
    }
}
