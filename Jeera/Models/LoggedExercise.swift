import Foundation
import SwiftData

@Model
final class LoggedExercise {
    @Attribute(.unique) var id: UUID
    var orderIndex: Int
    var notes: String

    @Relationship var exercise: Exercise?
    @Relationship(deleteRule: .cascade) var sets: [LoggedSet]
    @Relationship var session: WorkoutSession?

    init(
        id: UUID = UUID(),
        orderIndex: Int = 0,
        notes: String = "",
        exercise: Exercise? = nil,
        sets: [LoggedSet] = []
    ) {
        self.id = id
        self.orderIndex = orderIndex
        self.notes = notes
        self.exercise = exercise
        self.sets = sets
    }

    var orderedSets: [LoggedSet] {
        sets.sorted { $0.setSlotIndex < $1.setSlotIndex }
    }

    var workSets: [LoggedSet] {
        orderedSets.filter { $0.setType == .work || $0.setType == .topSet || $0.setType == .backoff }
    }

    var completedWorkSets: [LoggedSet] {
        workSets.filter { $0.completed }
    }

    var warmupSets: [LoggedSet] {
        orderedSets.filter { $0.setType == .warmup }
    }

    var lastCompletedSet: LoggedSet? {
        orderedSets.filter { $0.completed }.last
    }

    var nextSetSlotIndex: Int {
        (orderedSets.map(\.setSlotIndex).max() ?? -1) + 1
    }

    var summaryText: String {
        let completed = completedWorkSets
        if completed.isEmpty { return "No sets" }
        return completed.map { set in
            if set.weight > 0 {
                return "\(set.weight.cleanWeight)x\(set.reps)"
            } else {
                return "BWx\(set.reps)"
            }
        }.joined(separator: ", ")
    }
}
