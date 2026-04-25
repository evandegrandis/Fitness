import Foundation
import SwiftData

/// Surfaces recent personal records for the home screen.
///
/// An "achievement" here is a set that beats a previous best — either the
/// heaviest validated weight ever, or the most reps at a given weight.
/// We scan the last N finished sessions and flag sets that were records
/// at the time they were logged.
struct Achievement: Identifiable {
    let id = UUID()
    let exerciseName: String
    let date: Date
    let kind: RecordKind
    let weight: Double
    let reps: Int
}

struct AchievementsEngine {
    private struct AchievementKey: Hashable {
        let exerciseName: String
        let sessionDay: Date
    }

    private static func rank(for kind: RecordKind) -> Int {
        switch kind {
        case .heaviestWeight:
            return 4
        case .estimated1RM:
            return 3
        case .repsAtWeight:
            return 2
        case .bodyweightReps:
            return 1
        }
    }

    /// Extract recent achievements from the last `maxSessions` finished sessions.
    /// Each set is tested against all PRIOR history to see if it was a record when logged.
    static func recentAchievements(
        sessions: [WorkoutSession],
        exercises: [Exercise],
        maxSessions: Int = 10
    ) -> [Achievement] {
        // Sessions must be sorted newest-first (the @Query default).
        let recent = Array(sessions.prefix(maxSessions))
        // Build a chronological list of all sessions for per-exercise history.
        let allChronological = sessions.reversed()

        var results: [Achievement] = []

        for exercise in exercises {
            // Gather all historical sets for this exercise, in chronological order.
            var cumulativeSets: [LoggedSet] = []

            for session in allChronological {
                let logged = session.loggedExercises.filter { $0.exercise?.id == exercise.id }
                let newSets = logged.flatMap(\.completedWorkSets)
                guard !newSets.isEmpty else { continue }

                // Build records BEFORE this session's sets.
                let priorRecords = RecordsEngine.buildRecords(for: exercise, historicalSets: cumulativeSets)

                // Check each new set against prior records.
                for set in newSets {
                    if let kind = RecordsEngine.classify(set: set, exercise: exercise, priorRecords: priorRecords) {
                        // Only include if this session is in the "recent" window.
                        if recent.contains(where: { $0.id == session.id }) {
                            results.append(Achievement(
                                exerciseName: exercise.name,
                                date: session.date,
                                kind: kind,
                                weight: set.weight,
                                reps: set.reps
                            ))
                        }
                    }
                }

                cumulativeSets.append(contentsOf: newSets)
            }
        }

        var deduped: [AchievementKey: Achievement] = [:]

        for achievement in results {
            let key = AchievementKey(
                exerciseName: achievement.exerciseName,
                sessionDay: Calendar.current.startOfDay(for: achievement.date)
            )

            if let existing = deduped[key] {
                let newRank = rank(for: achievement.kind)
                let oldRank = rank(for: existing.kind)

                if newRank > oldRank ||
                    (newRank == oldRank && achievement.reps > existing.reps) ||
                    (newRank == oldRank && achievement.reps == existing.reps && achievement.weight > existing.weight) {
                    deduped[key] = achievement
                }
            } else {
                deduped[key] = achievement
            }
        }

        // Sort newest first, then strongest record first.
        return deduped.values.sorted { a, b in
            if a.date != b.date { return a.date > b.date }
            return rank(for: a.kind) > rank(for: b.kind)
        }
    }
}
