import Foundation
import SwiftData

@Model
final class WorkoutSession {
    @Attribute(.unique) var id: UUID
    var date: Date
    var startTime: Date
    var endTime: Date?
    var notes: String
    var isActive: Bool

    @Relationship var template: WorkoutTemplate?
    @Relationship(deleteRule: .cascade) var loggedExercises: [LoggedExercise]

    init(
        id: UUID = UUID(),
        date: Date = Date(),
        startTime: Date = Date(),
        endTime: Date? = nil,
        notes: String = "",
        isActive: Bool = true,
        template: WorkoutTemplate? = nil,
        loggedExercises: [LoggedExercise] = []
    ) {
        self.id = id
        self.date = date
        self.startTime = startTime
        self.endTime = endTime
        self.notes = notes
        self.isActive = isActive
        self.template = template
        self.loggedExercises = loggedExercises
    }

    /// Ordered strictly by the stable `orderIndex`, with a UUID tiebreaker so two
    /// exercises with the same index never flicker around each other between renders.
    /// Logging sets or changing completion state must NEVER affect this order.
    var orderedExercises: [LoggedExercise] {
        loggedExercises.sorted { a, b in
            if a.orderIndex != b.orderIndex { return a.orderIndex < b.orderIndex }
            return a.id.uuidString < b.id.uuidString
        }
    }

    var duration: TimeInterval? {
        guard let end = endTime else { return Date().timeIntervalSince(startTime) }
        return end.timeIntervalSince(startTime)
    }

    var durationFormatted: String {
        guard let dur = duration else { return "--" }
        let mins = Int(dur) / 60
        if mins < 60 { return "\(mins)m" }
        return "\(mins / 60)h \(mins % 60)m"
    }

    var totalWorkSets: Int {
        loggedExercises.reduce(0) { $0 + $1.completedWorkSets.count }
    }
}
