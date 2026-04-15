import Foundation
import SwiftData

@Model
final class LoggedSet {
    @Attribute(.unique) var id: UUID
    var weight: Double
    var reps: Int
    var setType: SetType
    var timestamp: Date
    var setSlotIndex: Int
    var completed: Bool

    /// Round number inside a superset (1-based). Nil for standalone exercises
    /// and for sets logged before superset tracking existed. Lets a workout's
    /// history replay as "round 1: A 10×10 + B 12×10, round 2: …" instead of
    /// a flat list of per-exercise sets.
    var supersetRoundIndex: Int?

    @Relationship var loggedExercise: LoggedExercise?

    init(
        id: UUID = UUID(),
        weight: Double = 0,
        reps: Int = 0,
        setType: SetType = .work,
        timestamp: Date = Date(),
        setSlotIndex: Int = 0,
        completed: Bool = true,
        supersetRoundIndex: Int? = nil
    ) {
        self.id = id
        self.weight = weight
        self.reps = reps
        self.setType = setType
        self.timestamp = timestamp
        self.setSlotIndex = setSlotIndex
        self.completed = completed
        self.supersetRoundIndex = supersetRoundIndex
    }
}

extension Double {
    var cleanWeight: String {
        if self == floor(self) {
            return String(format: "%.0f", self)
        }
        return String(format: "%.1f", self)
    }
}
