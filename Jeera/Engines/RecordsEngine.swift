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
    /// Best reps achieved on a pure bodyweight set (weight == 0). Lets BW-only
    /// exercises still earn rep PRs (pull-ups 10 → 12 → 15).
    let bestBodyweightReps: Int
    /// Best Epley e1RM across validated sets. Used to surface PRs when the user
    /// never repeats the exact same weight twice (50x9 → 55x8 → 60x7).
    let bestE1RM: Double
    /// True when there is no prior history at all.
    let isEmpty: Bool

    static let empty = ExerciseRecords(
        heaviestValidated: 0,
        repsAtHeaviestValidated: 0,
        bestRepsByWeight: [:],
        bestBodyweightReps: 0,
        bestE1RM: 0,
        isEmpty: true
    )
}

enum RecordKind {
    case heaviestWeight   // New PR weight
    case repsAtWeight     // New rep PR at a weight already lifted
    case bodyweightReps   // New rep PR on a pure bodyweight set
    case estimated1RM     // New e1RM PR (meaningful margin required)
}

/// Minimum relative improvement over previous best e1RM to qualify as a PR.
/// Small enough to catch real progress (80→82 = +2.5%) but large enough to
/// avoid flagging every half-kilo variation as a record.
private let kE1RMPRThreshold: Double = 1.02

struct RecordsEngine {

    /// Build a compact record summary for an exercise from its historical work sets.
    /// `historicalSets` must NOT include sets from the currently active session.
    static func buildRecords(for exercise: Exercise, historicalSets: [LoggedSet]) -> ExerciseRecords {
        let workKinds: Set<SetType> = [.work, .topSet, .backoff]
        let completedWork = historicalSets.filter { $0.completed && workKinds.contains($0.setType) }

        // Weighted records require validated reps (>= repTargetMin) and weight > 0.
        let weightedValidated = completedWork.filter {
            $0.weight > 0 && $0.reps >= exercise.repTargetMin
        }

        // Bodyweight record track: any completed BW set counts (weight == 0). We don't
        // gate on repTargetMin so the first few BW workouts still produce PRs.
        let bwSets = completedWork.filter { $0.weight == 0 }
        let bestBWReps = bwSets.map(\.reps).max() ?? 0

        // e1RM track: consider all validated weighted sets (reps <= 15 for Epley to be useful).
        let bestE1RM = ProgressionEngine.bestE1RM(from: weightedValidated)?.e1rm ?? 0

        guard !weightedValidated.isEmpty || bestBWReps > 0 else { return .empty }

        var bestRepsByWeight: [Double: Int] = [:]
        for set in weightedValidated {
            let current = bestRepsByWeight[set.weight] ?? 0
            if set.reps > current {
                bestRepsByWeight[set.weight] = set.reps
            }
        }

        let heaviest = weightedValidated.max(by: { $0.weight < $1.weight })

        return ExerciseRecords(
            heaviestValidated: heaviest?.weight ?? 0,
            repsAtHeaviestValidated: heaviest?.reps ?? 0,
            bestRepsByWeight: bestRepsByWeight,
            bestBodyweightReps: bestBWReps,
            bestE1RM: bestE1RM,
            isEmpty: false
        )
    }

    /// Classify whether a just-logged set beats any existing record.
    /// Returns nil if the set is not a record.
    ///
    /// Order matters — the most "impressive" wins when multiple apply:
    ///   1. heaviestWeight (new top-end)
    ///   2. estimated1RM (new e1RM with >=2% margin, avoids flapping on tiny changes)
    ///   3. repsAtWeight (more reps at a weight already hit)
    ///   4. bodyweightReps (BW exercises: more reps than ever)
    static func classify(
        set: LoggedSet,
        exercise: Exercise,
        priorRecords: ExerciseRecords
    ) -> RecordKind? {
        guard set.completed else { return nil }

        // Bodyweight branch: flag a rep PR when this is strictly more than any
        // previous BW rep count. Don't require repTargetMin so the very first
        // "better" BW set still counts as progression.
        if set.weight == 0 {
            if set.reps > priorRecords.bestBodyweightReps {
                return .bodyweightReps
            }
            return nil
        }

        // Weighted sets must pass validation (enough reps to count as a quality set).
        guard set.reps >= exercise.repTargetMin else { return nil }

        // New PR weight: strictly heavier than the previous best validated weight.
        if set.weight > priorRecords.heaviestValidated {
            return .heaviestWeight
        }

        // New e1RM PR with a meaningful margin.
        if let newE1RM = ProgressionEngine.estimated1RM(weight: set.weight, reps: set.reps),
           priorRecords.bestE1RM > 0,
           newE1RM > priorRecords.bestE1RM * kE1RMPRThreshold {
            return .estimated1RM
        }

        // Rep PR at a weight we've already lifted.
        if let prior = priorRecords.bestRepsByWeight[set.weight], set.reps > prior {
            return .repsAtWeight
        }

        return nil
    }

    /// Determine if a finished set sitting in history should be shown with a record star.
    /// Call this with the FULL historical set list (including the set itself). A set earns a
    /// star if removing it from the history would change the best-at-that-weight record.
    static func isRecordSet(_ set: LoggedSet, among allSets: [LoggedSet], exercise: Exercise) -> Bool {
        guard set.completed else { return false }

        let others = allSets.filter { $0.id != set.id }

        // Bodyweight branch: star when strictly more reps than any prior BW set.
        if set.weight == 0 {
            let priorBWMax = others
                .filter { $0.completed && $0.weight == 0 }
                .map(\.reps)
                .max() ?? 0
            return set.reps > priorBWMax
        }

        guard set.reps >= exercise.repTargetMin else { return false }

        let priorAtWeight = others
            .filter { $0.completed && $0.weight == set.weight && $0.reps >= exercise.repTargetMin }
            .map(\.reps)
            .max() ?? 0

        if set.reps > priorAtWeight {
            return true
        }

        // Also star the absolute heaviest validated weight even if reps match.
        let heaviestElsewhere = others
            .filter { $0.completed && $0.weight > 0 && $0.reps >= exercise.repTargetMin }
            .map(\.weight)
            .max() ?? 0
        if set.weight > heaviestElsewhere {
            return true
        }

        return false
    }
}
